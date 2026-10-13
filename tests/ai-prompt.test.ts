import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { subjectKey, subjectLabel, type AiContext } from '../src/ai/context';
import { drawingOf, emptyDrawing, TurnPlan } from '../src/ai/drawing';
import { INSTRUCTIONS_FILE } from '../src/ai/instructions';
import { narrationOutline } from '../src/ai/outline';
import {
  buildTurns,
  condense,
  describeCatalog,
  describeContext,
  describeEvents,
  describeOutline,
  FULL_HISTORY_BYTES,
  instructions,
  NARRATION_REQUEST,
  utf8Bytes,
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
    expect(INSTRUCTIONS_FILE).toContain('Her adım için iki metin yazarsın:');
  });

  it('map every action the file names onto a tool the page really offers', () => {
    const plan = new TurnPlan();
    const offered = createTools({ resolver, range, plan }).map((t) => t.name);
    const text = instructions(true);
    const literal = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // what the file says the model may do, and the tool the notes give each of them
    for (const [inFile, inNotes, tool] of [
      ['sadece o olayı göster', 'veri setindeki bir olayı göstermek', 'show_event'],
      ['Hangi devletlerin öne çıkacağını', 'hangi devletlerin öne çıkacağını söylemek', 'highlight'],
      ['Bir çatışmanın taraflarını', 'bir çatışmanın taraflarını (kim kiminle) göstermek', 'sides'],
      [
        'sıralı yerlerden geçen yönlü bir yol',
        'bir ordunun ilerleyişini, bir seferi, bir geri çekilişi, bir göçü ya da bir ticaret yolunu çizmek',
        'route',
      ],
      ['Kendi çizgi', 'veride olmayan bir ilişkiyi çizmek', 'connect'],
      ['yol ve işaretlerini', 'veride olmayan bir yeri işaretlemek', 'mark'],
      ['Her adım için iki metin', 'adımları bildirmek', 'step'],
    ] as const) {
      expect(INSTRUCTIONS_FILE).toContain(inFile);
      expect(offered).toContain(tool);
      expect(text).toMatch(new RegExp(`${literal(inNotes)}[^\\n]*→ \`${tool}\``)); // "action → `tool`"
    }
    // every tool of the page is named in the notes, and no tool the file does not have a use for is offered
    expect(offered).toEqual(['step', 'show_event', 'highlight', 'sides', 'route', 'connect', 'mark']);
    for (const name of offered) expect(text).toContain(`\`${name}\``);
    expect(text).toContain('POLİTİLER');
    expect(text).toContain('OLAYLAR');
  });

  it('say what a place is: where lines begin and end and routes stop, with a polity standing for its capital', () => {
    const text = instructions(true);
    expect(INSTRUCTIONS_FILE).toContain('devletlerin ortası değil');
    expect(INSTRUCTIONS_FILE).toContain('o yılın başkenti');
    expect(text).toMatch(/Yerler\. `connect`in uçları ve `route`un durakları devletlerin ortası değil, YERLERDİR/);
    expect(text).toContain('eski adlar da tanınır');
    expect(text).toContain('"enlem, boylam"');
    expect(text).toContain('o yılın başkenti kullanılır');
    expect(text).toMatch(/Yerini emin olmadığın bir yeri koordinatla uydurma/);
  });

  it('say what sides and routes are for, and show them on the worked example', () => {
    const text = instructions(true);
    expect(text).toMatch(/uygulama her tarafı tek bir blok olarak/);
    expect(text).toMatch(/ayrıca `highlight` çağırma/);
    expect(text).toMatch(/animate:true ise yol adım açılınca çizilerek belirir/);
    const example = text.slice(text.indexOf('ÖRNEK (iki adımlı)'));
    expect(example).toContain('sides{step:1,sides:[');
    expect(example).toContain('route{step:1,via:[');
    expect(example).toContain('type:"advance"');
  });

  it('give the file the section on disputed borders, between the display rules and the tone', () => {
    expect(INSTRUCTIONS_FILE).toContain('## Tartışmalı sınırlar');
    const at = INSTRUCTIONS_FILE.indexOf('## Tartışmalı sınırlar');
    expect(at).toBeGreaterThan(INSTRUCTIONS_FILE.indexOf('## Gösterim'));
    expect(at).toBeLessThan(INSTRUCTIONS_FILE.indexOf('## Ton'));
    const section = INSTRUCTIONS_FILE.slice(at, INSTRUCTIONS_FILE.indexOf('## Ton')).replace(/\s+/g, ' ');
    expect(section).toContain('Haritadaki sınırlar bir veri setinin yorumudur, kesin gerçek değildir.');
    expect(section).toContain('Hüküm verme, taraf tutma.');
    expect(section).toContain('İşgal edilmiş bir toprağı işgalcinin toprağı gibi anlatma; işgal olduğunu söyle.');
  });

  it('say what the app does so the model does not have to: no camera, no looks, the year from the events', () => {
    const text = instructions(true);
    expect(text).toContain('NASIL görüneceğini (renk, vurgu, çizgi, kamera) uygulama belirler');
    expect(text).toContain('Kamera diye bir aracın yok');
    expect(text).not.toContain('`focus`');
    expect(text).not.toContain('`set_year`');
    expect(text).toContain('`year`'); // the step's own, for a step with no event
    expect(text).toMatch(/savaşlarda iki taraf arasındaki çizgiyi o işaretin üzerinden geçirir/);
    expect(text).toMatch(/Aynı olay için ayrıca `connect` ya da `mark` çağırma/);
  });

  it('teach the way an event is named in a text, so the reader can click it', () => {
    const text = instructions(true);
    expect(INSTRUCTIONS_FILE).toContain('onu olay olarak işaretle');
    expect(text).toContain('`[olay adı](olay:KİMLİK)`');
    expect(text).toContain("`[Stalingrad Muharebesi](olay:stalingrad-1942)'nde`");
    expect(text).toMatch(/başlıklarda da kullanma/);
  });

  it('give the two-phase protocol of a stepped answer: the tools first, in one round, then the numbered texts', () => {
    const text = instructions(true);
    expect(text).toContain('TEK turda');
    expect(text).toContain('HİÇ METİN YAZMADAN');
    expect(text).toMatch(/step`\{n, title, caption\}/);
    expect(text).toContain('"## n. Başlık"');
    expect(text).toContain('Altyazı bu metnin özeti olmalı');
    // every answer is a narration: a plain question is one step (n:1), never a different format the model has to choose
    expect(text).toContain('Her cevap adımlıdır');
    expect(text).toMatch(/Tek bir şeyi anlatıyorsan tek adım yaz \(n:1\)/);
    expect(text).toContain('Biçim seçmen gerekmez');
    expect(text).toContain('"Devamını oku"');
    expect(text).not.toContain('Tek parça cevap');
  });

  it('say that every step owns the map, and that an event of the app is shown by its own marker', () => {
    const text = instructions(true);
    expect(text).toContain('Her adım haritanın sahibidir');
    expect(text).toContain('kendi başına bildirmeli');
    expect(text).not.toContain('devral'); // nothing is inherited from the step before
    expect(text).not.toContain('`clear`');
    expect(text).toMatch(/OLAYLAR listesindeki kimlikle\)\. Yalnızca hangi olay olduğunu söylersin/);
    expect(text).toMatch(/`mark`\s*\(kent, geçit, liman/);
  });

  it('give the narration outline rule: the same steps for the same subject, in the outline’s order', () => {
    const text = instructions(true);
    expect(text).toContain('ANLATIM İSKELETİ');
    expect(text).toMatch(/sıra ve adım sayısı iskeletindir/);
    expect(text).toMatch(/İskeletin dışına çıkıp adım ekleme/);
    expect(text).toMatch(/Kullanıcı başka bir biçim isterse/);
  });

  it('show the protocol on a worked example', () => {
    const text = instructions(true);
    expect(text).toContain('ÖRNEK');
    expect(text).toMatch(/step\{n:1,title:"[^"]+",caption:"[^"]+"/);
    expect(text).toMatch(/\n ## 2\. Stalingrad\n/);
    expect(text).toContain('show_event{step:1,event:"barbarossa-1941"}');
    // and one of a single step: a plain question has a caption and a text too
    expect(text).toContain('ÖRNEK (tek adımlı');
    expect(text).toMatch(/step\{n:1,title:"Stalingrad",caption:"[^"]+"\}/);
    expect(text).toMatch(/\n ## 1\. Stalingrad\n/);
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
    expect(text).toContain('tek adım yaz');
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
      { kind: 'highlight', step: 1, polities: ['ottoman-empire'] },
      { kind: 'event', step: 1, id: 'caldiran-1514' },
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
    expect(all).not.toContain(`0: ${long}`);
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
  });

  it('gives the app’s outline with a narration, in the request, and nothing of the kind without tools', () => {
    const outline = narrationOutline(context, data.events);
    expect(outline.length).toBeGreaterThanOrEqual(3);
    const last = buildTurns(base({ outline })).at(-1)!.content;
    expect(last).toContain('ANLATIM İSKELETİ (');
    expect(last).toContain(describeOutline(outline));
    expect(last).toMatch(/\n1\. [a-z0-9-]+ \| [^|]+ \| [^|]+ \| [^|\n]+\n/);
    expect(last.indexOf('ANLATIM İSKELETİ')).toBeGreaterThan(last.indexOf('OLAYLAR ('));
    expect(buildTurns(base({ outline, tools: false })).at(-1)!.content).not.toContain('ANLATIM İSKELETİ');
    expect(buildTurns(base({ outline: [] })).at(-1)!.content).not.toContain('ANLATIM İSKELETİ');
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
