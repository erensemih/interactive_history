import { describe, expect, it } from 'vitest';
import {
  describeDrawing,
  drawingOf,
  emptyDrawing,
  frameTargetOf,
  isEmptyDrawing,
  resolveFrame,
  TurnPlan,
} from '../src/ai/drawing';
import { eventKindOf, warSides } from '../src/ai/eventKinds';
import { pointsBox, surroundings } from '../src/domain/camera';
import { Resolver } from '../src/ai/resolve';
import type { MapAction, PlaceRef, RouteType, SceneClock, Side } from '../src/ai/types';
import { withMiniPlaces } from './helpers/places';
import { archivedData } from './helpers/shipped';

const hl = (step: number, beat: number, ...polities: string[]): MapAction => ({
  kind: 'highlight',
  step,
  beat,
  polities,
});
const mark = (step: number, beat: number, lon: number, lat: number, label: string): MapAction => ({
  kind: 'mark',
  step,
  beat,
  point: { lon, lat },
  label,
});
const event = (step: number, beat: number, id: string): MapAction => ({ kind: 'event', step, beat, id });
const year = (step: number, y: number): MapAction => ({ kind: 'set_year', step, year: y });
const city = (id: string, name: string): PlaceRef => ({ kind: 'city', id, name });
const polity = (id: string): PlaceRef => ({ kind: 'polity', id });
const at = (lon: number, lat: number): PlaceRef => ({ kind: 'point', point: { lon, lat } });
const border = (id: string, toward: PlaceRef): PlaceRef => ({ kind: 'border', id, toward });
const route = (
  step: number,
  beat: number,
  via: PlaceRef[],
  type: RouteType = 'advance',
  animate = false,
  label?: string,
): MapAction => ({ kind: 'route', step, beat, via, type, animate, ...(label ? { label } : {}) });
const sides = (step: number, beat: number, list: Side[], neutral: string[] = []): MapAction => ({
  kind: 'sides',
  step,
  beat,
  sides: list,
  neutral,
});
const change = (step: number, beat: number, id: string, from: number, to: number): MapAction => ({
  kind: 'territory',
  step,
  beat,
  polity: id,
  from,
  to,
});
const IST = city('istanbul', 'İstanbul');
const VIE = city('vienna', 'Viyana');
const EDI = city('edirne', 'Edirne');

