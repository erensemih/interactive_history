import { describe, expect, it } from 'vitest';
import {
  describeDrawing,
  drawingOf,
  emptyDrawing,
  frameTargetOf,
  isEmptyDrawing,
  resolveDrawing,
  TurnPlan,
} from '../src/ai/drawing';
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
const event = (step: number, id: string): MapAction => ({ kind: 'event', step, id });
const year = (step: number, y: number): MapAction => ({ kind: 'set_year', step, year: y });

describe('drawingOf', () => {
  it('is what the actions ask for, without repeating a polity, a link, a mark or an event', () => {
    const d = drawingOf([
      hl(1, 'a', 'b'),
      hl(1, 'b', 'c'),
      link(1, 'a', 'b'),
      link(1, 'b', 'a', 'war', 'Yeni etiket'),
      event(1, 'x'),
      event(1, 'x'),
      mark(1, 28.97, 41.01, 'İstanbul'),
      mark(1, 28.98, 41.02, 'istanbul'),
    ]);
    expect(d.highlights).toEqual(['a', 'b', 'c']);
    expect(d.links).toEqual([{ from: 'b', to: 'a', relation: 'war', label: 'Yeni etiket' }]); // same pair and kind: replaced
    expect(d.events).toEqual(['x']);
    expect(d.marks).toHaveLength(1);
  });

  it('keeps links of different kinds between the same two polities', () => {
    const d = drawingOf([link(1, 'a', 'b', 'war'), link(1, 'a', 'b', 'trade')]);
    expect(d.links.map((l) => l.relation)).toEqual(['war', 'trade']);
  });

  it('the last year asked for wins', () => {
    expect(drawingOf([year(1, 1510), year(1, 1520)]).year).toBe(1520);
    expect(drawingOf([hl(1, 'a')]).year).toBeUndefined();
  });

  it('keeps a map readable: only the newest of too many', () => {
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const d = drawingOf([hl(1, ...many)]);
    expect(d.highlights).toHaveLength(8);
    expect(d.highlights.at(-1)).toBe('p19');
    expect(drawingOf(Array.from({ length: 12 }, (_, i) => mark(1, i * 10, 10, `M${i}`))).marks).toHaveLength(8);
    expect(drawingOf(Array.from({ length: 12 }, (_, i) => event(1, `e${i}`))).events).toHaveLength(6);
  });

  it('nothing in, nothing out', () => {
    expect(drawingOf([])).toEqual(emptyDrawing());
    expect(isEmptyDrawing(drawingOf([]))).toBe(true);
    expect(isEmptyDrawing(drawingOf([event(1, 'x')]))).toBe(false);
  });
});

