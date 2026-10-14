import { describe, expect, it } from 'vitest';
import { frameBounds, pointsBox, surroundings } from '../src/domain/camera';
import { drawingOf, frameTargetOf, resolveFrame, TurnPlan } from '../src/ai/drawing';
import { Resolver } from '../src/ai/resolve';
import type { MapAction, PlaceRef } from '../src/ai/types';
import { shippedData } from './helpers/shipped';

/**
 * What a scene about an event of the war years shows: the borders at the event's start, and a camera that frames the places
 * of the scene and the parts of the polities it points at that reach there, not the territory of every polity of them. (The
 * shipped data is 1800–2000.)
 */
const data = shippedData();
const resolver = new Resolver(data);
const eventYearOf = (id: string) => {
  const ev = resolver.eventById(id);
  return ev ? resolver.showYearOf(ev) : null;
};
const show = (id: string): MapAction => ({ kind: 'event', step: 1, beat: 1, id });
const highlight = (...polities: string[]): MapAction => ({ kind: 'highlight', step: 1, beat: 1, polities });
const city = (id: string, name: string): PlaceRef => ({ kind: 'city', id, name });
const route = (...via: PlaceRef[]): MapAction => ({
  kind: 'route',
  step: 1,
  beat: 1,
  via,
  type: 'advance',
  animate: true,
});
const event = (id: string): PlaceRef => ({ kind: 'event', id, name: id });
const sides = (...list: { name: string; polities: string[] }[]): MapAction => ({
  kind: 'sides',
  step: 1,
  beat: 1,
  sides: list,
  neutral: [],
});
const yearOf = (id: string) => resolver.showYearOf(resolver.eventById(id)!);

const PARIS = { lon: 2.35, lat: 48.86 };

/** The frame the camera will go for: the box around the target's points and boxes. */
const frameOf = (actions: MapAction[], year: number) => {
  const drawing = drawingOf(actions, eventYearOf);
  const target = frameTargetOf(drawing, resolver, year)!;
  return { drawing, target, frame: frameBounds(target.boxes, target.points)! };
};
const WEST = ['french-third-republic', 'kingdom-of-great-britain', 'nazi-germany'];

describe('the borders a step about an event shows: those at its start, not after it', () => {
  it('the Battle of France (10 May 1940) is on the borders of 1939: the Third Republic has none from 1940 on', () => {
    expect(resolver.rowAt('french-third-republic', 1940)).toBeNull();
    expect(resolver.rowAt('french-third-republic', 1939)).not.toBeNull();
    expect(yearOf('fransa-muharebesi-1940')).toBe(1939);
    // and so are the other events of the fall of France whose parties were still there when they began
    for (const id of ['dunkirk-1940', 'paris-isgali-1940', 'compiegne-ateskesi-1940'])
      expect(yearOf(id), id).toBe(1939);
  });

  it('an event is a marker where it happened and nothing more: no line from one capital to another, whatever the borders of the year', () => {
    const year = yearOf('fransa-muharebesi-1940');
    const plan = new TurnPlan(eventYearOf);
    plan.declare(1, 'Fransa', 'Fransa düştü.');
    plan.add(show('fransa-muharebesi-1940'));
    const frame = resolveFrame(plan.frameAt(plan.endClock(1)), resolver, year);
    expect(frame.events.map((e) => e.id)).toEqual(['fransa-muharebesi-1940']);
    expect(frame.routes).toEqual([]);
    // (on the borders of 1940 the Third Republic is gone, and nothing is drawn of it unless the model says so)
    expect(frame.painted).toEqual([]);
    expect(frame.emphasis).toEqual([]);
  });

  it('an event is shown on its own year when its parties are all there, and a party that is missing for years does not pull it back', () => {
    for (const [id, year] of [
      ['normandiya-1944', 1944],
      ['stalingrad-1942', 1942],
      ['barbarossa-1941', 1941],
      ['pearl-harbor-1941', 1941],
      ['almanya-teslimi-1945', 1945], // the Free French have no borders in 1945, but they are not one of its main parties
      ['berlin-muharebesi-1945', 1945],
      ['anne-frank-saklanma-1942', 1942], // the Netherlands are gone since 1940: not something that ended in 1942
      ['polonya-isgali-1939', 1939],
    ] as const) {
      expect(yearOf(id), id).toBe(year);
    }
  });

  it('an event that ended one of its sides is on the year before, as it was', () => {
    expect(yearOf('anschluss-1938')).toBe(1937); // Austria
    expect(yearOf('cekoslovakya-isgali-1939')).toBe(1938); // Czechoslovakia
    expect(yearOf('yugoslavya-yunanistan-1941')).toBe(1940);
    expect(yearOf('waterloo-1815')).toBe(1814); // the Empire of Napoleon
  });

  it('is never later than the event’s own year, and every event of the data can be drawn on the year it gets', () => {
    for (const ev of data.events) {
      const year = resolver.showYearOf(ev);
      expect(year, ev.id).toBeLessThanOrEqual(ev.year);
      expect(year, ev.id).toBeGreaterThanOrEqual(ev.year - 4);
    }
  });
});

