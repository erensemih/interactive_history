import type { Rect } from '../domain/reveal';

export type Side = 'right' | 'left' | 'above' | 'below';

/** A point to hang a label from, with the sides it would like, best first. */
export interface FlagAnchor {
  x: number;
  y: number;
  /** Distance between the point and the label. */
  gap: number;
  prefer: Side[];
}

/** A small label to hang beside a point: the point's position and the label's size, in map pixels. */
export interface FlagRequest extends FlagAnchor {
  id: string;
  w: number;
  h: number;
  /**
   * Other points the label may hang from when no side of the first one is free: further along a line, a little
   * further out from a mark. They are tried in order, after every side of the first.
   */
  alternates?: FlagAnchor[];
}

export interface PlacedFlag {
  id: string;
  left: number;
  top: number;
  side: Side;
  /** False when the label had to go somewhere crowded: nothing was free. */
  clear: boolean;
  /** The soft obstacles (labels that may give way) this label sits on, if it had to. */
  yields: Rect[];
}

const ALL: Side[] = ['right', 'left', 'above', 'below'];
const EDGE = 4;

function rectAt(f: { w: number; h: number }, a: { x: number; y: number; gap: number }, side: Side): Rect {
  const { x, y, gap } = a;
  const { w, h } = f;
  switch (side) {
    case 'right':
      return { left: x + gap, top: y - h / 2, right: x + gap + w, bottom: y + h / 2 };
    case 'left':
      return { left: x - gap - w, top: y - h / 2, right: x - gap, bottom: y + h / 2 };
    case 'above':
      return { left: x - w / 2, top: y - gap - h, right: x + w / 2, bottom: y - gap };
    case 'below':
      return { left: x - w / 2, top: y + gap, right: x + w / 2, bottom: y + gap + h };
  }
}

const overlap = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

interface Candidate {
  rect: Rect;
  side: Side;
}

function candidatesOf(f: FlagRequest): Candidate[] {
  const anchors: FlagAnchor[] = [f, ...(f.alternates ?? [])];
  const out: Candidate[] = [];
  for (const a of anchors) {
    const order = [...new Set([...a.prefer, ...ALL])];
    for (const side of order) out.push({ rect: rectAt(f, a, side), side });
  }
  return out;
}

/**
 * Hangs each label on the first place where it fits: inside the map, clear of the labels already placed
 * (earlier requests win), of the hard obstacles (markers, the pin, the map's controls, labels that cannot
 * give way) and, if it can, of the soft ones (polity names, which would rather not be covered but may be
 * dropped). Places are tried in the order the request lists them: every side of its first point, then of
 * each alternate. A label that fits nowhere clear takes the place that covers the least; one that cannot
 * even stay inside the map is pushed back in.
 */
export function placeFlags(
  requests: readonly FlagRequest[],
  size: { width: number; height: number },
  obstacles: readonly Rect[] = [],
  soft: readonly Rect[] = [],
): PlacedFlag[] {
  const inside = (r: Rect) =>
    r.left >= EDGE && r.top >= EDGE && r.right <= size.width - EDGE && r.bottom <= size.height - EDGE;
  const taken: Rect[] = [...obstacles];
  const out: PlacedFlag[] = [];
  for (const f of requests) {
    const all = candidatesOf(f);
    const fitting = all.filter((c) => inside(c.rect));
    const free = (c: Candidate) => !taken.some((t) => overlap(c.rect, t));
    let pick = fitting.find((c) => free(c) && !soft.some((s) => overlap(c.rect, s)));
    let clear = !!pick;
    if (!pick) {
      pick = fitting.find(free);
      clear = !!pick;
    }
    if (!pick && fitting.length) {
      // Nothing is free: the place that covers the least (an earlier one on a tie).
      const cost = (c: Candidate) => taken.reduce((sum, t) => sum + overlapArea(c.rect, t), 0);
      pick = fitting.reduce((best, c) => (cost(c) < cost(best) ? c : best));
    }
    pick ??= all[0]!;
    let r = pick.rect;
    if (!inside(r)) {
      // Pull the far edge in, then make sure the near edge stays on the map: a label wider than the map loses its far end.
      let dx = r.right > size.width - EDGE ? size.width - EDGE - r.right : 0;
      if (r.left + dx < EDGE) dx = EDGE - r.left;
      let dy = r.bottom > size.height - EDGE ? size.height - EDGE - r.bottom : 0;
      if (r.top + dy < EDGE) dy = EDGE - r.top;
      r = { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
      clear = false;
    }
    taken.push(r);
    out.push({ id: f.id, left: r.left, top: r.top, side: pick.side, clear, yields: soft.filter((s) => overlap(r, s)) });
  }
  return out;
}
