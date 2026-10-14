import { describe, expect, it } from 'vitest';
import { contextEvent, contextFromView, type AiContext } from '../src/ai/context';
import { isEmptyDrawing } from '../src/ai/drawing';
import { createMockProvider, MockProvider, type MockOptions, type MockScript } from '../src/ai/mockProvider';
import { createMockScripts } from '../src/ai/mockScripts';
import { hasMore, stepsOf } from '../src/ai/narration';
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

function contextAt(point: { lon: number; lat: number } | null, range = WAR, eventId: string | null = null): AiContext {
  const vm = deriveView({ ...DEFAULT_STATE, range, places: point ? [point] : [], selectedEventId: eventId }, data);
  return contextFromView(vm, data);
}
// A place in Germany (Berlin) over the war years: the scripted narration of Germany at war is for it.
const BERLIN = { lon: 13.4, lat: 52.52 };
const LONDON = { lon: -0.13, lat: 51.5 };
const TOKYO = { lon: 139.7, lat: 35.7 };
const WAR = { from: 1939, to: 1945 };
const berlin = () => contextAt(BERLIN);
const AXIS_QUESTION = 'Almanya ile İtalya arasındaki ittifak neydi?';

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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());

    const answer = last(session);
    expect(answer.status).toBe('done');
    expect(session.items.map((i) => i.kind)).toEqual(['user', 'assistant']);

    const sections = parseAnswer(answer.text).sections;
    expect(sections).toHaveLength(8);
    expect(answer.plan.numbers()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const s of sections) expect(answer.plan.titleOf(s.n)).toBe(s.title);
    // every step has its subtitle, a summary shorter than the text it belongs to
    for (const s of sections) {
      const caption = answer.plan.captionOf(s.n);
      expect(caption).toBeTruthy();
      expect(caption!.length).toBeLessThan(s.body.length);
    }

    // each step owns its map state: what the data has an event for is only named (the app lights its parties and draws
    // its war line); `highlight` adds the polities that stand out besides
    const one = answer.plan.drawingAt(1);
    expect(one.events).toEqual(['polonya-isgali-1939']);
    expect(one.highlights).toEqual(['nazi-germany']); // besides the event's own parties
    expect(one.links).toEqual([]);
    expect(one.marks).toEqual([]);
    expect(answer.plan.drawingAt(2).events).toEqual(['fransa-muharebesi-1940', 'compiegne-ateskesi-1940']);
    expect(answer.plan.drawingAt(2).highlights).toEqual([]); // no line of the model's own for a war the data has
    expect(answer.plan.drawingAt(3).events).toEqual(['britanya-muharebesi-1940']);
    expect(answer.plan.drawingAt(4).events).toEqual(['barbarossa-1941', 'leningrad-kusatmasi-1941']);
    expect(answer.plan.drawingAt(5).events).toEqual(['wannsee-1942']);
    expect(answer.plan.drawingAt(6).events).toEqual(['stalingrad-1942', 'el-alamein-1942']);
    expect(answer.plan.drawingAt(7).events).toEqual(['normandiya-1944', 'bagration-1944']);
    expect(answer.plan.drawingAt(8).events).toEqual(['berlin-muharebesi-1945', 'almanya-teslimi-1945']);
    // the year of a step with events is theirs (the earliest), unless the step names one; and the borders are those of the
    // event's start: the Battle of France begins in May 1940, when the Third Republic is still there (the data has it up to
    // 1939), so step 2 shows 1939. (Cliopatria has no Nazi Germany in 1945; the correction layer carries its 1938 borders
    // over, so the Battle of Berlin is drawn on the borders of 1945.)
    expect(answer.plan.numbers().map((n) => answer.plan.drawingAt(n).year)).toEqual([
      1939, 1939, 1940, 1941, 1942, 1942, 1944, 1945,
    ]);
    // the step's date for the timeline is the day its earliest event starts: Battle of France 10 May 1940, whatever borders it shows
    const when = answer.plan.numbers().map((n) => answer.plan.whenAt(n)!);
    expect(when.map(Math.floor)).toEqual([1939, 1940, 1940, 1941, 1942, 1942, 1944, 1945]);
    expect(when[1]).toBeCloseTo(1940.355, 2);
    expect(when).toEqual([...when].sort((a, b) => a - b));
    // the vocabulary beyond events: the Eastern Front has its two sides painted as blocs and the advance on Moscow as a
    // directed route through cities (animated), the retreat of 1944 is a route of another type
    const four = answer.plan.drawingAt(4);
    expect(four.sides.map((side) => side.name)).toEqual(['Mihver ve ortakları', 'Sovyetler Birliği']);
    expect(four.sides[0]!.polities).toEqual([
      'nazi-germany',
      'romania',
      'republic-of-finland',
      'hungary',
      'kingdom-of-italy',
    ]);
    expect(four.routes).toHaveLength(1);
    expect(four.routes[0]).toMatchObject({ type: 'advance', animate: true, label: 'Alman ilerleyişi' });
    // (the model wrote "Brest-Litovsk", an old name; the gazetteer knows the town as Brest and the page calls it so)
    expect(four.routes[0]!.via.map((v) => (v.kind === 'city' ? v.name : v.kind))).toEqual([
      'Brest',
      'Minsk',
      'Smolensk',
      'Moskova',
    ]);
    expect(answer.plan.drawingAt(7).routes).toMatchObject([{ type: 'retreat', animate: false }]);
    for (const n of [1, 2, 3, 5, 6, 8]) expect(answer.plan.drawingAt(n).routes, `step ${n}`).toEqual([]);
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const req = provider.requests[0]!;
    expect(req.tier).toBe('quick');
    expect(req.tools.map((t) => t.name)).toEqual([
      'step',
      'show_event',
      'highlight',
      'sides',
      'route',
      'connect',
      'mark',
    ]);
    expect(req.turns[0]!.content.startsWith(INSTRUCTIONS_FILE)).toBe(true); // the owner's file, as it is, in every call
    expect(req.turns.at(-1)!.content).toContain(`İSTEK\n${NARRATION_REQUEST}`);
    expect(req.turns.at(-1)!.content).toContain('nazi-germany | Nazi Almanyası');
    expect(req.turns.at(-1)!.content).toContain('Stalingrad Muharebesi'); // the app's own record, as a source
    expect(req.turns.at(-1)!.content).toContain('stalingrad-1942 | '); // and with the id show_event takes
    expect(req.turns.at(-1)!.content).not.toMatch(/İSKELET/); // the events are listed as information, not as a structure to follow
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    expect(atFirstText).toEqual([{ steps: [1, 2, 3, 4, 5, 6, 7, 8], captions: 8, drawn: 8 }]);
  });

  it('streams: the text only grows, and the answer is waiting, then streaming, then done', async () => {
    const provider = mock({ ...FAST, chunkChars: 60 });
    const session = makeSession(provider);
    const seen: { status: string; length: number }[] = [];
    session.subscribe(() => {
      const a = session.items.find((i) => i.kind === 'assistant') as AssistantItem | undefined;
      if (a) seen.push({ status: a.status, length: a.text.length });
    });
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const statuses = [...new Set(seen.map((s) => s.status))];
    expect(statuses).toEqual(['waiting', 'streaming', 'done']);
    const lengths = seen.filter((s) => s.status === 'streaming').map((s) => s.length);
    expect(lengths.length).toBeGreaterThan(3);
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(session.busy).toBe(false);
  });

  it('works for any place: a narration made of the place own record', async () => {
    const session = makeSession(mock());
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, contextAt(TOKYO, WAR));
    const answer = last(session);
    expect(answer.status).toBe('done');
    const sections = parseAnswer(answer.text).sections;
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(answer.plan.drawingAt(1).highlights).toEqual(['empire-of-japan']);
    expect(answer.plan.drawingAt(1).year).toBeDefined(); // every step of it says which year's borders it shows
  });

  it('and for the world when no place is chosen', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Bu aralıkta dünyada olanları anlat.', mode: 'narration' }, contextAt(null));
    const answer = last(session);
    expect(parseAnswer(answer.text).sections.length).toBeGreaterThanOrEqual(3);
    expect(answer.plan.drawingAt(2).events.length).toBeGreaterThan(0);
    // the mock tells the range's most important events, so the world's narration is the same turning points every time
    const second = makeSession(mock());
    await second.send({ text: 'Bu aralıkta dünyada olanları anlat.', mode: 'narration' }, contextAt(null));
    expect(
      last(second)
        .plan.numbers()
        .map((n) => last(second).plan.drawingAt(n).events),
    ).toEqual(answer.plan.numbers().map((n) => answer.plan.drawingAt(n).events));
  });
});

