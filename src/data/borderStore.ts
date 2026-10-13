import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { boundsOf } from '../domain/geo';
import type { BorderProps, PolygonCoords } from '../domain/types';
import { DELTA_ENCODING, decodeGeometry, type EncodedMeta } from './borderCodec';

type BorderFeature = Feature<Geometry, BorderProps>;

export function polysOf(geometry: Geometry): PolygonCoords[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as PolygonCoords];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as PolygonCoords[];
  return [];
}

/**
 * The border file's rows, with their shapes decoded only when somebody asks for them.
 *
 * 1800–2000 holds 2.6 million points in 2 700 rows; as ordinary GeoJSON arrays that is hundreds of megabytes in
 * the page and tens of seconds in the map's own tile index. The file keeps every ring as a flat list of integers
 * (borderCodec.ts); a row is turned into GeoJSON the first time its shape is needed — by a click that lands in
 * its bounding box, or because the map is about to draw its years — and stays decoded after that. Plain GeoJSON
 * files (the 1400–1600 archive, test fixtures) work the same way, they just have nothing to decode.
 */
export class BorderStore {
  readonly features: BorderFeature[];
  private readonly scale: number;
  private readonly pending: boolean[];

  constructor(raw: FeatureCollection<Geometry, BorderProps> & { meta?: EncodedMeta }) {
    this.features = raw.features as BorderFeature[];
    this.scale = raw.meta?.scale ?? 100;
    const encoded = raw.meta?.encoding === DELTA_ENCODING;
    this.pending = this.features.map(() => encoded);
  }

  /** Row `i` as GeoJSON (decoded on first use). */
  geometry(i: number): Geometry {
    const f = this.features[i]!;
    if (this.pending[i]) {
      f.geometry = decodeGeometry(f.geometry, this.scale);
      this.pending[i] = false;
    }
    return f.geometry;
  }

  polys(i: number): PolygonCoords[] {
    return polysOf(this.geometry(i));
  }

  /** The row's bounding box: from the file when it has one, else from the (then decoded) shape. */
  box(i: number): [number, number, number, number] {
    return this.features[i]!.properties.box ?? boundsOf(this.polys(i));
  }

  /**
   * The rows that exist at some time in [from, to], in file order (big polities first, so small ones paint on
   * top), as a collection the map can take: only these are ever handed to the map's tile index.
   */
  window(from: number, to: number): FeatureCollection<Geometry, BorderProps> {
    const features: BorderFeature[] = [];
    this.features.forEach((f, i) => {
      if (f.properties.to < from || f.properties.from > to) return;
      this.geometry(i);
      features.push(f);
    });
    return { type: 'FeatureCollection', features };
  }
}
