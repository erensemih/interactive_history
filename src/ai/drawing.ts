import type { PlacePoint } from '../domain/types';
import { pointsBox, surroundings } from '../domain/camera';
import { lonInArc, narrowestArc, unwrapPath } from '../domain/antimeridian';
import { NO_ACTORS, paintSides, type Actors, type SidesCall } from './actors';
import { distanceKm, normalizeName, type Resolver } from './resolve';
import { sentencesOf } from './sentences';
import {
  LIMITS,
  ROUTE_WORD,
  type Bloc,
  type Drawing,
  type Frame,
  type FrameTarget,
  type MapAction,
  type Mark,
  type PlaceRef,
  type ResolvedEvent,
  type ResolvedFrame,
  type ResolvedMark,
  type ResolvedRoute,
  type Route,
  type SceneClock,
  type Side,
  type TerritoryChange,
} from './types';

export const emptyDrawing = (): Drawing => ({
  highlights: [],
  routes: [],
  sides: [],
  neutral: [],
  marks: [],
  events: [],
  changes: [],
});

/** The border year a scene about an event of the data shows (null for an id the data does not know). */
export type EventYear = (id: string) => number | null;

/** When an event of the data starts, as a fractional year (null for an id the data does not know). */
export type EventStart = (id: string) => number | null;

const refKey = (r: PlaceRef): string =>
  r.kind === 'point'
    ? `p:${r.point.lon.toFixed(2)},${r.point.lat.toFixed(2)}`
    : r.kind === 'border'
      ? `b:${r.id}>${refKey(r.toward)}`
      : `${r.kind}:${r.id}`;
const routeKey = (r: Pick<Route, 'via' | 'type'>) => `${r.type}|${r.via.map(refKey).join('>')}`;
const markKey = (m: Mark) => `${m.point.lon.toFixed(1)},${m.point.lat.toFixed(1)}|${normalizeName(m.label)}`;
const changeKey = (c: TerritoryChange) => `${c.polity}|${c.from}>${c.to}`;

/** The newest `max` entries: when a scene asks for too much, the earlier requests give way. */
const newest = <T>(list: T[], max: number): T[] => (list.length > max ? list.slice(list.length - max) : list);

/** What one beat of a scene shows: its own actions (the sides it states are kept as the calls they were, in order). */
interface BeatPart {
  highlights: string[];
  routes: Route[];
  marks: Mark[];
  events: string[];
  changes: TerritoryChange[];
  calls: SidesCall[];
}

const emptyPart = (): BeatPart => ({ highlights: [], routes: [], marks: [], events: [], changes: [], calls: [] });

/** The actions a scene keeps: of each kind the newest ones, as many as one scene may hold. */
function limited(actions: readonly MapAction[]): MapAction[] {
  const keep = new Set<MapAction>(actions);
  const cap = (kind: MapAction['kind'], max: number, weight: (a: MapAction) => number = () => 1) => {
    const of = actions.filter((a) => a.kind === kind);
    let total = 0;
    for (const a of [...of].reverse()) {
      total += weight(a);
      if (total > max) keep.delete(a);
    }
  };
  cap('route', LIMITS.routes);
  cap('mark', LIMITS.marks);
  cap('event', LIMITS.events);
  cap('territory', LIMITS.changes);
  return actions.filter((a) => keep.has(a));
}

/** A change in a scene keeps the order of its beats; a change named twice is one. */
function uniqueBy<T>(list: T[], key: (t: T) => string): T[] {
  const seen = new Set<string>();
  return list.filter((t) => !seen.has(key(t)) && !!seen.add(key(t)));
}

/**
 * What one scene shows on the map, all its beats together: its own actions and nothing else. The scene before leaves
 * nothing behind and the scene after inherits nothing, so the map is always what the scene on screen asked for (but for
 * the colours of the actors, which belong to the narration). The year is part of that: the one the scene names, else the
 * borders at the start of the earliest event it shows (a scene about Mohács shows the borders of 1526 without being told; one
 * about the Battle of France those of 1939, the last year with a France), else the first of its territory changes' years, else
 * the reader's own.
 */