describe('drawingOf', () => {
  it('is what the actions ask for, without repeating a polity, a mark or an event', () => {
    const d = drawingOf([
      hl(1, 1, 'a', 'b'),
      hl(1, 2, 'b', 'c'),
      event(1, 1, 'x'),
      event(1, 2, 'x'),
      mark(1, 1, 28.97, 41.01, 'İstanbul'),
      mark(1, 1, 28.98, 41.02, 'istanbul'),
    ]);
    expect(d.highlights).toEqual(['a', 'b', 'c']);
    expect(d.events).toEqual(['x']);
    expect(d.marks).toHaveLength(1);
  });

  it('a route is a route once however often it is asked, and only the newest six stay', () => {
    const d = drawingOf([
      route(1, 1, [IST, VIE], 'advance'),
      route(1, 1, [IST, VIE], 'advance', true, 'Sefer'), // the same road: the later ask replaces the earlier
      route(1, 1, [IST, VIE], 'retreat'), // another type: another route
      route(1, 1, [VIE, IST], 'advance'), // the other way round is another road: a route has a direction
    ]);
    expect(d.routes).toHaveLength(3);
    expect(d.routes[0]).toMatchObject({ type: 'advance', animate: true, label: 'Sefer' });
    const many = drawingOf(Array.from({ length: 9 }, (_, i) => route(1, 1, [IST, at(10 + i, 45)], 'trade')));
    expect(many.routes).toHaveLength(6);
    expect(many.routes.at(-1)!.via[1]).toEqual(at(18, 45));
  });

  it('a border is a stop of its own: the border of a polity toward a place is not the polity’s capital', () => {
    const d = drawingOf([
      route(1, 1, [border('a', VIE), VIE]),
      route(1, 1, [polity('a'), VIE]),
      route(1, 1, [border('a', IST), VIE]),
    ]);
    expect(d.routes).toHaveLength(3);
  });

  it('the sides of every statement count, a polity stands on the side it was named on last, and at most three sides', () => {
    const d = drawingOf([
      sides(1, 1, [{ name: 'Eski', polities: ['a'] }]),
      sides(
        1,
        2,
        [
          { name: 'X', polities: ['a', 'b'] },
          { name: 'Y', polities: ['b', 'c'] },
          { name: 'Boş', polities: ['a'] }, // everything of it is on X: no side left
          { name: 'Z', polities: ['d'] },
          { name: 'W', polities: ['e'] }, // a fourth
        ],
        ['f'],
      ),
    ]);
    // "Eski" lost its only polity to X, "Boş" had nothing left; a side stated twice is one side
    expect(d.sides.map((s) => s.name)).toEqual(['X', 'Y', 'Z']);
    expect(d.sides).toEqual([
      { name: 'X', polities: ['a', 'b'] }, // (within one statement a polity is on the first side that names it)
      { name: 'Y', polities: ['c'] },
      { name: 'Z', polities: ['d'] },
    ]);
    expect(d.neutral).toEqual(['f']);
  });

  it('a side named again later (in other words) is the same side; a polity moves to wherever it was named last', () => {
    const d = drawingOf([
      sides(1, 1, [{ name: 'Mihver', polities: ['a', 'b'] }], ['c']),
      sides(
        1,
        2,
        [
          { name: ' mihver ', polities: ['d'] },
          { name: 'Müttefikler', polities: ['b'] },
        ],
        ['a'],
      ),
    ]);
    expect(d.sides).toEqual([
      { name: 'Mihver', polities: ['d'] },
      { name: 'Müttefikler', polities: ['b'] },
    ]);
    expect(d.neutral).toEqual(['c', 'a']);
  });

  it('the changes of borders keep the order of their beats, and one named twice is one', () => {
    const d = drawingOf([change(1, 2, 'b', 1939, 1940), change(1, 1, 'a', 1938, 1939), change(1, 3, 'b', 1939, 1940)]);
    expect(d.changes).toEqual([
      { polity: 'b', from: 1939, to: 1940 },
      { polity: 'a', from: 1938, to: 1939 },
    ]);
  });

  it('the last year asked for wins', () => {
    expect(drawingOf([year(1, 1510), year(1, 1520)]).year).toBe(1520);
    expect(drawingOf([hl(1, 1, 'a')]).year).toBeUndefined();
  });

  it('a scene that shows events and names no year starts at the borders of the earliest event’s year', () => {
    const years: Record<string, number> = { moh: 1526, viy: 1529, yok: Number.NaN };
    const of = (id: string) => (id in years && !Number.isNaN(years[id]!) ? years[id]! : null);
    expect(drawingOf([event(1, 1, 'viy'), event(1, 1, 'moh')], of).year).toBe(1526);
    expect(drawingOf([event(1, 1, 'viy'), event(1, 1, 'moh'), year(1, 1527)], of).year).toBe(1527); // the model’s own year wins
    expect(drawingOf([event(1, 1, 'yok')], of).year).toBeUndefined(); // an event the data does not know has no year
    expect(drawingOf([hl(1, 1, 'a')], of).year).toBeUndefined(); // nothing shown, nothing to take a year from
    expect(drawingOf([event(1, 1, 'moh')]).year).toBeUndefined(); // (no data to ask)
  });

  it('a scene that changes borders starts at the year its first change starts from, if that is earlier than its events', () => {
    const of = (id: string) => (id === 'e' ? 1941 : null);
    expect(drawingOf([event(1, 1, 'e'), change(1, 2, 'a', 1939, 1940)], of).year).toBe(1939);
    expect(drawingOf([event(1, 1, 'e'), change(1, 2, 'a', 1942, 1943)], of).year).toBe(1941);
    expect(drawingOf([change(1, 1, 'a', 1944, 1945)], of).year).toBe(1944);
  });

  it('keeps a map readable: only the newest of too many', () => {
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    const d = drawingOf([hl(1, 1, ...many)]);
    expect(d.highlights).toHaveLength(8);
    expect(d.highlights.at(-1)).toBe('p19');
    expect(drawingOf(Array.from({ length: 14 }, (_, i) => mark(1, 1, i * 10, 10, `M${i}`))).marks).toHaveLength(10);
    expect(drawingOf(Array.from({ length: 14 }, (_, i) => event(1, 1, `e${i}`))).events).toHaveLength(10);
    expect(drawingOf(Array.from({ length: 9 }, (_, i) => change(1, 1, `c${i}`, 1900, 1901))).changes).toHaveLength(6);
  });

  it('nothing in, nothing out', () => {
    expect(drawingOf([])).toEqual(emptyDrawing());
    expect(isEmptyDrawing(drawingOf([]))).toBe(true);
    expect(isEmptyDrawing(drawingOf([event(1, 1, 'x')]))).toBe(false);
    // a route, the sides, those who stand aside or a change of borders alone are something to show and to frame
    expect(isEmptyDrawing(drawingOf([route(1, 1, [IST, VIE])]))).toBe(false);
    expect(isEmptyDrawing(drawingOf([sides(1, 1, [{ name: 'A', polities: ['a'] }])]))).toBe(false);
    expect(isEmptyDrawing(drawingOf([change(1, 1, 'a', 1900, 1901)]))).toBe(false);
    expect(isEmptyDrawing(drawingOf([year(1, 1900)]))).toBe(true);
  });
});

