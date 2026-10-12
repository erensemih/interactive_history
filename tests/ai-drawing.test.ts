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
import { eventKindOf, warSides } from '../src/ai/eventKinds';
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

  it('a step that shows events and names no year shows the borders of the earliest event’s year', () => {
    const years: Record<string, number> = { moh: 1526, viy: 1529, yok: Number.NaN };
    const of = (id: string) => (id in years && !Number.isNaN(years[id]!) ? years[id]! : null);
    expect(drawingOf([event(1, 'viy'), event(1, 'moh')], of).year).toBe(1526);
    expect(drawingOf([event(1, 'viy'), event(1, 'moh'), year(1, 1527)], of).year).toBe(1527); // the model's own year wins
    expect(drawingOf([event(1, 'yok')], of).year).toBeUndefined(); // an event the data does not know has no year
    expect(drawingOf([hl(1, 'a')], of).year).toBeUndefined(); // nothing shown, nothing to take a year from
    expect(drawingOf([event(1, 'moh')]).year).toBeUndefined(); // (no data to ask)
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

  it('a plan that knows the events’ years gives each step the year of its own events', () => {
    const years: Record<string, number> = { a: 1514, b: 1526 };
    const plan = new TurnPlan((id) => years[id] ?? null);
    plan.add(event(1, 'a'));
    plan.add(event(2, 'b'));
    plan.add(hl(3, 'x'));
    expect(plan.drawingAt(1).year).toBe(1514);
    expect(plan.drawingAt(2).year).toBe(1526);
    expect(plan.drawingAt(3).year).toBeUndefined();
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

  it('knows its steps, their titles and captions, and whether it is empty', () => {
    const plan = new TurnPlan();
    expect(plan.empty).toBe(true);
    plan.declare(2, 'İkinci', 'İkinci adımın altyazısı.');
    plan.add(hl(1, 'a'));
    expect(plan.empty).toBe(false);
    expect(plan.numbers()).toEqual([1, 2]);
    expect(plan.titleOf(1)).toBeNull();
    expect(plan.captionOf(1)).toBeNull();
    expect(plan.titleOf(2)).toBe('İkinci');
    expect(plan.captionOf(2)).toBe('İkinci adımın altyazısı.');
    plan.declare(2, null, null); // declaring again without texts keeps the ones it has
    expect(plan.captionOf(2)).toBe('İkinci adımın altyazısı.');
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

describe('how the app draws an event of the data, by its kind', () => {
  it('a war (military) is drawn as a line through its marker; every other kind lights its parties and shows its marker', () => {
    expect(eventKindOf('military')).toBe('war');
    for (const category of ['politics', 'exploration', 'culture', 'religion', 'disaster', 'something-new'])
      expect(eventKindOf(category)).toBe('plain');
  });

  it('a war is between its first party and the second, unless the data says who the first one fought', () => {
    expect(warSides({ parties: ['ottoman-empire', 'kingdom-of-hungary', 'habsburg-monarchy'] })).toEqual({
      first: ['ottoman-empire'],
      second: ['kingdom-of-hungary', 'habsburg-monarchy'],
    });
    // Grunwald: Poland and Lithuania on one side, the Teutonic Order on the other
    expect(
      warSides({
        parties: ['kingdom-of-poland', 'grand-duchy-of-lithuania', 'teutonic-order'],
        versus: ['teutonic-order'],
      }),
    ).toEqual({ first: ['kingdom-of-poland', 'grand-duchy-of-lithuania'], second: ['teutonic-order'] });
    expect(warSides({ parties: ['ming-dynasty'] })).toBeNull(); // nobody to fight
    expect(warSides({ parties: [] })).toBeNull();
  });
});

describe('resolveDrawing and frameTargetOf (shipped data)', () => {
  const data = shippedData();
  const resolver = new Resolver(data);

  it('puts in the spotlight what the model named, the parties of its events and the ends of its own lines', () => {
    const drawing = drawingOf([
      hl(1, 'kingdom-of-france'),
      link(1, 'ottoman-empire', 'safavid-dynasty', 'alliance', 'İttifak'),
      event(1, 'mohac-1526'),
      event(1, 'yok-boyle-bir-olay'),
    ]);
    const r = resolveDrawing(drawing, resolver, 1526);
    expect(r.spotIds).toEqual([
      'kingdom-of-france',
      'ottoman-empire',
      'kingdom-of-hungary',
      'habsburg-monarchy',
      'safavid-dynasty',
    ]);
    expect(r.events.map((e) => e.id)).toEqual(['mohac-1526']); // the event the data does not know is dropped
  });

  it('turns an event into its marker, its parties and, for a war, a line from side to side', () => {
    const r = resolveDrawing(drawingOf([event(1, 'mohac-1526')]), resolver, 1526);
    const e = r.events[0]!;
    expect(e).toMatchObject({
      id: 'mohac-1526',
      title: 'Mohaç Muharebesi',
      category: 'military',
      point: { lon: 18.68, lat: 45.99 },
    });
    expect(e.parties).toEqual(['ottoman-empire', 'kingdom-of-hungary', 'habsburg-monarchy']);
    expect(e.war).toMatchObject({ aId: 'ottoman-empire', bId: 'kingdom-of-hungary' });
    // the line leaves each polity from where it is nearest the battle: Hungary's end is nearer Mohács than the Ottoman one
    const km = (p: { lon: number; lat: number }) => Math.hypot(p.lon - e.point.lon, p.lat - e.point.lat);
    expect(km(e.war!.b)).toBeLessThan(km(e.war!.a));
  });

  it('an event that is not a war has its parties lit and no line', () => {
    const r = resolveDrawing(drawingOf([event(1, 'tordesillas-1494')]), resolver, 1494);
    const e = r.events[0]!;
    expect(e.category).toBe('politics');
    expect(e.war).toBeUndefined();
    expect(r.spotIds).toEqual(['kingdom-of-portugal', 'crown-of-castile']);
    expect(e.parties).toEqual(['kingdom-of-portugal', 'crown-of-castile']);
  });

  it('knows which side each war party is on where the data says so (Grunwald, Granada, the Imjin War)', () => {
    const grunwald = resolveDrawing(drawingOf([event(1, 'grunwald-1410')]), resolver, 1410).events[0]!;
    expect(grunwald.war).toMatchObject({ aId: 'kingdom-of-poland', bId: 'teutonic-order' });
    const granada = resolveDrawing(drawingOf([event(1, 'girnata-1492')]), resolver, 1491).events[0]!;
    expect(granada.war).toMatchObject({ bId: 'emirate-of-granada' });
    expect(['crown-of-castile', 'crown-of-aragon']).toContain(granada.war!.aId);
    const imjin = resolveDrawing(drawingOf([event(1, 'imjin-savasi-1592')]), resolver, 1592).events[0]!;
    expect(imjin.war).toMatchObject({ aId: 'joseon', bId: 'warring-states-japan' });
  });

  it('a war whose second side has no borders that year is a marker and its first party, without a line', () => {
    const r = resolveDrawing(drawingOf([event(1, 'caldiran-1514')]), resolver, 1420); // the Safavids do not exist yet
    expect(r.events[0]!.war).toBeUndefined();
    expect(r.events[0]!.parties).toEqual(['ottoman-empire']);
    expect(r.spotIds).toEqual(['ottoman-empire']);
  });

  it('the year a step about an event shows is the event’s own, or just before it when the event ended one of its sides', () => {
    expect(resolver.showYearOf(resolver.eventById('mohac-1526')!)).toBe(1526);
    // Granada fell at the start of 1492: the map of 1491 is the last one with it on it
    expect(resolver.showYearOf(resolver.eventById('girnata-1492')!)).toBe(1491);
    for (const id of ['girnata-1492', 'istanbul-fethi-1453', 'ridaniye-1517', 'trabzon-1461']) {
      const ev = resolver.eventById(id)!;
      const y = resolver.showYearOf(ev);
      expect(y).toBeLessThanOrEqual(ev.year);
      expect(y).toBeGreaterThanOrEqual(ev.year - 3);
      expect(resolveDrawing(drawingOf([event(1, id)]), resolver, y).events[0]!.war, id).toBeDefined(); // the war can be drawn there
    }
  });

  it('every war of the data looks the same way: a line between two different polities that both have borders', () => {
    const wars = data.events.filter((e) => eventKindOf(e.category) === 'war');
    expect(wars.length).toBeGreaterThan(30);
    let drawn = 0;
    for (const ev of wars) {
      const r = resolveDrawing(drawingOf([event(1, ev.id)]), resolver, ev.year);
      const w = r.events[0]!.war;
      if (!w) continue;
      drawn++;
      expect(w.aId).not.toBe(w.bId);
      expect(ev.parties).toContain(w.aId);
      expect(ev.parties).toContain(w.bId);
      expect(r.spotIds).toEqual(expect.arrayContaining([w.aId, w.bId]));
    }
    expect(drawn).toBeGreaterThan(wars.length * 0.7); // most wars have both sides on the map in their year
  });

  it('the model’s own war line between the two sides of a war it also shows is not drawn twice', () => {
    const drawing = drawingOf([
      event(1, 'mohac-1526'),
      link(1, 'kingdom-of-hungary', 'ottoman-empire', 'war'), // the same war, the other way round
      link(1, 'ottoman-empire', 'kingdom-of-france', 'alliance'),
    ]);
    const r = resolveDrawing(drawing, resolver, 1526);
    expect(r.links.map((l) => l.relation)).toEqual(['alliance']);
  });

  it('leaves out what has no borders that year, but keeps it in the drawing for another year', () => {
    const drawing = drawingOf([
      hl(1, 'mamluk-sultanate', 'ottoman-empire'),
      link(1, 'mamluk-sultanate', 'ottoman-empire'),
    ]);
    const early = resolveDrawing(drawing, resolver, 1510);
    const late = resolveDrawing(drawing, resolver, 1530);
    expect(early.spotIds).toContain('mamluk-sultanate');
    expect(early.links).toHaveLength(1);
    expect(late.spotIds).toEqual(['ottoman-empire']);
    expect(late.links).toHaveLength(0);
  });

  it('the camera target is everything the step shows: the spotlit polities’ boxes, the markers, the war line’s ends, the model’s own lines and marks', () => {
    const drawing = drawingOf([
      event(1, 'caldiran-1514'),
      link(1, 'ottoman-empire', 'mamluk-sultanate', 'alliance'),
      mark(1, 37.1, 36.68, 'Mercidabık'),
    ]);
    const resolved = resolveDrawing(drawing, resolver, 1514);
    const target = frameTargetOf(resolved, resolver, 1514)!;
    expect(target.boxes).toHaveLength(resolved.spotIds.length);
    expect(resolved.spotIds).toEqual(['ottoman-empire', 'safavid-dynasty', 'mamluk-sultanate']);
    // Çaldıran's marker and the two ends of its war line, the two ends of the model's line, the mark
    expect(target.points).toHaveLength(1 + 2 + 2 + 1);
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
      'öne çıkan: Alfa; Alfa – Beta: ittifak (Pakt); olay: Çaldıran Muharebesi; işaretli: Kent; sınır yılı 1536',
    );
    expect(describeDrawing(emptyDrawing(), name)).toBe('');
    expect(isEmptyDrawing(emptyDrawing())).toBe(true);
    expect(isEmptyDrawing(d)).toBe(false);
  });
});