export function drawingOf(actions: readonly MapAction[], eventYearOf?: EventYear): Drawing {
  const d = emptyDrawing();
  for (const a of limited(actions)) {
    if (a.kind === 'highlight') {
      for (const id of a.polities) if (!d.highlights.includes(id)) d.highlights.push(id);
    } else if (a.kind === 'route') {
      const route: Route = { via: a.via, type: a.type, animate: a.animate, ...(a.label ? { label: a.label } : {}) };
      const at = d.routes.findIndex((r) => routeKey(r) === routeKey(route));
      if (at >= 0) d.routes[at] = route;
      else d.routes.push(route);
    } else if (a.kind === 'sides') {
      // every statement of the sides counts (the camera frames them all): a polity stands on the side it was named on last
      const blocs = new Map<string, Side>(d.sides.map((side) => [normalizeName(side.name), side]));
      const neutral = new Set(d.neutral);
      const leave = (id: string) => {
        for (const side of blocs.values()) side.polities = side.polities.filter((p) => p !== id);
        neutral.delete(id);
      };
      // within one statement a polity is on the first side that names it
      const named = new Set<string>();
      for (const side of a.sides) {
        const key = normalizeName(side.name);
        const bloc = blocs.get(key) ?? { name: side.name, polities: [] };
        for (const id of side.polities) {
          if (named.has(id)) continue;
          named.add(id);
          leave(id);
          bloc.polities.push(id);
        }
        blocs.set(key, bloc);
      }
      for (const id of a.neutral) {
        if (named.has(id)) continue;
        leave(id);
        neutral.add(id);
      }
      d.sides = [...blocs.values()].filter((side) => side.polities.length).slice(0, LIMITS.sides);
      d.neutral = [...neutral].slice(0, LIMITS.sidePolities);
    } else if (a.kind === 'mark') {
      const mark: Mark = { point: a.point, label: a.label };
      if (!d.marks.some((m) => markKey(m) === markKey(mark))) d.marks.push(mark);
    } else if (a.kind === 'event') {
      if (!d.events.includes(a.id)) d.events.push(a.id);
    } else if (a.kind === 'territory') {
      d.changes.push({ polity: a.polity, from: a.from, to: a.to });
    }
  }
  d.highlights = newest(d.highlights, LIMITS.highlights);
  d.changes = uniqueBy(d.changes, changeKey);
  for (const a of actions) if (a.kind === 'set_year') d.year = a.year;
  d.routes = newest(d.routes, LIMITS.routes);
  if (d.year === undefined) {
    // the scene starts at the earliest of its events' borders and the years its changes of borders start from
    const years = [...(eventYearOf ? d.events.map(eventYearOf) : []), ...d.changes.map((c) => c.from)].filter(
      (y): y is number => y !== null,
    );
    if (years.length) d.year = Math.min(...years);
  }
  return d;
}

export interface PlannedStep {
  n: number;
  title: string | null;
  /** The subtitle: a few sentences, each a beat of the scene. */
  caption: string | null;
  actions: MapAction[];
}

/**
 * What the model asked for during one turn, collected by the page functions while the call runs. A scene is
 * a number (1-based) with an optional title and caption (the two short texts that come with it) and its
 * actions; a single-part answer's one scene is scene 1. The caption is a sequence of sentences and each sentence is a
 * beat: the actions say which beat they belong to.
 */
export class TurnPlan {
  private readonly steps = new Map<number, PlannedStep>();
  /** Grows with every change, so a view can tell cheaply whether it has to look again. */
  version = 0;
  /**
   * The polities the narration is about (the ones that hold the place it was asked for): the side that has one of them is the
   * side the map is painted relative to.
   */
  focus: string[] = [];

  /**
   * `eventYearOf` lets a scene that shows an event of the data and names no year show that event's borders;
   * `eventStartOf` lets the timeline put such a scene at the date the event starts.
   */
  constructor(
    private readonly eventYearOf?: EventYear,
    private readonly eventStartOf?: EventStart,
  ) {}

  private ensure(n: number): PlannedStep {
    let step = this.steps.get(n);
    if (!step) {
      step = { n, title: null, caption: null, actions: [] };
      this.steps.set(n, step);
    }
    return step;
  }

  declare(n: number, title: string | null, caption: string | null = null) {
    const step = this.ensure(n);
    if (title) step.title = title;
    if (caption) step.caption = caption;
    this.version++;
  }

  add(action: MapAction) {
    this.ensure(action.step).actions.push(action);
    this.version++;
  }

  /** Does any scene of the answer state who is on which side? (Then every scene keeps room under its caption for the names of the sides.) */
  hasSides(): boolean {
    for (const step of this.steps.values()) if (step.actions.some((a) => a.kind === 'sides')) return true;
    return false;
  }

