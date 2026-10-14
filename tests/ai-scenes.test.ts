import { describe, expect, it } from 'vitest';
import { frameBounds, pointsBox, surroundings } from '../src/domain/camera';
import { drawingOf, frameTargetOf, resolveDrawing, TurnPlan } from '../src/ai/drawing';
import { Resolver } from '../src/ai/resolve';
import type { MapAction } from '../src/ai/types';
import { shippedData } from './helpers/shipped';

/**
 * What a step about an event of the war years shows: the borders at the event's start, and a camera that frames the places
 * of the scene, not the territory of every polity that is lit in it. (The shipped data is 1800–2000.)
 */
const data = shippedData();
const resolver = new Resolver(data);
const eventYearOf = (id: string) => {
  const ev = resolver.eventById(id);
  return ev ? resolver.showYearOf(ev) : null;
};
const show = (id: string): MapAction => ({ kind: 'event', step: 1, id });
const highlight = (...polities: string[]): MapAction => ({ kind: 'highlight', step: 1, polities });
const yearOf = (id: string) => resolver.showYearOf(resolver.eventById(id)!);

const PARIS = { lon: 2.35, lat: 48.86 };
const BERLIN = { lon: 13.4, lat: 52.52 };
const LONDON = { lon: -0.13, lat: 51.51 };
const near = (a: { lon: number; lat: number }, b: { lon: number; lat: number }, deg = 0.6) =>
  Math.abs(a.lon - b.lon) <= deg && Math.abs(a.lat - b.lat) <= deg;

/** The frame the camera will go for: the box around the target's points and boxes. */
const frameOf = (actions: MapAction[], year: number) => {
  const drawing = drawingOf(actions, eventYearOf);
  const resolved = resolveDrawing(drawing, resolver, year);
  const target = frameTargetOf(resolved, resolver, year)!;
  return { resolved, target, frame: frameBounds(target.boxes, target.points)! };
};

