/**
 * Longitudes on a map that has an edge at ±180°. A line between Tokyo and Honolulu takes the short way, over the date
 * line; for that its longitudes must run on from one end to the other (140° → 202°), not jump back by 360°.
 */

/** A longitude inside [-180, 180). */
export const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180;

/** The copy of `lon` (lon + 360·k) that lies nearest to `near`. */
export const unwrapNear = (lon: number, near: number): number => lon + 360 * Math.round((near - lon) / 360);

/**
 * A path whose longitudes run on: each point is the copy (±360°) of itself that lies within 180° of the point before it,
 * so a hop from 140° to −158° becomes 140° → 202°. The first point stays where it is.
 */
export function unwrapPath<T extends { lon: number }>(points: readonly T[]): T[] {
  const out: T[] = [];
  for (const p of points) {
    const prev = out[out.length - 1];
    out.push(prev ? { ...p, lon: unwrapNear(p.lon, prev.lon) } : p);
  }
  return out;
}

/** Does the path (as given, in [-180, 180]) cross the date line by the short way? */
export const crossesDateLine = (points: readonly { lon: number }[]): boolean =>
  unwrapPath(points).some((p) => p.lon > 180 || p.lon < -180);

/**
 * The narrowest arc of longitudes that holds all of them: the circle cut at the biggest gap between neighbours. Returns
 * its west end and its width in degrees; `west` lies in [-180, 180) and the arc runs east from it, over the date line
 * where it must (`west + width` may exceed 180). Nothing: a width of 0 at 0°.
 */
export function narrowestArc(lons: readonly number[]): { west: number; width: number } {
  if (!lons.length) return { west: 0, width: 0 };
  const sorted = [...new Set(lons.map(wrapLon))].sort((a, b) => a - b);
  if (sorted.length === 1) return { west: sorted[0]!, width: 0 };
  let gap = -1;
  let after = 0; // the index of the point the arc starts at: the one after the biggest gap
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1]! : sorted[0]! + 360;
    if (next - sorted[i]! > gap) {
      gap = next - sorted[i]!;
      after = (i + 1) % sorted.length;
    }
  }
  return { west: sorted[after]!, width: 360 - gap };
}

/** `lon` as the copy that falls inside the arc starting at `west` (within [west, west + 360)); a hair short of a whole turn is none. */
export const lonInArc = (lon: number, west: number): number => {
  const turn = (((lon - west) % 360) + 360) % 360;
  return west + (turn > 360 - 1e-9 ? 0 : turn);
};
