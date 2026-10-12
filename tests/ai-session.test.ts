import { describe, expect, it } from 'vitest';
import { contextEvent, contextFromView, type AiContext } from '../src/ai/context';
import { isEmptyDrawing } from '../src/ai/drawing';
import { createMockProvider, MockProvider, type MockOptions, type MockScript } from '../src/ai/mockProvider';
import { createMockScripts } from '../src/ai/mockScripts';
import { INSTRUCTIONS_FILE } from '../src/ai/instructions';
import { NARRATION_REQUEST } from '../src/ai/prompt';
import { ModelError, type CompletionRequest, type ModelProvider } from '../src/ai/provider';
import { AiSession, NO_TOOLS_NOTE, type AssistantItem } from '../src/ai/session';
import { appEventsSource } from '../src/ai/sources';
import { alignWithPlan, parseAnswer } from '../src/ai/steps';
import { deriveView } from '../src/state/derive';
import { DEFAULT_STATE } from '../src/state/store';
import { shippedData } from './helpers/shipped';

const data = shippedData();
const FAST = { thinkMs: 0, roundMs: 0, chunkChars: 500, chunkMs: 0 };

function contextAt(
  point: { lon: number; lat: number } | null,
  range = { from: 1500, to: 1550 },
  eventId: string | null = null,
): AiContext {
  const vm = deriveView({ ...DEFAULT_STATE, range, places: point ? [point] : [], selectedEventId: eventId }, data);
  return contextFromView(vm, data);
}
const anatolia = () => contextAt({ lon: 35.5, lat: 38.9 });

function makeSession(provider: ModelProvider, extra: { tier?: 'quick' | 'default' | 'complex' } = {}) {
  return new AiSession({ provider: Promise.resolve(provider), data, sources: [appEventsSource(data)], ...extra });
}
const mock = (options: MockOptions = FAST, scripts: MockScript[] = createMockScripts(data)) =>
  createMockProvider(scripts, options);
const last = (s: AiSession) => s.items[s.items.length - 1] as AssistantItem;