describe('TurnPlan', () => {
  it('a step shows only its own drawing: nothing from the step before, and nothing left for the one after', () => {
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
    // step 2 did not ask for the Ottoman highlight, so it is not on the map while step 2 is
    expect(two.highlights).toEqual([]);
    expect(two.links).toHaveLength(1);
    expect(two.year).toBe(1514);
    expect(plan.drawingAt(1)).toEqual(one); // going back gives exactly what step 1 showed
  });

  it('a step that sets no year leaves the year to the reader, whatever the step before set', () => {
    const plan = new TurnPlan();
    plan.add(year(1, 1505));
    plan.add(hl(2, 'a'));
    expect(plan.drawingAt(2).year).toBeUndefined();
  });

  it('a step the plan does not know is an empty map', () => {
    const plan = new TurnPlan();
    plan.add(hl(1, 'a'));
    expect(isEmptyDrawing(plan.drawingAt(7))).toBe(true);
  });

  it('does not depend on the order the tool calls of one round arrived in', () => {
    const actions = [
      hl(1, 'a'),
      link(2, 'a', 'b'),
      year(2, 1510),
      hl(2, 'b'),
      mark(1, 5, 5, 'Y'),
      event(3, 'e'),
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

  it('counts changes', () => {
    const plan = new TurnPlan();
    const v = plan.version;
    plan.add(hl(1, 'a'));
    expect(plan.version).toBeGreaterThan(v);
  });
});

describe('resolveDrawing and frameTargetOf (shipped data)', () => {
  const data = shippedData();
  const resolver = new Resolver(data);

  it('turns polities into places for the year shown, and events into their own markers', () => {
    const drawing = drawingOf([
      hl(1, 'ottoman-empire', 'kingdom-of-france'),
      link(1, 'ottoman-empire', 'kingdom-of-france', 'alliance', 'İttifak, 1536'),
      event(1, 'mohac-1526'),
      event(1, 'yok-boyle-bir-olay'),
    ]);
    const r = resolveDrawing(drawing, resolver, 1536);
    expect(r.highlightIds).toEqual(['ottoman-empire', 'kingdom-of-france']);
    expect(r.links).toHaveLength(1);
    expect(r.links[0]).toMatchObject({ relation: 'alliance', label: 'İttifak, 1536' });
    expect(r.links[0]!.a.lon).toBeGreaterThan(r.links[0]!.b.lon); // the Ottoman anchor lies east of France
    expect(r.events).toEqual([{ id: 'mohac-1526', title: 'Mohaç Muharebesi', point: { lon: 18.68, lat: 45.99 } }]);
  });

  it('leaves out what has no borders that year, but keeps it in the drawing for another year', () => {
    const drawing = drawingOf([
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

  it('the camera target is everything the step shows: the polities boxes, link ends, marks and events', () => {
    const drawing = drawingOf([
      hl(1, 'ottoman-empire', 'safavid-dynasty'),
      link(1, 'ottoman-empire', 'safavid-dynasty'),
      mark(1, 37.1, 36.68, 'Mercidabık'),
      event(1, 'caldiran-1514'),
    ]);
    const target = frameTargetOf(resolveDrawing(drawing, resolver, 1514), resolver, 1514)!;
    expect(target.boxes).toHaveLength(2);
    expect(target.points).toHaveLength(2 + 1 + 1);
    expect(target.points).toContainEqual({ lon: 44.0, lat: 39.14 }); // Çaldıran, by its own record
    for (const b of target.boxes) expect(b[0]).toBeLessThan(b[2]);
  });

  it('a step that puts nothing on the map has nothing to bring into view', () => {
    expect(frameTargetOf(resolveDrawing(drawingOf([year(1, 1520)]), resolver, 1520), resolver, 1520)).toBeNull();
    expect(frameTargetOf(resolveDrawing(emptyDrawing(), resolver, 1520), resolver, 1520)).toBeNull();
    // a polity without borders that year cannot be drawn and so cannot be framed either
    expect(
      frameTargetOf(resolveDrawing(drawingOf([hl(1, 'mamluk-sultanate')]), resolver, 1530), resolver, 1530),
    ).toBeNull();
  });
});

describe('describeDrawing', () => {
  const name = (id: string) => ({ a: 'Alfa', b: 'Beta' })[id] ?? id;
  it('says what is drawn, for the model and for screen readers', () => {
    const d = drawingOf([
      hl(1, 'a'),
      link(1, 'a', 'b', 'alliance', 'Pakt'),
      event(1, 'caldiran-1514'),
      mark(1, 1, 1, 'Kent'),
      year(1, 1536),
    ]);
    expect(describeDrawing(d, name, () => 'Çaldıran Muharebesi')).toBe(
      'vurgulanan: Alfa; Alfa – Beta: ittifak (Pakt); olay: Çaldıran Muharebesi; işaretli: Kent; sınır yılı 1536',
    );
    expect(describeDrawing(emptyDrawing(), name)).toBe('');
    expect(isEmptyDrawing(emptyDrawing())).toBe(true);
    expect(isEmptyDrawing(d)).toBe(false);
  });
});
