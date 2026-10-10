import { describe, expect, it } from 'vitest';
import { applyStep, describeDrawing, emptyDrawing, isEmptyDrawing, resolveDrawing, TurnPlan } from '../src/ai/drawing';
import { Resolver } from '../src/ai/resolve';
import type { MapAction } from '../src/ai/types';
import { shippedData } from './helpers/shipped';

const hl = (step: number, ...polities: string[]): MapAction => ({ kind: 'highlight', step, polities });
const link = (
  step: number,
  from: string,
  to: string,
  relation: 'war' | 'alliance' | 'trade' | 'treaty' = 'war',
  label?: string,
): MapAction => ({
  kind: 'connect',
  step,
  from,
  to,
  relation,
  ...(label ? { label } : {}),
});
const mark = (step: number, lon: number, lat: number, label: string): MapAction => ({
  kind: 'mark',
  step,
  point: { lon, lat },
  label,
});
const year = (step: number, y: number): MapAction => ({ kind: 'set_year', step, year: y });

describe('applyStep', () => {
  it('adds to what the step inherits, without repeating a polity or a link', () => {
    const a = applyStep(emptyDrawing(), [hl(1, 'a', 'b'), link(1, 'a', 'b')]);
    const b = applyStep(a, [hl(2, 'b', 'c'), link(2, 'b', 'a', 'war', 'Yeni etiket')]);
    expect(b.highlights).toEqual(['a', 'b', 'c']);
    expect(b.links).toEqual([{ from: 'b', to: 'a', relation: 'war', label: 'Yeni etiket' }]); // same pair and kind: replaced
    expect(a.highlights).toEqual(['a', 'b']); // the earlier state is not touched
  });

  it('keeps links of different kinds between the same two polities', () => {
    const d = applyStep(emptyDrawing(), [link(1, 'a', 'b', 'war'), link(1, 'a', 'b', 'trade')]);
    expect(d.links.map((l) => l.relation)).toEqual(['war', 'trade']);
  });

  it('a clear empties everything first, whatever the order of the actions in the step', () => {
    const before = applyStep(emptyDrawing(), [hl(1, 'a'), mark(1, 10, 10, 'X'), year(1, 1520)]);
    const clearFirst = applyStep(before, [{ kind: 'clear', step: 2 }, hl(2, 'b')]);
    const clearLast = applyStep(before, [hl(2, 'b'), { kind: 'clear', step: 2 }]);
    expect(clearFirst).toEqual(clearLast);
    expect(clearFirst.highlights).toEqual(['b']);
    expect(clearFirst.marks).toEqual([]);
    expect(clearFirst.year).toBeUndefined(); // the year goes back to the reader
  });

  it('the last year asked for in a step wins, and a clear does not stop a year asked in the same step', () => {
    const d = applyStep(emptyDrawing(), [year(1, 1510), year(1, 1520)]);
    expect(d.year).toBe(1520);
    expect(applyStep(d, [{ kind: 'clear', step: 2 }, year(2, 1530)]).year).toBe(1530);
  });

  it('keeps a map readable: only the newest of too many', () => {
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const d = applyStep(emptyDrawing(), [hl(1, ...many)]);
    expect(d.highlights).toHaveLength(8);
    expect(d.highlights.at(-1)).toBe('p19');
    const marks = applyStep(
      emptyDrawing(),
      Array.from({ length: 12 }, (_, i) => mark(1, i * 10, 10, `M${i}`)),
    );
    expect(marks.marks).toHaveLength(8);
  });

  it('does not draw the same label on the same spot twice', () => {
    const d = applyStep(emptyDrawing(), [mark(1, 28.97, 41.01, 'İstanbul'), mark(1, 28.98, 41.02, 'istanbul')]);
    expect(d.marks).toHaveLength(1);
  });
});