describe('a model that does not write quite what was asked', () => {
  const run = async (reply: ReturnType<MockScript>) => {
    const session = makeSession(mock(FAST, [() => reply]));
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    return last(session);
  };

  it('names polities in Turkish or English, numbers steps as text, and puts bold numbers for headings', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { n: '1', title: 'Başlangıç' } },
        {
          name: 'highlight',
          input: { step: '1', polities: ['Nazi Almanyası', 'Union of Soviet Socialist Republics'] },
        },
        { name: 'step', input: { n: 2, title: 'İki' } },
        { name: 'connect', input: { step: 2, from: 'Nazi Almanyası', to: 'İtalya', relation: 'İttifak' } },
        { name: 'set_year', input: { step: 2, year: '1941' } }, // a tool of an older version: there is none to run it, nothing happens
      ],
      text: '**1. Başlangıç**\nİlk paragraf.\n\n**2. İki**\nİkinci paragraf.',
    });
    expect(parseAnswer(answer.text).sections.map((s) => [s.n, s.title])).toEqual([
      [1, 'Başlangıç'],
      [2, 'İki'],
    ]);
    expect(answer.plan.drawingAt(1).highlights).toEqual(['nazi-germany', 'union-of-soviet-socialist-republics']);
    expect(answer.plan.drawingAt(2).links).toEqual([
      {
        from: { kind: 'polity', id: 'nazi-germany' },
        to: { kind: 'polity', id: 'kingdom-of-italy' },
        relation: 'alliance',
      },
    ]);
    expect(answer.plan.drawingAt(2).year).toBeUndefined();
  });

  it('takes the year from the step itself, as a number or as text, when it is in the range', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { n: 1, title: 'A', caption: 'a', year: '1941' } },
        { name: 'step', input: { n: 2, title: 'B', caption: 'b', year: 1700 } },
      ],
      text: '## 1. A\nİlk.\n\n## 2. B\nİkinci.',
    });
    expect(answer.plan.drawingAt(1).year).toBe(1941);
    expect(answer.plan.drawingAt(2).year).toBeUndefined(); // outside the range: left to the reader
    expect(answer.plan.titleOf(2)).toBe('B');
  });

  it('writes a line before the steps: it is kept apart, and the steps still line up with the plan', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { n: 1, title: 'A' } },
        { name: 'highlight', input: { step: 1, polities: ['nazi-germany'] } },
      ],
      text: 'Tamam, şimdi anlatıyorum.\n\n## 1. A\nGövde.',
    });
    const parsed = parseAnswer(answer.text);
    expect(parsed.preamble).toBe('Tamam, şimdi anlatıyorum.');
    expect(parsed.sections).toHaveLength(1);
    expect(answer.plan.drawingAt(parsed.sections[0]!.n).highlights).toEqual(['nazi-germany']);
  });

  it('plans several steps but writes plain paragraphs: the paragraphs become the steps', async () => {
    const answer = await run({
      calls: [
        { name: 'step', input: { title: 'Bir' } },
        { name: 'step', input: { title: 'İki' } },
        { name: 'highlight', input: { step: 2, polities: ['kingdom-of-italy'] } },
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
    expect(answer.plan.drawingAt(2).highlights).toEqual(['kingdom-of-italy']);
    expect(answer.plan.drawingAt(1).highlights).toEqual([]);
  });

  it('asks for things that do not exist: the answer still arrives, only the drawing is smaller', async () => {
    const answer = await run({
      calls: [
        { name: 'highlight', input: { polities: ['atlantis', 'lemuria'] } },
        { name: 'connect', input: { from: 'atlantis', to: 'nazi-germany', relation: 'war' } },
        { name: 'mark', input: { lon: 500, lat: 500, label: 'Yok' } },
        { name: 'show_event', input: { event: 'yok-boyle-bir-olay' } },
        { name: 'draw_everything', input: {} },
        { name: 'highlight', input: { polities: ['nazi-germany'] } },
      ],
      text: 'Yanıt yine de geldi.',
    });
    expect(answer.status).toBe('done');
    const d = answer.plan.drawingAt(1);
    expect(d).toMatchObject({ highlights: ['nazi-germany'], links: [], marks: [], events: [] });
    expect(d.year).toBeUndefined();
  });
});

describe('a question', () => {
  it('is one step with a caption and a text, and gets one map state: the pact highlights and connects both polities', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    const answer = last(session);
    expect(answer.status).toBe('done');
    expect(parseAnswer(answer.text).sections).toHaveLength(1);
    expect(answer.plan.numbers()).toEqual([1]);
    expect(answer.plan.titleOf(1)).toBe('Almanya ve İtalya');
    expect(answer.plan.captionOf(1)!.length).toBeLessThan(parseAnswer(answer.text).sections[0]!.body.length); // a caption, not the text
    const d = answer.plan.drawingAt(1);
    expect(d.highlights).toEqual(['nazi-germany', 'kingdom-of-italy']);
    // the model gave two cities, not two polities: the line runs from Berlin to Rome
    expect(d.links[0]).toMatchObject({
      relation: 'alliance',
      from: { kind: 'city', name: 'Berlin' },
      to: { kind: 'city', name: 'Roma' },
    });
    expect(d.events).toEqual(['uclu-pakt-1940']);
    expect(d.year).toBe(1939); // the step named it: the 1939 pact is not an event of the data
    expect(provider.requests[0]!.turns.at(-1)!.content).toContain(`İSTEK\n${AXIS_QUESTION}`);
  });

  it('is one step even for a plain Stalingrad question: caption, text and the event shown, nothing to choose between', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Stalingrad neden önemliydi?', mode: 'qa' }, berlin());
    const answer = last(session);
    expect(answer.plan.numbers()).toEqual([1]);
    expect(answer.plan.captionOf(1)).toContain('olay:stalingrad-1942');
    expect(answer.plan.drawingAt(1).events).toEqual(['stalingrad-1942']);
    expect(parseAnswer(answer.text).sections[0]!.body).toContain('\n\n'); // the full text has paragraphs the caption does not
  });

  it('answers the two scenes in the west with one step each: the fall of France on the borders of its start, the landings with the US in them', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Fransa 1940 sahnesini göster.', mode: 'qa' }, berlin());
    const france = last(session);
    expect(france.plan.numbers()).toEqual([1]);
    expect(france.plan.drawingAt(1).events).toEqual(['fransa-muharebesi-1940']);
    expect(france.plan.drawingAt(1).highlights).toEqual(['french-third-republic', 'kingdom-of-great-britain']);
    expect(france.plan.drawingAt(1).year).toBe(1939); // the Third Republic is in the data up to 1939
    expect(france.plan.captionOf(1)).toContain('olay:fransa-muharebesi-1940');
    await session.send({ text: 'Normandiya çıkarmasını göster.', mode: 'qa' }, berlin());
    const normandy = last(session);
    expect(normandy.plan.numbers()).toEqual([1]);
    expect(normandy.plan.drawingAt(1).events).toEqual(['normandiya-1944']);
    expect(normandy.plan.drawingAt(1).year).toBe(1944);
    expect(parseAnswer(normandy.text).sections[0]!.body).toContain('\n\n');
  });

  it('with a model that writes plain text and nothing else, the answer is still one step: the page makes the caption', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Hava gücü hakkında düz metin ver.', mode: 'qa' }, berlin());
    const answer = last(session);
    expect(answer.status).toBe('done');
    expect(answer.plan.empty).toBe(true);
    const [step, ...rest] = stepsOf(answer);
    expect(rest).toEqual([]);
    expect(step!.caption).toBe(
      "Hava gücü, İkinci Dünya Savaşı'nın sonucunu belirleyen etkenlerden biriydi. Savaşın başında Almanya'nın yıldırım savaşı, yoğun hava desteğiyle ilerleyen zırhlı birliklere dayanıyordu; Britanya Muharebesi'nde bu üstünlüğü kuramaması ise Almanya'nın ilk büyük başarısızlığı oldu.".split(
        /(?<=\.)\s/,
      )[0],
    );
    expect(step!.body).toBe(answer.text); // all of the text is for Read
    expect(hasMore(step!)).toBe(true);
  });

  it('sees the open event: the question about an event carries it as context, and the user item shows it', async () => {
    const provider = mock();
    const session = makeSession(provider);
    const stalingrad = data.eventsById.get('stalingrad-1942')!;
    await session.send({ text: 'Bu olayı anlat.', mode: 'qa', event: contextEvent(stalingrad, data) }, berlin());
    const user = session.items[0]!;
    expect(user.kind === 'user' && user.event?.id).toBe('stalingrad-1942');
    expect(provider.requests[0]!.turns.at(-1)!.content).toContain('Açık olay kartı: «Stalingrad Muharebesi»');
    const answer = last(session);
    expect(answer.plan.drawingAt(1).highlights).toEqual([]); // only which event: the app lights its parties itself
    expect(answer.plan.drawingAt(1).links).toEqual([]);
    expect(answer.plan.drawingAt(1).events).toEqual(['stalingrad-1942']); // its own marker, not a mark of the model's
    expect(answer.plan.drawingAt(1).marks).toEqual([]);
    expect(answer.plan.drawingAt(1).year).toBe(1942);
    expect(answer.plan.captionOf(1)).toBeTruthy(); // an answer about an event has its caption too
  });

  it('carries the chat so far into the next call, because the model keeps nothing', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    const turns = provider.requests[1]!.turns;
    expect(turns.map((t) => t.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(turns[1]!.content).toContain(NARRATION_REQUEST);
    expect(turns[2]!.content).toContain('## 1. Polonya’ya saldırı');
    expect(turns[3]!.content).toContain(AXIS_QUESTION);
  });

  it('sends the whole conversation every time, with what each answer put on the map, so the model knows what it said', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    await session.send({ text: 'Peki Japonya?', mode: 'qa' }, berlin());
    const turns = provider.requests[2]!.turns;
    expect(turns.map((t) => t.role)).toEqual(['user', 'user', 'assistant', 'user', 'assistant', 'user']);
    // the whole first answer, every step of it, and what it showed
    expect(turns[2]!.content).toContain(
      "[Haritada gösterdiklerim: 1. adım: öne çıkan: Nazi Almanyası; olay: Almanya'nın Polonya'yı işgali",
    );
    expect(turns[2]!.content).toContain('## 8. Berlin ve teslim');
    expect(turns[2]!.content).toMatch(
      /4\. adım: taraflar: Mihver ve ortakları \([^)]+\) – Sovyetler Birliği \([^)]+\); yol \(ilerleyiş\): Brest → Minsk → Smolensk → Moskova \(Alman ilerleyişi\); olay: Barbarossa Harekâtı, Leningrad Kuşatması/,
    );
    expect(turns[4]!.content).toContain('öne çıkan: Nazi Almanyası, İtalya Krallığı'); // the second answer's own scene
    // and the next request, when the chat is not too long, loses nothing
    expect(provider.requests[1]!.turns[2]!.content).toBe(turns[2]!.content);
  });

  it('condenses an old answer instead of dropping it when the chat gets long, and the page keeps all of it', async () => {
    const long = 'Çok uzun bir yanıt. '.repeat(900);
    let n = 0;
    const talky: MockScript = () => ({ text: `${++n}: ${long}` });
    const provider = mock(FAST, [talky]);
    const session = makeSession(provider);
    for (let i = 0; i < 8; i++) await session.send({ text: `Soru ${i}`, mode: 'qa' }, berlin());
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    expect(provider.requests[0]!.turns.at(-1)!.content).not.toContain('TEKRAR');
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    expect(provider.requests[1]!.turns.at(-1)!.content).toContain(
      'TEKRAR\nBu istek (aynı sözlerle, aynı konuda) bu sohbette daha önce 1 kez yapıldı',
    );
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, contextAt(TOKYO));
    expect(provider.requests[2]!.turns.at(-1)!.content).not.toContain('TEKRAR'); // another place: a new ask
  });

  it('sends a narration request as it sends any other: the context, the lists, the request; no skeleton, whoever is asked about', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, contextAt(TOKYO));
    await session.send({ text: 'Bu aralıkta dünyada olanları anlat.', mode: 'narration' }, contextAt(null));
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    for (const req of provider.requests) {
      const turn = req.turns.at(-1)!.content;
      expect(turn).not.toMatch(/İSKELET|ANLATIM/);
      expect(turn).toContain('OLAYLAR (');
      expect(turn).toContain('POLİTİLER (');
      expect(req.turns[0]!.content).not.toMatch(/iskelet/i);
    }
  });

  it('refuses to start a second call while one runs', async () => {
    const provider = mock({ ...FAST, thinkMs: 30 });
    const session = makeSession(provider);
    const first = session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    await session.send({ text: 'ikinci', mode: 'qa' }, berlin());
    await first;
    expect(provider.requests).toHaveLength(1);
    expect(session.items).toHaveLength(2);
  });
});

