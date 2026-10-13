import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { FeatureCollection, Geometry } from 'geojson';
import { describe, expect, it } from 'vitest';
import { decodeBorders, decodeGeometry, encodeGeometry } from '../src/data/borderCodec';
import { polysOf } from '../src/data/borderStore';
import { gunzipBase64 } from '../src/data/gzip';

const collection = (meta: Record<string, unknown> | undefined, geometries: unknown[]) =>
  ({
    type: 'FeatureCollection',
    ...(meta ? { meta } : {}),
    features: geometries.map((geometry) => ({ type: 'Feature', properties: {}, geometry })),
  }) as unknown as FeatureCollection<Geometry> & { meta?: { encoding?: string; scale?: number } };

describe('compact border files', () => {
  it('turns step-encoded rings back into closed GeoJSON rings', () => {
    // (10.00, 20.00) -> +1.00 east -> +1.00 north -> 1.00 west, closing point left out
    const fc = collection({ encoding: 'delta-int', scale: 100 }, [
      { type: 'Polygon', coordinates: [[1000, 2000, 100, 0, 0, 100, -100, 0]] },
    ]);
    decodeBorders(fc);
    expect((fc.features[0]!.geometry as { coordinates: unknown }).coordinates).toEqual([
      [
        [10, 20],
        [11, 20],
        [11, 21],
        [10, 21],
        [10, 20],
      ],
    ]);
  });

  it('keeps holes and every part of a multipolygon, and negative coordinates', () => {
    const fc = collection({ encoding: 'delta-int', scale: 100 }, [
      {
        type: 'MultiPolygon',
        coordinates: [
          [
            [-500, -300, 200, 0, 0, 200, -200, 0],
            [-450, -250, 50, 0, 0, 50],
          ],
          [[1234, 5678, 1, 0, 0, 1]],
        ],
      },
    ]);
    decodeBorders(fc);
    const parts = (fc.features[0]!.geometry as unknown as { coordinates: number[][][][] }).coordinates;
    expect(parts).toHaveLength(2);
    expect(parts[0]).toHaveLength(2);
    expect(parts[0]![0]![0]).toEqual([-5, -3]);
    expect(parts[0]![0]![2]).toEqual([-3, -1]);
    expect(parts[0]![1]![0]).toEqual([-4.5, -2.5]);
    // 1234 / 100 is the same double as the text "12.34": no drift from the integer form
    expect(parts[1]![0]![0]![0]).toBe(12.34);
    for (const ring of parts.flat()) expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('leaves plain GeoJSON alone, and decoding twice is harmless', () => {
    const plain = collection({}, [
      {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    ]);
    const before = JSON.stringify(plain);
    decodeBorders(plain);
    expect(JSON.stringify(plain)).toBe(before);

    const encoded = collection({ encoding: 'delta-int', scale: 100 }, [
      { type: 'Polygon', coordinates: [[0, 0, 100, 0, 0, 100]] },
    ]);
    decodeBorders(encoded);
    const once = JSON.stringify(encoded);
    decodeBorders(encoded);
    expect(JSON.stringify(encoded)).toBe(once);
    expect(encoded.meta?.encoding).toBeUndefined();
  });
});

describe('encoding a shape the way the border file holds it', () => {
  const square = (x: number, y: number, side: number): number[][] => [
    [x, y],
    [x + side, y],
    [x + side, y + side],
    [x, y + side],
    [x, y],
  ];

  it('makes one polygon a Polygon and several a MultiPolygon, rings as flat step lists with no closing point', () => {
    const one = encodeGeometry([[square(10, 20, 1)]], 100) as unknown as { type: string; coordinates: number[][][] };
    expect(one.type).toBe('Polygon');
    expect(one.coordinates).toEqual([[1000, 2000, 100, 0, 0, 100, -100, 0]]);
    const two = encodeGeometry([[square(10, 20, 1)], [square(-5, -3, 2)]], 100) as unknown as {
      type: string;
      coordinates: number[][][][];
    };
    expect(two.type).toBe('MultiPolygon');
    expect(two.coordinates).toHaveLength(2);
    expect(two.coordinates[1]![0]).toEqual([-500, -300, 200, 0, 0, 200, -200, 0]);
  });

  it('is the inverse of the decoder: what goes in comes out, closed, holes and negative numbers included', () => {
    const polygons = [
      [square(-5, -3, 2), square(-4.5, -2.5, 0.5)], // a hole
      [square(12.34, 56.78, 0.01)],
    ];
    const back = polysOf(decodeGeometry(encodeGeometry(polygons, 100), 100));
    expect(back).toEqual(polygons);
  });

  it('rounds to the grid, drops repeated points and accepts rings that are not closed', () => {
    const open = [
      [10.001, 20.004],
      [10.004, 20.001], // the same grid point as the one before
      [11, 20],
      [11, 21],
    ];
    const back = polysOf(decodeGeometry(encodeGeometry([[open]], 100), 100));
    expect(back).toEqual([
      [
        [
          [10, 20],
          [11, 20],
          [11, 21],
          [10, 20],
        ],
      ],
    ]);
  });

  it('refuses a ring without three distinct points and a shape without polygons', () => {
    expect(() =>
      encodeGeometry(
        [
          [
            [
              [0, 0],
              [1, 1],
              [0, 0],
            ],
          ],
        ],
        100,
      ),
    ).toThrow();
    expect(() => encodeGeometry([], 100)).toThrow();
  });

  it('gives back, row for row, the shapes the pipeline wrote into the real border file', () => {
    const file = JSON.parse(
      readFileSync(join(__dirname, '..', 'public', 'data', 'borders', 'cliopatria-1800-2000.json'), 'utf8'),
    ) as FeatureCollection<Geometry> & { meta: { scale: number } };
    expect(file.features.length).toBeGreaterThan(2500);
    let checked = 0;
    for (let i = 0; i < file.features.length; i += 20) {
      const encoded = file.features[i]!.geometry;
      const again = encodeGeometry(polysOf(decodeGeometry(encoded, file.meta.scale)), file.meta.scale);
      expect(again, `row ${i}`).toEqual(encoded);
      checked++;
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe('gzipped data blocks of the single-file build', () => {
  it('opens base64 + gzip back into the exact text, non-ASCII included', async () => {
    const text = JSON.stringify({ ad: 'Çanakkale Boğazı – İstanbul', n: [1, 2, 3] });
    const packed = gzipSync(Buffer.from(text), { level: 9 }).toString('base64');
    expect(await gunzipBase64(packed)).toBe(text);
    expect(await gunzipBase64(`  ${packed}\n`)).toBe(text);
  });
});