describe('the borders a step about an event shows: those at its start, not after it', () => {
  it('the Battle of France (10 May 1940) is on the borders of 1939: the Third Republic has none from 1940 on', () => {
    expect(resolver.rowAt('french-third-republic', 1940)).toBeNull();
    expect(resolver.rowAt('french-third-republic', 1939)).not.toBeNull();
    expect(yearOf('fransa-muharebesi-1940')).toBe(1939);
    // and so are the other events of the fall of France whose parties were still there when they began
    for (const id of ['dunkirk-1940', 'paris-isgali-1940', 'compiegne-ateskesi-1940'])
      expect(yearOf(id), id).toBe(1939);
  });

  it('the war line of the Battle of France runs between Germany and France, and leaves the UK where it belongs', () => {
    const year = yearOf('fransa-muharebesi-1940');
    const war = resolveDrawing(drawingOf([show('fransa-muharebesi-1940')], eventYearOf), resolver, year).events[0]!
      .war!;
    expect([war.aId, war.bId]).toEqual(['nazi-germany', 'french-third-republic']);
    expect(near(war.a, BERLIN)).toBe(true);
    expect(near(war.b, PARIS)).toBe(true);
    // (on the borders of 1940, where France no longer is, the line fell back to the next party of its side: London)
    const after = resolveDrawing(drawingOf([show('fransa-muharebesi-1940')]), resolver, 1940).events[0]!.war!;
    expect(after.bId).toBe('kingdom-of-great-britain');
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

describe('where the camera looks: the places of the scene and the parts of the lit polities that reach there', () => {
  it('a scene of the Battle of France frames France, the Low Countries, Britain and western Germany, not the world', () => {
    const { frame, target, resolved } = frameOf([show('fransa-muharebesi-1940')], 1939);
    expect(resolved.spotIds).toContain('french-third-republic');
    expect(resolved.spotIds).toContain('kingdom-of-great-britain');
    // Western Europe: a few tens of degrees across, both capitals of the line and the battle itself inside
    expect(frame[2] - frame[0]).toBeLessThan(35);
    expect(frame[3] - frame[1]).toBeLessThan(20);
    for (const p of [PARIS, BERLIN, { lon: 4.94, lat: 49.7 }]) {
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

  it('a scene of Normandy (the US is in it) frames Western Europe: the United States brings none of its land', () => {
    const { frame, target, resolved } = frameOf([show('normandiya-1944')], 1944);
    expect(resolved.spotIds).toContain('united-states-of-america');
    expect(frame[2] - frame[0]).toBeLessThan(40);
    expect(frame[3] - frame[1]).toBeLessThan(20);
    expect(frame[0]).toBeGreaterThan(-15); // nothing of Greenland (−72…−12), Alaska, or the Atlantic
    for (const b of target.boxes) expect(b[0]).toBeGreaterThan(-15);
    // the line runs London – Omaha Beach – Berlin: all of it is in view
    const omaha = { lon: -0.87, lat: 49.37 };
    for (const p of [LONDON, omaha, BERLIN]) {
      expect(p.lon).toBeGreaterThanOrEqual(frame[0]);
      expect(p.lon).toBeLessThanOrEqual(frame[2]);
      expect(p.lat).toBeGreaterThanOrEqual(frame[1]);
      expect(p.lat).toBeLessThanOrEqual(frame[3]);
    }
  });

  it('the part of a polity that is framed lies in the surroundings of the places, cut at their edge', () => {
    const { target } = frameOf([show('fransa-muharebesi-1940')], 1939);
    const around = surroundings(pointsBox(target.points)!);
    for (const b of target.boxes) {
      expect(b[0]).toBeGreaterThanOrEqual(around[0] - 1e-9);
      expect(b[1]).toBeGreaterThanOrEqual(around[1] - 1e-9);
      expect(b[2]).toBeLessThanOrEqual(around[2] + 1e-9);
      expect(b[3]).toBeLessThanOrEqual(around[3] + 1e-9);
    }
  });

  it('the Soviet Union of a scene at Stalingrad frames its European side, not Siberia and Chukotka', () => {
    const { frame } = frameOf([show('stalingrad-1942')], 1942);
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

  it('a step that only lights polities frames their bodies: France and the UK of 1939 are Western Europe too', () => {
    const { frame } = frameOf([highlight('french-third-republic', 'kingdom-of-great-britain')], 1939);
    expect(frame[2] - frame[0]).toBeLessThan(25);
    expect(frame[0]).toBeGreaterThan(-12);
    expect(frame[2]).toBeLessThan(15);
    const us = frameOf([highlight('united-states-of-america')], 1944).frame;
    expect(us[0]).toBeGreaterThan(-130);
    expect(us[2]).toBeLessThan(-60);
  });

  it('a war of far-away powers still has its whole line in view: the line is drawn, so the camera shows it', () => {
    const { frame } = frameOf([show('pearl-harbor-1941')], 1941);
    expect(frame[2] - frame[0]).toBeGreaterThan(180); // Washington to Tokyo
  });
});

describe('when a step is about (its place on the timeline)', () => {
  it('is when the earliest event it shows starts, whatever year’s borders it shows', () => {
    const plan = new TurnPlan(eventYearOf, (id) => resolver.eventById(id)?.start ?? null);
    plan.add({ kind: 'event', step: 1, id: 'fransa-muharebesi-1940' });
    plan.add({ kind: 'event', step: 1, id: 'compiegne-ateskesi-1940' });
    expect(plan.drawingAt(1).year).toBe(1939); // the borders at the start of the Battle of France...
    expect(plan.whenAt(1)).toBeCloseTo(1940.355, 2); // ...and its date: 10 May 1940
  });

  it('is the middle of the year a step names when it shows no event, and nothing when it has neither', () => {
    const plan = new TurnPlan(eventYearOf, (id) => resolver.eventById(id)?.start ?? null);
    plan.add({ kind: 'set_year', step: 1, year: 1943 });
    plan.add({ kind: 'highlight', step: 2, polities: ['nazi-germany'] });
    expect(plan.whenAt(1)).toBe(1943.5);
    expect(plan.whenAt(2)).toBeNull();
    expect(plan.whenAt(3)).toBeNull();
  });
});
