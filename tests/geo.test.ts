import { describe, expect, it } from 'vitest';
import { boundsOf, pointInPolygon, primaryAt, resolvePlace, rowContains, sovereigntySegments } from '../src/domain/geo';
import type { BorderRow, Entity, PolygonCoords } from '../src/domain/types';

const square = (x: number, y: number, s: number): PolygonCoords => [
  [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]],
];

function row(id: string, from: number, to: number, area: number, poly: PolygonCoords, up: string[] = []): BorderRow {
  return { id, from, to, area, up, label: null, bbox: null, polys: [poly], box: boundsOf([poly]) };
}

describe('point in polygon', () => {
  const donut: PolygonCoords = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
  ];
  it('respects holes', () => {
    expect(pointInPolygon(2, 2, donut)).toBe(true);
    expect(pointInPolygon(5, 5, donut)).toBe(false);
    expect(pointInPolygon(11, 5, donut)).toBe(false);
  });
});

describe('who holds a place', () => {
  // A point (5,5) changes hands in 1468; a smaller enclave (vassal) overlaps it from 1450.
  const karaman = row('karaman', 1400, 1467, 100, square(0, 0, 10));
  const ottoman = row('ottoman', 1468, 1600, 900, square(0, 0, 20), ['umbrella']);
  const enclave = row('enclave', 1450, 1500, 5, square(4, 4, 2));
  const rows = [ottoman, karaman, enclave];
  const here = rows.filter((r) => rowContains(r, 5, 5));

  it('only includes rows containing the point', () => {
    expect(rowContains(karaman, 15, 15)).toBe(false);
    expect(here.map((r) => r.id).sort()).toEqual(['enclave', 'karaman', 'ottoman']);
  });

  it('picks the most specific polity valid in that year', () => {
    expect(primaryAt(here, 1420)?.id).toBe('karaman');
    expect(primaryAt(here, 1475)?.id).toBe('enclave');
    expect(primaryAt(here, 1550)?.id).toBe('ottoman');
    expect(primaryAt(here, 1399)).toBeNull();
  });

  it('builds contiguous sovereignty segments', () => {
    expect(sovereigntySegments(here, 1440, 1520)).toEqual([
      { id: 'karaman', from: 1440, to: 1449 },
      { id: 'enclave', from: 1450, to: 1500 },
      { id: 'ottoman', from: 1501, to: 1520 },
    ]);
  });

  it('lineage = holders over the window + their parents + regions', () => {
    const region: Entity = { id: 'anatolia', kind: 'region', name: 'Anadolu', bounds: [0, 0, 20, 20] };
    const res = resolvePlace(rows, [region], { lon: 5, lat: 5 }, 1520, { from: 1440, to: 1520 });
    expect(res.row?.id).toBe('ottoman');
    expect([...res.lineage].sort()).toEqual(['anatolia', 'enclave', 'karaman', 'ottoman', 'umbrella']);
  });

  it('blank land has no holder but still resolves regions', () => {
    const region: Entity = { id: 'caribbean', kind: 'region', name: 'Karayipler', bounds: [-90, 8, -58, 28] };
    const res = resolvePlace(rows, [region], { lon: -70, lat: 20 }, 1500, { from: 1490, to: 1510 });
    expect(res.row).toBeNull();
    expect(res.regions).toEqual(['caribbean']);
    expect(res.sequence).toEqual([]);
  });
});
