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
