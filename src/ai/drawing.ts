import type { HistoricalEvent, PlacePoint } from '../domain/types';
import { eventKindOf, warSides } from './eventKinds';
import { normalizeName, type Resolver } from './resolve';
import {
  LIMITS,
  RELATION_WORD,
  type Drawing,
  type FrameTarget,
  type Link,
  type MapAction,
  type Mark,
  type ResolvedDrawing,
  type ResolvedEvent,
  type ResolvedLink,
  type ResolvedWar,
} from './types';

export const emptyDrawing = (): Drawing => ({
  highlights: [],
  links: [],
  marks: [],
  events: [],
});

/** The year of an event of the data (null for an id the data does not know). */
export type EventYear = (id: string) => number | null;

const linkKey = (l: Pick<Link, 'from' | 'to' | 'relation'>) => `${[l.from, l.to].sort().join('|')}|${l.relation}`;
const markKey = (m: Mark) => `${m.point.lon.toFixed(1)},${m.point.lat.toFixed(1)}|${normalizeName(m.label)}`;

/** The newest `max` entries: when a step asks for too much, the earlier requests give way. */
const newest = <T>(list: T[], max: number): T[] => (list.length > max ? list.slice(list.length - max) : list);

/**
 * What one step shows on the map: its own actions and nothing else. The step before leaves nothing behind
 * and the step after inherits nothing, so the map is always exactly what the step on screen asked for.
 * The year is part of that: the one the step names, else the year of the earliest event it shows (a step about
 * Mohács shows the borders of 1526 without being told), else the reader's own.
 */
export function drawingOf(actions: readonly MapAction[], eventYearOf?: EventYear): Drawing {
  const d = emptyDrawing();
  for (const a of actions) {
    if (a.kind === 'highlight') {
      for (const id of a.polities) if (!d.highlights.includes(id)) d.highlights.push(id);
    } else if (a.kind === 'connect') {
      const link: Link = { from: a.from, to: a.to, relation: a.relation, ...(a.label ? { label: a.label } : {}) };
      const at = d.links.findIndex((l) => linkKey(l) === linkKey(link));
      if (at >= 0) d.links[at] = link;
      else d.links.push(link);
    } else if (a.kind === 'mark') {
      const mark: Mark = { point: a.point, label: a.label };
      if (!d.marks.some((m) => markKey(m) === markKey(mark))) d.marks.push(mark);
    } else if (a.kind === 'event') {
      if (!d.events.includes(a.id)) d.events.push(a.id);
    }
  }
  for (const a of actions) if (a.kind === 'set_year') d.year = a.year;
  d.highlights = newest(d.highlights, LIMITS.highlights);
  d.links = newest(d.links, LIMITS.links);
  d.marks = newest(d.marks, LIMITS.marks);
  d.events = newest(d.events, LIMITS.events);
  if (d.year === undefined && eventYearOf) {
    const years = d.events.map(eventYearOf).filter((y): y is number => y !== null);
    if (years.length) d.year = Math.min(...years);
  }
  return d;
}

export interface PlannedStep {
  n: number;
  title: string | null;
  /** The subtitle: a sentence or two that the reader reads while watching the map. */
  caption: string | null;
  actions: MapAction[];
}

/**
 * What the model asked for during one turn, collected by the page functions while the call runs. A step is
 * a number (1-based) with an optional title and caption (the two short texts that come with its scene) and
 * its actions; a single-part answer's one scene is step 1.
 */
export class TurnPlan {
  private readonly steps = new Map<number, PlannedStep>();
  /** Grows with every change, so a view can tell cheaply whether it has to look again. */
  version = 0;

  /** `eventYearOf` lets a step that shows an event of the data and names no year show that event's year. */
  constructor(private readonly eventYearOf?: EventYear) {}

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

  /** The step numbers the model used, ascending. */
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

  /** Actions of one step, in the order they arrived. */
  actionsOf(n: number): readonly MapAction[] {
    return this.steps.get(n)?.actions ?? [];
  }

  /**
   * The map while step `n` is the one on screen: that step's own drawing, whichever step came before. Going
   * back to step 2 gives exactly what step 2 showed the first time.
   */
  drawingAt(n: number): Drawing {
    return drawingOf(this.actionsOf(n), this.eventYearOf);
  }
}

/* ------------------------------------------------------------- how the app draws an event */