describe('a narration', () => {
  it('fills a plan with a step and a map state for each paragraph, then the text', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());

    const answer = last(session);
    expect(answer.status).toBe('done');
    expect(session.items.map((i) => i.kind)).toEqual(['user', 'assistant']);

    const sections = parseAnswer(answer.text).sections;
    expect(sections).toHaveLength(6);
    expect(answer.plan.numbers()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const s of sections) expect(answer.plan.titleOf(s.n)).toBe(s.title);
    // every step has its subtitle, a summary shorter than the text it belongs to
    for (const s of sections) {
      const caption = answer.plan.captionOf(s.n);
      expect(caption).toBeTruthy();
      expect(caption!.length).toBeLessThan(s.body.length);
    }

    // each step owns its map state: step 5 is the French alliance and shows nothing of the Hungarian war before it
    const five = answer.plan.drawingAt(5);
    expect(five.highlights).toEqual(['ottoman-empire', 'kingdom-of-france']);
    expect(five.links).toEqual([
      { from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance', label: 'İttifak, 1536' },
    ]);
    expect(five.events).toEqual([]);
    expect(five.year).toBe(1536); // the step named it: it shows no event to take one from
    // what the data has an event for is only named: the app lights its parties and draws its war line
    const three = answer.plan.drawingAt(3);
    expect(three.events).toEqual(['ridaniye-1517']);
    expect(three.links).toEqual([]); // no line of the model's own for a war the data has
    expect(three.highlights).toEqual([]);
    expect(three.marks.map((m) => m.label)).toEqual(['Mercidabık']); // the one place the data has no event for is a mark
    expect(answer.plan.drawingAt(2).events).toEqual(['caldiran-1514']);
    expect(answer.plan.drawingAt(2).links).toEqual([]);
    expect(answer.plan.drawingAt(1).events).toEqual(['safevi-1501']);
    expect(answer.plan.drawingAt(1).highlights).toEqual(['ottoman-empire']); // besides the event's own parties
    expect(answer.plan.drawingAt(4).events).toEqual(['mohac-1526', 'viyana-1529']);
    // the year of a step with events is theirs (the earliest), unless the step names one
    expect(answer.plan.drawingAt(1).year).toBe(1505);
    expect(answer.plan.drawingAt(2).year).toBe(1514);
    expect(answer.plan.drawingAt(3).year).toBe(1517);
    expect(answer.plan.drawingAt(4).year).toBe(1526);
    expect(answer.plan.drawingAt(6).year).toBe(1538);
    for (const n of answer.plan.numbers()) {
      // every step shows something and says what it needs by itself, and none of it is left to the step before
      const d = answer.plan.drawingAt(n);
      expect(d.events.length + d.highlights.length).toBeGreaterThan(0);
      expect(d.year).toBeDefined();
    }
  });

  it('reaches the model as tools plus turns made of the rules, the state and the request', async () => {
    const provider = mock();
    const session = makeSession(provider, { tier: 'quick' });
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const req = provider.requests[0]!;
    expect(req.tier).toBe('quick');
    expect(req.tools.map((t) => t.name)).toEqual(['step', 'show_event', 'highlight', 'connect', 'mark']);
    expect(req.turns[0]!.content.startsWith(INSTRUCTIONS_FILE)).toBe(true); // the owner's file, as it is, in every call
    expect(req.turns.at(-1)!.content).toContain(`İSTEK\n${NARRATION_REQUEST}`);
    expect(req.turns.at(-1)!.content).toContain('ottoman-empire | Osmanlı İmparatorluğu');
    expect(req.turns.at(-1)!.content).toContain('Çaldıran Muharebesi'); // the app's own record, as a source
    expect(req.turns.at(-1)!.content).toContain('caldiran-1514 | '); // and with the id show_event takes
    expect(req.turns.at(-1)!.content).toContain('ANLATIM İSKELETİ'); // a narration comes with the app's outline
    expect(req.meta.mode).toBe('narration');
  });

  it('has the whole plan, captions and scenes included, before the first word of the long text', async () => {
    const provider = mock({ ...FAST, chunkChars: 60 });
    const session = makeSession(provider);
    const atFirstText: { steps: number[]; captions: number; drawn: number }[] = [];
    session.subscribe(() => {
      const a = session.items.at(-1);
      if (a?.kind === 'assistant' && a.status === 'streaming' && !atFirstText.length) {
        atFirstText.push({
          steps: a.plan.numbers(),
          captions: a.plan.numbers().filter((n) => a.plan.captionOf(n)).length,
          drawn: a.plan.numbers().filter((n) => !isEmptyDrawing(a.plan.drawingAt(n))).length,
        });
      }
    });
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    expect(atFirstText).toEqual([{ steps: [1, 2, 3, 4, 5, 6], captions: 6, drawn: 6 }]);
  });

  it('streams: the text only grows, and the answer is waiting, then streaming, then done', async () => {
    const provider = mock({ ...FAST, chunkChars: 60 });
    const session = makeSession(provider);
    const seen: { status: string; length: number }[] = [];
    session.subscribe(() => {
      const a = session.items.find((i) => i.kind === 'assistant') as AssistantItem | undefined;
      if (a) seen.push({ status: a.status, length: a.text.length });
    });
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const statuses = [...new Set(seen.map((s) => s.status))];
    expect(statuses).toEqual(['waiting', 'streaming', 'done']);
    const lengths = seen.filter((s) => s.status === 'streaming').map((s) => s.length);
    expect(lengths.length).toBeGreaterThan(3);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(session.busy).toBe(false);
  });

  it('works for any place: a narration made of the place own record', async () => {
    const session = makeSession(mock());
    await session.send(
      { text: NARRATION_REQUEST, mode: 'narration' },
      contextAt({ lon: 112, lat: 33 }, { from: 1500, to: 1550 }),
    );
    const answer = last(session);
    expect(answer.status).toBe('done');
    const sections = parseAnswer(answer.text).sections;
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(answer.plan.drawingAt(1).highlights).toEqual(['ming-dynasty']);
    expect(answer.plan.drawingAt(1).year).toBeDefined(); // every step of it says which year's borders it shows
  });

  it('and for the world when no place is chosen', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Bu aralıkta dünyada olanları anlat.', mode: 'narration' }, contextAt(null));
    const answer = last(session);
    expect(parseAnswer(answer.text).sections.length).toBeGreaterThanOrEqual(3);
    expect(answer.plan.drawingAt(2).events.length).toBeGreaterThan(0);
    // the mock follows the app's outline, so the world's narration is the same turning points every time
    const second = makeSession(mock());
    await second.send({ text: 'Bu aralıkta dünyada olanları anlat.', mode: 'narration' }, contextAt(null));
    expect(last(second).plan.numbers().map((n) => last(second).plan.drawingAt(n).events)).toEqual(
      answer.plan.numbers().map((n) => answer.plan.drawingAt(n).events),
    );
  });
});