const CAPTION = 'Birinci cümle. İkinci cümle burada. Üçüncü cümle de var.';
const clock = (n: number, beat: number, done = false, replay = 0): SceneClock => ({ n, beat, done, replay });

describe('TurnPlan', () => {
  it('a scene shows only its own drawing: nothing from the scene before, and nothing left for the one after', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Doğuda yeni bir komşu');
    plan.declare(2, 'Çaldıran');
    plan.add(hl(1, 1, 'ottoman-empire'));
    plan.add(year(1, 1505));
    plan.add(route(2, 1, [IST, VIE], 'advance', false, 'Çaldıran'));
    plan.add(year(2, 1514));
    const one = plan.drawingAt(1);
    const two = plan.drawingAt(2);
    expect(one).toMatchObject({ highlights: ['ottoman-empire'], routes: [], year: 1505 });
    // scene 2 did not ask for the Ottoman highlight, so it is not on the map while scene 2 is
    expect(two.highlights).toEqual([]);
    expect(two.routes).toHaveLength(1);
    expect(two.year).toBe(1514);
    expect(plan.drawingAt(1)).toEqual(one); // going back gives exactly what scene 1 showed
  });

  it('a plan that knows the events’ years gives each scene the year of its own events', () => {
    const years: Record<string, number> = { a: 1514, b: 1526 };
    const plan = new TurnPlan((id) => years[id] ?? null);
    plan.add(event(1, 1, 'a'));
    plan.add(event(2, 1, 'b'));
    plan.add(hl(3, 1, 'x'));
    expect(plan.drawingAt(1).year).toBe(1514);
    expect(plan.drawingAt(2).year).toBe(1526);
    expect(plan.drawingAt(3).year).toBeUndefined();
  });

  it('a scene that sets no year leaves the year to the reader, whatever the scene before set', () => {
    const plan = new TurnPlan();
    plan.add(year(1, 1505));
    plan.add(hl(2, 1, 'a'));
    expect(plan.drawingAt(2).year).toBeUndefined();
  });

  it('a scene the plan does not know is an empty map', () => {
    const plan = new TurnPlan();
    plan.add(hl(1, 1, 'a'));
    expect(isEmptyDrawing(plan.drawingAt(7))).toBe(true);
  });

  it('does not depend on the order the tool calls of one round arrived in', () => {
    const actions = [
      hl(1, 1, 'a'),
      route(2, 1, [IST, VIE]),
      year(2, 1510),
      hl(2, 2, 'b'),
      mark(1, 1, 5, 5, 'Y'),
      event(3, 1, 'e'),
      hl(3, 1, 'z'),
    ];
    const forward = new TurnPlan();
    const backward = new TurnPlan();
    for (const a of actions) forward.add(a);
    for (const a of [...actions].reverse()) backward.add(a);
    for (const n of [1, 2, 3]) expect(backward.drawingAt(n)).toEqual(forward.drawingAt(n));
  });

  it('knows its scenes, their titles and captions, and whether it is empty', () => {
    const plan = new TurnPlan();
    expect(plan.empty).toBe(true);
    plan.declare(2, 'İkinci', 'İkinci sahnenin altyazısı.');
    plan.add(hl(1, 1, 'a'));
    expect(plan.empty).toBe(false);
    expect(plan.numbers()).toEqual([1, 2]);
    expect(plan.titleOf(1)).toBeNull();
    expect(plan.captionOf(1)).toBeNull();
    expect(plan.titleOf(2)).toBe('İkinci');
    expect(plan.captionOf(2)).toBe('İkinci sahnenin altyazısı.');
    plan.declare(2, null, null); // declaring again without texts keeps the ones it has
    expect(plan.captionOf(2)).toBe('İkinci sahnenin altyazısı.');
    expect(plan.has(3)).toBe(false);
  });

  it('counts changes, and knows whether any scene says who is on which side', () => {
    const plan = new TurnPlan();
    const v = plan.version;
    plan.add(hl(1, 1, 'a'));
    expect(plan.version).toBeGreaterThan(v);
    expect(plan.hasSides()).toBe(false);
    plan.add(sides(2, 1, [{ name: 'A', polities: ['a'] }]));
    expect(plan.hasSides()).toBe(true);
  });
});

