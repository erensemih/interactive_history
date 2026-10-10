import type { PlacePoint } from '../domain/types';
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
} from './types';

export const emptyDrawing = (): Drawing => ({ highlights: [], links: [], marks: [], events: [] });

const linkKey = (l: Pick<Link, 'from' | 'to' | 'relation'>) => `${[l.from, l.to].sort().join('|')}|${l.relation}`;
const markKey = (m: Mark) => `${m.point.lon.toFixed(1)},${m.point.lat.toFixed(1)}|${normalizeName(m.label)}`;

/** The newest `max` entries: when a step asks for too much, the earlier requests give way. */
const newest = <T>(list: T[], max: number): T[] => (list.length > max ? list.slice(list.length - max) : list);

/**
 * What one step shows on the map: its own actions and nothing else. The step before leaves nothing behind
 * and the step after inherits nothing, so the map is always exactly what the step on screen asked for.
 * The year is part of that: a step that sets none leaves the year to the reader.
 */
export function drawingOf(actions: readonly MapAction[]): Drawing {
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
  return d;
}

export interface PlannedStep {
  n: number;
  title: string | null;
  actions: MapAction[];
}

/**
 * What the model asked for during one turn, collected by the page functions while the call runs. A step is
 * a number (1-based) with an optional title and its actions; a question's single answer is step 1.
 */
export class TurnPlan {
  private readonly steps = new Map<number, PlannedStep>();
  /** Grows with every change, so a view can tell cheaply whether it has to look again. */
  version = 0;

  private ensure(n: number): PlannedStep {
    let step = this.steps.get(n);
    if (!step) {
      step = { n, title: null, actions: [] };
      this.steps.set(n, step);
    }
    return step;
  }

  declare(n: number, title: string | null) {
    const step = this.ensure(n);
    if (title) step.title = title;
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

  /** Actions of one step, in the order they arrived. */
  actionsOf(n: number): readonly MapAction[] {
    return this.steps.get(n)?.actions ?? [];
  }

  /**
   * The map while step `n` is the one on screen: that step's own drawing, whichever step came before. Going
   * back to step 2 gives exactly what step 2 showed the first time.
   */
  drawingAt(n: number): Drawing {
    return drawingOf(this.actionsOf(n));
  }
}

/**
 * The drawing for the year shown: polities become the places they are drawn at, events the markers they
 * have. A polity without borders that year cannot be highlighted or connected, so it is left out (the
 * drawing may well be right in another year of the range); an event that is not in the data is dropped.
 */
export function resolveDrawing(drawing: Drawing, resolver: Resolver, year: number): ResolvedDrawing {
  const highlightIds = drawing.highlights.filter((id) => resolver.rowAt(id, year));
  const links: ResolvedLink[] = [];
  for (const link of drawing.links) {
    const mainA = resolver.anchorAt(link.from, year);
    const mainB = resolver.anchorAt(link.to, year);
    if (!mainA || !mainB) continue;
    // each end leaves from the part of its polity that is nearest the other
    const a = resolver.anchorToward(link.from, year, mainB) ?? mainA;
    const b = resolver.anchorToward(link.to, year, mainA) ?? mainB;
    links.push({ ...link, a, b });
  }
  const events: ResolvedEvent[] = [];
  for (const id of drawing.events) {
    const ev = resolver.eventById(id);
    if (ev) events.push({ id, title: ev.title, point: { lon: ev.location.lon, lat: ev.location.lat } });
  }
  return { highlightIds, links, marks: drawing.marks, events };
}

/**
 * Everything the drawing puts on the map for `year`, as the camera needs it. Null when it puts nothing
 * anywhere (a step with only a year, or an empty one): the camera then stays where it is.
 */
export function frameTargetOf(resolved: ResolvedDrawing, resolver: Resolver, year: number): FrameTarget | null {
  const boxes = resolved.highlightIds.flatMap((id) => {
    const box = resolver.boundsAt(id, year);
    return box ? [box] : [];
  });
  const points: PlacePoint[] = [];
  for (const l of resolved.links) points.push(l.a, l.b);
  for (const m of resolved.marks) points.push(m.point);
  for (const e of resolved.events) points.push(e.point);
  return boxes.length || points.length ? { boxes, points } : null;
}

/** The drawing in words, for the model ("what is on the map now") and for screen readers. */
export function describeDrawing(
  drawing: Drawing,
  nameOf: (id: string) => string,
  eventTitleOf: (id: string) => string = (id) => id,
): string {
  const parts: string[] = [];
  if (drawing.highlights.length) parts.push(`vurgulanan: ${drawing.highlights.map(nameOf).join(', ')}`);
  for (const l of drawing.links) {
    const label = l.label ? ` (${l.label})` : '';
    parts.push(`${nameOf(l.from)} – ${nameOf(l.to)}: ${RELATION_WORD[l.relation]}${label}`);
  }
  if (drawing.events.length) parts.push(`olay: ${drawing.events.map(eventTitleOf).join(', ')}`);
  if (drawing.marks.length) parts.push(`işaretli: ${drawing.marks.map((m) => m.label).join(', ')}`);
  if (drawing.year !== undefined) parts.push(`sınır yılı ${drawing.year}`);
  return parts.join('; ');
}

export const isEmptyDrawing = (d: Drawing): boolean =>
  !d.highlights.length && !d.links.length && !d.marks.length && !d.events.length;