describe('where the camera looks: the places of the scene and the parts of the polities it points at that reach there', () => {
  it('a scene of the Battle of France with the powers pointed at frames France, the Low Countries, Britain and western Germany, not the world', () => {
    const { frame, target } = frameOf([show('fransa-muharebesi-1940'), highlight(...WEST)], 1939);
    // Western Europe: a few tens of degrees across, the battle itself and Paris inside
    expect(frame[2] - frame[0]).toBeLessThan(35);
    expect(frame[3] - frame[1]).toBeLessThan(20);
    for (const p of [PARIS, { lon: 4.94, lat: 49.7 }]) {
      expect(p.lon).toBeGreaterThanOrEqual(frame[0]);
      expect(p.lon).toBeLessThanOrEqual(frame[2]);
      expect(p.lat).toBeGreaterThanOrEqual(frame[1]);
      expect(p.lat).toBeLessThanOrEqual(frame[3]);
    }
    // the French land in it is France, not Guiana; the British land is Britain, not Aden or Palestine
    expect(frame[0]).toBeGreaterThan(-12);
    expect(frame[1]).toBeGreaterThan(38);
    expect(frame[2]).toBeLessThan(30);
    for (const b of target.boxes) {
      expect(b[0]).toBeGreaterThan(-12);
      expect(b[2]).toBeLessThan(30);
    }
  });

  it('a scene of Normandy with the US pointed at frames Western Europe: the United States brings none of its land', () => {
    const { frame, target } = frameOf(
      [show('normandiya-1944'), highlight('united-states-of-america', 'kingdom-of-great-britain', 'nazi-germany')],
      1944,
    );
    expect(frame[2] - frame[0]).toBeLessThan(40);
    expect(frame[3] - frame[1]).toBeLessThan(20);
    expect(frame[0]).toBeGreaterThan(-15); // nothing of Greenland (−72…−12), Alaska, or the Atlantic
    for (const b of target.boxes) expect(b[0]).toBeGreaterThan(-15);
    // the landing itself is in view
    const omaha = { lon: -0.87, lat: 49.37 };
    expect(omaha.lon).toBeGreaterThanOrEqual(frame[0]);
    expect(omaha.lon).toBeLessThanOrEqual(frame[2]);
    expect(omaha.lat).toBeGreaterThanOrEqual(frame[1]);
    expect(omaha.lat).toBeLessThanOrEqual(frame[3]);
  });

  it('the part of a polity that is framed lies in the surroundings of the places, cut at their edge', () => {
    const { target } = frameOf([show('fransa-muharebesi-1940'), highlight(...WEST)], 1939);
    const around = surroundings(pointsBox(target.points)!);
    for (const b of target.boxes) {
      expect(b[0]).toBeGreaterThanOrEqual(around[0] - 1e-9);
      expect(b[1]).toBeGreaterThanOrEqual(around[1] - 1e-9);
      expect(b[2]).toBeLessThanOrEqual(around[2] + 1e-9);
      expect(b[3]).toBeLessThanOrEqual(around[3] + 1e-9);
    }
  });

  it('the Soviet Union of a scene at Stalingrad frames its European side, not Siberia and Chukotka', () => {
    const { frame } = frameOf([show('stalingrad-1942'), highlight('union-of-soviet-socialist-republics')], 1942);
    expect(frame[2]).toBeLessThan(80);
    expect(frame[2] - frame[0]).toBeLessThan(70);
  });

  it('a polity with no land near the scene has nothing to frame; with no scene at all it is its body (not its colonies)', () => {
    const around = surroundings([-1, 49, 14, 53]); // Normandy to Berlin
    expect(resolver.boundsAt('united-states-of-america', 1944, around)).toBeNull();
    expect(resolver.boundsAt('kingdom-of-great-britain', 1944, around)).not.toBeNull();
    const us = resolver.boundsAt('united-states-of-america', 1944)!;
    expect(us[0]).toBeGreaterThan(-130); // the lower 48, without Alaska
    expect(us[3]).toBeLessThan(60); // and without Greenland
    const uk = resolver.boundsAt('kingdom-of-great-britain', 1939)!;
    expect(uk[0]).toBeGreaterThan(-10);
    expect(uk[2]).toBeLessThan(5); // Britain and Northern Ireland, not Aden or Palestine
  });

  it('a scene that only points at polities frames their bodies: France and the UK of 1939 are Western Europe too', () => {
    const { frame } = frameOf([highlight('french-third-republic', 'kingdom-of-great-britain')], 1939);
    expect(frame[2] - frame[0]).toBeLessThan(25);
    expect(frame[0]).toBeGreaterThan(-12);
    expect(frame[2]).toBeLessThan(15);
    const us = frameOf([highlight('united-states-of-america')], 1944).frame;
    expect(us[0]).toBeGreaterThan(-130);
    expect(us[2]).toBeLessThan(-60);
  });

  it('a scene that paints sides or changes borders frames the polities too: all of what it will show, once', () => {
    const painted = frameOf(
      [sides({ name: 'A', polities: ['nazi-germany'] }, { name: 'B', polities: ['second-polish-republic'] }) as never],
      1939,
    );
    expect(painted.target.boxes).toHaveLength(2);
    expect(painted.target.points).toEqual([]);
    const changed = frameOf(
      [{ kind: 'territory', step: 1, beat: 1, polity: 'union-of-soviet-socialist-republics', from: 1939, to: 1940 }],
      1940,
    );
    expect(changed.target.boxes).toHaveLength(1);
  });

  it('a war of far-away powers has all its arrow in view, and an arrow over the date line takes the short way', () => {
    const { frame, target } = frameOf([route(event('pearl-harbor-1941'), city('tokyo', 'Tokyo'))], 1941);
    // Pearl Harbor to Tokyo is a few thousand kilometres over the Pacific, not the whole world the other way round
    expect(frame[2] - frame[0]).toBeLessThan(100);
    expect(frame[2]).toBeGreaterThan(180); // the box runs on past the date line: it is the Pacific, in one piece
    expect(target.points.map((p) => p.lon).some((lon) => lon > 180)).toBe(true);
  });
});

describe('when a step is about (its place on the timeline)', () => {
  it('is when the earliest event it shows starts, whatever year’s borders it shows', () => {
    const plan = new TurnPlan(eventYearOf, (id) => resolver.eventById(id)?.start ?? null);
    plan.add({ kind: 'event', step: 1, beat: 1, id: 'fransa-muharebesi-1940' });
    plan.add({ kind: 'event', step: 1, beat: 1, id: 'compiegne-ateskesi-1940' });
    expect(plan.drawingAt(1).year).toBe(1939); // the borders at the start of the Battle of France...
    expect(plan.whenAt(1)).toBeCloseTo(1940.355, 2); // ...and its date: 10 May 1940
  });

  it('is the middle of the year a step names when it shows no event, and nothing when it has neither', () => {
    const plan = new TurnPlan(eventYearOf, (id) => resolver.eventById(id)?.start ?? null);
    plan.add({ kind: 'set_year', step: 1, year: 1943 });
    plan.add({ kind: 'highlight', step: 2, beat: 1, polities: ['nazi-germany'] });
    expect(plan.whenAt(1)).toBe(1943.5);
    expect(plan.whenAt(2)).toBeNull();
    expect(plan.whenAt(3)).toBeNull();
  });
});
