/** A rectangle in map pixels (origin at the map's top-left corner). */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface RevealInput {
  /** Where the event is, as a pixel offset from the middle of the map at the current zoom. */
  dx: number;
  dy: number;
  width: number;
  height: number;
  /** Space to keep clear along each edge (room for the dot, its year and its name). */
  margin: { top: number; right: number; bottom: number; left: number };
  /** Parts of the map covered by controls: a dot must not end up hidden behind them. */
  avoid: Rect[];
}

/** Several things to bring into view at once (a step of a narration may be about two polities). */
export interface RevealAllInput extends Omit<RevealInput, 'dx' | 'dy'> {
  offsets: { dx: number; dy: number }[];
}

type Margin = RevealInput['margin'];

/** Is a spot clear of the margins along the edges and of every control? (On the line of a margin it is; on the edge of a control it is not.) */
function isClear(x: number, y: number, { width, height, margin, avoid }: Omit<RevealInput, 'dx' | 'dy'>): boolean {
  if (!(x >= margin.left && x <= width - margin.right && y >= margin.top && y <= height - margin.bottom)) return false;
  return !avoid.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

/**
 * How many zoom levels the map must zoom *out* (about its current centre) before every point is clear of
 * the edges and of the controls: 0 when they already are, Infinity when no amount of zooming out helps.
 *
 * Zooming out about the centre is the gentlest way to bring something into view: nothing pans, the
 * view the user was looking at stays in the middle of the new one, and the on-screen offset of a
 * point from the centre simply halves with every level (Web Mercator is exactly linear in that).
 */
export function zoomOutToRevealAll(input: RevealAllInput, maxLevels = 12, step = 0.02): number {
  const { offsets, width, height } = input;
  const visibleAfter = (levels: number) => {
    const k = 2 ** -levels;
    return offsets.every(({ dx, dy }) => isClear(width / 2 + dx * k, height / 2 + dy * k, input));
  };
  if (offsets.some(({ dx, dy }) => !Number.isFinite(dx) || !Number.isFinite(dy))) return Infinity;
  for (let levels = 0; levels <= maxLevels + 1e-9; levels += step) if (visibleAfter(levels)) return levels;
  return Infinity;
}

/** The same for one point. */
export function zoomOutToReveal(input: RevealInput, maxLevels = 12, step = 0.02): number {
  const { dx, dy, ...rest } = input;
  return zoomOutToRevealAll({ ...rest, offsets: [{ dx, dy }] }, maxLevels, step);
}

/* ------------------------------------------------------------------ when zooming out is not enough */

/** Zooming out goes a little further than the least it takes, so the event is not left on the very line of the margin. */
const ZOOM_SLACK = 0.05;
/** A pan puts the event this far (px) inside the free area: on the edge of a control it would still count as covered. */
const PAN_INSET = 2;
/** A pan smaller than this (px) is not a move. */
const NO_PAN = 0.01;

/** A box in map pixels: x0 ≤ x1, y0 ≤ y1. */
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** [a, b] as they are, or both at the middle when a range has closed up (a > b). */
function ordered(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [(a + b) / 2, (a + b) / 2];
}

/** The margins, squeezed when the map is so small that they would take more than four fifths of a side. */
function fitMargin(m: Margin, width: number, height: number): Margin {
  const squeeze = (a: number, b: number, room: number): [number, number] =>
    a + b > room ? [(a * room) / (a + b), (b * room) / (a + b)] : [a, b];
  const [left, right] = squeeze(m.left, m.right, width * 0.8);
  const [top, bottom] = squeeze(m.top, m.bottom, height * 0.8);
  return { top, right, bottom, left };
}

/** The part of the map where an event may stand: inside the margins and clear of every control, as boxes pulled in by `PAN_INSET`. */
function freeBoxes({ width, height, margin, avoid }: Omit<RevealInput, 'dx' | 'dy'>): Box[] {
  const [x0, x1] = ordered(margin.left, width - margin.right);
  const [y0, y1] = ordered(margin.top, height - margin.bottom);
  // The lines where the controls cut the area into cells; each cell is wholly free or wholly covered.
  const cuts = (lo: number, hi: number, at: number[]) =>
    [...new Set([lo, hi, ...at.filter((v) => v > lo && v < hi)])].sort((a, b) => a - b);
  const xs = cuts(
    x0,
    x1,
    avoid.flatMap((r) => [r.left, r.right]),
  );
  const ys = cuts(
    y0,
    y1,
    avoid.flatMap((r) => [r.top, r.bottom]),
  );
  const covered = (x: number, y: number) =>
    avoid.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  const grid = ys
    .slice(1)
    .map((yEnd, j) => xs.slice(1).map((xEnd, i) => !covered((xs[i] + xEnd) / 2, (ys[j] + yEnd) / 2)));
  // A side is pulled in only where the cell ends at the margin or at a control, not where it meets another free cell.
  const pull = (lo: number, hi: number, atLo: boolean, atHi: boolean): [number, number] => {
    const a = lo + (atLo ? PAN_INSET : 0);
    const b = hi - (atHi ? PAN_INSET : 0);
    return a <= b ? [a, b] : [(lo + hi) / 2, (lo + hi) / 2];
  };
  const boxes: Box[] = [];
  grid.forEach((row, j) =>
    row.forEach((free, i) => {
      if (!free) return;
      const wall = (di: number, dj: number) => !grid[j + dj]?.[i + di];
      const [bx0, bx1] = pull(xs[i], xs[i + 1], wall(-1, 0), wall(1, 0));
      const [by0, by1] = pull(ys[j], ys[j + 1], wall(0, -1), wall(0, 1));
      boxes.push({ x0: bx0, y0: by0, x1: bx1, y1: by1 });
    }),
  );
  if (boxes.length) return boxes;
  // Controls cover all of it: nothing can be kept clear of them, so only the margins count.
  const [bx0, bx1] = pull(x0, x1, true, true);
  const [by0, by1] = pull(y0, y1, true, true);
  return [{ x0: bx0, y0: by0, x1: bx1, y1: by1 }];
}

/** The value of [a0, a1] ∩ [r0, r1] nearest to 0, or, when they do not meet, the end of [r0, r1] nearest to [a0, a1] and how far it is. */
function along(a0: number, a1: number, r0: number, r1: number): { v: number; gap: number } {
  const lo = Math.max(a0, r0);
  const hi = Math.min(a1, r1);
  if (lo <= hi) return { v: Math.min(Math.max(0, lo), hi), gap: 0 };
  return a1 < r0 ? { v: r0, gap: r0 - a1 } : { v: r1, gap: a0 - r1 };
}

/** The shortest move of the centre that lands every spot in a free box, kept within `range`; `gap` is how far short it falls (0 = it lands them all). */
function nearestPan(
  spots: { x: number; y: number }[],
  free: Box[],
  range: Rect,
): { x: number; y: number; gap: number } {
  // Moving the centre by t moves a spot to p − t, so the moves that land p in a box b are p − b.
  const landing = (p: { x: number; y: number }, b: Box): Box => ({
    x0: p.x - b.x1,
    x1: p.x - b.x0,
    y0: p.y - b.y1,
    y1: p.y - b.y0,
  });
  let ways = free.map((b) => landing(spots[0], b));
  for (const p of spots.slice(1)) {
    ways = ways.flatMap((w) =>
      free.flatMap((b) => {
        const c = landing(p, b);
        const m = {
          x0: Math.max(w.x0, c.x0),
          x1: Math.min(w.x1, c.x1),
          y0: Math.max(w.y0, c.y0),
          y1: Math.min(w.y1, c.y1),
        };
        return m.x0 <= m.x1 && m.y0 <= m.y1 ? [m] : [];
      }),
    );
  }
  let best = { x: 0, y: 0, gap: Infinity };
  for (const w of ways) {
    const x = along(w.x0, w.x1, range.left, range.right);
    const y = along(w.y0, w.y1, range.top, range.bottom);
    const gap = Math.hypot(x.gap, y.gap);
    if (gap < best.gap - 1e-9 || (gap < best.gap + 1e-9 && Math.hypot(x.v, y.v) < Math.hypot(best.x, best.y)))
      best = { x: x.v, y: y.v, gap };
  }
  return best;
}

/**
 * The shortest way to move the map's centre (in pixels, x to the east and y to the south) so that every point is clear
 * of the margins and of the controls: nothing when they already are. `reach` is the range the centre may move within
 * (the map's limits); when it holds no move that brings a point in, the move that gets nearest to it is given. Of several
 * points all are brought in when some move does it; when none does, the first ones have to do, in the order given.
 */
export function panToRevealAll(input: RevealAllInput, reach?: Rect | null): { x: number; y: number } {
  const { offsets, width, height } = input;
  const spots = offsets.map(({ dx, dy }) => ({ x: width / 2 + dx, y: height / 2 + dy }));
  if (!spots.length || spots.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return { x: 0, y: 0 };
  if (spots.every((p) => isClear(p.x, p.y, input))) return { x: 0, y: 0 };
  const [left, right] = reach ? ordered(reach.left, reach.right) : [-Infinity, Infinity];
  const [top, bottom] = reach ? ordered(reach.top, reach.bottom) : [-Infinity, Infinity];
  const free = freeBoxes(input);
  let best = { x: 0, y: 0, gap: Infinity };
  for (let n = spots.length; n >= 1; n--) {
    best = nearestPan(spots.slice(0, n), free, { left, top, right, bottom });
    if (best.gap === 0) break;
  }
  return { x: best.x, y: best.y };
}

/** What the camera does to bring something into view. */
export interface RevealMove {
  /** The zoom to end at: the one the map has now, or a lower one. */
  zoom: number;
  /** How far the centre moves, in pixels of the map as it is now (x to the east, y to the south): zero when zooming out is enough. */
  pan: { x: number; y: number };
}

export interface RevealMoveInput extends RevealAllInput {
  /** The map's zoom now, and the lowest zoom it was given. */
  zoom: number;
  minZoom: number;
  /**
   * The map's limits (its `maxBounds`) in map pixels as the map is now. The view never leaves them, so where they are
   * smaller than the view the map does not zoom out that far, and the centre cannot be moved past them.
   */
  limits?: Rect | null;
}

/**
 * How the camera brings things into view with the least change, or null when there is nothing to do:
 *  - already clear of the margins and the controls: nothing moves (so opening the same event twice never moves the map);
 *  - otherwise the map zooms out about its centre just far enough (nothing pans: the view the reader was in stays inside
 *    the new one), as `zoomOutToRevealAll` says;
 *  - when even the widest view the map has (its minimum zoom, or the one at which its limits fill the view) is not wide
 *    enough, the map goes as wide as that and the centre moves the shortest way that brings the points in, within the
 *    limits. Having moved so, they are clear: asking again changes nothing.
 */
export function revealMove(input: RevealMoveInput): RevealMove | null {
  const { offsets, width, height, zoom, minZoom } = input;
  const limits = input.limits && Object.values(input.limits).every(Number.isFinite) ? input.limits : null;
  if (!offsets.length || offsets.some(({ dx, dy }) => !Number.isFinite(dx) || !Number.isFinite(dy))) return null;
  const margin = fitMargin(input.margin, width, height);
  const needed = zoomOutToRevealAll({ ...input, margin });
  if (needed === 0) return null;
  // The widest view: the minimum zoom, or, if the limits are smaller than the view there, the zoom at which they just fill it.
  const fit = limits
    ? Math.max(
        limits.right > limits.left ? zoom + Math.log2(width / (limits.right - limits.left)) : -Infinity,
        limits.bottom > limits.top ? zoom + Math.log2(height / (limits.bottom - limits.top)) : -Infinity,
      )
    : -Infinity;
  const floor = Math.max(minZoom, fit);
  if (Number.isFinite(needed) && zoom - needed - ZOOM_SLACK >= floor) {
    return { zoom: zoom - needed - ZOOM_SLACK, pan: { x: 0, y: 0 } };
  }
  // Not wide enough. Zoom out as far as the map goes (unless zooming out does not help at all: a control over the
  // middle), then move the centre the shortest way. At the new zoom everything is `k` times as far from the centre,
  // and so are the limits.
  const room = zoom - floor;
  const levels = Number.isFinite(needed) && room > 1e-6 ? room : 0;
  const k = 2 ** -levels;
  const reach = limits
    ? {
        left: width / 2 + (limits.left - width / 2) * k,
        right: width / 2 + (limits.right - width / 2) * k - width,
        top: height / 2 + (limits.top - height / 2) * k,
        bottom: height / 2 + (limits.bottom - height / 2) * k - height,
      }
    : null;
  const pan = panToRevealAll(
    { ...input, margin, offsets: offsets.map(({ dx, dy }) => ({ dx: dx * k, dy: dy * k })) },
    reach,
  );
  if (levels === 0 && Math.hypot(pan.x, pan.y) < NO_PAN) return null;
  return { zoom: zoom - levels, pan: { x: pan.x / k, y: pan.y / k } };
}