describe('a model that does not write quite what was asked', () => {
  const run = async (reply: ReturnType<MockScript>) => {
    const session = makeSession(mock(FAST, [() => reply]));
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    return last(session);
  };

  it('names polities in Turkish or English, numbers steps as text, and puts bold numbers for headings', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { n: '1', title: 'Başlangıç' } },
        { name: 'highlight', input: { step: '1', polities: ['Osmanlı', 'Safavid Dynasty'] } },
        { name: 'step', input: { n: 2, title: 'İki' } },
        { name: 'connect', input: { step: 2, from: 'Osmanlı Devleti', to: 'Fransa', relation: 'İttifak' } },
        { name: 'set_year', input: { step: 2, year: '1536' } }, // a tool of an older version: there is none to run it, nothing happens
      ],
      text: '**1. Başlangıç**\nİlk paragraf.\n\n**2. İki**\nİkinci paragraf.',
    });
    expect(parseAnswer(answer.text).sections.map((s) => [s.n, s.title])).toEqual([
      [1, 'Başlangıç'],
      [2, 'İki'],
    ]);
    expect(answer.plan.drawingAt(1).highlights).toEqual(['ottoman-empire', 'safavid-dynasty']);
    expect(answer.plan.drawingAt(2).links).toEqual([
      { from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance' },
    ]);
    expect(answer.plan.drawingAt(2).year).toBeUndefined();
  });

  it('takes the year from the step itself, as a number or as text, when it is in the range', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { n: 1, title: 'A', caption: 'a', year: '1536' } },
        { name: 'step', input: { n: 2, title: 'B', caption: 'b', year: 1700 } },
      ],
      text: '## 1. A\nİlk.\n\n## 2. B\nİkinci.',
    });
    expect(answer.plan.drawingAt(1).year).toBe(1536);
    expect(answer.plan.drawingAt(2).year).toBeUndefined(); // outside the range: left to the reader
    expect(answer.plan.titleOf(2)).toBe('B');
  });

  it('writes a line before the steps: it is kept apart, and the steps still line up with the plan', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { n: 1, title: 'A' } },
        { name: 'highlight', input: { step: 1, polities: ['ottoman-empire'] } },
      ],
      text: 'Tamam, şimdi anlatıyorum.\n\n## 1. A\nGövde.',
    });
    const parsed = parseAnswer(answer.text);
    expect(parsed.preamble).toBe('Tamam, şimdi anlatıyorum.');
    expect(parsed.sections).toHaveLength(1);
    expect(answer.plan.drawingAt(parsed.sections[0]!.n).highlights).toEqual(['ottoman-empire']);
  });

  it('plans several steps but writes plain paragraphs: the paragraphs become the steps', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { title: 'Bir' } },
        { name: 'step', input: { title: 'İki' } },
        { name: 'highlight', input: { step: 2, polities: ['kingdom-of-france'] } },
      ],
      text: 'Birinci paragraf.\n\nİkinci paragraf.',
    });
    const sections = alignWithPlan(parseAnswer(answer.text).sections, answer.plan.numbers(), (n) =>
      answer.plan.titleOf(n),
    );
    expect(sections.map((s) => [s.n, s.title, s.body])).toEqual([
      [1, 'Bir', 'Birinci paragraf.'],
      [2, 'İki', 'İkinci paragraf.'],
    ]);
    expect(answer.plan.drawingAt(2).highlights).toEqual(['kingdom-of-france']);
    expect(answer.plan.drawingAt(1).highlights).toEqual([]);
  });

  it('asks for things that do not exist: the answer still arrives, only the drawing is smaller', async () => {
    const answer = await run({
      calls: [
        { name: 'highlight', input: { polities: ['atlantis', 'lemuria'] } },
        { name: 'connect', input: { from: 'atlantis', to: 'ottoman-empire', relation: 'war' } },
        { name: 'mark', input: { lon: 500, lat: 500, label: 'Yok' } },
        { name: 'show_event', input: { event: 'yok-boyle-bir-olay' } },
        { name: 'draw_everything', input: {} },
        { name: 'highlight', input: { polities: ['ottoman-empire'] } },
      ],
      text: 'Yanıt yine de geldi.',
    });
    expect(answer.status).toBe('done');
    const d = answer.plan.drawingAt(1);
    expect(d).toMatchObject({ highlights: ['ottoman-empire'], links: [], marks: [], events: [] });
    expect(d.year).toBeUndefined();
  });
});