describe('the beats of a scene', () => {
  it('are the sentences of its caption, at least one, and an empty caption is one beat', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', CAPTION);
    plan.declare(2, 'İki');
    plan.declare(3, 'Üç', 'Tek cümle, noktalı virgülle; hâlâ tek.');
    expect(plan.beatsOf(1)).toEqual(['Birinci cümle.', 'İkinci cümle burada.', 'Üçüncü cümle de var.']);
    expect(plan.beatsOf(2)).toEqual(['']);
    expect(plan.beatsOf(3)).toHaveLength(1);
    expect(plan.beatsOf(9)).toEqual(['']);
    expect(plan.endClock(1)).toEqual({ n: 1, beat: 2, done: true, replay: 0 });
  });

  it('keep a reference to an event whole, and do not split after a number or an initial', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'x', "Alman 6. Ordusu teslim oldu. [Dr. Smith'in raporu](olay:rapor-1943) çıktı. Son.");
    expect(plan.beatsOf(1)).toEqual([
      'Alman 6. Ordusu teslim oldu.',
      "[Dr. Smith'in raporu](olay:rapor-1943) çıktı.",
      'Son.',
    ]);
  });

  it('show an action only from its own beat on: events as markers (prominent, then a numbered dot), arrows only while they play', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', CAPTION);
    plan.add(event(1, 1, 'a'));
    plan.add(route(1, 2, [IST, VIE], 'advance', true, 'Sefer'));
    plan.add(event(1, 2, 'b'));
    plan.add(mark(1, 3, 10, 20, 'Kent'));
    const first = plan.frameAt(clock(1, 0));
    expect(first.events).toEqual([{ id: 'a', beat: 1, now: true }]);
    expect(first.routes).toEqual([]);
    expect(first.marks).toEqual([]);
    const second = plan.frameAt(clock(1, 1));
    expect(second.events).toEqual([
      { id: 'a', beat: 1, now: false },
      { id: 'b', beat: 2, now: true },
    ]);
    expect(second.routes).toHaveLength(1);
    expect(second.routes[0]).toMatchObject({ beat: 2, route: { type: 'advance', label: 'Sefer' } });
    const third = plan.frameAt(clock(1, 2));
    expect(third.events.map((e) => [e.id, e.now])).toEqual([
      ['a', false],
      ['b', false],
    ]);
    expect(third.routes).toEqual([]); // the arrow of beat 2 is gone with its beat
    expect(third.marks).toEqual([{ mark: { point: { lon: 10, lat: 20 }, label: 'Kent' }, beat: 3, now: true }]);
  });

  it('end the scene with every marker a numbered dot, no arrows and no emphasis', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', CAPTION);
    plan.add(event(1, 1, 'a'));
    plan.add(route(1, 3, [IST, VIE]));
    plan.add(hl(1, 3, 'p'));
    plan.add(mark(1, 2, 10, 20, 'Kent'));
    const playing = plan.frameAt(clock(1, 2));
    expect(playing.routes).toHaveLength(1);
    expect(playing.emphasis).toEqual(['p']);
    const ended = plan.frameAt(plan.endClock(1));
    expect(ended.routes).toEqual([]);
    expect(ended.emphasis).toEqual([]);
    expect(ended.events.every((e) => !e.now)).toBe(true);
    expect(ended.marks.every((m) => !m.now)).toBe(true);
    expect(ended.events).toHaveLength(1);
    expect(ended.marks).toHaveLength(1);
  });

  it('an action asked for a beat past the end of the caption plays with the last one; one without a beat plays with the first', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', 'Bir. İki.');
    plan.add(event(1, 9, 'late'));
    plan.add(event(1, 1, 'early'));
    expect(plan.frameAt(clock(1, 0)).events.map((e) => e.id)).toEqual(['early']);
    expect(plan.frameAt(clock(1, 1)).events.map((e) => [e.id, e.beat, e.now])).toEqual([
      ['early', 1, false],
      ['late', 2, true],
    ]);
  });

  it('are replayed with the same frame, told apart only by the replay count', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', CAPTION);
    plan.add(route(1, 2, [IST, VIE]));
    const a = plan.frameAt(clock(1, 1, false, 0));
    const b = plan.frameAt(clock(1, 1, false, 1));
    expect(b.routes).toEqual(a.routes);
    expect(b.replay).toBe(a.replay + 1);
  });

  it('move the year with a change of borders, from the beat that names it on', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', CAPTION);
    plan.add(year(1, 1939));
    plan.add(change(1, 2, 'a', 1939, 1940));
    plan.add(change(1, 3, 'b', 1940, 1941));
    expect(plan.frameAt(clock(1, 0)).year).toBe(1939);
    expect(plan.frameAt(clock(1, 1)).year).toBe(1940);
    expect(plan.frameAt(clock(1, 1)).changes).toEqual([
      { change: { polity: 'a', from: 1939, to: 1940 }, beat: 2, now: true },
    ]);
    const third = plan.frameAt(clock(1, 2));
    expect(third.year).toBe(1941);
    expect(third.changes.map((c) => [c.change.polity, c.now])).toEqual([
      ['a', false],
      ['b', true],
    ]);
    expect(plan.frameAt(plan.endClock(1)).year).toBe(1941);
    expect(plan.endYearOf(1)).toBe(1941);
    expect(plan.drawingAt(1).year).toBe(1939); // the scene starts there
  });

  it('end in the year they started in when nothing changes borders', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', CAPTION);
    plan.add(year(1, 1939));
    expect(plan.endYearOf(1)).toBe(1939);
    plan.declare(2, 'İki', CAPTION);
    expect(plan.endYearOf(2)).toBeUndefined();
  });
});