  /** The scene numbers the model used, ascending. */
  numbers(): number[] {
    return [...this.steps.keys()].sort((a, b) => a - b);
  }

  has(n: number): boolean {
    return this.steps.has(n);
  }

  get empty(): boolean {
    return this.steps.size === 0;
  }

  titleOf(n: number): string | null {
    return this.steps.get(n)?.title ?? null;
  }

  captionOf(n: number): string | null {
    return this.steps.get(n)?.caption ?? null;
  }

  /** Actions of one scene, in the order they arrived. */
  actionsOf(n: number): readonly MapAction[] {
    return this.steps.get(n)?.actions ?? [];
  }

  /** The sentences of the scene's caption: its beats (at least one, at most `LIMITS.beats`; an empty caption is one beat). */
  beatsOf(n: number): string[] {
    const sentences = sentencesOf(this.captionOf(n) ?? '').slice(0, LIMITS.beats);
    return sentences.length ? sentences : [''];
  }

  /** The beat (0-based) an action belongs to: the sentence it names, kept inside the caption. */
  private beatIndexOf(a: MapAction, count: number): number {
    return a.kind === 'set_year' ? 0 : Math.min(Math.max(1, a.beat), count) - 1;
  }

  /** What each beat of a scene shows by itself (the actions that arrived over the limits are already left out). */
  private partsOf(n: number): BeatPart[] {
    const count = this.beatsOf(n).length;
    const parts = Array.from({ length: count }, emptyPart);
    for (const a of limited(this.actionsOf(n))) {
      if (a.kind === 'set_year') continue;
      const part = parts[this.beatIndexOf(a, count)]!;
      if (a.kind === 'highlight')
        part.highlights = newest(
          [...part.highlights, ...a.polities.filter((id) => !part.highlights.includes(id))],
          LIMITS.highlights,
        );
      else if (a.kind === 'route')
        part.routes.push({ via: a.via, type: a.type, animate: a.animate, ...(a.label ? { label: a.label } : {}) });
      else if (a.kind === 'mark') part.marks.push({ point: a.point, label: a.label });
      else if (a.kind === 'event') part.events.push(a.id);
      else if (a.kind === 'territory') part.changes.push({ polity: a.polity, from: a.from, to: a.to });
      else {
        const taken = new Set<string>();
        part.calls.push({
          sides: a.sides.map((side) => ({
            name: side.name,
            polities: side.polities.filter((id) => !taken.has(id) && !!taken.add(id)),
          })),
          neutral: a.neutral.filter((id) => !taken.has(id)),
        });
      }
    }
    return parts;
  }

  /**
   * The map while scene `n` is the one on screen, all its beats together: that scene's own drawing, whichever scene came
   * before. Going back to scene 2 gives exactly what scene 2 showed the first time.
   */
  drawingAt(n: number): Drawing {
    return drawingOf(this.actionsOf(n), this.eventYearOf);
  }

  /** The colours the actors have when scene `n` begins, and the sides that were last stated. */
  private actorsBefore(n: number): { actors: Actors; blocs: Bloc[] } {
    let actors = NO_ACTORS;
    let blocs: Bloc[] = [];
    for (const k of this.numbers()) {
      if (k >= n) break;
      for (const part of this.partsOf(k)) {
        for (const call of part.calls) {
          const painted = paintSides(actors, call, this.focus);
          actors = painted.actors;
          blocs = painted.blocs;
        }
      }
    }
    return { actors, blocs };
  }

  /** The border year scene `n` ends at: where its territory changes took the borders to, else the year it started at. */
  endYearOf(n: number): number | undefined {
    const d = this.drawingAt(n);
    return d.changes.length ? d.changes[d.changes.length - 1]!.to : d.year;
  }

  /** The clock of a scene at its end (every beat played). */
  endClock(n: number): SceneClock {
    return { n, beat: this.beatsOf(n).length - 1, done: true, replay: 0 };
  }

