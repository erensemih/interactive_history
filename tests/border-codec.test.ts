import { gzipSync } from 'node:zlib';
import type { FeatureCollection, Geometry } from 'geojson';
import { describe, expect, it } from 'vitest';
import { decodeBorders } from '../src/data/borderCodec';
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

describe('gzipped data blocks of the single-file build', () => {
  it('opens base64 + gzip back into the exact text, non-ASCII included', async () => {
    const text = JSON.stringify({ ad: 'Çanakkale Boğazı – İstanbul', n: [1, 2, 3] });
    const packed = gzipSync(Buffer.from(text), { level: 9 }).toString('base64');
    expect(await gunzipBase64(packed)).toBe(text);
    expect(await gunzipBase64(`  ${packed}\n`)).toBe(text);
  });
});
