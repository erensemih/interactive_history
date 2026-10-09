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

/**
 * How many zoom levels the map must zoom *out* (about its current centre) before the event is clear of
 * the edges and of the controls: 0 when it already is, Infinity when no amount of zooming out helps.
 *
 * Zooming out about the centre is the gentlest way to bring something into view: nothing pans, the
 * view the user was looking at stays in the middle of the new one, and the on-screen offset of a
 * point from the centre simply halves with every level (Web Mercator is exactly linear in that).
 */
export function zoomOutToReveal(input: RevealInput, maxLevels = 12, step = 0.02): number {
  const { dx, dy, width, height, margin, avoid } = input;
  const visibleAfter = (levels: number) => {
    const k = 2 ** -levels;
    const x = width / 2 + dx * k;
    const y = height / 2 + dy * k;
    if (!(x >= margin.left && x <= width - margin.right && y >= margin.top && y <= height - margin.bottom))
      return false;
    return !avoid.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
  };
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return Infinity;
  for (let levels = 0; levels <= maxLevels + 1e-9; levels += step) if (visibleAfter(levels)) return levels;
  return Infinity;
}

/** The smallest [west, south, east, north] box that holds both a view and a point. */
export function unionBounds(
  view: [number, number, number, number],
  point: { lon: number; lat: number },
): [number, number, number, number] {
  return [
    Math.min(view[0], point.lon),
    Math.min(view[1], point.lat),
    Math.max(view[2], point.lon),
    Math.max(view[3], point.lat),
  ];
}
