import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Feature, Geometry } from 'geojson';
import { afterAll, describe, expect, it } from 'vitest';
import { decodeGeometry, encodeGeometry } from '../src/data/borderCodec';
import { BorderStore, polysOf } from '../src/data/borderStore';
import {
  applyRowCorrections,
  boxesOf,
  clippedAreaKm2,
  OccupationIndex,
  polygonAreaKm2,
  ringAreaKm2,
  type BordersRaw,
  type CorrectionsDoc,
  type OccupationEntry,
  type RowCorrection,
} from '../src/data/corrections';
import { primaryAt, resolvePlace, rowsContaining } from '../src/domain/geo';
import type { BorderProps, BorderRow, Bounds, PolygonCoords } from '../src/domain/types';
// @ts-expect-error plain ESM script without type declarations
import { validateCorrections } from '../scripts/validate-corrections.mjs';
import { shippedData } from './helpers/shipped';

/**
 * The correction layer (public/data/corrections/ww2.json): Cliopatria's file stays as it is, and a few rows and names are
 * applied on top of it when the page loads. First the mechanics on small made-up collections, then what the layer does to
 * the shipped data.
 */

/* ----------------------------------------------------------------------- fixtures */

const sq = (x: number, y: number, w: number, h = w): number[][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
];

const boundsOfPolys = (polys: number[][][][]): Bounds => {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const poly of polys) {
    for (const [x, y] of poly[0]!) {
      w = Math.min(w, x!);
      e = Math.max(e, x!);
      s = Math.min(s, y!);
      n = Math.max(n, y!);
    }
  }
  return [w, s, e, n];
};

function feature(
  id: string,
  from: number,
  to: number,
  polys: number[][][][],
  area = 1000,
): Feature<Geometry, BorderProps> {
  const box = boundsOfPolys(polys);
  return {
    type: 'Feature',
    properties: { id, from, to, area, label: [box[0] + 0.1, box[1] + 0.1, 0.1], bbox: box, box, up: ['umbrella'] },
    geometry: encodeGeometry(polys, 100),
  };
}

const collection = (...features: Feature<Geometry, BorderProps>[]): BordersRaw => ({
  type: 'FeatureCollection',
  meta: { encoding: 'delta-int', scale: 100 },
  features,
});

/** A plain (not encoded) collection, like the archived periods hold. */
const plainCollection = (...features: Feature<Geometry, BorderProps>[]): BordersRaw => ({
  type: 'FeatureCollection',
  features: features.map((f) => ({
    ...f,
    geometry: decodeGeometry(f.geometry, 100),
  })),
});

const META = { title: 'deneme', note: 'Cliopatria değişmez' };
const rowsDoc = (...rows: RowCorrection[]): CorrectionsDoc => ({ meta: META, rows });
const note = { note: 'neden', source: 'kaynak' };

/** A row as AppData holds it: the shape is there to read. */
const row = (id: string, from: number, to: number, area: number, polys: number[][][][]): BorderRow =>
  ({
    id,
    from,
    to,
    area,
    label: null,
    bbox: null,
    box: boundsOfPolys(polys),
    up: [],
    tint: null,
    polys: polys as PolygonCoords[],
  }) as BorderRow;

/* --------------------------------------------------------------------- the file layer */