  /**
   * What scene `clock.n` shows at `clock`: the beat that plays is prominent (its arrows, its markers, what it points at, what
   * its borders flash); the beats before it are what they left behind (their markers as small numbered dots, the colours they
   * gave the actors, the borders they changed); the beats after it are not there yet. At the scene's end only what is left
   * behind is on the map.
   */
  frameAt(clock: SceneClock): Frame {
    const n = clock.n;
    const parts = this.partsOf(n);
    const last = parts.length - 1;
    const upTo = clock.done ? last : Math.min(Math.max(0, clock.beat), last);
    const playing = !clock.done;
    const base = this.drawingAt(n);
    let { actors, blocs } = this.actorsBefore(n);
    const events = new Map<string, { id: string; beat: number; now: boolean }>();
    const marks = new Map<string, { mark: Mark; beat: number; now: boolean }>();
    const changes: Frame['changes'] = [];
    let year = base.year;
    for (let j = 0; j <= upTo; j++) {
      const part = parts[j]!;
      const now = playing && j === upTo;
      for (const call of part.calls) {
        const painted = paintSides(actors, call, this.focus);
        actors = painted.actors;
        blocs = painted.blocs;
      }
      for (const id of part.events) events.set(id, { id, beat: j + 1, now });
      for (const m of part.marks) marks.set(markKey(m), { mark: m, beat: j + 1, now });
      for (const c of part.changes) {
        changes.push({ change: c, beat: j + 1, now });
        year = c.to;
      }
    }
    const part = parts[upTo]!;
    return {
      ...(year !== undefined ? { year } : {}),
      emphasis: playing ? part.highlights : [],
      painted: [...actors.colors].map(([id, color]) => ({ id, color })),
      blocs,
      events: [...events.values()],
      marks: [...marks.values()],
      routes: playing ? part.routes.map((route) => ({ route, beat: upTo + 1 })) : [],
      changes,
      replay: clock.replay,
    };
  }

  /**
   * When scene `n` is about, as a fractional year, for its place on the timeline: the date the earliest event it shows
   * starts, else (a scene that shows no event) the middle of the year it names. Null when it has neither: there is nowhere
   * to put it. This is the scene's date in the story; the borders it shows (`drawingAt(n).year`) may be those of the year
   * before (the borders at the event's start).
   */
  whenAt(n: number): number | null {
    const d = this.drawingAt(n);
    const starts = d.events.map((id) => this.eventStartOf?.(id) ?? null).filter((t): t is number => t !== null);
    if (starts.length) return Math.min(...starts);
    return d.year !== undefined ? d.year + 0.5 : null;
  }
}

/* ------------------------------------------------------------------ the frame, for a year */

/** Two stops closer than this are one place: there is nothing to draw between them. */
const MIN_LINE_KM = 5;

/**
 * The frame for the year shown: events become the markers they have, routes the points they run through (by the short
 * way over the date line), and a polity without borders that year is left out of what is painted, pointed at or changed (the
 * scene may well be right in another year of the range). An event that is not in the data is dropped.
 */
export function resolveFrame(frame: Frame, resolver: Resolver, year: number): ResolvedFrame {
  const has = (id: string) => !!resolver.rowAt(id, year);
  const events: ResolvedEvent[] = frame.events.flatMap((e) => {
    const ev = resolver.eventById(e.id);
    if (!ev) return [];
    return [
      {
        id: e.id,
        title: ev.title,
        category: ev.category,
        point: { lon: ev.location.lon, lat: ev.location.lat },
        beat: e.beat,
        now: e.now,
      },
    ];
  });
  const marks: ResolvedMark[] = frame.marks.map((m) => ({ ...m.mark, beat: m.beat, now: m.now }));
  const routes: ResolvedRoute[] = [];
  for (const { route } of frame.routes) {
    const points: PlacePoint[] = [];
    for (const stop of route.via) {
      const at = resolver.placePoint(stop, year);
      const last = points[points.length - 1];
      if (at && (!last || distanceKm(last, at) >= MIN_LINE_KM)) points.push(at);
    }
    if (points.length >= 2) routes.push({ ...route, points: unwrapPath(points) });
  }
  const changes = frame.changes
    .filter((c) => !!resolver.rowAt(c.change.polity, c.change.from) || !!resolver.rowAt(c.change.polity, c.change.to))
    .map((c) => ({ ...c.change, beat: c.beat, now: c.now }));
  return {
    year,
    emphasis: frame.emphasis.filter(has),
    painted: frame.painted.filter((p) => has(p.id)),
    blocs: frame.blocs,
    events,
    marks,
    routes,
    changes,
    replay: frame.replay,
  };
}