describe('the colours of the actors', () => {
  const west: Side = { name: 'Batı', polities: ['a', 'b'] };
  const east: Side = { name: 'Doğu', polities: ['c'] };
  const colorsOf = (frame: { painted: { id: string; color: string }[] }) =>
    Object.fromEntries(frame.painted.map((p) => [p.id, p.color]));

  it('are the side the narration is about, the sides against it and whoever stands aside; no two opposing sides share a colour', () => {
    const plan = new TurnPlan();
    plan.focus = ['c'];
    plan.declare(1, 'Bir', 'Bir.');
    plan.add(sides(1, 1, [west, east], ['d']));
    const frame = plan.frameAt(plan.endClock(1));
    expect(colorsOf(frame)).toEqual({ a: 'foe-1', b: 'foe-1', c: 'focus', d: 'neutral' });
    expect(frame.blocs.map((b) => [b.name, b.color])).toEqual([
      ['Batı', 'foe-1'],
      ['Doğu', 'focus'],
      ['Tarafsız ya da belirsiz', 'neutral'],
    ]);
  });

  it('the side that holds the focus is the focus; without one, the first side', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Bir', 'Bir.');
    plan.add(sides(1, 1, [west, east]));
    expect(colorsOf(plan.frameAt(plan.endClock(1)))).toEqual({ a: 'focus', b: 'focus', c: 'foe-1' });
  });

  it('stay with an actor for the whole narration: a later scene that states nothing still has the colours of the one before', () => {
    const plan = new TurnPlan();
    plan.focus = ['a'];
    plan.declare(1, 'Bir', 'Bir.');
    plan.declare(2, 'İki', 'İki.');
    plan.add(sides(1, 1, [west, east]));
    plan.add(event(2, 1, 'x'));
    const frame = plan.frameAt(clock(2, 0));
    expect(colorsOf(frame)).toEqual({ a: 'focus', b: 'focus', c: 'foe-1' });
    expect(frame.blocs.map((b) => b.name)).toEqual(['Batı', 'Doğu']); // and the legend says so
  });

  it('are the same when a side comes again by its name, whatever its members now are, and recolour a polity that changes sides', () => {
    const plan = new TurnPlan();
    plan.focus = ['a'];
    plan.declare(1, 'Bir', 'Bir. İki. Üç.');
    plan.add(sides(1, 1, [west, east], ['d']));
    plan.add(
      sides(1, 2, [
        { name: 'Batı', polities: ['a'] },
        { name: 'Üçüncü', polities: ['e'] },
        { name: 'Doğu', polities: ['c', 'd'] }, // d joins the east: it is no longer on the margin
      ]),
    );
    const frame = plan.frameAt(clock(1, 1));
    expect(colorsOf(frame)).toEqual({ a: 'focus', e: 'foe-2', c: 'foe-1', d: 'foe-1' }); // (b was not named: it fades)
  });

  it('come with their beat: before it a polity is not painted, at it it is', () => {
    const plan = new TurnPlan();
    plan.focus = ['a'];
    plan.declare(1, 'Bir', 'Bir. İki.');
    plan.add(
      sides(
        1,
        1,
        [
          { name: 'A', polities: ['a'] },
          { name: 'B', polities: ['c'] },
        ],
        ['d'],
      ),
    );
    plan.add(
      sides(1, 2, [
        { name: 'A', polities: ['a'] },
        { name: 'B', polities: ['c', 'd'] },
      ]),
    );
    expect(colorsOf(plan.frameAt(clock(1, 0)))).toEqual({ a: 'focus', c: 'foe-1', d: 'neutral' });
    expect(colorsOf(plan.frameAt(clock(1, 1)))).toEqual({ a: 'focus', c: 'foe-1', d: 'foe-1' });
  });

  it('are not a matter of the order the tool calls arrived in', () => {
    const actions = [
      sides(1, 1, [west, east]),
      sides(2, 1, [
        { name: 'Doğu', polities: ['c'] },
        { name: 'Yeni', polities: ['z'] },
      ]),
      event(2, 1, 'x'),
    ];
    const make = (list: MapAction[]) => {
      const plan = new TurnPlan();
      plan.focus = ['a'];
      plan.declare(1, 'Bir', 'Bir.');
      plan.declare(2, 'İki', 'İki.');
      for (const a of list) plan.add(a);
      return plan;
    };
    const forward = make(actions);
    const backward = make([...actions].reverse());
    expect(backward.frameAt(clock(2, 0))).toEqual(forward.frameAt(clock(2, 0)));
  });
});

