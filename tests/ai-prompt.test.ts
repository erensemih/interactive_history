import { describe, expect, it, vi } from 'vitest';
import { subjectKey, subjectLabel, type AiContext } from '../src/ai/context';
import { applyStep, emptyDrawing } from '../src/ai/drawing';
import {
  buildTurns,
  describeCatalog,
  describeContext,
  instructions,
  NARRATION_REQUEST,
  utf8Bytes,
  type PromptInput,
} from '../src/ai/prompt';
import { Resolver } from '../src/ai/resolve';
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
  mode: 'narration',
  question: NARRATION_REQUEST,
  context,
  previous: null,
  catalog: resolver.catalog(range),
  sources: [],
  drawing: null,
  nameOf: (id) => resolver.nameOf(id),
  history: [],
  tools: true,
  ...patch,
});

describe('instructions', () => {
  it('state the protocol the page relies on: tools first in one round, then the numbered text', () => {
    const text = instructions(true);
    expect(text).toContain('TEK turda');
    expect(text).toContain('## n. Kısa başlık');
    for (const name of ['step', 'highlight', 'connect', 'mark', 'set_year', 'focus', 'clear'])
      expect(text).toContain(name);
    expect(text).toContain('POLİTİLER');
  });

  it('show the protocol on a worked example', () => {
    const text = instructions(true);
    expect(text).toContain('ÖRNEK');
    expect(text).toMatch(/step\{n:1,title:"[^"]+"\}/);
    expect(text).toMatch(/\n ## 2\. Çaldıran\n/);
    expect(instructions(false)).not.toContain('ÖRNEK');
  });

  it('without tools they say so and mention no tool', () => {
    const text = instructions(false);
    expect(text).toContain('yalnızca metin');
    expect(text).not.toContain('highlight');
    expect(text).toContain('## n. Kısa başlık');
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
    expect(text).toContain('«Mohaç Muharebesi», 29 Ağustos 1526');
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
    expect(turns[0]!.content).toContain('tarih anlatıcısısın');
    const last = turns[1]!.content;
    expect(last).toMatch(/^BAĞLAM\n/);
    expect(last).toContain('POLİTİLER');
    expect(last).toContain('ottoman-empire | Osmanlı İmparatorluğu');
    expect(last).toContain('KAYITLAR\nUygulamanın olay kayıtları:');
    expect(last).toContain('Çaldıran Muharebesi');
    expect(last.endsWith(`İSTEK [ANLATIM]\n${NARRATION_REQUEST}`)).toBe(true);
  });

  it('leaves the polity list out when there are no tools', () => {
    const last = buildTurns(base({ tools: false })).at(-1)!.content;
    expect(last).not.toContain('POLİTİLER');
  });

  it('tells the model what it has already drawn', () => {
    const drawing = applyStep(emptyDrawing(), [{ kind: 'highlight', step: 1, polities: ['ottoman-empire'] }]);
    expect(buildTurns(base({ drawing })).at(-1)!.content).toContain('vurgulanan: Osmanlı İmparatorluğu');
    expect(buildTurns(base({ drawing: emptyDrawing() })).at(-1)!.content).not.toContain('çizdiklerin');
  });

  it('carries the chat so far, in order, with each reader turn marked by its kind and subject', () => {
    const turns = buildTurns(
      base({
        mode: 'qa',
        question: 'Fransa ile ittifak neydi?',
        history: [
          { role: 'user', text: NARRATION_REQUEST, mode: 'narration', subject: 'Osmanlı İmparatorluğu · 1500–1550' },
          { role: 'assistant', text: '## 1. Başlık\nMetin.' },
        ],
      }),
    );
    expect(turns.map((t) => t.role)).toEqual(['user', 'user', 'assistant', 'user']);
    expect(turns[1]!.content).toBe(`[ANLATIM · Osmanlı İmparatorluğu · 1500–1550] ${NARRATION_REQUEST}`);
    expect(turns[2]!.content).toBe('## 1. Başlık\nMetin.');
    expect(turns[3]!.content).toContain('İSTEK [SORU]\nFransa ile ittifak neydi?');
  });

  it('keeps the input under the limit by dropping the oldest exchanges first, never the rules or the request', () => {
    const long = 'Eski yanıt. '.repeat(400);
    const history = Array.from({ length: 12 }, (_, i) => [
      { role: 'user' as const, text: `Soru ${i}`, mode: 'qa' as const },
      { role: 'assistant' as const, text: `${i}: ${long}` },
    ]).flat();
    const turns = buildTurns(base({ history }), 30_000);
    const bytes = turns.reduce((n, t) => n + utf8Bytes(t.content), 0);
    expect(bytes).toBeLessThanOrEqual(30_000);
    expect(turns[0]!.content).toContain('tarih anlatıcısısın');
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
          { role: 'user', text: 'Soru', mode: 'qa' },
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
