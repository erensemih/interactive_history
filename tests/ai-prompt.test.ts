import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { subjectKey, subjectLabel, type AiContext } from '../src/ai/context';
import { drawingOf, emptyDrawing, TurnPlan } from '../src/ai/drawing';
import { INSTRUCTIONS_FILE } from '../src/ai/instructions';
import {
  buildTurns,
  condense,
  describeCatalog,
  describeContext,
  describeEvents,
  FULL_HISTORY_BYTES,
  instructions,
  narrationRequest,
  NARRATION_REQUEST,
  utf8Bytes,
  WORLD_NARRATION_REQUEST,
  type HistoryTurn,
  type PromptInput,
} from '../src/ai/prompt';
import { Resolver } from '../src/ai/resolve';
import { createTools } from '../src/ai/tools';
import { appEventsSource, gatherPassages, type SourceProvider } from '../src/ai/sources';
import { archivedData } from './helpers/shipped';

const data = archivedData('1400-1600');
const resolver = new Resolver(data);
const range = { from: 1500, to: 1550 };

const context: AiContext = {
  range,
  year: 1525,
  places: [
    {
      id: '35.500,38.900',
      point: { lon: 35.5, lat: 38.9 },
      title: 'Osmanlı İmparatorluğu',
      occupation: null,
      holder: { id: 'ottoman-empire', name: 'Osmanlı İmparatorluğu' },
      regions: ['Anadolu'],
      lineage: ['ottoman-empire', 'anatolia'],
      range,
      sovereigns: [{ id: 'ottoman-empire', name: 'Osmanlı İmparatorluğu', from: 1500, to: 1550 }],
    },
  ],
  event: null,
};

const base = (patch: Partial<PromptInput> = {}): PromptInput => ({
  question: NARRATION_REQUEST,
  context,
  previous: null,
  catalog: resolver.catalog(range),
  events: resolver.eventCatalog(range),
  sources: [],
  drawing: null,
  nameOf: (id) => resolver.nameOf(id),
  history: [],
  tools: true,
  ...patch,
});