describe('a question', () => {
  it('gets one map state: the French alliance highlights and connects both polities', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Osmanlı ile Fransa arasındaki 1536 ittifakı neydi?', mode: 'qa' }, anatolia());
    const answer = last(session);
    expect(answer.status).toBe('done');
    expect(parseAnswer(answer.text).sections).toHaveLength(1);
    const d = answer.plan.drawingAt(1);
    expect(d.highlights).toEqual(['ottoman-empire', 'kingdom-of-france']);
    expect(d.links[0]).toMatchObject({ relation: 'alliance' });
    expect(d.year).toBeUndefined(); // a single-part answer with no event leaves the year to the reader
    expect(provider.requests[0]!.turns.at(-1)!.content).toContain(
      'İSTEK\nOsmanlı ile Fransa arasındaki 1536 ittifakı neydi?',
    );
  });

  it('sees the open event: the question about an event carries it as context, and the user item shows it', async () => {
    const provider = mock();
    const session = makeSession(provider);
    const mohac = data.eventsById.get('mohac-1526')!;
    await session.send({ text: 'Bu olayı anlat.', mode: 'qa', event: contextEvent(mohac, data) }, anatolia());
    const user = session.items[0]!;
    expect(user.kind === 'user' && user.event?.id).toBe('mohac-1526');
    expect(provider.requests[0]!.turns.at(-1)!.content).toContain('Açık olay kartı: «Mohaç Muharebesi»');
    const answer = last(session);
    expect(answer.plan.drawingAt(1).highlights).toEqual([]); // only which event: the app lights its parties itself
    expect(answer.plan.drawingAt(1).links).toEqual([]);
    expect(answer.plan.drawingAt(1).events).toEqual(['mohac-1526']); // its own marker, not a mark of the model's
    expect(answer.plan.drawingAt(1).marks).toEqual([]);
    expect(answer.plan.drawingAt(1).year).toBe(1526);
  });

  it('carries the chat so far into the next call, because the model keeps nothing', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    const turns = provider.requests[1]!.turns;
    expect(turns.map((t) => t.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(turns[1]!.content).toContain(NARRATION_REQUEST);
    expect(turns[2]!.content).toContain('## 1. Doğuda yeni bir komşu');
    expect(turns[3]!.content).toContain('Fransa ile ittifak neydi?');
  });

  it('sends the whole conversation every time, with what each answer put on the map, so the model knows what it said', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    await session.send({ text: 'Peki Venedik?', mode: 'qa' }, anatolia());
    const turns = provider.requests[2]!.turns;
    expect(turns.map((t) => t.role)).toEqual(['user', 'user', 'assistant', 'user', 'assistant', 'user']);
    // the whole first answer, every step of it, and what it showed
    expect(turns[2]!.content).toContain('[Haritada gösterdiklerim: 1. adım: öne çıkan: Osmanlı İmparatorluğu; olay: Safevî');
    expect(turns[2]!.content).toContain('## 6. Akdeniz’de güç dengesi');
    expect(turns[2]!.content).toContain('4. adım: olay: Mohaç Muharebesi, Birinci Viyana Kuşatması');
    expect(turns[4]!.content).toContain('öne çıkan: Osmanlı İmparatorluğu, Fransa Krallığı'); // the second answer's own scene
    // and the next request, when the chat is not too long, loses nothing
    expect(provider.requests[1]!.turns[2]!.content).toBe(turns[2]!.content);
  });

  it('condenses an old answer instead of dropping it when the chat gets long, and the page keeps all of it', async () => {
    const long = 'Çok uzun bir yanıt. '.repeat(900);
    let n = 0;
    const talky: MockScript = () => ({ text: `${++n}: ${long}` });
    const provider = mock(FAST, [talky]);
    const session = makeSession(provider);
    for (let i = 0; i < 8; i++) await session.send({ text: `Soru ${i}`, mode: 'qa' }, anatolia());
    const last8 = provider.requests[7]!.turns.map((t) => t.content).join('\n');
    for (let i = 0; i < 7; i++) expect(last8).toContain(`Soru ${i}`); // every earlier question is still there
    expect(last8).toContain(`7: ${long}`); // the newest answer is whole
    expect(last8).toContain('sohbet uzadığı için kısaltıldı'); // the oldest are shorter
    expect(last8).not.toContain(`1: ${long}`);
    expect(session.items.filter((i) => i.kind === 'assistant')).toHaveLength(8); // nothing leaves the chat on screen
    expect((session.items[1] as AssistantItem).text).toContain(`1: ${long}`);
  });

  it('tells the model when the same ask is made again in the same chat and subject, and not when it is a new subject', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    expect(provider.requests[0]!.turns.at(-1)!.content).not.toContain('TEKRAR');
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    expect(provider.requests[1]!.turns.at(-1)!.content).toContain('TEKRAR\nBu istek (aynı sözlerle, aynı konuda) bu sohbette daha önce 1 kez yapıldı');
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, contextAt({ lon: 112, lat: 33 }));
    expect(provider.requests[2]!.turns.at(-1)!.content).not.toContain('TEKRAR'); // another place: a new ask
  });

  it('gives the same outline for the same subject however many times it is asked, and a new one for another subject', async () => {
    const provider = mock();
    const session = makeSession(provider);
    const outlineOf = (i: number) => {
      const text = provider.requests[i]!.turns.at(-1)!.content;
      return /ANLATIM İSKELETİ[^\n]*\n([\s\S]*?)\n\n/.exec(text)?.[1];
    };
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    session.newChat();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, { ...anatolia(), year: 1531 }); // another year shown
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, contextAt({ lon: 112, lat: 33 }));
    expect(outlineOf(0)).toBeTruthy();
    expect(outlineOf(1)).toBe(outlineOf(0));
    expect(outlineOf(2)).not.toBe(outlineOf(0));
    // a question is not a narration: no outline for it
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    expect(provider.requests[3]!.turns.at(-1)!.content).not.toContain('ANLATIM İSKELETİ');
  });

  it('refuses to start a second call while one runs', async () => {
    const provider = mock({ ...FAST, thinkMs: 30 });
    const session = makeSession(provider);
    const first = session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    await session.send({ text: 'ikinci', mode: 'qa' }, anatolia());
    await first;
    expect(provider.requests).toHaveLength(1);
    expect(session.items).toHaveLength(2);
  });
});