describe('how the app draws an event of the data, by its kind', () => {
  it('a war (military) is told from every other kind of event', () => {
    expect(eventKindOf('military')).toBe('war');
    for (const category of ['politics', 'economy', 'culture', 'society', 'disaster', 'something-new'])
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

describe('resolveFrame and frameTargetOf (shipped data)', () => {
  const data = archivedData('1400-1600');
  const resolver = new Resolver(data);

  it('turns an event into its marker, and drops the one the data does not know', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Mohaç', 'Mohaç.');
    plan.add(event(1, 1, 'mohac-1526'));
    plan.add(event(1, 1, 'yok-boyle-bir-olay'));
    const r = resolveFrame(plan.frameAt(clock(1, 0)), resolver, 1526);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({
      id: 'mohac-1526',
      title: 'Mohaç Muharebesi',
      category: 'military',
      point: { lon: 18.68, lat: 45.99 },
      beat: 1,
      now: true,
    });
    expect(r.year).toBe(1526);
  });

  it('draws no line for an event, whatever its kind: a marker is all an event is', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'x', 'x.');
    plan.add(event(1, 1, 'mohac-1526'));
    plan.add(event(1, 1, 'tordesillas-1494'));
    const r = resolveFrame(plan.frameAt(clock(1, 0)), resolver, 1526);
    expect(r.routes).toEqual([]);
    expect(r.events).toHaveLength(2);
    expect(Object.keys(r)).not.toContain('links');
    expect(Object.keys(r)).not.toContain('wars');
  });

  it('paints and points at only what has borders in the year shown, but keeps it in the plan for another year', () => {
    const plan = new TurnPlan();
    plan.focus = ['ottoman-empire'];
    plan.declare(1, 'x', 'x. y.');
    plan.add(
      sides(1, 1, [
        { name: 'Osmanlı', polities: ['ottoman-empire'] },
        { name: 'Memlük', polities: ['mamluk-sultanate'] },
      ]),
    );
    plan.add(hl(1, 1, 'mamluk-sultanate', 'ottoman-empire'));
    const frame = plan.frameAt(clock(1, 0));
    const early = resolveFrame(frame, resolver, 1510);
    const late = resolveFrame(frame, resolver, 1530);
    expect(early.painted.map((p) => p.id)).toEqual(['ottoman-empire', 'mamluk-sultanate']);
    expect(early.emphasis).toEqual(['mamluk-sultanate', 'ottoman-empire']);
    expect(late.painted.map((p) => p.id)).toEqual(['ottoman-empire']); // the Mamluks are gone by 1530
    expect(late.emphasis).toEqual(['ottoman-empire']);
    expect(late.blocs.map((b) => b.name)).toEqual(['Osmanlı', 'Memlük']); // (the legend is the narration’s)
  });

  it('changes of borders are kept while the polity has borders in either of their years', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'x', 'x.');
    plan.add(change(1, 1, 'ottoman-empire', 1500, 1530));
    plan.add(change(1, 1, 'mamluk-sultanate', 1510, 1530)); // gone by 1530, but there in 1510
    plan.add(change(1, 1, 'atlantis', 1500, 1530));
    const r = resolveFrame(plan.frameAt(clock(1, 0)), resolver, 1530);
    expect(r.changes.map((c) => c.polity)).toEqual(['ottoman-empire', 'mamluk-sultanate']);
    expect(r.changes[0]).toMatchObject({ from: 1500, to: 1530, beat: 1, now: true });
  });

  it('the camera target is everything the scene will show: the markers, the stops of its arrows, its marks and the part of each polity it is about', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'Çaldıran', 'Bir. İki. Üç.');
    plan.add(event(1, 1, 'caldiran-1514'));
    plan.add(
      sides(1, 2, [
        { name: 'A', polities: ['ottoman-empire'] },
        { name: 'B', polities: ['safavid-dynasty'] },
      ]),
    );
    plan.add(hl(1, 3, 'mamluk-sultanate'));
    plan.add(mark(1, 3, 37.1, 36.68, 'Mercidabık'));
    const target = frameTargetOf(plan.drawingAt(1), resolver, 1514)!;
    // Çaldıran’s marker and the mark; the polities (three) are boxes
    expect(target.points).toContainEqual({ lon: 44.0, lat: 39.14 });
    expect(target.points).toContainEqual({ lon: 37.1, lat: 36.68 });
    expect(target.points).toHaveLength(2);
    expect(target.boxes.length).toBeGreaterThan(0);
    for (const b of target.boxes) expect(b[0]).toBeLessThan(b[2]);
  });

  it('a scene that puts nothing on the map has nothing to bring into view', () => {
    expect(frameTargetOf(drawingOf([year(1, 1520)]), resolver, 1520)).toBeNull();
    expect(frameTargetOf(emptyDrawing(), resolver, 1520)).toBeNull();
    // a polity without borders that year cannot be drawn and so cannot be framed either
    expect(frameTargetOf(drawingOf([hl(1, 1, 'mamluk-sultanate')]), resolver, 1530)).toBeNull();
  });
});

