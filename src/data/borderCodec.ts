import type { FeatureCollection, Geometry, Position } from 'geojson';

/**
 * Compact border files (scripts/pipeline/build_borders.py, `--format delta`): the GeoJSON is the same, but
 * every ring is one flat list of integers, `[x0, y0, dx1, dy1, ...]` in units of `1 / meta.scale` degrees: the
 * first point absolute, each next point as the step from the one before, the closing point left out.
 * About half the size of the text form, and a gzip of it is four times smaller still.
 */
export const DELTA_ENCODING = 'delta-int';

export interface EncodedMeta {
  encoding?: string;
  scale?: number;
}

function decodeRing(flat: number[], scale: number): Position[] {
  const n = flat.length >> 1;
  const ring: Position[] = new Array<Position>(n + 1);
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += flat[2 * i]!;
    y += flat[2 * i + 1]!;
    ring[i] = [x / scale, y / scale];
  }
  ring[n] = [ring[0]![0]!, ring[0]![1]!];
  return ring;
}

/** One geometry of an encoded file as ordinary GeoJSON coordinates (a new geometry; the input is not touched). */
export function decodeGeometry(g: Geometry, scale: number): Geometry {
  if (g.type === 'Polygon') {
    return { type: 'Polygon', coordinates: (g.coordinates as unknown as number[][]).map((r) => decodeRing(r, scale)) };
  }
  if (g.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: (g.coordinates as unknown as number[][][]).map((poly) => poly.map((r) => decodeRing(r, scale))),
    };
  }
  return g;
}

function encodeRing(ring: number[][], scale: number): number[] {
  // points on the grid; a point that repeats the one before is dropped, and so is the closing point
  const pts: [number, number][] = [];
  for (const p of ring) {
    const x = Math.round(p[0]! * scale) || 0; // (`|| 0`: no minus zero)
    const y = Math.round(p[1]! * scale) || 0;
    const last = pts[pts.length - 1];
    if (!last || last[0] !== x || last[1] !== y) pts.push([x, y]);
  }
  if (pts.length > 1 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1]) pts.pop();
  if (pts.length < 3) throw new Error('bir halka en az üç ayrı noktadan oluşmalı');
  const flat: number[] = [];
  let px = 0;
  let py = 0;
  for (const [x, y] of pts) {
    flat.push(x - px, y - py);
    px = x;
    py = y;
  }
  return flat;
}

/**
 * The inverse of `decodeGeometry`: polygons (each `[outer ring, ...holes]` of `[lon, lat]`, rings closed or not) as the
 * compact geometry of an encoded border file, with every coordinate rounded to the grid of `1 / scale` degrees. One
 * polygon makes a Polygon and several a MultiPolygon, like the pipeline writes them (build_borders.py `delta_geometry`).
 */
export function encodeGeometry(polygons: number[][][][], scale: number): Geometry {
  if (!polygons.length) throw new Error('bir şekil en az bir çokgenden oluşmalı');
  const polys = polygons.map((poly) => poly.map((ring) => encodeRing(ring, scale)));
  if (polys.length === 1) return { type: 'Polygon', coordinates: polys[0] } as unknown as Geometry;
  return { type: 'MultiPolygon', coordinates: polys } as unknown as Geometry;
}

/**
 * Turns a whole encoded border collection back into ordinary GeoJSON, in place. A collection without
 * `meta.encoding` is plain GeoJSON already and is returned untouched; calling this twice is harmless.
 * (The app itself does not do this up front: BorderStore decodes a row when somebody needs its shape.)
 */
export function decodeBorders<T extends FeatureCollection<Geometry>>(fc: T & { meta?: EncodedMeta }): T {
  if (fc.meta?.encoding !== DELTA_ENCODING) return fc;
  const scale = fc.meta.scale ?? 100;
  for (const f of fc.features) f.geometry = decodeGeometry(f.geometry, scale);
  delete fc.meta.encoding;
  delete fc.meta.scale;
  return fc;
}