describe('when the subject changes mid-conversation', () => {
  it('puts one marker in the chat, updates it, and takes it away if the reader goes back', async () => {
    const session = makeSession(mock());
    session.syncContext(contextAt({ lon: 112, lat: 33 })); // before any question: nothing to point out
    expect(session.items).toHaveLength(0);

    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    expect(session.items).toHaveLength(2);

    session.syncContext(contextAt({ lon: 2.2, lat: 48.5 })); // France
    const marker = session.items.at(-1)!;
    expect(marker).toMatchObject({ kind: 'context', from: 'Osmanlı İmparatorluğu · 1500–1550' });
    expect(marker.kind === 'context' && marker.to).toMatch(/^Fransa Krallığı · 1500–1550$/);

    session.syncContext(contextAt({ lon: 2.2, lat: 48.5 }, { from: 1500, to: 1520 })); // and then the range
    expect(session.items).toHaveLength(3);
    expect(session.items.at(-1)!.kind === 'context' && (session.items.at(-1) as { to: string }).to).toBe(
      'Fransa Krallığı · 1500–1520',
    );

    session.syncContext(anatolia()); // back where the conversation was
    expect(session.items).toHaveLength(2);
  });

  it('is not triggered by moving the year cursor or opening an event', async () => {
    const session = makeSession(mock());
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    session.syncContext({ ...anatolia(), year: 1540 });
    session.syncContext(contextAt({ lon: 35.5, lat: 38.9 }, { from: 1500, to: 1550 }, 'mohac-1526'));
    expect(session.items).toHaveLength(2);
  });

  it('tells the model, once, that the subject changed', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    await session.send({ text: 'Peki burada ne oluyordu?', mode: 'qa' }, contextAt({ lon: 2.2, lat: 48.5 }));
    expect(provider.requests[1]!.turns.at(-1)!.content).toContain('Konu değişti');
    await session.send({ text: 'Ve sonra?', mode: 'qa' }, contextAt({ lon: 2.2, lat: 48.5 }));
    expect(provider.requests[2]!.turns.at(-1)!.content).not.toContain('Konu değişti');
    // each earlier question keeps the subject it was asked about
    expect(provider.requests[2]!.turns.map((t) => t.content).join('\n')).toContain(
      '[Fransa Krallığı · 1500–1550] Peki burada ne oluyordu?',
    );
  });
});