describe('resolveFrame with places (a few cities and capitals on the 1400–1600 data)', () => {
  const resolver = new Resolver(withMiniPlaces(archivedData('1400-1600')));
  const ISTANBUL = { lon: 28.98, lat: 41.01 };
  const EDIRNE = { lon: 26.56, lat: 41.68 };
  const VIENNA = { lon: 16.37, lat: 48.21 };
  const PARIS = { lon: 2.35, lat: 48.86 };

  const routesOf = (actions: MapAction[], yearShown: number) => {
    const plan = new TurnPlan();
    plan.declare(1, 'x', 'x.');
    for (const a of actions) plan.add(a);
    return resolveFrame(plan.frameAt(clock(1, 0)), resolver, yearShown).routes;
  };

  it('the capital is the one of the year: Edirne before 1453, İstanbul after', () => {
    expect(resolver.placePoint(polity('ottoman-empire'), 1452)).toEqual(EDIRNE);
    expect(resolver.placePoint(polity('ottoman-empire'), 1453)).toEqual(ISTANBUL);
  });

  it('a polity with no borders that year is nowhere, whatever the table says of its capital', () => {
    expect(resolver.capitalPoint('mamluk-sultanate', 1500)).toEqual({ lon: 31.25, lat: 30.06 });
    expect(resolver.placePoint(polity('mamluk-sultanate'), 1500)).toEqual({ lon: 31.25, lat: 30.06 });
    expect(resolver.placePoint(polity('mamluk-sultanate'), 1530)).toBeNull();
    expect(resolver.placePoint(polity('atlantis'), 1530)).toBeNull();
  });

  it('a route runs through its stops in the order given, in the year shown, one point for each', () => {
    const r = routesOf([route(1, 1, [EDI, VIE, polity('kingdom-of-france')], 'advance', true, 'Sefer')], 1526);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ type: 'advance', animate: true, label: 'Sefer' });
    expect(r[0]!.points).toEqual([EDIRNE, VIENNA, PARIS]);
  });

  it('a stop that is not on the map that year is left out, and a route with fewer than two stops is not drawn', () => {
    const r = routesOf(
      [
        route(1, 1, [EDI, polity('mamluk-sultanate'), VIE]), // the Mamluks are gone in 1530
        route(1, 1, [EDI, polity('mamluk-sultanate')], 'retreat'),
      ],
      1530,
    );
    expect(r.map((x) => x.type)).toEqual(['advance']);
    expect(r[0]!.points).toEqual([EDIRNE, VIENNA]);
  });

  it('two stops that are one place that year are one stop', () => {
    const r = routesOf([route(1, 1, [IST, polity('ottoman-empire'), VIE], 'advance')], 1526);
    expect(r[0]!.points).toEqual([ISTANBUL, VIENNA]);
  });

  it('an army leaves from the border of its polity toward where it goes, not from its capital', () => {
    const r = routesOf([route(1, 1, [border('ottoman-empire', VIE), VIE], 'advance')], 1526);
    expect(r).toHaveLength(1);
    const start = r[0]!.points[0]!;
    expect(start).toEqual(resolver.borderPoint('ottoman-empire', 1526, VIENNA));
    expect(start).not.toEqual(ISTANBUL);
    // it is on the Ottoman side of the front: nearer Vienna than the capital is
    const km = (p: { lon: number; lat: number }) => Math.hypot(p.lon - VIENNA.lon, p.lat - VIENNA.lat);
    expect(km(start)).toBeLessThan(km(ISTANBUL));
    expect(r[0]!.points[1]).toEqual(VIENNA);
  });

  it('the border of a polity that has no borders that year is nowhere, and the route has one stop fewer', () => {
    const r = routesOf([route(1, 1, [border('mamluk-sultanate', VIE), VIE])], 1530);
    expect(r).toEqual([]);
  });

  it('a route across the date line runs on: its longitudes are not folded back', () => {
    const r = routesOf([route(1, 1, [at(139.7, 35.7), at(-157.9, 21.3)])], 1526);
    expect(r[0]!.points.map((p) => p.lon)).toEqual([139.7, 202.1]);
  });

  it('frames a scene across the date line as the stretch it is, with longitudes that run on', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'x', 'x.');
    plan.add(route(1, 1, [at(139.7, 35.7), at(-157.9, 21.3)]));
    plan.add(mark(1, 1, 143, 11, 'Mariana'));
    const target = frameTargetOf(plan.drawingAt(1), resolver, 1526)!;
    const lons = target.points.map((p) => p.lon);
    expect(Math.max(...lons) - Math.min(...lons)).toBeLessThan(90); // not the whole world the other way round
    expect(Math.max(...lons)).toBeGreaterThan(180);
  });

  it('the part of a polity the scene is about is the one that reaches into the surroundings of its places', () => {
    const plan = new TurnPlan();
    plan.declare(1, 'x', 'x.');
    plan.add(route(1, 1, [EDI, VIE]));
    plan.add(hl(1, 1, 'kingdom-of-france', 'ottoman-empire', 'safavid-dynasty'));
    const target = frameTargetOf(plan.drawingAt(1), resolver, 1520)!;
    expect(target.points).toEqual([EDIRNE, VIENNA]); // the stops of the arrow are in view too
    expect(target.boxes.length).toBeLessThan(3); // the Safavids, far away, are not
    const around = surroundings(pointsBox(target.points)!);
    for (const b of target.boxes) {
      expect(b[0]).toBeGreaterThanOrEqual(around[0] - 1e-9);
      expect(b[2]).toBeLessThanOrEqual(around[2] + 1e-9);
    }
    // the Ottoman part around the arrow is there, with Edirne in it (Vienna is not Ottoman)
    expect(
      target.boxes.some((b) => b[0] < EDIRNE.lon && EDIRNE.lon < b[2] && b[1] < EDIRNE.lat && EDIRNE.lat < b[3]),
    ).toBe(true);
    // with no place at all, only the polities: the body of each of the three
    const only = frameTargetOf(
      drawingOf([hl(1, 1, 'kingdom-of-france', 'ottoman-empire', 'safavid-dynasty')]),
      resolver,
      1520,
    )!;
    expect(only.points).toEqual([]);
    expect(only.boxes).toHaveLength(3);
  });
});