/**
 * Everything a scene puts on the map, as the camera needs it: the points it names (event markers, the stops of its routes,
 * its marks) and, for each polity it points at, paints or changes, the part of it that the scene is about. With points,
 * that is the part of the polity that reaches into their surroundings (`surroundings`): France and the United Kingdom of
 * a scene in Normandy frame Western Europe, not their colonies, and the United States in it frames nothing, since none of
 * its land is there. With none (a scene that only paints polities), it is the polity's body. Longitudes run on over the date
 * line where the narrowest view is the one across it (a Pacific crossing is framed as the Pacific, not as the whole world).
 * Null when it puts nothing anywhere (a scene with only a year, or an empty one): the camera then stays where it is.
 */
export function frameTargetOf(drawing: Drawing, resolver: Resolver, year: number): FrameTarget | null {
  const points: PlacePoint[] = [];
  for (const id of drawing.events) {
    const ev = resolver.eventById(id);
    if (ev) points.push({ lon: ev.location.lon, lat: ev.location.lat });
  }
  for (const m of drawing.marks) points.push(m.point);
  for (const r of drawing.routes) {
    const stops: PlacePoint[] = [];
    for (const stop of r.via) {
      const at = resolver.placePoint(stop, year);
      if (at) stops.push(at);
    }
    points.push(...unwrapPath(stops));
  }
  const ids = new Set<string>([...drawing.highlights, ...drawing.neutral]);
  for (const side of drawing.sides) for (const id of side.polities) ids.add(id);
  for (const c of drawing.changes) ids.add(c.polity);
  const focus = pointsBox(points);
  const around = focus ? surroundings(focus) : undefined;
  const boxes = [...ids].flatMap((id) => {
    const box = resolver.boundsAt(id, year, around);
    return box ? [box] : [];
  });
  if (!boxes.length && !points.length) return null;
  // the narrowest arc of longitudes that holds everything: where it runs over the date line the points and the boxes run on
  const lons = [...points.map((p) => p.lon), ...boxes.flatMap((b) => [b[0], b[2]])];
  const arc = narrowestArc(lons);
  if (arc.west + arc.width <= 180) return { boxes, points };
  return {
    boxes: boxes.map((b) => {
      const west = lonInArc(b[0], arc.west);
      return [west, b[1], west + (b[2] - b[0]), b[3]];
    }),
    points: points.map((p) => ({ ...p, lon: lonInArc(p.lon, arc.west) })),
  };
}

/** A place in words for the model and for screen readers. */
const refName = (ref: PlaceRef, nameOf: (id: string) => string): string =>
  ref.kind === 'polity'
    ? nameOf(ref.id)
    : ref.kind === 'border'
      ? `${nameOf(ref.id)} sınırı`
      : ref.kind === 'point'
        ? (ref.name ?? `${ref.point.lat}, ${ref.point.lon}`)
        : ref.name;

/** The drawing in words, for the model ("what is on the map now") and for screen readers. */
export function describeDrawing(
  drawing: Drawing,
  nameOf: (id: string) => string,
  eventTitleOf: (id: string) => string = (id) => id,
): string {
  const parts: string[] = [];
  if (drawing.highlights.length) parts.push(`öne çıkan: ${drawing.highlights.map(nameOf).join(', ')}`);
  if (drawing.sides.length)
    parts.push(`taraflar: ${drawing.sides.map((s) => `${s.name} (${s.polities.map(nameOf).join(', ')})`).join(' – ')}`);
  if (drawing.neutral.length) parts.push(`tarafsız ya da belirsiz: ${drawing.neutral.map(nameOf).join(', ')}`);
  for (const r of drawing.routes) {
    const label = r.label ? ` (${r.label})` : '';
    parts.push(`ok (${ROUTE_WORD[r.type]}): ${r.via.map((v) => refName(v, nameOf)).join(' → ')}${label}`);
  }
  for (const c of drawing.changes) parts.push(`toprak değişimi: ${nameOf(c.polity)} ${c.from}→${c.to}`);
  if (drawing.events.length) parts.push(`olay: ${drawing.events.map(eventTitleOf).join(', ')}`);
  if (drawing.marks.length) parts.push(`işaretli: ${drawing.marks.map((m) => m.label).join(', ')}`);
  if (drawing.year !== undefined) parts.push(`sınır yılı ${drawing.year}`);
  return parts.join('; ');
}

/** Does the scene put nothing on the map? (A scene with only a year has nothing to show or frame.) */
export const isEmptyDrawing = (d: Drawing): boolean =>
  !d.highlights.length &&
  !d.routes.length &&
  !d.sides.length &&
  !d.neutral.length &&
  !d.marks.length &&
  !d.events.length &&
  !d.changes.length;