describe('stopping and failing', () => {
  it('Stop ends the call at once, keeps what was written, and leaves the chat ready for another question', async () => {
    const provider = mock({ thinkMs: 0, roundMs: 0, chunkChars: 20, chunkMs: 15 });
    const session = makeSession(provider);
    const pending = session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    await new Promise((r) => setTimeout(r, 120));
    expect(session.busy).toBe(true);
    session.stop();
    await pending;
    const answer = last(session);
    expect(answer.status).toBe('stopped');
    expect(answer.text.length).toBeGreaterThan(0);
    expect(answer.text.length).toBeLessThan(600);
    expect(answer.error).toBeNull();
    expect(session.busy).toBe(false);
    expect(session.blocked).toBeNull();
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    expect(last(session).status).toBe('done');
  });

  it('Stop during the thinking stage leaves an empty, stopped answer', async () => {
    const session = makeSession(mock({ ...FAST, thinkMs: 500 }));
    const pending = session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    await new Promise((r) => setTimeout(r, 20));
    session.stop();
    await pending;
    expect(last(session)).toMatchObject({ status: 'stopped', text: '' });
  });

  it('rate_limited is shown where it happened, keeps the partial text, and does not lock the chat', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Deneme [hata:rate_limited]', mode: 'qa' }, anatolia());
    const answer = last(session);
    expect(answer.status).toBe('failed');
    expect(answer.error?.code).toBe('rate_limited');
    expect(answer.text.length).toBeGreaterThan(0);
    expect(session.blocked).toBeNull();
  });

  it('not_granted locks the composer for the rest of the visit and nothing is sent again', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Deneme [hata:not_granted]', mode: 'qa' }, anatolia());
    expect(last(session).error?.code).toBe('not_granted');
    expect(session.blocked?.code).toBe('not_granted');
    await session.send({ text: 'Bir daha', mode: 'qa' }, anatolia());
    expect(provider.requests).toHaveLength(1);
  });

  it('a refusal withdraws what had been written', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Deneme [hata:refused]', mode: 'qa' }, anatolia());
    expect(last(session)).toMatchObject({ status: 'failed', text: '' });
  });

  it('an unknown failure is an upstream error, and a thrown string is too', async () => {
    const odd: ModelProvider = {
      kind: 'mock',
      label: 'x',
      capabilities: async () => ({ tools: true, maxTools: 7 }),
      complete: () => Promise.reject({ code: 'brand_new_code', message: 'boom' }),
    };
    const session = makeSession(odd);
    await session.send({ text: 'x', mode: 'qa' }, anatolia());
    expect(last(session).error).toEqual({ code: 'upstream_error', message: 'boom' });
    const worse: ModelProvider = { ...odd, complete: () => Promise.reject('boom') };
    const s2 = makeSession(worse);
    await s2.send({ text: 'x', mode: 'qa' }, anatolia());
    expect(last(s2).error?.code).toBe('upstream_error');
  });

  it('retry asks the last question again, in place of the failed answer', async () => {
    let calls = 0;
    const flaky: MockScript = (req) => {
      calls++;
      return calls === 1
        ? { text: 'Yarım kalan yanıt', fail: { code: 'upstream_error', afterChars: 5 } }
        : { text: `Tamam: ${req.meta.question}` };
    };
    const session = makeSession(mock(FAST, [flaky]));
    session.syncContext(anatolia());
    await session.send({ text: 'Soru?', mode: 'qa' }, anatolia());
    expect(last(session).status).toBe('failed');
    await session.retry();
    expect(session.items.map((i) => i.kind)).toEqual(['user', 'assistant']);
    expect(last(session)).toMatchObject({ status: 'done', text: 'Tamam: Soru?' });
  });

  it('retry does nothing when the last answer is fine', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    await session.retry();
    expect(provider.requests).toHaveLength(1);
  });

  it('a failed question does not travel with the next one as history', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Deneme [hata:upstream_error]', mode: 'qa' }, anatolia());
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    expect(provider.requests[1]!.turns.map((t) => t.role)).toEqual(['user', 'user']);
  });
});