describe('describeDrawing', () => {
  const name = (id: string) => ({ a: 'Alfa', b: 'Beta' })[id] ?? id;

  it('says what is drawn, for the model and for screen readers', () => {
    const d = drawingOf([
      hl(1, 1, 'a'),
      event(1, 1, 'caldiran-1514'),
      mark(1, 1, 1, 1, 'Kent'),
      change(1, 2, 'b', 1939, 1940),
      year(1, 1936),
    ]);
    expect(describeDrawing(d, name, () => 'Çaldıran Muharebesi')).toBe(
      'öne çıkan: Alfa; toprak değişimi: Beta 1939→1940; olay: Çaldıran Muharebesi; işaretli: Kent; sınır yılı 1936',
    );
    expect(describeDrawing(emptyDrawing(), name)).toBe('');
  });

  it('names the sides, those who stand aside and the stops of an arrow', () => {
    const d = drawingOf([
      sides(
        1,
        1,
        [
          { name: 'Mihver', polities: ['a'] },
          { name: 'Müttefikler', polities: ['b'] },
        ],
        ['c'],
      ),
      route(1, 1, [EDI, polity('a'), VIE], 'retreat', true, 'Çekiliş'),
      route(1, 1, [border('a', VIE), VIE], 'advance'),
      route(1, 1, [IST, VIE], 'trade'),
    ]);
    expect(describeDrawing(d, name)).toBe(
      'taraflar: Mihver (Alfa) – Müttefikler (Beta); tarafsız ya da belirsiz: c; ' +
        'ok (geri çekilme): Edirne → Alfa → Viyana (Çekiliş); ok (ilerleyiş): Alfa sınırı → Viyana; ' +
        'ok (ticaret yolu): İstanbul → Viyana',
    );
  });
});