/** The rules the notes used to carry about how to build a narration (the skeleton, the shape, which tool when). They are gone. */
const REMOVED_RULES: [name: string, pattern: RegExp][] = [
  ['the narration skeleton', /iskelet/i],
  ['a step per skeleton row', /sıra ve adım sayısı/],
  ['do not add steps', /adım ekleme/],
  ['one step for one thing', /tek (bir şeyi anlatıyorsan )?adım yaz/i],
  ['every answer has steps', /Her cevap adımlıdır/],
  ['no format to choose', /Biçim seçmen gerekmez/],
  ['merge steps that share a scene', /aynı sahneyi paylaşan/],
  ['one event, no connect or mark', /Aynı olay için ayrıca/],
  ['highlight only for the others', /yalnızca onlardan başka devletler/],
  ['sides only for two-sided conflicts', /Yalnızca gerçekten iki/],
  ['connect only for what the data lacks', /yalnızca OLAYLAR'da karşılığı olmayan/],
  ['do not show far-away things together', /çok uzak şeyleri gereksiz yere gösterme/],
  ['stay in the selected range', /aralığın dışındaki gelişmelere/],
  ['do not contradict the records', /onlarla çelişme/],
  ['each step must declare everything itself', /kendi başına bildirmeli/],
  ['skipped tools are of no importance', /önemli değil/],
];

describe('instructions', () => {
  it("are the owner's file, as it is, followed by the page's own notes", () => {
    const file = readFileSync(new URL('../instructions/okuma-arkadasi.txt', import.meta.url), 'utf8');
    expect(INSTRUCTIONS_FILE).toBe(file.replace(/\r\n?/g, '\n').trimEnd());
    for (const tools of [true, false]) {
      const text = instructions(tools);
      expect(text.startsWith(INSTRUCTIONS_FILE)).toBe(true);
      expect(text.slice(INSTRUCTIONS_FILE.length)).toMatch(/^\n\nUYGULAMA NOTLARI\n/);
    }
    expect(INSTRUCTIONS_FILE).toContain('Sen, tarih okuyan birine harita üzerinden eşlik eden bir okuma arkadaşısın.');
    expect(INSTRUCTIONS_FILE).toContain('Anlatımı nasıl kuracağın sana kalmış: kaç sahne, hangi sırayla');
  });

  it('leave how to build a narration to the model: none of the rules that used to steer it is left, in the file or in the notes', () => {
    for (const tools of [true, false]) {
      const text = instructions(tools);
      for (const [name, pattern] of REMOVED_RULES) expect(text, name).not.toMatch(pattern);
    }
  });

  it('keep the file to what the owner wrote: what the model has, the format, the truth, the tone, the reader’s say', () => {
    for (const heading of ['## Elindekiler', '## Biçim', '## Doğruluk', '## Ton', '## Kullanıcı']) {
      expect(INSTRUCTIONS_FILE).toContain(heading);
    }
    expect(INSTRUCTIONS_FILE).toContain('kamera dahil, uygulama halleder');
    // (line breaks of the file are not part of its words)
    const words = INSTRUCTIONS_FILE.replace(/\s+/g, ' ');
    expect(words).toContain('Cevabın sahnelerden oluşur; tek bir sahne de olabilir.');
    expect(words).toContain('Veri setindeki bir olaydan söz ettiğinde onu olay olarak işaretle');
    expect(INSTRUCTIONS_FILE).toContain('Bilmediğin şeyi uydurma. Emin olmadığın bir konum için çizim yapma.');
    expect(INSTRUCTIONS_FILE).toContain('İşgal edilmiş bir toprağı işgal olarak an.');
    expect(INSTRUCTIONS_FILE).toContain('tartışmalı olarak anlat; taraf\ntutma');
    expect(INSTRUCTIONS_FILE).toContain('Kullanıcı başka bir şey isterse');
  });

  it('describe the scenes of an answer in the owner’s words: a title, a caption that goes sentence by sentence, a full text, a beat for each sentence', () => {
    const words = INSTRUCTIONS_FILE.replace(/\s+/g, ' ');
    expect(words).toContain(
      'Cevabın sahnelerden oluşur; tek bir sahne de olabilir. Her sahnenin kısa bir başlığı, cümle cümle ilerleyen bir altyazısı ve tam bir metni vardır. Altyazının her cümlesi haritada bir vuruştur: o cümle okunurken haritada ne görüneceğini sen seçersin.',
    );
    // what the file said of the caption before (a line or two, the essence of the text) is gone: the sentence above replaces it
    expect(words).not.toContain('bir iki cümle');
    expect(words).not.toContain('Altyazı metnin özüdür');
  });

  it('offer the seven tools, the first two named in the notes (the protocol is built on them) and the rest by their own descriptions', () => {
    const plan = new TurnPlan();
    const offered = createTools({ resolver, range, plan }).map((t) => t.name);
    expect(offered).toEqual(['step', 'show_event', 'highlight', 'sides', 'route', 'territory_change', 'mark']);
    const text = instructions(true);
    expect(text).toContain('`step`');
    expect(text).toContain('show_event{step:1,beat:1,event:"…"}');
    expect(text).toContain('POLİTİLER');
    expect(text).toContain('OLAYLAR');
    // which tool does what is in the tools’ descriptions (see ai-tools.test.ts), not in the notes
    for (const name of ['highlight', 'sides', 'route', 'territory_change', 'mark'])
      expect(text).not.toContain(`\`${name}\``);
    expect(text).not.toContain('connect'); // there is no line between two places any more
  });

  it('tell the mechanics of the beats and the camera, and the one meaning of each kind of mark, without saying how to use them', () => {
    const text = instructions(true);
    // each sentence of a caption is a beat; `beat` says which sentence an action appears with
    expect(text).toContain('Altyazı cümlelere bölünür');
    expect(text).toContain('`beat`');
    expect(text).toContain('okuma hızında sırayla oynar');
    expect(text).toContain('küçük numaralı noktalara dönüşür');
    expect(text).toContain('sahnenin başında bir kez konumlanır');
    // the fixed visual language: area, arrow, point, hatching
    expect(text).toContain(
      'alan toprak ya da denetimdir, ok gerçek bir harekettir, nokta bir yer ya da olaydır, tarama işgal ya da belirsizliktir',
    );
    // the colours belong to the actors for the whole narration
    expect(text).toContain('devletlerin renkleri anlatım boyunca aynı kalır');
  });

  it('say what the app does so the model does not have to: no camera, no looks, the year of the map', () => {
    const text = instructions(true);
    expect(text).toContain('nasıl görüneceğini (renk, vurgu, ok, kamera) uygulama belirler');
    expect(text).not.toContain('`focus`');
    expect(text).not.toContain('`set_year`');
    expect(text).toContain('year'); // the step's own, which it may name
    expect(text).toMatch(
      /sahnedeki olayın başladığı yıl \(o yılın sınırlarında olayın ana tarafları yoksa bir önceki yıl\)/,
    );
    expect(text).toContain('toprak değişiminin from yılı');
    expect(text).toMatch(/Harita, etkin sahnenin kendi gösterimini gösterir/);
    expect(text).not.toContain('devral'); // nothing is inherited from the step before
  });

  it('teach the way an event is named in a text, so the reader can click it', () => {
    const text = instructions(true);
    expect(INSTRUCTIONS_FILE.replace(/\s+/g, ' ')).toContain('onu olay olarak işaretle');
    expect(text).toContain('`[olay adı](olay:KİMLİK)`');
    expect(text).toContain("`[Stalingrad Muharebesi](olay:stalingrad-1942)'nde`");
    expect(text).toMatch(/başlıklarda da kullanılmaz/);
    expect(text).toMatch(/listede olmayan kimlik tanınmaz/); // the ids come from the lists
  });

  it('give the two-phase protocol of a stepped answer: the tools first, in one round, then the numbered texts', () => {
    const text = instructions(true);
    expect(text).toContain('Önce metin yazmadan');
    expect(text).toContain('tek turda, birlikte (paralel)');
    expect(text).toMatch(/step`\{n, title, caption\}/);
    expect(text).toContain('"## n. Başlık"');
    expect(text).toContain('"Devamını oku"');
    expect(text).toMatch(/Cevabın her sahnesi için `step` aracıyla/);
  });

  it('show the protocol on a format example that says nothing of what a narration is to be', () => {
    const text = instructions(true);
    const example = text.slice(text.indexOf('ÖRNEK'));
    expect(example.startsWith('ÖRNEK (biçim)')).toBe(true);
    expect(example).toMatch(/step\{n:1,title:"…",caption:"Birinci cümle\. İkinci cümle\."\}/);
    expect(example).toMatch(/show_event\{step:1,beat:1,event:"…"\}/);
    expect(example).toMatch(/\n ## 1\. …\n/);
    expect(example).toMatch(/\n ## 2\. …\n/);
    expect(example).not.toMatch(/stalingrad|barbarossa|sides\{/i);
    expect(instructions(false)).not.toContain('ÖRNEK');
  });

  it('without tools they say so and mention no tool', () => {
    const text = instructions(false);
    expect(text).toContain('yalnızca metin');
    expect(text).not.toContain('highlight');
    expect(text).not.toContain('show_event');
    expect(text).toContain('## n. Başlık');
    // the caption is made from the text: its first sentences, with the rest behind "Devamını oku"
    expect(text).toContain('ilk bir iki cümlesi');
    expect(text).toContain('tek sahne de olabilir');
  });
});

describe('narrationRequest (what the narration button asks)', () => {
  const holder = { id: 'ottoman-empire', name: 'Osmanlı İmparatorluğu' };

  it('gives the model both things "this place" can mean: the point and the polity whose borders hold it in the year shown', () => {
    const text = narrationRequest(context);
    expect(text.startsWith(NARRATION_REQUEST)).toBe(true);
    expect(text).toContain('Seçtiğim yer: 35.50°D, 38.90°K');
    expect(text).toContain('1525 sınırlarında bu noktayı içeren devlet: Osmanlı İmparatorluğu');
  });

  it('does not say which of the two to tell about: how much is the point’s and how much the polity’s is the model’s to decide', () => {
    const text = narrationRequest(context);
    expect(text).not.toMatch(/odaklan|ağırlık|öncelik|yalnızca|sadece|özellikle|devleti anlat|noktayı anlat/i);
    // the polity's own events are not told apart from the place's either: the request is the button's, as it was, plus facts
    expect(text.slice(NARRATION_REQUEST.length)).toMatch(/^ Seçtiğim yer: [^;]+; [^;]+\.$/);
  });

  it('says so when the point belongs to no polity of the data, and what an occupied land really is', () => {
    const bare = { ...context, places: [{ ...context.places[0]!, holder: null }] };
    expect(narrationRequest(bare)).toContain('1525 sınırlarında bu nokta kayıtlı bir devlete ait değil');
    const occupied = {
      ...context,
      places: [
        {
          ...context.places[0]!,
          holder: { id: 'nazi-germany', name: 'Nazi Almanyası' },
          occupation: { id: 'poland', name: 'Polonya', holder: 'Nazi Almanyası', label: 'Alman işgali' },
        },
      ],
    };
    const text = narrationRequest(occupied);
    expect(text).toContain('Nazi Almanyası');
    expect(text).toContain('bu toprak gerçekte Polonya, o yıllarda Alman işgali');
    expect(holder.name).toBe('Osmanlı İmparatorluğu'); // (the plain case above names the holder as it is)
  });

  it('asks about the world as before when no place is selected', () => {
    expect(narrationRequest({ ...context, places: [] })).toBe(WORLD_NARRATION_REQUEST);
  });
});

describe('describeContext', () => {
  it('names the range, the year, the place, who held it and the open event', () => {
    const text = describeContext(
      {
        ...context,
        event: {
          id: 'mohac-1526',
          title: 'Mohaç Muharebesi',
          dateLabel: '29 Ağustos 1526',
          placeName: 'Mohaç',
          summary: 'Özet.',
          parties: ['Osmanlı İmparatorluğu', 'Macaristan Krallığı'],
          point: { lon: 18.68, lat: 45.99 },
          category: 'war',
        },
      },
      null,
    );
    expect(text).toContain('1500–1550');
    expect(text).toContain('1525');
    expect(text).toContain('Osmanlı İmparatorluğu (35.50°D, 38.90°K)');
    expect(text).toContain(
      'Haritada gösterilen yılda (1525) bu noktayı sınırlarında içeren devlet: Osmanlı İmparatorluğu.',
    );
    expect(text).toContain('Anadolu');
    expect(text).toContain('Bu noktanın egemenleri');
    expect(text).toContain('«Mohaç Muharebesi» (kimlik: mohac-1526), 29 Ağustos 1526');
    expect(text).toContain('Macaristan Krallığı');
  });

  it('says there is no place, and that the subject changed', () => {
    const none = { ...context, places: [] };
    expect(describeContext(none, null)).toContain('Seçili yer yok');
    const changed = describeContext(none, context);
    expect(changed).toContain('Konu değişti');
    expect(changed).toContain('«Osmanlı İmparatorluğu · 1500–1550»');
    expect(changed).toContain('«Dünya · 1500–1550»');
  });
});

describe('subject', () => {
  it('changes with the place and the range, not with the year shown or the open event', () => {
    expect(subjectKey(context)).toBe(subjectKey({ ...context, year: 1530 }));
    expect(subjectKey(context)).not.toBe(
      subjectKey({ ...context, places: [{ ...context.places[0]!, id: '2.000,46.000' }] }),
    );
    const moved = {
      ...context,
      range: { from: 1450, to: 1500 },
      places: [{ ...context.places[0]!, range: { from: 1450, to: 1500 } }],
    };
    expect(subjectKey(moved)).not.toBe(subjectKey(context));
    expect(subjectKey({ ...context, places: [] })).toBe('world@1500-1550');
    expect(subjectLabel(context)).toBe('Osmanlı İmparatorluğu · 1500–1550');
  });
});

describe('describeCatalog', () => {
  it('gives id and name, and the years only when the polity is there for part of the range', () => {
    const text = describeCatalog(resolver.catalog(range), range);
    expect(text).toMatch(/^ottoman-empire \| Osmanlı İmparatorluğu$/m);
    expect(text).toMatch(/^mamluk-sultanate \| Memlük Sultanlığı \| 1500–\d{4}$/m);
  });
});

describe('buildTurns', () => {
  it('is the rules, then the new request with the state, the polities and the records', async () => {
    const sources = await gatherPassages([appEventsSource(data)], {
      mode: 'narration',
      question: NARRATION_REQUEST,
      context,
    });
    const turns = buildTurns(base({ sources }));
    expect(turns).toHaveLength(2);
    expect(turns.every((t) => t.role === 'user')).toBe(true);
    expect(turns[0]!.content.startsWith(INSTRUCTIONS_FILE)).toBe(true);
    const last = turns[1]!.content;
    expect(last).toMatch(/^BAĞLAM\n/);
    expect(last).toContain('POLİTİLER');
    expect(last).toContain('ottoman-empire | Osmanlı İmparatorluğu');
    expect(last).toContain('KAYITLAR\nUygulamanın olay kayıtları:');
    expect(last).toContain('Çaldıran Muharebesi');
    expect(last.endsWith(`İSTEK\n${NARRATION_REQUEST}`)).toBe(true);
    expect(last).not.toMatch(/ANLATIM|SORU/); // the model decides the form of the answer; the page does not tag the request
  });

  it('leaves the polity and event lists out when there are no tools', () => {
    const last = buildTurns(base({ tools: false, events: [] })).at(-1)!.content;
    expect(last).not.toContain('POLİTİLER');
    expect(last).not.toContain('OLAYLAR');
  });

  it('lists the range events with the ids show_event takes', () => {
    const last = buildTurns(base()).at(-1)!.content;
    expect(last).toContain('OLAYLAR (');
    expect(last).toMatch(/\ncaldiran-1514 \| [^|]+ \| Çaldıran Muharebesi \| Çaldıran\n/);
    expect(last).not.toContain('istanbul-fethi-1453 |'); // outside the range
    const lines = describeEvents(resolver.eventCatalog(range)).split('\n');
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.every((l) => l.split(' | ').length === 4)).toBe(true);
  });

  it('tells the model what it has already drawn', () => {
    const drawing = drawingOf([
      { kind: 'highlight', step: 1, beat: 1, polities: ['ottoman-empire'] },
      { kind: 'event', step: 1, beat: 1, id: 'caldiran-1514' },
    ]);
    const turn = buildTurns(base({ drawing, eventTitleOf: (id) => resolver.eventById(id)?.title ?? id })).at(-1)!;
    expect(turn.content).toContain('öne çıkan: Osmanlı İmparatorluğu');
    expect(turn.content).toContain('olay: Çaldıran Muharebesi');
    expect(buildTurns(base({ drawing: emptyDrawing() })).at(-1)!.content).not.toContain('çizdiklerin');
  });

  it('carries the chat so far, in order, with each reader turn marked by its subject', () => {
    const turns = buildTurns(
      base({
        question: 'Fransa ile ittifak neydi?',
        history: [
          { role: 'user', text: NARRATION_REQUEST, subject: 'Osmanlı İmparatorluğu · 1500–1550' },
          { role: 'assistant', text: '## 1. Başlık\nMetin.' },
          {
            role: 'user',
            text: 'Bunu açar mısın?',
            subject: 'Osmanlı İmparatorluğu · 1500–1550',
            event: 'Mohaç Muharebesi',
          },
          { role: 'assistant', text: 'Açıklama.' },
          { role: 'user', text: 'Daha kısa anlat.' },
          { role: 'assistant', text: 'Kısa.' },
        ],
      }),
    );
    expect(turns.map((t) => t.role)).toEqual([
      'user',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    expect(turns[1]!.content).toBe(`[Osmanlı İmparatorluğu · 1500–1550] ${NARRATION_REQUEST}`);
    expect(turns[2]!.content).toBe('## 1. Başlık\nMetin.');
    expect(turns[3]!.content).toBe('[Osmanlı İmparatorluğu · 1500–1550 · olay: «Mohaç Muharebesi»] Bunu açar mısın?');
    expect(turns[5]!.content).toBe('Daha kısa anlat.'); // no subject, no tag
    expect(turns[7]!.content).toContain('İSTEK\nFransa ile ittifak neydi?');
  });

  it('keeps the input under the limit by condensing the oldest exchanges, never by dropping any, nor the rules or the request', () => {
    const long = 'Eski yanıt. '.repeat(400);
    const history = Array.from({ length: 12 }, (_, i) => [
      { role: 'user' as const, text: `Soru ${i}` },
      { role: 'assistant' as const, text: `${i}: ${long}`, digest: `${i}. adım — özet.` },
    ]).flat();
    const turns = buildTurns(base({ history }), 30_000);
    const bytes = turns.reduce((n, t) => n + utf8Bytes(t.content), 0);
    expect(bytes).toBeLessThanOrEqual(30_000);
    expect(turns[0]!.content.startsWith(INSTRUCTIONS_FILE)).toBe(true);
    expect(turns.at(-1)!.content).toContain('İSTEK');
    // the newest answer is still whole
    expect(turns.some((t) => t.role === 'assistant' && t.content.startsWith('11: Eski yanıt.'))).toBe(true);
    // the oldest are shorter, and every question of the chat is still somewhere in what the model is sent
    const all = turns.map((t) => t.content).join('\n');
    for (let i = 0; i < 12; i++) expect(all).toContain(`Soru ${i}`);
    expect(all).not.toMatch(/^0: Eski yanıt/m); // (not "10: …", whose tail reads the same)
  });

  it('sends a long chat whole when it fits, and keeps the page’s own hard limit in mind', () => {
    const history = Array.from({ length: 6 }, (_, i) => [
      { role: 'user' as const, text: `Soru ${i}` },
      { role: 'assistant' as const, text: `Yanıt ${i}.`, scenes: `${i}. adım: olay: X` },
    ]).flat();
    const turns = buildTurns(base({ history }));
    expect(turns).toHaveLength(1 + 12 + 1);
    expect(turns.filter((t) => t.role === 'assistant')).toHaveLength(6);
    expect(turns[2]!.content).toBe('[Haritada gösterdiklerim: 0. adım: olay: X]\nYanıt 0.'); // what it showed goes with what it wrote
  });

  it('tells the model how many times the same ask has been made, and only then', () => {
    const none = buildTurns(base()).at(-1)!.content;
    expect(none).not.toContain('TEKRAR');
    const again = buildTurns(base({ repeats: 2 })).at(-1)!.content;
    expect(again).toMatch(/\nTEKRAR\nBu istek \(aynı sözlerle, aynı konuda\) bu sohbette daha önce 2 kez yapıldı/);
    expect(again.indexOf('TEKRAR')).toBeLessThan(again.indexOf('İSTEK\n')); // before the request, like the other facts
    // a fact, not an order: what to do about it is the model's
    expect(again).not.toMatch(/Aynısını baştan yazma|atıf yap|neyi merak/);
  });

  it('gives a narration request the same as any other: the lists as information, no skeleton to follow', () => {
    const last = buildTurns(base({ question: NARRATION_REQUEST })).at(-1)!.content;
    expect(last).toContain('POLİTİLER (');
    expect(last).toContain('OLAYLAR (');
    expect(last).not.toMatch(/İSKELET|bu sıra ve sayıda/);
    expect(last).not.toContain('ANLATIM');
    // the lists say what they are for (the ids the tools take), not what to do with them
    expect(last).toMatch(
      /OLAYLAR \(uygulamanın seçili aralıktaki olayları; show_event ve metindeki \[ad\]\(olay:kimlik\)/,
    );
  });

  it('thins the records before it gives up the request', async () => {
    const sources = [
      { label: 'Kaynak', passages: Array.from({ length: 40 }, (_, i) => ({ title: `T${i}`, text: 'x'.repeat(1000) })) },
    ];
    const turns = buildTurns(base({ sources }), 26_000);
    expect(turns.reduce((n, t) => n + utf8Bytes(t.content), 0)).toBeLessThanOrEqual(26_000);
    expect(turns.at(-1)!.content).toContain('İSTEK');
  });

  it('skips empty history turns (a stopped answer that never wrote anything)', () => {
    const turns = buildTurns(
      base({
        history: [
          { role: 'user', text: 'Soru' },
          { role: 'assistant', text: '  ' },
        ],
      }),
    );
    expect(turns.map((t) => t.role)).toEqual(['user', 'user', 'user']);
  });
});

describe('sources', () => {
  it('the app records for the range come first for the place lineage, then by importance, shown in date order', async () => {
    const query = { mode: 'narration' as const, question: 'x', context };
    const found = await appEventsSource(data, 6).retrieve(query);
    expect(found).toHaveLength(6);
    const dates = found.map((f) => f.title);
    expect(dates.some((t) => t.includes('Çaldıran'))).toBe(true); // an Ottoman event
    // date order: titles start with the date label, whose years never decrease
    const years = dates.map((t) => Number(/(\d{4})/.exec(t)![1]));
    expect(years).toEqual([...years].sort((a, b) => a - b));
    for (const y of years) expect(y).toBeGreaterThanOrEqual(1500);
    for (const y of years) expect(y).toBeLessThanOrEqual(1550);
  });

  it('stays inside its budget and leaves out a provider that fails', async () => {
    const big: SourceProvider = {
      id: 'big',
      label: 'Büyük',
      retrieve: () => Array.from({ length: 50 }, (_, i) => ({ title: `T${i}`, text: 'y'.repeat(900) })),
    };
    const broken: SourceProvider = {
      id: 'broken',
      label: 'Bozuk',
      retrieve: () => Promise.reject(new Error('çevrimdışı')),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const groups = await gatherPassages([broken, big], { mode: 'qa', question: 'x', context }, 5_000);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect(groups).toHaveLength(1);
    expect(groups[0]!.label).toBe('Büyük');
    const chars = groups[0]!.passages.reduce((n, p) => n + p.title.length + p.text.length, 0);
    expect(chars).toBeLessThanOrEqual(5_000);
    expect(groups[0]!.passages.length).toBeGreaterThan(0);
  });
});

describe('condense (the conversation as the model is sent it)', () => {
  const exchange = (i: number, size = 300): HistoryTurn[] => [
    { role: 'user', text: `Soru ${i}`, subject: 'Dünya · 1500–1550' },
    {
      role: 'assistant',
      text: `Yanıt ${i}. ${'ayrıntı '.repeat(size)}`,
      scenes: `${i}. adım: olay: Olay ${i}`,
      digest: `1. Başlık ${i} — özet ${i}.`,
    },
  ];
  const chat = (n: number, size?: number) => Array.from({ length: n }, (_, i) => exchange(i, size)).flat();
  const bytes = (turns: { content: string }[]) => turns.reduce((n, t) => n + utf8Bytes(t.content), 0);

  it('sends everything in full while the chat is short', () => {
    const turns = condense(chat(4));
    expect(turns).toHaveLength(8);
    expect(turns.filter((t) => t.role === 'assistant').every((t) => t.content.includes('ayrıntı ayrıntı'))).toBe(true);
    expect(turns.some((t) => t.content.includes('kısaltıldı'))).toBe(false);
  });

  it('starts sending the oldest answers in short once the chat is longer than the full-text budget, the newest stay whole', () => {
    const history = chat(40, 400); // far more than FULL_HISTORY_BYTES in full
    expect(bytes(condense(history, { fullBytes: 1e9, maxBytes: 1e9 }))).toBeGreaterThan(FULL_HISTORY_BYTES);
    const turns = condense(history);
    expect(bytes(turns)).toBeLessThanOrEqual(FULL_HISTORY_BYTES + 3_000);
    const answers = turns.filter((t) => t.role === 'assistant');
    expect(answers).toHaveLength(40); // none is gone
    expect(answers[0]!.content).toContain('[Önceki cevabımın özeti; sohbet uzadığı için kısaltıldı]');
    expect(answers[0]!.content).toContain('1. Başlık 0 — özet 0.');
    expect(answers[0]!.content).toContain('[Haritada gösterdiklerim: 0. adım: olay: Olay 0]'); // what it showed is kept in short too
    expect(answers.at(-1)!.content).toContain('ayrıntı ayrıntı'); // the last one is whole
    expect(answers.at(-1)!.content).not.toContain('kısaltıldı');
    // the shortening goes from the oldest on: once an answer is whole, every later one is
    const whole = answers.map((a) => !a.content.includes('kısaltıldı'));
    expect(whole.indexOf(true)).toBeGreaterThan(0);
    expect(whole.slice(whole.indexOf(true)).every(Boolean)).toBe(true);
  });

  it('folds the oldest exchanges into one short summary turn when even the digests do not fit', () => {
    const turns = condense(chat(30, 50), { fullBytes: 2_000, maxBytes: 5_000 });
    expect(bytes(turns)).toBeLessThanOrEqual(5_000);
    expect(turns[0]!.role).toBe('user');
    expect(turns[0]!.content).toContain('[Sohbetin başı, kısaca');
    // every question that is not in a turn of its own is in the summary, so no question is lost
    const text = turns.map((t) => t.content).join('\n');
    for (let i = 0; i < 30; i++) expect(text).toContain(`Soru ${i}`);
    // and the newest exchange is still a real pair
    expect(turns.at(-2)!.content).toContain('Soru 29');
    expect(turns.at(-1)!.role).toBe('assistant');
  });

  it('keeps an unanswered reader turn, and skips the empty ones', () => {
    const turns = condense([
      { role: 'user', text: 'Cevapsız soru' },
      { role: 'user', text: 'Boş', subject: 'x' },
      { role: 'assistant', text: '   ' },
      { role: 'user', text: 'Son soru' },
    ]);
    expect(turns.map((t) => t.content)).toEqual(['Cevapsız soru', '[x] Boş', 'Son soru']);
  });
});