describe('when the subject changes mid-conversation', () => {
  it('puts one marker in the chat, updates it, and takes it away if the reader goes back', async () => {
    const session = makeSession(mock());
    session.syncContext(contextAt(LONDON)); // before any question: nothing to point out
    expect(session.items).toHaveLength(0);

    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    expect(session.items).toHaveLength(2);

    session.syncContext(contextAt(LONDON)); // Britain
    const marker = session.items.at(-1)!;
    expect(marker).toMatchObject({ kind: 'context', from: 'Nazi Almanyası · 1939–1945' });
    expect(marker.kind === 'context' && marker.to).toMatch(/^Birleşik Krallık · 1939–1945$/);

    session.syncContext(contextAt(LONDON, { from: 1939, to: 1941 })); // and then the range
    expect(session.items).toHaveLength(3);
    expect(session.items.at(-1)!.kind === 'context' && (session.items.at(-1) as { to: string }).to).toBe(
      'Birleşik Krallık · 1939–1941',
    );

    session.syncContext(berlin()); // back where the conversation was
    expect(session.items).toHaveLength(2);
  });

  it('is not triggered by moving the year cursor or opening an event', async () => {
    const session = makeSession(mock());
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    session.syncContext({ ...berlin(), year: 1943 });
    session.syncContext(contextAt(BERLIN, WAR, 'stalingrad-1942'));
    expect(session.items).toHaveLength(2);
  });

  it('tells the model, once, that the subject changed', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await session.send({ text: 'Peki burada ne oluyordu?', mode: 'qa' }, contextAt(LONDON));
    expect(provider.requests[1]!.turns.at(-1)!.content).toContain('Konu değişti');
    await session.send({ text: 'Ve sonra?', mode: 'qa' }, contextAt(LONDON));
    expect(provider.requests[2]!.turns.at(-1)!.content).not.toContain('Konu değişti');
    // each earlier question keeps the subject it was asked about
    expect(provider.requests[2]!.turns.map((t) => t.content).join('\n')).toContain(
      '[Birleşik Krallık · 1939–1945] Peki burada ne oluyordu?',
    );
  });
});