/** The war line of an event for the year shown: the first side and the opposing one that have borders then, joined near the event. */
function warOf(ev: HistoricalEvent, resolver: Resolver, year: number, point: PlacePoint): ResolvedWar | undefined {
  const sides = warSides(ev);
  if (!sides) return undefined;
  const aId = sides.first.find((p) => resolver.rowAt(p, year));
  const bId = sides.second.find((p) => p !== aId && resolver.rowAt(p, year));
  if (!aId || !bId) return undefined;
  // each end leaves from the part of its polity that is nearest the event, so the line does not start across the sea
  const a = resolver.anchorToward(aId, year, point) ?? resolver.anchorAt(aId, year);
  const b = resolver.anchorToward(bId, year, point) ?? resolver.anchorAt(bId, year);
  return a && b ? { aId, bId, a, b } : undefined;
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|');

/**
 * The drawing for the year shown: polities become the places they are drawn at, events the markers (and, for a war,
 * the line) they have. A polity without borders that year cannot be lit or connected, so it is left out (the
 * drawing may well be right in another year of the range); an event that is not in the data is dropped.
 */
export function resolveDrawing(drawing: Drawing, resolver: Resolver, year: number): ResolvedDrawing {
  const events: ResolvedEvent[] = [];
  for (const id of drawing.events) {
    const ev = resolver.eventById(id);
    if (!ev) continue;
    const point = { lon: ev.location.lon, lat: ev.location.lat };
    const war = eventKindOf(ev.category) === 'war' ? warOf(ev, resolver, year, point) : undefined;
    events.push({
      id,
      title: ev.title,
      category: ev.category,
      point,
      parties: ev.parties.filter((p) => resolver.rowAt(p, year)),
      ...(war ? { war } : {}),
    });
  }
  // the app already draws a war event's line: the model's own line between the same two is the same thing twice
  const drawnWars = new Set(events.flatMap((e) => (e.war ? [pairKey(e.war.aId, e.war.bId)] : [])));
  const links: ResolvedLink[] = [];
  for (const link of drawing.links) {
    if (link.relation === 'war' && drawnWars.has(pairKey(link.from, link.to))) continue;
    const mainA = resolver.anchorAt(link.from, year);
    const mainB = resolver.anchorAt(link.to, year);
    if (!mainA || !mainB) continue;
    // each end leaves from the part of its polity that is nearest the other
    const a = resolver.anchorToward(link.from, year, mainB) ?? mainA;
    const b = resolver.anchorToward(link.to, year, mainA) ?? mainB;
    links.push({ ...link, a, b });
  }
  // in the spotlight: what the model named, the parties of its events, the ends of its own lines
  const spot: string[] = [];
  const light = (id: string) => {
    if (!spot.includes(id) && resolver.rowAt(id, year)) spot.push(id);
  };
  drawing.highlights.forEach(light);
  for (const e of events) e.parties.forEach(light);
  for (const l of links) [l.from, l.to].forEach(light);
  return { spotIds: spot, links, marks: drawing.marks, events };
}

/**
 * Everything the drawing puts on the map for `year`, as the camera needs it. Null when it puts nothing
 * anywhere (a step with only a year, or an empty one): the camera then stays where it is.
 */
export function frameTargetOf(resolved: ResolvedDrawing, resolver: Resolver, year: number): FrameTarget | null {
  const boxes = resolved.spotIds.flatMap((id) => {
    const box = resolver.boundsAt(id, year);
    return box ? [box] : [];
  });
  const points: PlacePoint[] = [];
  for (const l of resolved.links) points.push(l.a, l.b);
  for (const m of resolved.marks) points.push(m.point);
  for (const e of resolved.events) {
    points.push(e.point);
    if (e.war) points.push(e.war.a, e.war.b);
  }
  return boxes.length || points.length ? { boxes, points } : null;
}

/** The drawing in words, for the model ("what is on the map now") and for screen readers. */
export function describeDrawing(
  drawing: Drawing,
  nameOf: (id: string) => string,
  eventTitleOf: (id: string) => string = (id) => id,
): string {
  const parts: string[] = [];
  if (drawing.highlights.length) parts.push(`öne çıkan: ${drawing.highlights.map(nameOf).join(', ')}`);
  for (const l of drawing.links) {
    const label = l.label ? ` (${l.label})` : '';
    parts.push(`${nameOf(l.from)} – ${nameOf(l.to)}: ${RELATION_WORD[l.relation]}${label}`);
  }
  if (drawing.events.length) parts.push(`olay: ${drawing.events.map(eventTitleOf).join(', ')}`);
  if (drawing.marks.length) parts.push(`işaretli: ${drawing.marks.map((m) => m.label).join(', ')}`);
  if (drawing.year !== undefined) parts.push(`sınır yılı ${drawing.year}`);
  return parts.join('; ');
}

/** Does the step put nothing on the map? (A step with only a year has nothing to show or frame.) */
export const isEmptyDrawing = (d: Drawing): boolean =>
  !d.highlights.length && !d.links.length && !d.marks.length && !d.events.length;
