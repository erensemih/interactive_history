import type { FeatureCollection, Geometry } from 'geojson';
import { describe, expect, it } from 'vitest';
import { BorderStore } from '../src/data/borderStore';
import { assembleData, type RawFiles } from '../src/data/load';
import { rowContains } from '../src/domain/geo';
import type { BorderProps } from '../src/domain/types';

const props = (id: string, from: number, to: number, extra: Partial<BorderProps> = {}): BorderProps => ({
  id,
  from,
  to,
  area: 1,
  label: null,
  bbox: null,
  ...extra,
});

/** A 1°×1° square at (lon, lat), as the compact file stores it: first point absolute, then steps, no closing point. */
const squareEncoded = (lon: number, lat: number): Geometry =>
  ({ type: 'Polygon', coordinates: [[lon * 100, lat * 100, 100, 0, 0, 100, -100, 0]] }) as unknown as Geometry;

const squarePlain = (lon: number, lat: number): Geometry => ({
  type: 'Polygon',
  coordinates: [
    [
      [lon, lat],
      [lon + 1, lat],
      [lon + 1, lat + 1],
      [lon, lat + 1],
      [lon, lat],
    ],
  ],
});

const collection = (encoded: boolean, features: [BorderProps, number, number][]) =>
  ({
    type: 'FeatureCollection',
    meta: encoded ? { encoding: 'delta-int', scale: 100 } : {},
    features: features.map(([properties, lon, lat]) => ({
      type: 'Feature',
      properties,
      geometry: encoded ? squareEncoded(lon, lat) : squarePlain(lon, lat),
    })),
  }) as unknown as FeatureCollection<Geometry, BorderProps> & { meta: { encoding?: string; scale?: number } };

const rowsFile = () =>
  collection(true, [
    [props('big', 1800, 1950, { box: [0, 0, 11, 21] }), 10, 20],
    [props('mid', 1900, 1945), 30, 40],
    [props('late', 1960, 2000), 50, 60],
  ]);

describe('BorderStore', () => {
  it('decodes a row the first time its shape is asked for, and no sooner', () => {
    const raw = rowsFile();
    const store = new BorderStore(raw);
    // nothing decoded yet: the file's flat integer lists are still in place
    expect((raw.features[1]!.geometry as unknown as { coordinates: number[][] }).coordinates[0]).toEqual([
      3000, 4000, 100, 0, 0, 100, -100, 0,
    ]);
    expect(store.polys(1)[0]![0]).toEqual([
      [30, 40],
      [31, 40],
      [31, 41],
      [30, 41],
      [30, 40],
    ]);
    expect(store.geometry(1)).toBe(store.geometry(1)); // decoded once
    // the others are untouched
    expect((raw.features[2]!.geometry as unknown as { coordinates: number[][] }).coordinates[0]![0]).toBe(5000);
  });

  it('takes the row box from the file, or works it out from the shape', () => {
    const store = new BorderStore(rowsFile());
    expect(store.box(0)).toEqual([0, 0, 11, 21]); // as stored (deliberately not the real bounds)
    expect(store.box(1)).toEqual([30, 40, 31, 41]);
  });

  it('hands out the rows that exist at some time in the window, in file order, decoded', () => {
    const store = new BorderStore(rowsFile());
    const w = store.window(1940, 1955);
    expect(w.features.map((f) => f.properties.id)).toEqual(['big', 'mid']);
    for (const f of w.features)
      expect(typeof (f.geometry as { coordinates: unknown[][] }).coordinates[0]![0]).toBe('object');
    expect(store.window(1951, 1959).features).toEqual([]);
    expect(store.window(1960, 1960).features.map((f) => f.properties.id)).toEqual(['late']);
  });

  it('treats plain GeoJSON as already decoded', () => {
    const plain = collection(false, [[props('a', 1400, 1500), 5, 5]]);
    const store = new BorderStore(plain);
    expect(store.polys(0)[0]![0]![2]).toEqual([6, 6]);
    expect(store.box(0)).toEqual([5, 5, 6, 6]);
  });
});

describe('rows made from a compact file', () => {
  const files = (): RawFiles => ({
    index: {
      meta: { range: [1800, 2000], tintCount: 9, source: { name: 'x', url: 'https://example.org', license: 'x' } },
      entities: {
        big: { dataName: 'Big', wikipedia: '', wikidata: '', from: 1800, to: 1950, umbrella: false, tint: 1 },
        mid: { dataName: 'Mid', wikipedia: '', wikidata: '', from: 1900, to: 1945, umbrella: false, tint: 2 },
        late: { dataName: 'Late', wikipedia: '', wikidata: '', from: 1960, to: 2000, umbrella: false, tint: 3 },
      },
    },
    entitiesDoc: { entities: {} },
    categoriesDoc: { categories: [] },
    eventSets: [],
    land: { type: 'FeatureCollection', features: [] },
    bordersRaw: rowsFile(),
  });

  it('read their shape on demand, so a click can test them without the rest being decoded', () => {
    const data = assembleData(files());
    const mid = data.rows.find((r) => r.id === 'mid')!;
    expect(mid.box).toEqual([30, 40, 31, 41]);
    expect(rowContains(mid, 30.5, 40.5)).toBe(true);
    expect(rowContains(mid, 32, 40.5)).toBe(false);
    expect(mid.polys).toHaveLength(1);
    // the map is given only the rows near the year it shows
    expect(data.borders.window(1960, 1990).features.map((f) => f.properties.id)).toEqual(['late']);
  });
});
