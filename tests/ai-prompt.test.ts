import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { subjectKey, subjectLabel, type AiContext } from '../src/ai/context';
import { drawingOf, emptyDrawing, TurnPlan } from '../src/ai/drawing';
import { INSTRUCTIONS_FILE } from '../src/ai/instructions';
import {
  buildTurns,
  describeCatalog,
  describeContext,
  describeEvents,
  instructions,
  NARRATION_REQUEST,
  utf8Bytes,
  type PromptInput,
} from '../src/ai/prompt';
import { Resolver } from '../src/ai/resolve';
import { createTools } from '../src/ai/tools';
import { appEventsSource, gatherPassages, type SourceProvider } from '../src/ai/sources';
import { shippedData } from './helpers/shipped';

const data = shippedData();
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
    for (const [action, tool] of [
      ['devletleri vurgulamak', 'highlight'],
      ['ilişkiye göre bağlamak', 'connect'],
      ['kısa bir etiketle işaretlemek', 'mark'],
      ['sınır yılını değiştirmek', 'set_year'],
      ['bölgeyi göstermek', 'focus'],
      ['olayı göstermek', 'show_event'],
      ['adımları bildirmek', 'step'],
    ] as const) {
      expect(offered).toContain(tool);
      expect(text).toMatch(new RegExp(`${action}[^\\n]*→ \`${tool}\``)); // "action → `tool`"
    }
    // every tool of the page is named in the notes
    for (const name of offered) expect(text).toContain(`\`${name}\``);
    expect(text).toContain('POLİTİLER');
    expect(text).toContain('OLAYLAR');
  });

  it('give the two-phase protocol of a stepped answer: the tools first, in one round, then the numbered texts', () => {
    const text = instructions(true);
    expect(text).toContain('TEK turda');
    expect(text).toContain('HİÇ METİN YAZMADAN');
    expect(text).toMatch(/step`\{n, title, caption\}/);
    expect(text).toContain('"## n. Başlık"');
    expect(text).toContain('Altyazı bu metnin özeti olmalı');
    expect(text).toMatch(/Tek parça cevap: `step` çağırma/);
  });

  it('say that every step owns the map, and that an event of the app is shown by its own marker', () => {
    const text = instructions(true);
    expect(text).toContain('Her adım haritanın sahibidir');
    expect(text).toContain('kendi başına bildirmeli');
    expect(text).not.toContain('devral'); // nothing is inherited from the step before
    expect(text).not.toContain('`clear`');
    expect(text).toMatch(/OLAYLAR listesindeki kimlikle; kendi işaretini çizme/);
    expect(text).toMatch(/`mark` yalnızca OLAYLAR'da bulunmayan yerler/);
    expect(text).toContain('Harita takibi');
  });

  it('show the protocol on a worked example', () => {
    const text = instructions(true);
    expect(text).toContain('ÖRNEK');
    expect(text).toMatch(/step\{n:1,title:"[^"]+",caption:"[^"]+"\}/);
    expect(text).toMatch(/\n ## 2\. Çaldıran\n/);
    expect(instructions(false)).not.toContain('ÖRNEK');
  });

  it('without tools they say so and mention no tool', () => {
    const text = instructions(false);
    expect(text).toContain('yalnızca metin');
    expect(text).not.toContain('highlight');
    expect(text).not.toContain('show_event');
    expect(text).toContain('## n. Başlık');
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
    expect(turn.content).toContain('vurgulanan: Osmanlı İmparatorluğu');
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

  it('keeps the input under the limit by dropping the oldest exchanges first, never the rules or the request', () => {
    const long = 'Eski yanıt. '.repeat(400);
    const history = Array.from({ length: 12 }, (_, i) => [
      { role: 'user' as const, text: `Soru ${i}` },
      { role: 'assistant' as const, text: `${i}: ${long}` },
    ]).flat();
    const turns = buildTurns(base({ history }), 30_000);
    const bytes = turns.reduce((n, t) => n + utf8Bytes(t.content), 0);
    expect(bytes).toBeLessThanOrEqual(30_000);
    expect(turns[0]!.content.startsWith(INSTRUCTIONS_FILE)).toBe(true);
    expect(turns.at(-1)!.content).toContain('İSTEK');
    // what remains is the newest, still in pairs
    const kept = turns.slice(1, -1);
    expect(kept.length % 2).toBe(0);
    expect(kept.at(-1)!.content.startsWith('11: ')).toBe(true);
    expect(kept.some((t) => t.content.startsWith('0: '))).toBe(false);
  });

  it('thins the records before it gives up the request', async () => {
    const sources = [
      { label: 'Kaynak', passages: Array.from({ length: 40 }, (_, i) => ({ title: `T${i}`, text: 'x'.repeat(1000) })) },
    ];
    const turns = buildTurns(base({ sources }), 20_000);
    expect(turns.reduce((n, t) => n + utf8Bytes(t.content), 0)).toBeLessThanOrEqual(20_000);
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
