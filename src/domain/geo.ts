import type {
  Bounds,
  BorderRow,
  Entity,
  PlacePoint,
  PlaceResolution,
  PolygonCoords,
  SovereigntySegment,
  YearRange,
} from './types';

/* --------------------------------------------------------- point in polygon */

/** Ray casting. Ring is [lon, lat][]; the ring need not be explicitly closed. */
export function pointInRing(x: number, y: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Outer ring minus holes. */
export function pointInPolygon(x: number, y: number, poly: PolygonCoords): boolean {
  if (!pointInRing(x, y, poly[0]!)) return false;
  for (let h = 1; h < poly.length; h++) if (pointInRing(x, y, poly[h]!)) return false;
  return true;
}

export function boundsOf(polys: PolygonCoords[]): Bounds {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly[0]!) {
      if (x! < w) w = x!;
      if (x! > e) e = x!;
      if (y! < s) s = y!;
      if (y! > n) n = y!;
    }
  }
  return [w, s, e, n];
}

export const inBounds = (b: Bounds, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

export function rowContains(row: BorderRow, x: number, y: number): boolean {
  if (!inBounds(row.box, x, y)) return false;
  for (const poly of row.polys) if (pointInPolygon(x, y, poly)) return true;
  return false;
}

/* -------------------------------------------------------------------- land */

export interface LandPart {
  box: Bounds;
  poly: PolygonCoords;
}

export function isLand(parts: LandPart[], x: number, y: number): boolean {
  for (const part of parts) if (inBounds(part.box, x, y) && pointInPolygon(x, y, part.poly)) return true;
  return false;
}

/* -------------------------------------------------------------- resolution */

/** Every border row (any time) whose geometry contains the point. */
export function rowsContaining(rows: BorderRow[], x: number, y: number): BorderRow[] {
  const out: BorderRow[] = [];
  for (const row of rows) if (rowContains(row, x, y)) out.push(row);
  return out;
}

const validAt = (row: BorderRow, year: number) => row.from <= year && year <= row.to;

/** The polity that holds the point in `year`: of overlapping rows the most specific (smallest) wins. */
export function primaryAt(candidates: BorderRow[], year: number): BorderRow | null {
  let best: BorderRow | null = null;
  for (const row of candidates) {
    if (!validAt(row, year)) continue;
    if (!best || row.area < best.area || (row.area === best.area && row.id < best.id)) best = row;
  }
  return best;
}

/** Who held the point, year by year over [lo, hi], merged into contiguous segments. */
export function sovereigntySegments(candidates: BorderRow[], lo: number, hi: number): SovereigntySegment[] {
  const out: SovereigntySegment[] = [];
  for (let y = lo; y <= hi; y++) {
    const row = primaryAt(candidates, y);
    if (!row) continue;
    const last = out[out.length - 1];
    if (last && last.id === row.id && last.to === y - 1) last.to = y;
    else out.push({ id: row.id, from: y, to: y });
  }
  return out;
}

export function regionsAt(entities: Iterable<Entity>, x: number, y: number): string[] {
  const out: string[] = [];
  for (const e of entities) if (e.kind === 'region' && e.bounds && inBounds(e.bounds, x, y)) out.push(e.id);
  return out;
}

/**
 * Everything the app needs to know about a place: who holds it at `year`, who held it over the
 * detail window, and which entity ids make up its timeline "lineage" (holders, their parents,
 * and the regions it lies in).
 */
export function resolvePlace(
  rows: BorderRow[],
  entities: Iterable<Entity>,
  point: PlacePoint,
  year: number,
  window: YearRange,
): PlaceResolution {
  const candidates = rowsContaining(rows, point.lon, point.lat);
  const row = primaryAt(candidates, year);
  const regions = regionsAt(entities, point.lon, point.lat);
  const lo = Math.min(window.from, year);
  const hi = Math.max(window.to, year);
  const sequence = sovereigntySegments(candidates, lo, hi);
  const lineage = new Set<string>(regions);
  for (let y = lo; y <= hi; y++) {
    const r = primaryAt(candidates, y);
    if (!r) continue;
    lineage.add(r.id);
    for (const parent of r.up ?? []) lineage.add(parent);
  }
  return { point, row, regions, sequence, lineage };
}