describe('stopping and failing', () => {
  it('Stop ends the call at once, keeps what was written, and leaves the chat ready for another question', async () => {
    const provider = mock({ thinkMs: 0, roundMs: 0, chunkChars: 20, chunkMs: 15 });
    const session = makeSession(provider);
    const pending = session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
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
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    expect(last(session).status).toBe('done');
  });

  it('Stop during the thinking stage leaves an empty, stopped answer', async () => {
    const session = makeSession(mock({ ...FAST, thinkMs: 500 }));
    const pending = session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    await new Promise((r) => setTimeout(r, 20));
    session.stop();
    await pending;
    expect(last(session)).toMatchObject({ status: 'stopped', text: '' });
  });

  it('rate_limited is shown where it happened, keeps the partial text, and does not lock the chat', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Deneme [hata:rate_limited]', mode: 'qa' }, berlin());
    const answer = last(session);
    expect(answer.status).toBe('failed');
    expect(answer.error?.code).toBe('rate_limited');
    expect(answer.text.length).toBeGreaterThan(0);
    expect(session.blocked).toBeNull();
  });

  it('not_granted locks the composer for the rest of the visit and nothing is sent again', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Deneme [hata:not_granted]', mode: 'qa' }, berlin());
    expect(last(session).error?.code).toBe('not_granted');
    expect(session.blocked?.code).toBe('not_granted');
    await session.send({ text: 'Bir daha', mode: 'qa' }, berlin());
    expect(provider.requests).toHaveLength(1);
  });

  it('a refusal withdraws what had been written', async () => {
    const session = makeSession(mock());
    await session.send({ text: 'Deneme [hata:refused]', mode: 'qa' }, berlin());
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
    await session.send({ text: 'x', mode: 'qa' }, berlin());
    expect(last(session).error).toEqual({ code: 'upstream_error', message: 'boom' });
    const worse: ModelProvider = { ...odd, complete: () => Promise.reject('boom') };
    const s2 = makeSession(worse);
    await s2.send({ text: 'x', mode: 'qa' }, berlin());
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
    session.syncContext(berlin());
    await session.send({ text: 'Soru?', mode: 'qa' }, berlin());
    expect(last(session).status).toBe('failed');
    await session.retry();
    expect(session.items.map((i) => i.kind)).toEqual(['user', 'assistant']);
    expect(last(session)).toMatchObject({ status: 'done', text: 'Tamam: Soru?' });
  });

  it('retry does nothing when the last answer is fine', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    await session.retry();
    expect(provider.requests).toHaveLength(1);
  });

  it('a failed question does not travel with the next one as history', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: 'Deneme [hata:upstream_error]', mode: 'qa' }, berlin());
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
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
    await session.send({ text: 'Soru 1', mode: 'qa' }, berlin());
    expect(seen).toEqual([7, 0]);
    expect(last(session)).toMatchObject({ status: 'done', text: 'Yalnızca metin.', notes: [NO_TOOLS_NOTE] });
    await session.send({ text: 'Soru 2', mode: 'qa' }, berlin());
    expect(seen).toEqual([7, 0, 0]); // no second round trip for the same refusal
  });

  it('a view that reports no tools gets plain text and a note, with no polity list in the prompt', async () => {
    const provider = mock({ ...FAST, tools: false });
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    expect(provider.requests[0]!.tools.map((t) => t.name)).toEqual(['step', 'show_event', 'highlight']);
    expect(last(session).status).toBe('done');
  });
});

describe('housekeeping', () => {
  it('a new chat forgets everything, and the next question starts without history', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    session.newChat();
    expect(session.items).toEqual([]);
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, contextAt(LONDON));
    expect(provider.requests[1]!.turns.map((t) => t.role)).toEqual(['user', 'user']);
    expect(provider.requests[1]!.turns.at(-1)!.content).not.toContain('Konu değişti');
  });

  it('the reader can change the speed between questions', async () => {
    const provider = mock();
    const session = makeSession(provider);
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    session.setTier('complex');
    await session.send({ text: 'Peki Japonya?', mode: 'qa' }, berlin());
    expect(provider.requests.map((r) => r.tier)).toEqual(['default', 'complex']);
  });

  it('knows its provider once it has resolved, and survives one that never does well', async () => {
    const provider = new MockProvider([], FAST);
    const session = makeSession(provider);
    await Promise.resolve();
    await Promise.resolve();
    expect(session.provider).toBe(provider);

    const broken = new AiSession({ provider: Promise.reject(new Error('yok')), data, sources: [] });
    await broken.send({ text: 'x', mode: 'qa' }, berlin());
    expect((broken.items.at(-1) as AssistantItem).error?.code).toBe('upstream_error');
  });
});