describe('tools that are not there', () => {
  it('a call that is refused for tools is asked again as plain text, once, and remembered', async () => {
    const seen: number[] = [];
    const provider: ModelProvider = {
      kind: 'sample',
      label: 'x',
      capabilities: async () => ({ tools: true, maxTools: 7 }),
      async complete(req: CompletionRequest) {
        seen.push(req.tools.length);
        if (req.tools.length) throw new ModelError('tools_unavailable');
        req.onText('Yalnızca metin.');
        return { text: 'Yalnızca metin.', truncated: false };
      },
    };
    const session = makeSession(provider);
    await session.send({ text: 'Soru 1', mode: 'qa' }, anatolia());
    expect(seen).toEqual([5, 0]);
    expect(last(session)).toMatchObject({ status: 'done', text: 'Yalnızca metin.', notes: [NO_TOOLS_NOTE] });
    await session.send({ text: 'Soru 2', mode: 'qa' }, anatolia());
    expect(seen).toEqual([5, 0, 0]); // no second round trip for the same refusal
  });

  it('a view that reports no tools gets plain text and a note, with no polity list in the prompt', async () => {
    const provider = mock({ ...FAST, tools: false });
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const req = provider.requests[0]!;
    expect(req.tools).toHaveLength(0);
    expect(req.turns.at(-1)!.content).not.toContain('POLİTİLER');
    expect(req.turns[0]!.content).toContain('yalnızca metin');
    const answer = last(session);
    expect(answer.status).toBe('done');
    expect(answer.notes).toEqual([NO_TOOLS_NOTE]);
    expect(answer.plan.empty).toBe(true);
    expect(parseAnswer(answer.text).sections.length).toBeGreaterThan(1); // the narration still comes in steps
  });

  it('a view that allows fewer tools gets the ones that matter most', async () => {
    const provider = mock({ ...FAST, maxTools: 3 });
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    expect(provider.requests[0]!.tools.map((t) => t.name)).toEqual(['step', 'show_event', 'highlight']);
    expect(last(session).status).toBe('done');
  });
});

describe('housekeeping', () => {
  it('a new chat forgets everything, and the next question starts without history', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    session.newChat();
    expect(session.items).toEqual([]);
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, contextAt({ lon: 2.2, lat: 48.5 }));
    expect(provider.requests[1]!.turns.map((t) => t.role)).toEqual(['user', 'user']);
    expect(provider.requests[1]!.turns.at(-1)!.content).not.toContain('Konu değişti');
  });

  it('the reader can change the speed between questions', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    session.setTier('complex');
    await session.send({ text: 'Peki Venedik?', mode: 'qa' }, anatolia());
    expect(provider.requests.map((r) => r.tier)).toEqual(['default', 'complex']);
  });

  it('knows its provider once it has resolved, and survives one that never does well', async () => {
    const provider = new MockProvider([], FAST);
    const session = makeSession(provider);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.provider).toBe(provider);

    const broken = new AiSession({ provider: Promise.reject(new Error('yok')), data, sources: [] });
    await broken.send({ text: 'x', mode: 'qa' }, anatolia());
    expect((broken.items.at(-1) as AssistantItem).error?.code).toBe('upstream_error');
  });
});