describe('applyRowCorrections', () => {
  // the file lists its rows biggest first
  const base = () =>
    collection(
      feature('other', 1938, 1946, [[sq(0, 0, 1)]], 5_000_000),
      feature('reich', 1938, 1938, [[sq(5, 45, 10, 8)], [sq(30, 60, 1)], [sq(-5, 38, 0.5)]], 600_000),
    );

  it('changes nothing without a layer: no document, an empty one, one without rows', () => {
    const raw = base();
    const before = JSON.stringify(raw);
    expect(applyRowCorrections(raw, null)).toEqual([]);
    expect(applyRowCorrections(raw, { meta: META })).toEqual([]);
    expect(applyRowCorrections(raw, rowsDoc())).toEqual([]);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('copies a row to new years, sharing its encoded shape and leaving the rows of the file alone', () => {
    const raw = base();
    const rowsBefore = JSON.stringify(raw.features);
    const lines = applyRowCorrections(
      raw,
      rowsDoc({ op: 'copy', id: 'reich', of: { id: 'reich', year: 1938 }, from: 1945, to: 1945, ...note }),
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('reich 1945');
    expect(raw.features).toHaveLength(3);
    const source = raw.features[1]!;
    const copy = raw.features[2]!;
    expect(copy.geometry).toBe(source.geometry);
    expect(copy.properties).toEqual({ ...source.properties, from: 1945, to: 1945 });
    expect(copy.properties.label).toEqual(source.properties.label);
    expect(JSON.stringify(raw.features.slice(0, 2))).toBe(rowsBefore);
  });

  it('applies a collection once: the second call finds it done', () => {
    const raw = base();
    const doc = rowsDoc({ op: 'copy', id: 'reich', of: { id: 'reich', year: 1938 }, from: 1945, to: 1945, ...note });
    expect(applyRowCorrections(raw, doc)).toHaveLength(1);
    expect(applyRowCorrections(raw, doc)).toEqual([]);
    expect(raw.features).toHaveLength(3);
  });

  it('can leave out the parts of the copied shape that lie outside the boxes ("keep"), and re-encodes the rest', () => {
    const raw = base();
    applyRowCorrections(
      raw,
      rowsDoc({
        op: 'copy',
        id: 'reich',
        of: { id: 'reich', year: 1938 },
        keep: [0, 40, 20, 55],
        from: 1945,
        to: 1945,
        ...note,
      } as RowCorrection),
    );
    const source = raw.features[1]!;
    const copy = raw.features[2]!;
    expect(copy.geometry.type).toBe('Polygon');
    expect(polysOf(decodeGeometry(copy.geometry, 100))).toEqual([[sq(5, 45, 10, 8)]]);
    expect(copy.properties.box).toEqual([5, 45, 15, 53]);
    expect(copy.properties.area).toBe(600_000);
    expect(copy.properties.label).toEqual(source.properties.label);
    // the source row keeps its three parts
    expect(polysOf(decodeGeometry(source.geometry, 100))).toHaveLength(3);

    const two = base();
    applyRowCorrections(
      two,
      rowsDoc({
        op: 'copy',
        id: 'reich',
        of: { id: 'reich', year: 1938 },
        keep: [
          [0, 40, 20, 55],
          [29, 59, 32, 62],
        ],
        from: 1945,
        to: 1945,
        ...note,
      }),
    );
    expect(polysOf(decodeGeometry(two.features[2]!.geometry, 100))).toHaveLength(2);
  });

  it('a copy for another polity takes the shape and no name or parents of the first', () => {
    const raw = base();
    applyRowCorrections(
      raw,
      rowsDoc({ op: 'copy', id: 'other', of: { id: 'reich', year: 1938 }, from: 1945, to: 1945, ...note }),
    );
    const copy = raw.features[2]!;
    expect(copy.properties.id).toBe('other');
    expect(copy.properties.label).toBeNull();
    expect(copy.properties.up).toEqual([]);
  });

  it('adds a row of its own: encoded like the file, with area, boxes, no name label and no parents', () => {
    const raw = base();
    const lines = applyRowCorrections(
      raw,
      rowsDoc({
        op: 'add',
        id: 'other',
        name: 'Yama',
        from: 1942,
        to: 1945,
        polygons: [[sq(10, 0, 1)], [sq(20, 0, 2)]],
        ...note,
      }),
    );
    expect(lines[0]).toContain('Yama eklendi');
    const added = raw.features[2]!;
    expect(added.properties).toMatchObject({ id: 'other', from: 1942, to: 1945, label: null, up: [] });
    expect(added.properties.box).toEqual([10, 0, 22, 2]);
    expect(added.properties.bbox).toEqual([20, 0, 22, 2]); // the biggest part
    // 1° x 1° and 2° x 2° at the equator: 12 364 and 49 4xx km²
    expect(added.properties.area).toBeGreaterThan(61_000);
    expect(added.properties.area).toBeLessThan(62_500);
    expect(added.geometry.type).toBe('MultiPolygon');
    expect(polysOf(decodeGeometry(added.geometry, 100))).toEqual([[sq(10, 0, 1)], [sq(20, 0, 2)]]);
  });

  it('puts a new row where the file keeps its rows, biggest first: over the bigger rows it corrects, under the smaller ones', () => {
    const raw = collection(
      feature('big', 1900, 1999, [[sq(0, 0, 10)]], 5_000_000),
      feature('mid', 1938, 1938, [[sq(5, 45, 2)]], 600_000),
      feature('tiny', 1900, 1999, [[sq(5, 45, 0.1)]], 900),
    );
    applyRowCorrections(
      raw,
      rowsDoc(
        { op: 'copy', id: 'mid', of: { id: 'mid', year: 1938 }, from: 1945, to: 1945, ...note },
        { op: 'add', id: 'big', from: 1942, to: 1942, polygons: [[sq(1, 1, 1)]], ...note },
      ),
    );
    expect(raw.features.map((f) => `${f.properties.id}@${f.properties.from}`)).toEqual([
      'big@1900',
      'mid@1938',
      'mid@1945',
      'big@1942',
      'tiny@1900',
    ]);
    const areas = raw.features.map((f) => f.properties.area);
    expect(areas).toEqual([...areas].sort((a, b) => b - a));
  });

  it('works on a plain GeoJSON collection too (an archived period), writing plain closed rings', () => {
    const raw = plainCollection(feature('reich', 1938, 1938, [[sq(5, 45, 10, 8)], [sq(30, 60, 1)]], 600));
    applyRowCorrections(
      raw,
      rowsDoc(
        {
          op: 'copy',
          id: 'reich',
          of: { id: 'reich', year: 1938 },
          keep: [0, 40, 20, 55],
          from: 1945,
          to: 1945,
          ...note,
        },
        { op: 'add', id: 'reich', from: 1946, to: 1946, polygons: [[sq(1, 1, 1).slice(0, 4)]], ...note },
      ),
    );
    expect(raw.features).toHaveLength(3);
    const fromYear = (year: number) => raw.features.find((f) => f.properties.from === year)!;
    expect(fromYear(1945).geometry).toEqual({ type: 'Polygon', coordinates: [sq(5, 45, 10, 8)] });
    expect(fromYear(1946).geometry).toEqual({ type: 'Polygon', coordinates: [sq(1, 1, 1)] });
  });

  it('is read by the border store like any other row of the file', () => {
    const raw = base();
    applyRowCorrections(
      raw,
      rowsDoc(
        { op: 'copy', id: 'reich', of: { id: 'reich', year: 1938 }, from: 1945, to: 1945, ...note },
        { op: 'add', id: 'other', from: 1942, to: 1944, polygons: [[sq(10, 0, 1)]], ...note },
      ),
    );
    const store = new BorderStore(raw);
    expect(store.features).toHaveLength(4);
    expect(store.polys(2)).toHaveLength(3);
    expect(store.polys(3)).toEqual([[sq(10, 0, 1)]]);
    expect(store.box(3)).toEqual([10, 0, 11, 1]);
    // the window of 1943 holds the patch and the rows of 1938–1946, not the copy of 1945
    expect(store.window(1943, 1943).features.map((f) => `${f.properties.id}@${f.properties.from}`)).toEqual([
      'other@1938',
      'other@1942',
    ]);
  });

  it('fails loudly when a reference is not in the data', () => {
    const attempt = (c: RowCorrection) => () => applyRowCorrections(base(), rowsDoc(c));
    const copy: RowCorrection = {
      op: 'copy',
      id: 'reich',
      of: { id: 'reich', year: 1938 },
      from: 1945,
      to: 1945,
      ...note,
    };
    expect(attempt({ ...copy, of: { id: 'reich', year: 1950 } })).toThrow(/kaynak satır yok/);
    expect(attempt({ ...copy, of: { id: 'nowhere', year: 1938 } })).toThrow(/nowhere/);
    expect(attempt({ ...copy, keep: [50, 50, 60, 60] })).toThrow(/keep/);
    expect(attempt({ ...copy, from: 1946, to: 1945 })).toThrow(/yıl aralığı/);
    expect(attempt({ ...copy, from: 1945.5 })).toThrow(/yıl aralığı/);
    const add: RowCorrection = { op: 'add', id: 'other', from: 1942, to: 1945, polygons: [[sq(10, 0, 1)]], ...note };
    expect(attempt({ ...add, id: 'nobody' })).toThrow(/nobody.*sınır dosyasında yok/);
    expect(attempt({ ...add, polygons: [] })).toThrow(/şekil geçersiz/);
    expect(
      attempt({
        ...add,
        polygons: [
          [
            [
              [0, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
      }),
    ).toThrow(/şekil geçersiz/);
    expect(attempt({ op: 'move', id: 'other', from: 1942, to: 1945, ...note } as unknown as RowCorrection)).toThrow(
      /bilinmeyen işlem/,
    );
  });

  it('leaves the collection as it was when a correction throws', () => {
    const raw = base();
    const before = JSON.stringify(raw);
    expect(() =>
      applyRowCorrections(
        raw,
        rowsDoc(
          { op: 'copy', id: 'reich', of: { id: 'reich', year: 1938 }, from: 1945, to: 1945, ...note },
          { op: 'copy', id: 'reich', of: { id: 'reich', year: 1999 }, from: 1946, to: 1946, ...note },
        ),
      ),
    ).toThrow();
    expect(JSON.stringify(raw)).toBe(before);
  });
});

/* ------------------------------------------------------------------- geometry helpers */

describe('area of a shape', () => {
  it('is measured on the sphere: a degree square at the equator is about 12 364 km², and shrinks toward the pole', () => {
    expect(ringAreaKm2(sq(0, 0, 1))).toBeGreaterThan(12_300);
    expect(ringAreaKm2(sq(0, 0, 1))).toBeLessThan(12_430);
    const north = ringAreaKm2(sq(0, 60, 1));
    expect(north / ringAreaKm2(sq(0, 0, 1))).toBeCloseTo(0.5, 1);
    // open or closed, the same
    expect(ringAreaKm2(sq(0, 0, 1).slice(0, 4))).toBeCloseTo(ringAreaKm2(sq(0, 0, 1)), 6);
  });

  it('takes the holes out', () => {
    const full = polygonAreaKm2([sq(0, 0, 4)]);
    const holed = polygonAreaKm2([sq(0, 0, 4), sq(1, 1, 2)]);
    expect(holed / full).toBeCloseTo(0.75, 2);
  });

  it('can be cut to boxes: half the land is half the area, a list of boxes adds up, a hole is cut with it', () => {
    const land: PolygonCoords[] = [[sq(0, 0, 10)]];
    const whole = clippedAreaKm2(land, null);
    expect(clippedAreaKm2(land, [[0, 0, 5, 10]]) / whole).toBeCloseTo(0.5, 2);
    expect(
      clippedAreaKm2(land, [
        [0, 0, 2, 10],
        [4, 0, 6, 10],
      ]) / whole,
    ).toBeCloseTo(0.4, 2);
    // a box that sticks out of the land counts only what is there
    expect(clippedAreaKm2(land, [[-5, -5, 5, 5]]) / whole).toBeCloseTo(0.25, 2);
    expect(clippedAreaKm2(land, [[20, 20, 30, 30]])).toBe(0);
    const holed: PolygonCoords[] = [[sq(0, 0, 10), sq(2, 2, 2)]];
    expect(clippedAreaKm2(holed, [[0, 0, 5, 5]])).toBeLessThan(clippedAreaKm2([[sq(0, 0, 10)]], [[0, 0, 5, 5]]));
  });

  it('takes a box or a list of boxes for a list', () => {
    expect(boxesOf(undefined)).toBeNull();
    expect(boxesOf([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
    expect(
      boxesOf([
        [1, 2, 3, 4],
        [5, 6, 7, 8],
      ]),
    ).toHaveLength(2);
  });
});

/* ------------------------------------------------------------------ the occupation index */

describe('OccupationIndex', () => {
  const land = row('land', 1930, 1939, 500_000, [[sq(0, 0, 10)]]);
  const holder = row('occ', 1940, 1944, 5_000_000, [[sq(-5, -5, 30)]]);
  const other = row('other', 1940, 1944, 100, [[sq(0, 0, 1)]]);
  const entry = (extra: Partial<OccupationEntry> = {}): OccupationEntry => ({
    id: 'a',
    name: 'Ülke',
    area: { id: 'land', year: 1939 },
    occupiers: ['occ'],
    from: 1940,
    to: 1944,
    at: [5, 5],
    ...note,
    ...extra,
  });
  const doc = (...entries: OccupationEntry[]): CorrectionsDoc => ({
    meta: META,
    occupierLabels: { occ: 'Alman işgali' },
    occupations: entries,
  });
  const index = (...entries: OccupationEntry[]) => new OccupationIndex(doc(...entries), [land, holder, other]);
  const P = (lon: number, lat: number) => ({ lon, lat });

  it('names a land where an occupier holds a point of its shape in the years of the entry', () => {
    expect(index(entry()).at(P(5, 5), 1942, holder)).toEqual({
      id: 'a',
      name: 'Ülke',
      label: 'Alman işgali',
      occupier: 'occ',
    });
  });

  it('names nothing outside the years, for a holder that is not an occupier, on blank land, outside the shape or the box', () => {
    const idx = index(entry());
    expect(idx.at(P(5, 5), 1939, holder)).toBeNull();
    expect(idx.at(P(5, 5), 1945, holder)).toBeNull();
    expect(idx.at(P(5, 5), 1942, other)).toBeNull();
    expect(idx.at(P(5, 5), 1942, null)).toBeNull();
    // inside the occupier's row, but outside the shape of the land
    expect(idx.at(P(15, 15), 1942, holder)).toBeNull();
    const boxed = index(entry({ box: [0, 0, 5, 10] }));
    expect(boxed.at(P(2, 5), 1942, holder)?.id).toBe('a');
    expect(boxed.at(P(7, 5), 1942, holder)).toBeNull();
  });

  it('takes a list of boxes for their union', () => {
    const idx = index(
      entry({
        box: [
          [0, 0, 3, 10],
          [7, 0, 10, 10],
        ],
      }),
    );
    expect(idx.at(P(1, 5), 1942, holder)).not.toBeNull();
    expect(idx.at(P(5, 5), 1942, holder)).toBeNull();
    expect(idx.at(P(8, 5), 1942, holder)).not.toBeNull();
  });

  it('says "işgal" for an occupier that has no word of its own, and tells who it was', () => {
    const idx = new OccupationIndex({ meta: META, occupations: [entry({ occupiers: ['occ', 'other'] })] }, [
      land,
      holder,
      other,
    ]);
    expect(idx.at(P(5, 5), 1942, holder)).toMatchObject({ label: 'işgal', occupier: 'occ' });
    expect(idx.at(P(0.5, 0.5), 1942, other)).toMatchObject({ label: 'işgal', occupier: 'other' });
  });

  it('gives the word of the holder: one land, two occupiers', () => {
    const idx = new OccupationIndex(
      {
        meta: META,
        occupierLabels: { occ: 'Alman işgali', other: 'İtalyan işgali' },
        occupations: [entry({ occupiers: ['occ', 'other'] })],
      },
      [land, holder, other],
    );
    expect(idx.at(P(5, 5), 1942, holder)?.label).toBe('Alman işgali');
    expect(idx.at(P(0.5, 0.5), 1942, other)?.label).toBe('İtalyan işgali');
  });

  it('lets the first entry of the file win where several apply', () => {
    const idx = index(entry({ id: 'first', name: 'Birinci' }), entry({ id: 'second', name: 'İkinci' }));
    expect(idx.at(P(5, 5), 1942, holder)?.id).toBe('first');
    const narrowFirst = index(entry({ id: 'first', box: [0, 0, 2, 2] }), entry({ id: 'second' }));
    expect(narrowFirst.at(P(1, 1), 1942, holder)?.id).toBe('first');
    expect(narrowFirst.at(P(5, 5), 1942, holder)?.id).toBe('second');
  });

  it('takes the shape from the biggest row of the polity valid in that year', () => {
    const patch = row('land', 1939, 1939, 10, [[sq(1, 1, 1)]]);
    const idx = new OccupationIndex(doc(entry()), [patch, land, holder]);
    expect(idx.at(P(5, 5), 1942, holder)?.id).toBe('a');
  });

  it('fails loudly for a land whose row is not there', () => {
    expect(() => index(entry({ id: 'lost', area: { id: 'land', year: 1950 } }))).toThrow(/lost/);
    expect(() => index(entry({ id: 'lost', area: { id: 'nowhere', year: 1939 } }))).toThrow(/nowhere/);
  });

  it('puts a name tag in the years when an occupier holds the tag point, with the land as it is sized', () => {
    const idx = index(entry());
    const held = (r: BorderRow | null) => () => r;
    expect(idx.labels(1942, held(holder))).toEqual([
      { id: 'a', name: 'Ülke', label: 'Alman işgali', occupier: 'occ', lon: 5, lat: 5, area: 500_000 },
    ]);
    expect(idx.labels(1942, held(other))).toEqual([]);
    expect(idx.labels(1942, held(null))).toEqual([]);
    expect(idx.labels(1939, held(holder))).toEqual([]);
    expect(idx.labels(1945, held(holder))).toEqual([]);
    // the tag is asked about the entry's own point
    const asked: number[][] = [];
    idx.labels(1942, (lon, lat) => (asked.push([lon, lat]), holder));
    expect(asked).toEqual([[5, 5]]);
  });

  it('sizes the tag of a land narrowed by boxes by what is left of the shape, not by the row', () => {
    const whole = polygonAreaKm2([sq(0, 0, 10)]);
    const [tag] = index(entry({ box: [0, 0, 5, 10] })).labels(1942, () => holder);
    expect(tag!.area / whole).toBeCloseTo(0.5, 2);
    expect(tag!.area).not.toBe(500_000);
  });

  it('is empty without a layer', () => {
    const none = new OccupationIndex(null, [land, holder]);
    expect(none.at(P(5, 5), 1942, holder)).toBeNull();
    expect(none.labels(1942, () => holder)).toEqual([]);
    expect(new OccupationIndex({ meta: META }, []).labels(1942, () => holder)).toEqual([]);
  });
});

/* --------------------------------------------------------------- the shipped correction layer */

describe('the shipped layer (public/data/corrections/ww2.json)', () => {
  const data = shippedData();
  const root = join(__dirname, '..', 'public', 'data');
  const doc = JSON.parse(readFileSync(join(root, 'corrections', 'ww2.json'), 'utf8')) as CorrectionsDoc;

  const holderAt = (lon: number, lat: number, year: number) => primaryAt(rowsContaining(data.rows, lon, lat), year);
  const holderId = (lon: number, lat: number, year: number) => holderAt(lon, lat, year)?.id ?? null;
  const occupationAt = (lon: number, lat: number, year: number) =>
    data.occupations.at({ lon, lat }, year, holderAt(lon, lat, year));
  const told = (lon: number, lat: number, year: number) => {
    const o = occupationAt(lon, lat, year);
    return o ? `${o.name} · ${o.label}` : null;
  };

  describe('Nazi Germany in 1945', () => {
    const german: [string, number, number][] = [
      ['Berlin', 13.4, 52.52],
      ['Hamburg', 10.0, 53.55],
      ['Munich', 11.58, 48.14],
      ['Frankfurt', 8.68, 50.11],
      ['Dresden', 13.74, 51.05],
      ['Stuttgart', 9.18, 48.78],
      ['Cologne', 6.96, 50.94],
      ['Königsberg', 20.5, 54.71],
      ['Breslau', 17.03, 51.11],
      ['Vienna', 16.37, 48.21],
    ];

    it('holds the cities of the Reich, which the border data gives to the occupation zones', () => {
      for (const [name, lon, lat] of german) {
        expect(holderId(lon, lat, 1944), name).toBe('nazi-germany');
        expect(holderId(lon, lat, 1945), name).toBe('nazi-germany');
        const res = resolvePlace(data.rows, data.entities.values(), { lon, lat }, 1945, { from: 1939, to: 1945 });
        expect(res.row?.id, name).toBe('nazi-germany');
        expect(res.row?.from, name).toBe(1945);
      }
    });

    it('is one unbroken stretch for Berlin over the war years, and the zones come in 1946', () => {
      const res = resolvePlace(data.rows, data.entities.values(), { lon: 13.4, lat: 52.52 }, 1942, {
        from: 1939,
        to: 1946,
      });
      expect(res.sequence[0]).toEqual({ id: 'nazi-germany', from: 1939, to: 1945 });
      expect(res.sequence[1]!.from).toBe(1946);
      expect(res.sequence[1]!.id).not.toBe('nazi-germany');
    });

    it('leaves the countries the data already shows as liberated with the holders the data gives them', () => {
      const liberated: [string, number, number, string][] = [
        ['Paris', 2.35, 48.86, 'french-fourth-republic'],
        ['Strasbourg', 7.75, 48.58, 'french-fourth-republic'],
        ['Brussels', 4.35, 50.85, 'kingdom-of-belgium'],
        ['Amsterdam', 4.9, 52.37, 'netherlands'],
        ['Luxembourg', 6.13, 49.61, 'luxembourg'],
        ['Warsaw', 21.01, 52.23, 'union-of-soviet-socialist-republics'],
        ['Prague', 14.42, 50.08, 'union-of-soviet-socialist-republics'],
        ['Danzig', 18.65, 54.35, 'union-of-soviet-socialist-republics'],
        ['Posen', 16.93, 52.4, 'union-of-soviet-socialist-republics'],
        ['Oslo', 10.75, 59.91, 'kingdom-of-norway'],
        ['Rome', 12.5, 41.9, 'kingdom-of-italy'],
        ['Bolzano', 11.35, 46.5, 'kingdom-of-italy'],
        ['Athens', 23.73, 37.98, 'greece'],
        ['Belgrade', 20.46, 44.82, 'yugoslavia'],
        ['Maribor', 15.65, 46.55, 'yugoslavia'],
        ['Zürich', 8.54, 47.37, 'swiss-confederation'],
        ['Zealand', 11.5, 55.5, 'denmark'],
      ];
      for (const [name, lon, lat, id] of liberated) expect(holderId(lon, lat, 1945), name).toBe(id);
    });

    it('does not carry the stray islands and enclaves of the dataset into 1945 (they are still there in the years before)', () => {
      const strays: [string, number, number, string][] = [
        ['Hebrides', -6.36, 58.25, 'kingdom-of-great-britain'],
        ['Gallipoli', 26.65, 40.4, 'republic-of-turkey'],
        ['Ibiza', 1.46, 38.93, 'francoist-spain'],
        ['Zakynthos', 20.7, 37.8, 'greece'],
        ['Antibes', 7.06, 43.62, 'french-fourth-republic'],
        ['Derbent', 48.3, 42.0, 'union-of-soviet-socialist-republics'],
      ];
      for (const [name, lon, lat, id] of strays) {
        expect(holderId(lon, lat, 1945), name).toBe(id);
      }
      // the dataset's own rows of 1938 still carry them: the layer does not edit what it did not make
      expect(holderId(-6.36, 58.25, 1938)).toBe('nazi-germany');
      expect(holderId(26.65, 40.4, 1938)).toBe('nazi-germany');
    });

    it('is a copy of the row of 1938: same name label, size and parents, one year, placed after the bigger rows', () => {
      const copy = data.rows.find((r) => r.id === 'nazi-germany' && r.from === 1945)!;
      const source = data.rows.find((r) => r.id === 'nazi-germany' && r.from === 1938)!;
      expect(copy.to).toBe(1945);
      expect(copy.area).toBe(source.area);
      expect(copy.label).toEqual(source.label);
      expect(copy.tint).toBe(source.tint);
      expect(copy.polys.length).toBeLessThan(source.polys.length);
      expect(copy.polys.length).toBeLessThanOrEqual(10);
      // the file keeps its order, biggest first, so that the small paint on top: the copy paints over the occupation
      // zones it corrects (bigger rows) and under the small rows it only touches at the border (Switzerland)
      const areas = data.rows.map((r) => r.area);
      expect(areas).toEqual([...areas].sort((a, b) => b - a));
      expect(data.rows.length).toBe(data.borders.features.length);
      const position = (id: string, year: number) =>
        data.rows.findIndex((r) => r.id === id && r.from <= year && r.to >= year);
      expect(position('french-fourth-republic', 1945)).toBeLessThan(data.rows.indexOf(copy));
      expect(position('union-of-soviet-socialist-republics', 1945)).toBeLessThan(data.rows.indexOf(copy));
      expect(position('swiss-confederation', 1945)).toBeGreaterThan(data.rows.indexOf(copy));
    });
  });

  describe('the Japanese patches', () => {
    it('Singapore is British in 1941 and Japanese from 1942 to 1945, and British again in 1946', () => {
      const years = [1941, 1942, 1943, 1944, 1945, 1946];
      expect(years.map((y) => holderId(103.82, 1.35, y))).toEqual([
        'british-colonial-empire',
        'empire-of-japan',
        'empire-of-japan',
        'empire-of-japan',
        'empire-of-japan',
        'british-colonial-empire',
      ]);
    });

    it('takes the Johor shore across the strait with it: no British row is left near the island', () => {
      for (const [lon, lat] of [
        [103.75, 1.49], // Johor Bahru
        [103.7, 1.4],
        [103.9, 1.35],
        [103.55, 1.4],
      ] as const) {
        for (const y of [1942, 1943, 1944, 1945])
          expect(holderId(lon, lat, y), `${lon},${lat} ${y}`).toBe('empire-of-japan');
      }
      expect(holderId(103.75, 1.49, 1941)).toBe('british-colonial-empire');
    });

    it('has the patch beside the bigger Japanese row, with no name label of its own', () => {
      const patches = data.rows.filter((r) => r.id === 'empire-of-japan' && r.from === 1942 && r.area < 100_000);
      expect(patches.map((r) => `${r.from}–${r.to}`).sort()).toEqual(['1942–1944', '1942–1945']);
      for (const p of patches) {
        expect(p.label).toBeNull();
        expect(p.up).toEqual([]);
        expect(p.tint).toBe(data.entities.get('empire-of-japan')!.tint);
      }
      const singapore = patches.find((r) => r.to === 1945)!;
      expect(singapore.area).toBeGreaterThan(500);
      expect(singapore.area).toBeLessThan(1500);
      expect(singapore.box[0]).toBeGreaterThanOrEqual(103.4);
      expect(singapore.box[2]).toBeLessThanOrEqual(104.1);
      // the big row of 1943 covers Singapore too: the smallest row is what holds the point
      const covering = rowsContaining(data.rows, 103.82, 1.35).filter((r) => r.from <= 1943 && r.to >= 1943);
      expect(covering.map((r) => r.id).sort()).toEqual([
        'british-colonial-empire',
        'empire-of-japan',
        'empire-of-japan',
      ]);
    });

    it('East Timor is Portuguese in 1941 and Japanese from 1942, as the rest of the island is', () => {
      expect([1941, 1942, 1943, 1944, 1945].map((y) => holderId(125.57, -8.55, y))).toEqual([
        'estado-novo',
        'empire-of-japan',
        'empire-of-japan',
        'empire-of-japan',
        'empire-of-japan',
      ]);
      expect([1941, 1942].map((y) => holderId(125.9, -8.9, y))).toEqual(['estado-novo', 'empire-of-japan']);
    });

    it('moves no other place: against the same rows without the three the layer adds, holders differ only where it works', () => {
      const reich = data.rows.find((r) => r.id === 'nazi-germany' && r.from === 1945)!;
      const patches = data.rows.filter((r) => r.id === 'empire-of-japan' && r.from === 1942 && r.area < 100_000);
      const patchSingapore = patches.find((r) => r.to === 1945)!;
      const patchTimor = patches.find((r) => r.to === 1944)!;
      const added = new Set<BorderRow>([reich, patchSingapore, patchTimor]);
      expect(added.size).toBe(3);
      // the three rows lie inside the regions they are made for
      const inside = (b: Bounds, w: number, s: number, e: number, n: number) =>
        b[0] >= w && b[1] >= s && b[2] <= e && b[3] <= n;
      expect(inside(reich.box, 5.9, 46.3, 22.9, 55.4)).toBe(true);
      expect(inside(patchSingapore.box, 103.4, 1.2, 104.1, 1.55)).toBe(true);
      expect(inside(patchTimor.box, 123.8, -9.7, 127.4, -8.1)).toBe(true);

      const points: [number, number][] = [];
      // the places of the war the layer must not move, and the regions it works on
      for (const [lon, lat] of [
        [-0.13, 51.5],
        [37.62, 55.75],
        [-77.04, 38.9],
        [139.7, 35.7],
        [2.35, 48.86],
        [21.01, 52.23],
        [14.42, 50.08],
        [10.75, 59.91],
        [23.73, 37.98],
        [20.46, 44.82],
        [12.5, 41.9],
        [30.52, 50.45],
        [120.98, 14.6],
        [106.85, -6.2],
        [96.15, 16.8],
        [101.69, 3.14],
        [105.85, 21.03],
        [118.8, 32.06],
        [114.17, 22.27],
        [28.95, 30.83],
        [44.52, 48.71],
      ] as const)
        points.push([lon, lat]);
      for (let lon = 5; lon <= 23; lon += 1) for (let lat = 46; lat <= 56; lat += 1) points.push([lon, lat]);
      for (let lon = 103.3; lon <= 104.2; lon += 0.1)
        for (let lat = 1.1; lat <= 1.6; lat += 0.1) points.push([lon, lat]);
      for (let lon = 123.8; lon <= 127.4; lon += 0.2)
        for (let lat = -9.7; lat <= -8.0; lat += 0.2) points.push([lon, lat]);

      const changed: string[] = [];
      let germany = 0;
      let singapore = 0;
      let timor = 0;
      for (const [lon, lat] of points) {
        const after = rowsContaining(data.rows, lon, lat);
        const before = after.filter((r) => !added.has(r));
        for (let year = 1936; year <= 1950; year++) {
          const a = primaryAt(before, year)?.id ?? null;
          const b = primaryAt(after, year)?.id ?? null;
          if (a === b) continue;
          if (year === 1945 && inside([lon, lat, lon, lat], 5.9, 46.3, 22.9, 55.4) && b === 'nazi-germany') germany++;
          else if (
            year >= 1942 &&
            year <= 1945 &&
            inside([lon, lat, lon, lat], 103.4, 1.2, 104.1, 1.55) &&
            b === 'empire-of-japan'
          )
            singapore++;
          else if (
            year >= 1942 &&
            year <= 1944 &&
            inside([lon, lat, lon, lat], 123.8, -9.7, 127.4, -8.1) &&
            b === 'empire-of-japan'
          )
            timor++;
          else changed.push(`${lon},${lat} ${year}: ${a} -> ${b}`);
        }
      }
      expect(changed).toEqual([]);
      expect(germany).toBeGreaterThan(50);
      expect(singapore).toBeGreaterThan(5);
      expect(timor).toBeGreaterThan(20);
    });

    it(
      'leaves the border file as it is: every row it holds is still there, the same and in the same order, and three more are among them',
      { timeout: 60_000 },
      () => {
        const read = () =>
          JSON.parse(readFileSync(join(root, 'borders', 'cliopatria-1800-2000.json'), 'utf8')) as BordersRaw;
        const file = read();
        const fresh = read();
        const lines = applyRowCorrections(fresh, doc);
        expect(lines).toHaveLength(3);
        expect(fresh.features).toHaveLength(file.features.length + 3);
        const originals = file.features.map((f) => JSON.stringify(f));
        const known = new Set(originals);
        const now = fresh.features.map((f) => JSON.stringify(f));
        expect(now.filter((j) => known.has(j))).toEqual(originals);
        expect(now.filter((j) => !known.has(j))).toHaveLength(3);
      },
    );
  });

  describe('occupied lands, as the page names them', () => {
    it('Warsaw is Poland under German occupation in 1940–44, not Nazi Germany; Poland in 1939; nothing special in 1945', () => {
      for (const y of [1940, 1941, 1942, 1943, 1944]) {
        expect(holderId(21.01, 52.23, y)).toBe('nazi-germany');
        expect(occupationAt(21.01, 52.23, y)).toEqual({
          id: 'polonya',
          name: 'Polonya',
          label: 'Alman işgali',
          occupier: 'nazi-germany',
        });
      }
      expect(holderId(21.01, 52.23, 1939)).toBe('second-polish-republic');
      expect(occupationAt(21.01, 52.23, 1939)).toBeNull();
      expect(occupationAt(21.01, 52.23, 1945)).toBeNull();
    });

    it('the east of Poland is under Soviet occupation in 1940–41 and German in 1942–43', () => {
      expect([1940, 1941, 1942, 1943].map((y) => told(24.03, 49.84, y))).toEqual([
        'Doğu Polonya · Sovyet işgali',
        'Doğu Polonya · Sovyet işgali',
        'Polonya · Alman işgali',
        'Polonya · Alman işgali',
      ]);
      expect(told(23.69, 52.1, 1941)).toBe('Doğu Polonya · Sovyet işgali'); // Brest-Litovsk, where Barbarossa began
      expect(told(23.69, 52.1, 1942)).toBe('Polonya · Alman işgali');
      expect(told(19.2, 50.03, 1942)).toBe('Polonya · Alman işgali'); // Oświęcim
    });

    it('Vilnius is Lithuania, not Poland, even though the data has it in the Polish shape of 1939', () => {
      expect(told(25.28, 54.69, 1942)).toBe('Litvanya · Alman işgali');
      expect(told(25.28, 54.69, 1940)).toBeNull(); // Soviet in the data, and the Soviet years of the Baltic are not named
      expect(told(23.9, 54.9, 1943)).toBe('Litvanya · Alman işgali'); // Kaunas
    });

    it('France: the north is German from 1940, the Vichy zone is not named until the Germans come, Menton is Italian', () => {
      expect(told(2.35, 48.86, 1941)).toBe('Fransa · Alman işgali'); // Paris
      expect(told(-0.58, 44.84, 1941)).toBe('Fransa · Alman işgali'); // Bordeaux
      expect(holderId(4.83, 45.76, 1941)).toBe('vichy-france');
      expect(told(4.83, 45.76, 1941)).toBeNull(); // Lyon
      expect(told(4.83, 45.76, 1942)).toBeNull();
      expect(told(4.83, 45.76, 1943)).toBe('Fransa · Alman işgali');
      expect(told(5.37, 43.3, 1943)).toBe('Fransa · Alman işgali'); // Marseille
      expect(told(7.5, 43.78, 1941)).toBe('Fransa · İtalyan işgali'); // Menton
      expect(told(2.35, 48.86, 1945)).toBeNull();
    });

    it('Greece: German in 1941, Italian in Athens in 1942–43, German again in 1944, free in 1945', () => {
      expect([1940, 1941, 1942, 1943, 1944, 1945].map((y) => told(23.73, 37.98, y))).toEqual([
        null,
        'Yunanistan · Alman işgali',
        'Yunanistan · İtalyan işgali',
        'Yunanistan · İtalyan işgali',
        'Yunanistan · Alman işgali',
        null,
      ]);
    });

    it('the Balkans: Belgrade German, Podgorica Italian, Zagreb (a client state) and Skopje (Bulgarian) not named', () => {
      expect(told(20.46, 44.82, 1942)).toBe('Yugoslavya · Alman işgali');
      expect(told(19.26, 42.44, 1942)).toBe('Yugoslavya · İtalyan işgali');
      expect(told(15.98, 45.81, 1942)).toBeNull();
      expect(told(21.43, 42.0, 1942)).toBeNull();
      expect(told(19.82, 41.33, 1941)).toBe('Arnavutluk · İtalyan işgali'); // Tirana
      expect(told(19.82, 41.33, 1944)).toBeNull();
    });

    it('the countries of the west and the north, from the year the data draws them as German', () => {
      expect(told(4.9, 52.37, 1942)).toBe('Hollanda · Alman işgali');
      expect(told(4.35, 50.85, 1942)).toBe('Belçika · Alman işgali');
      expect(told(6.13, 49.61, 1942)).toBe('Lüksemburg · Alman işgali');
      expect(told(10.75, 59.91, 1942)).toBe('Norveç · Alman işgali'); // Oslo
      expect(told(10.75, 59.91, 1940)).toBeNull(); // the data still draws Norway in 1940
      expect(told(10.0, 56.2, 1942)).toBe('Danimarka · Alman işgali');
      expect(told(14.42, 50.08, 1941)).toBe('Bohemya ve Moravya · Alman işgali'); // Prague
      expect(told(14.42, 50.08, 1938)).toBeNull();
    });

    it('Slovakia, the Sudetenland, Danzig and Klaipėda, which the data draws as German, are not named occupied', () => {
      expect(holderId(17.1, 48.15, 1942)).toBe('nazi-germany'); // Bratislava
      expect(told(17.1, 48.15, 1942)).toBeNull();
      expect(told(15.06, 50.77, 1942)).toBeNull(); // Liberec
      expect(told(18.65, 54.35, 1942)).toBeNull(); // Danzig
      expect(told(21.13, 55.71, 1942)).toBeNull(); // Klaipėda
    });

    it('the Baltic and the Soviet lands are named in the years the data draws them as German', () => {
      expect(told(24.1, 56.95, 1942)).toBe('Letonya · Alman işgali'); // Riga
      expect(told(24.1, 56.95, 1941)).toBeNull();
      expect(told(24.75, 59.44, 1943)).toBe('Estonya · Alman işgali'); // Tallinn
      expect(told(30.52, 50.45, 1942)).toBe('Ukrayna · Alman işgali'); // Kyiv
      expect(told(30.52, 50.45, 1944)).toBeNull();
      expect(told(27.57, 53.9, 1943)).toBe('Belarus · Alman işgali'); // Minsk
      expect(told(27.57, 53.9, 1944)).toBeNull();
      expect(told(32.04, 54.78, 1942)).toBe('Rusya · Alman işgali'); // Smolensk
      expect(told(44.52, 48.71, 1942)).toBeNull(); // Stalingrad stays Soviet
      expect(told(37.62, 55.75, 1942)).toBeNull(); // Moscow
    });

    it('Germany itself is not occupied: Berlin, Munich and Vienna are named nothing in 1942', () => {
      expect(told(13.4, 52.52, 1942)).toBeNull();
      expect(told(11.58, 48.14, 1942)).toBeNull();
      expect(told(16.37, 48.21, 1942)).toBeNull();
      expect(told(13.4, 52.52, 1945)).toBeNull();
    });

    it('Asia: Nanjing, Manila, Jakarta, Rangoon, Hanoi, Kuala Lumpur and Singapore, in the years the data draws them as Japanese', () => {
      expect(told(118.8, 32.06, 1940)).toBe('Çin · Japon işgali'); // Nanjing
      expect(told(118.8, 32.06, 1946)).toBeNull();
      expect(told(120.98, 14.6, 1943)).toBe('Filipinler · Japon işgali');
      expect(told(120.98, 14.6, 1941)).toBeNull();
      expect(told(120.98, 14.6, 1945)).toBeNull();
      expect(told(106.85, -6.2, 1943)).toBe('Hollanda Doğu Hint Adaları · Japon işgali');
      expect(told(106.85, -6.2, 1942)).toBeNull(); // the data still draws the Indies as Dutch in 1942
      expect(told(96.15, 16.8, 1943)).toBe('Burma · Japon işgali');
      expect(told(96.15, 16.8, 1945)).toBeNull();
      expect(told(105.85, 21.03, 1942)).toBe("Fransız Çinhindi'si · Japon işgali"); // Hanoi
      expect(told(106.7, 10.78, 1942)).toBeNull(); // Saigon: the data keeps it French
      expect(told(101.69, 3.14, 1943)).toBe('Malaya · Japon işgali');
      expect(told(103.82, 1.35, 1943)).toBe('Singapur · Japon işgali');
      expect(told(103.82, 1.35, 1941)).toBeNull();
      expect(told(103.75, 1.49, 1943)).toBe('Malaya · Japon işgali'); // Johor Bahru, across the strait
      expect(told(110.34, 1.55, 1943)).toBe('İngiliz Borneosu · Japon işgali'); // Kuching
      expect(told(114.17, 22.27, 1943)).toBe('Hong Kong · Japon işgali');
      expect(told(114.17, 22.27, 1941)).toBeNull(); // still British
      expect(told(114.17, 22.27, 1946)).toBeNull();
      expect(told(125.57, -8.55, 1943)).toBe('Doğu Timor · Japon işgali'); // Dili
      expect(told(139.7, 35.7, 1943)).toBeNull(); // Tokyo
      expect(told(126.98, 37.57, 1943)).toBeNull(); // Seoul
      expect(told(95.0, 13.0, 1943)).toBeNull(); // sea
    });

    it('puts the names the page needs at the places of its own events', () => {
      const where = (id: string) => data.eventsById.get(id)!.location;
      const loc = (id: string, year: number) => told(where(id).lon, where(id).lat, year);
      expect(loc('barbarossa-1941', 1941)).toBe('Doğu Polonya · Sovyet işgali');
      expect(loc('varsova-getto-ayaklanmasi-1943', 1943)).toBe('Polonya · Alman işgali');
      expect(loc('anne-frank-saklanma-1942', 1942)).toBe('Hollanda · Alman işgali');
      expect(loc('singapur-dususu-1942', 1942)).toBe('Singapur · Japon işgali');
      expect(loc('paris-isgali-1940', 1940)).toBe('Fransa · Alman işgali');
      expect(loc('berlin-muharebesi-1945', 1945)).toBeNull();
      expect(loc('dresden-bombardimani-1945', 1945)).toBeNull();
      expect(holderId(where('almanya-teslimi-1945').lon, where('almanya-teslimi-1945').lat, 1945)).toBe('nazi-germany');
    });

    it('puts one name tag per occupied land on the map, each where an occupier holds the tag point', () => {
      const holder = (year: number) => (lon: number, lat: number) =>
        primaryAt(rowsContaining(data.rows, lon, lat), year);
      const ids = (year: number) =>
        data.occupations
          .labels(year, holder(year))
          .map((l) => l.id)
          .sort();
      expect(ids(1937)).toEqual([]);
      expect(ids(1938)).toEqual(['cin']);
      expect(ids(1939)).toEqual(['arnavutluk', 'bohemya-moravya', 'cin']);
      expect(ids(1941)).toEqual(
        [
          'arnavutluk',
          'bohemya-moravya',
          'belcika',
          'cin',
          'danimarka',
          'dogu-polonya',
          'fransa',
          'fransiz-cinhindisi',
          'hollanda',
          'luksemburg',
          'norvec',
          'polonya',
          'yugoslavya',
          'yunanistan',
        ].sort(),
      );
      expect(ids(1942)).toEqual(
        [
          'arnavutluk',
          'belarus',
          'belcika',
          'bohemya-moravya',
          'cin',
          'danimarka',
          'dogu-timor',
          'estonya',
          'filipinler',
          'fransa',
          'fransiz-cinhindisi',
          'hollanda',
          'hong-kong',
          'ingiliz-borneosu',
          'letonya',
          'litvanya',
          'litvanya-vilnius',
          'luksemburg',
          'malaya',
          'norvec',
          'polonya',
          'rusya',
          'singapur',
          'ukrayna',
          'yugoslavya',
          'yunanistan',
        ].sort(),
      );
      // the Soviet lands are Soviet again, Albania has its own row, and the Baltic is still German
      expect(ids(1944)).not.toContain('ukrayna');
      expect(ids(1944)).not.toContain('arnavutluk');
      expect(ids(1944)).toContain('letonya');
      expect(ids(1945)).toEqual(
        [
          'cin',
          'dogu-timor',
          'fransiz-cinhindisi',
          'hollanda-dogu-hint-adalari',
          'hong-kong',
          'ingiliz-borneosu',
          'malaya',
          'singapur',
        ].sort(),
      );
      expect(ids(1946)).toEqual([]);
      for (const year of [1939, 1940, 1941, 1942, 1943, 1944, 1945]) {
        for (const tag of data.occupations.labels(year, holder(year))) {
          const entry = doc.occupations!.find((o) => o.id === tag.id)!;
          const held = holder(year)(tag.lon, tag.lat)!;
          expect(entry.occupiers, `${tag.id} ${year}`).toContain(held.id);
          expect(tag.occupier).toBe(held.id);
          expect(tag.label.length).toBeGreaterThan(3);
          expect(tag.area).toBeGreaterThan(500);
          // a tag is sized like a polity's name: a land cut from the Soviet Union's 22 million km² is not that big
          if (entry.box) expect(tag.area, `${tag.id} ${year}`).toBeLessThan(2_000_000);
        }
      }
    });

    it('a place is told as the same land that its tag names: the first entry of the file is the entry itself at its tag point', () => {
      for (const o of doc.occupations!) {
        let applied = 0;
        for (let year = o.from; year <= o.to; year++) {
          const holder = holderAt(o.at[0], o.at[1], year);
          if (!holder || !o.occupiers.includes(holder.id)) continue;
          applied++;
          expect(data.occupations.at({ lon: o.at[0], lat: o.at[1] }, year, holder)?.id, `${o.id} ${year}`).toBe(o.id);
        }
        expect(applied, `${o.id} applies in at least one year`).toBeGreaterThan(0);
      }
    });
  });

  describe('the file itself', () => {
    it('explains itself: what it is, what it leaves, a note and a source for every entry', () => {
      expect(doc.meta.title).toMatch(/\S/);
      expect(doc.meta.note).toContain('Cliopatria');
      expect(doc.meta.sources!.length).toBeGreaterThanOrEqual(2);
      expect(doc.meta.knownGaps!.length).toBeGreaterThanOrEqual(5);
      for (const c of doc.rows!) {
        expect(c.note.length, `${c.id} ${c.from}`).toBeGreaterThan(80);
        expect(c.source.length, `${c.id} ${c.from}`).toBeGreaterThan(8);
      }
      for (const o of doc.occupations!) {
        expect(o.note.length, o.id).toBeGreaterThan(40);
        expect(o.source.length, o.id).toBeGreaterThan(8);
        expect(o.id, o.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
      expect(new Set(doc.occupations!.map((o) => o.id)).size).toBe(doc.occupations!.length);
    });

    it('names a word for every occupier it uses, and no polity that is not in the data', () => {
      const used = new Set(doc.occupations!.flatMap((o) => o.occupiers));
      expect([...used].sort()).toEqual(
        ['empire-of-japan', 'kingdom-of-italy', 'nazi-germany', 'union-of-soviet-socialist-republics'].sort(),
      );
      for (const id of used) {
        expect(doc.occupierLabels![id], id).toMatch(/işgali$/);
        expect(data.entities.has(id), id).toBe(true);
      }
    });

    it('has boxes that do not overlap within an entry (the area of a tag adds them up)', () => {
      for (const o of doc.occupations!) {
        const boxes = boxesOf(o.box) ?? [];
        for (let a = 0; a < boxes.length; a++) {
          for (let b = a + 1; b < boxes.length; b++) {
            const [p, q] = [boxes[a]!, boxes[b]!];
            expect(p[0] < q[2] && q[0] < p[2] && p[1] < q[3] && q[1] < p[3], `${o.id}: ${a}/${b}`).toBe(false);
          }
        }
      }
    });
  });
});

/* -------------------------------------------------------------------------- the validator */

describe('the validator of the layer (scripts/validate-corrections.mjs)', () => {
  const root = join(__dirname, '..', 'public', 'data');
  const entities = (JSON.parse(readFileSync(join(root, 'entities.json'), 'utf8')) as { entities: unknown }).entities;
  const borders = JSON.parse(readFileSync(join(root, 'borders', 'cliopatria-1800-2000.json'), 'utf8')) as unknown;
  const ctx = { entities, borders, range: [1800, 2000] };
  const shipped = readFileSync(join(root, 'corrections', 'ww2.json'), 'utf8');
  const dirs: string[] = [];
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  type Doc = {
    meta: { note?: string };
    rows: { op: string; id: string; from: number; of?: { year: number }; note?: string; polygons?: number[][][][] }[];
    occupierLabels: Record<string, string>;
    occupations: Record<string, unknown>[];
  };

  /** The validator's errors for the shipped file after a change to it. */
  const errorsAfter = (change: (d: Doc) => void): string[] => {
    const d = JSON.parse(shipped) as Doc;
    change(d);
    const dir = mkdtempSync(join(tmpdir(), 'corrections-'));
    dirs.push(dir);
    mkdirSync(join(dir, 'corrections'));
    writeFileSync(join(dir, 'corrections', 'ww2.json'), JSON.stringify(d));
    return (validateCorrections(dir, ctx) as { errors: string[] }).errors;
  };

  it('finds the shipped file valid, and says in which years each occupation really applies at its tag point', () => {
    const { errors, warnings, stats } = validateCorrections(root, ctx) as {
      errors: string[];
      warnings: string[];
      stats: { occupations: number; rowCorrections: number; occupationYears: Record<string, string> };
    };
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(stats.rowCorrections).toBe(3);
    expect(stats.occupations).toBe(29);
    expect(stats.occupationYears).toMatchObject({
      polonya: '1940–1944',
      'dogu-polonya': '1940–1941',
      fransa: '1940–1944',
      yunanistan: '1941–1944',
      belarus: '1942–1943',
      cin: '1938–1945',
      singapur: '1942–1945',
      'hong-kong': '1942–1945',
      'dogu-timor': '1942–1945',
    });
  });

  it('has nothing to check in a period without a layer', () => {
    const dir = mkdtempSync(join(tmpdir(), 'corrections-'));
    dirs.push(dir);
    expect(validateCorrections(dir, ctx)).toEqual({ errors: [], warnings: [], stats: { corrections: 0 } });
  });

  it('reads the entities and the border file itself when it is not given them', () => {
    expect((validateCorrections(root) as { errors: string[] }).errors).toEqual([]);
  });

  it('refuses what the data cannot back', () => {
    const has = (errors: string[], pattern: RegExp) =>
      expect(
        errors.some((e) => pattern.test(e)),
        String(pattern),
      ).toBe(true);
    has(
      errorsAfter((d) => (d.rows[0]!.id = 'atlantis')),
      /devlet değil/,
    );
    has(
      errorsAfter((d) => (d.rows[0]!.of!.year = 1900)),
      /kaynak satır yok/,
    );
    has(
      errorsAfter((d) => {
        const ring = d.rows[1]!.polygons![0]![0]!;
        ring.pop();
      }),
      /kapalı değil/,
    );
    has(
      errorsAfter((d) => delete d.rows[1]!.note),
      /note eksik/,
    );
    has(
      errorsAfter((d) => (d.rows[1]!.from = 1990)),
      /geçerli bir yıl aralığı|dışında/,
    );
    has(
      errorsAfter((d) => (d.occupations[0]!.area = { id: 'polonya', year: 1939 })),
      /area için satır yok/,
    );
    has(
      errorsAfter((d) => (d.occupations[3]!.area = { id: 'second-polish-republic', year: 1950 })),
      /area için satır yok/,
    );
    has(
      errorsAfter((d) => delete d.occupations[2]!.source),
      /source eksik/,
    );
    has(
      errorsAfter((d) => (d.occupations[1]!.id = d.occupations[0]!.id)),
      /id yinelenmiş/,
    );
    has(
      errorsAfter((d) => (d.occupations[1]!.id = 'Dogu Polonya')),
      /kebab-case/,
    );
    has(
      errorsAfter((d) => (d.occupations[1]!.occupiers = ['atlantis'])),
      /devlet değil/,
    );
    has(
      errorsAfter((d) => (d.occupations[1]!.at = [100, 10])),
      /dışında/,
    );
    has(
      errorsAfter((d) => (d.occupations[1]!.occupiers = ['empire-of-japan'])),
      /hiçbirinde .* işgalci tutmuyor/,
    );
    has(
      errorsAfter((d) => {
        const e = d.occupations.find((o) => o.id === 'belarus')!;
        e.box = [
          [23.1, 51.6, 28.0, 54.45],
          [27.0, 51.6, 31.0, 56.2],
        ];
      }),
      /üst üste biniyor/,
    );
    has(
      errorsAfter((d) => (d.occupierLabels['atlantis'] = 'x')),
      /devlet değil/,
    );
    has(
      errorsAfter((d) => delete d.meta.note),
      /meta.note/,
    );
  });
});
