import type { Rect } from '../domain/reveal';

export type Side = 'right' | 'left' | 'above' | 'below';

/** A small label to hang beside a point: the point's position and the label's size, in map pixels. */
export interface FlagRequest {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Where the label would like to sit, best first. */
  prefer: Side[];
  /** Distance between the point and the label. */
  gap: number;
}

export interface PlacedFlag {
  id: string;
  left: number;
  top: number;
  side: Side;
}

const ALL: Side[] = ['right', 'left', 'above', 'below'];
const EDGE = 4;

function rectAt(f: FlagRequest, side: Side): Rect {
  const { x, y, w, h, gap } = f;
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

/**
 * Hangs each label on the first of its preferred sides where it fits: inside the map, clear of the labels
 * already placed (earlier requests win) and of the given obstacles. A label that fits nowhere without a
 * collision takes its first side that stays inside the map; one that cannot even do that is pushed back in.
 */
export function placeFlags(
  requests: readonly FlagRequest[],
  size: { width: number; height: number },
  obstacles: readonly Rect[] = [],
): PlacedFlag[] {
  const inside = (r: Rect) =>
    r.left >= EDGE && r.top >= EDGE && r.right <= size.width - EDGE && r.bottom <= size.height - EDGE;
  const taken: Rect[] = [...obstacles];
  const out: PlacedFlag[] = [];
  for (const f of requests) {
    const order = [...new Set([...f.prefer, ...ALL])];
    const fits = order.find((s) => {
      const r = rectAt(f, s);
      return inside(r) && !taken.some((t) => overlap(r, t));
    });
    const side = fits ?? order.find((s) => inside(rectAt(f, s))) ?? f.prefer[0] ?? 'right';
    let r = rectAt(f, side);
    if (!inside(r)) {
      // Pull the far edge in, then make sure the near edge stays on the map: a label wider than the map loses its far end.
      let dx = r.right > size.width - EDGE ? size.width - EDGE - r.right : 0;
      if (r.left + dx < EDGE) dx = EDGE - r.left;
      let dy = r.bottom > size.height - EDGE ? size.height - EDGE - r.bottom : 0;
      if (r.top + dy < EDGE) dy = EDGE - r.top;
      r = { left: r.left + dx, top: r.top + dy, right: r.right + dx, bottom: r.bottom + dy };
    }
    taken.push(r);
    out.push({ id: f.id, left: r.left, top: r.top, side });
  }
  return out;
}
