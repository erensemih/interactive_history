import type { PlacePoint } from '../domain/types';
import { normalizeName, type Resolver } from './resolve';
import {
  LIMITS,
  RELATION_WORD,
  type Drawing,
  type FocusTarget,
  type Link,
  type MapAction,
  type Mark,
  type ResolvedDrawing,
  type ResolvedLink,
} from './types';

export const emptyDrawing = (): Drawing => ({ highlights: [], links: [], marks: [] });

const linkKey = (l: Pick<Link, 'from' | 'to' | 'relation'>) => `${[l.from, l.to].sort().join('|')}|${l.relation}`;
const markKey = (m: Mark) => `${m.point.lon.toFixed(1)},${m.point.lat.toFixed(1)}|${normalizeName(m.label)}`;

/** The newest `max` entries: when a step asks for too much, the earlier requests give way. */
const newest = <T>(list: T[], max: number): T[] => (list.length > max ? list.slice(list.length - max) : list);

/**
 * What one step does to the drawing it inherits. Order inside a step never matters: a `clear` is applied
 * first (it empties the drawing and gives the year back to the reader), then the additions, then the
 * year. That makes the result independent of the order in which the page functions happened to run
 * (several tool calls of one round run at the same time).
 */
export function applyStep(prev: Drawing, actions: readonly MapAction[]): Drawing {
  const clears = actions.some((a) => a.kind === 'clear');
  const next: Drawing = clears
    ? { highlights: [], links: [], marks: [] }
    : { highlights: [...prev.highlights], links: [...prev.links], marks: [...prev.marks], year: prev.year };
  for (const a of actions) {
    if (a.kind === 'highlight') {
      for (const id of a.polities) if (!next.highlights.includes(id)) next.highlights.push(id);
    } else if (a.kind === 'connect') {
      const link: Link = { from: a.from, to: a.to, relation: a.relation, ...(a.label ? { label: a.label } : {}) };
      const at = next.links.findIndex((l) => linkKey(l) === linkKey(link));
      if (at >= 0) next.links[at] = link;
      else next.links.push(link);
    } else if (a.kind === 'mark') {
      const mark: Mark = { point: a.point, label: a.label };
      if (!next.marks.some((m) => markKey(m) === markKey(mark))) next.marks.push(mark);
    }
  }
  for (const a of actions) if (a.kind === 'set_year') next.year = a.year;
  next.highlights = newest(next.highlights, LIMITS.highlights);
  next.links = newest(next.links, LIMITS.links);
  next.marks = newest(next.marks, LIMITS.marks);
  return next;
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
   * The map as it stands at the end of step `n`: every step up to and including it, applied in order, so
   * a later step builds on an earlier one unless it clears. Going back to step 2 gives exactly what step 2
   * showed the first time.
   */
  drawingAt(n: number): Drawing {
    let drawing = emptyDrawing();
    for (const k of this.numbers()) {
      if (k > n) break;
      drawing = applyStep(drawing, this.steps.get(k)!.actions);
    }
    return drawing;
  }

  /** What step `n` itself wants in view. The camera is not state: a step that asks for nothing leaves it alone. */
  focusAt(n: number): FocusTarget | null {
    const polities: string[] = [];
    const points: PlacePoint[] = [];
    for (const a of this.actionsOf(n)) {
      if (a.kind !== 'focus') continue;
      for (const id of a.polities) if (!polities.includes(id)) polities.push(id);
      points.push(...a.points);
    }
    return polities.length || points.length ? { polities, points } : null;
  }
}

/**
 * The drawing for the year shown: polities become the places they are drawn at. A polity without
 * borders that year cannot be highlighted or connected, so it is left out (the drawing may well be right
 * in another year of the range).
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
  return { highlightIds, links, marks: drawing.marks };
}

/** The drawing in words, for the model ("what is on the map now") and for screen readers. */
export function describeDrawing(drawing: Drawing, nameOf: (id: string) => string): string {
  const parts: string[] = [];
  if (drawing.highlights.length) parts.push(`vurgulanan: ${drawing.highlights.map(nameOf).join(', ')}`);
  for (const l of drawing.links) {
    const label = l.label ? ` (${l.label})` : '';
    parts.push(`${nameOf(l.from)} – ${nameOf(l.to)}: ${RELATION_WORD[l.relation]}${label}`);
  }
  if (drawing.marks.length) parts.push(`işaretli: ${drawing.marks.map((m) => m.label).join(', ')}`);
  if (drawing.year !== undefined) parts.push(`sınır yılı ${drawing.year}`);
  return parts.join('; ');
}

export const isEmptyDrawing = (d: Drawing): boolean => !d.highlights.length && !d.links.length && !d.marks.length;