describe('TurnPlan', () => {
  it('a step builds on the one before it, so going back gives exactly what the step showed', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Doğuda yeni bir komşu');
    plan.declare(2, 'Çaldıran');
    plan.add(hl(1, 'ottoman-empire'));
    plan.add(year(1, 1505));
    plan.add(link(2, 'ottoman-empire', 'safavid-dynasty', 'war', 'Çaldıran'));
    plan.add(year(2, 1514));
    const one = plan.drawingAt(1);
    const two = plan.drawingAt(2);
    expect(one).toMatchObject({ highlights: ['ottoman-empire'], links: [], year: 1505 });
    expect(two).toMatchObject({ highlights: ['ottoman-empire'], year: 1514 });
    expect(two.links).toHaveLength(1);
    expect(plan.drawingAt(1)).toEqual(one); // and again after step 2 exists
  });

  it('does not depend on the order the tool calls of one round arrived in', () => {
    const actions = [
      hl(1, 'a'),
      link(2, 'a', 'b'),
      year(2, 1510),
      hl(2, 'b'),
      mark(1, 5, 5, 'Y'),
      { kind: 'clear', step: 3 } as MapAction,
      hl(3, 'z'),
    ];
    const forward = new TurnPlan();
    const backward = new TurnPlan();
    for (const a of actions) forward.add(a);
    for (const a of [...actions].reverse()) backward.add(a);
    for (const n of [1, 2, 3]) expect(backward.drawingAt(n)).toEqual(forward.drawingAt(n));
  });

  it('knows its steps, their titles and whether it is empty', () => {
    const plan = new TurnPlan();
    expect(plan.empty).toBe(true);
    plan.declare(2, 'İkinci');
    plan.add(hl(1, 'a'));
    expect(plan.empty).toBe(false);
    expect(plan.numbers()).toEqual([1, 2]);
    expect(plan.titleOf(1)).toBeNull();
    expect(plan.titleOf(2)).toBe('İkinci');
    expect(plan.has(3)).toBe(false);
  });

  it('a step the model did not number is step 1: a question has one map state', () => {
    const plan = new TurnPlan();
    plan.add(hl(1, 'a'));
    plan.add(link(1, 'a', 'b', 'alliance'));
    expect(plan.drawingAt(1).links).toHaveLength(1);
  });

  it('the camera is the step own business: focus is not inherited and several are merged', () => {
    const plan = new TurnPlan();
    plan.add({ kind: 'focus', step: 1, polities: ['a'], points: [] });
    plan.add({ kind: 'focus', step: 1, polities: ['b', 'a'], points: [{ lon: 1, lat: 2 }] });
    plan.add(hl(2, 'c'));
    expect(plan.focusAt(1)).toEqual({ polities: ['a', 'b'], points: [{ lon: 1, lat: 2 }] });
    expect(plan.focusAt(2)).toBeNull();
  });

  it('counts changes', () => {
    const plan = new TurnPlan();
    const v = plan.version;
    plan.add(hl(1, 'a'));
    expect(plan.version).toBeGreaterThan(v);
  });
});

describe('resolveDrawing (shipped borders)', () => {
  const data = shippedData();
  const resolver = new Resolver(data);

  it('turns polities into places for the year shown', () => {
    const drawing = applyStep(emptyDrawing(), [
      hl(1, 'ottoman-empire', 'kingdom-of-france'),
      link(1, 'ottoman-empire', 'kingdom-of-france', 'alliance', 'İttifak, 1536'),
    ]);
    const r = resolveDrawing(drawing, resolver, 1536);
    expect(r.highlightIds).toEqual(['ottoman-empire', 'kingdom-of-france']);
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({ relation: 'alliance', label: 'İttifak, 1536' });
    expect(r.links[0]!.a.lon).toBeGreaterThan(r.links[0]!.b.lon); // the Ottoman anchor lies east of France
  });

  it('leaves out what has no borders that year, but keeps it in the drawing for another year', () => {
    const drawing = applyStep(emptyDrawing(), [
      hl(1, 'mamluk-sultanate', 'ottoman-empire'),
      link(1, 'mamluk-sultanate', 'ottoman-empire'),
    ]);
    const early = resolveDrawing(drawing, resolver, 1510);
    const late = resolveDrawing(drawing, resolver, 1530);
    expect(early.highlightIds).toContain('mamluk-sultanate');
    expect(early.links).toHaveLength(1);
    expect(late.highlightIds).toEqual(['ottoman-empire']);
    expect(late.links).toHaveLength(0);
  });
});

describe('describeDrawing', () => {
  const name = (id: string) => ({ a: 'Alfa', b: 'Beta' })[id] ?? id;
  it('says what is drawn, for the model and for screen readers', () => {
    const d = applyStep(emptyDrawing(), [
      hl(1, 'a'),
      link(1, 'a', 'b', 'alliance', 'Pakt'),
      mark(1, 1, 1, 'Kent'),
      year(1, 1536),
    ]);
    expect(describeDrawing(d, name)).toBe(
      'vurgulanan: Alfa; Alfa – Beta: ittifak (Pakt); işaretli: Kent; sınır yılı 1536',
    );
    expect(describeDrawing(emptyDrawing(), name)).toBe('');
    expect(isEmptyDrawing(emptyDrawing())).toBe(true);
    expect(isEmptyDrawing(d)).toBe(false);
  });
});
