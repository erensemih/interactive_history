import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { boundsOf, isLand, primaryAt, resolvePlace, rowsContaining, type LandPart } from '../src/domain/geo';
import type { BorderRow, Entity, PolygonCoords } from '../src/domain/types';

/** The same questions the app asks, answered against the shipped border data. */
const dataDir = join(__dirname, '..', 'public', 'data');
const read = (p: string) => JSON.parse(readFileSync(join(dataDir, p), 'utf8'));

const polysOf = (g: { type: string; coordinates: unknown }): PolygonCoords[] =>
  g.type === 'Polygon' ? [g.coordinates as PolygonCoords] : (g.coordinates as PolygonCoords[]);

const borders = read('borders/cliopatria-1400-1600.json');
const rows: BorderRow[] = borders.features.map((f: { properties: BorderRow; geometry: never }) => {
  const polys = polysOf(f.geometry);
  return { ...f.properties, up: f.properties.up ?? [], polys, box: boundsOf(polys) };
});
const land: LandPart[] = read('geo/land.json').features.flatMap((f: { geometry: never }) =>
  polysOf(f.geometry).map((poly) => ({ poly, box: boundsOf([poly]) })),
);
const entitiesDoc = read('entities.json').entities as Record<
  string,
  { kind: Entity['kind']; name: { tr: string }; bounds?: Entity['bounds'] }
>;
const entities: Entity[] = Object.entries(entitiesDoc).map(([id, e]) => ({
  id,
  kind: e.kind,
  name: e.name.tr,
  bounds: e.bounds,
}));

const holder = (lon: number, lat: number, year: number) => primaryAt(rowsContaining(rows, lon, lat), year)?.id ?? null;

describe('who held a place (shipped Cliopatria data)', () => {
  it('Anatolia is Ottoman in 1500 and China is Ming', () => {
    expect(holder(33.2, 39.2, 1500)).toBe('ottoman-empire');
    expect(holder(35.5, 38.9, 1475)).toBe('ottoman-empire');
    expect(holder(112, 33, 1500)).toBe('ming-dynasty');
  });

  it('Konya changes hands: Karaman, then the Ottomans', () => {
    expect(holder(32.49, 37.87, 1450)).toBe('beylik-of-karaman');
    expect(holder(32.49, 37.87, 1475)).toBe('ottoman-empire');
  });

  it('borders move with time: Egypt is Mamluk in 1500, Ottoman in 1530', () => {
    expect(holder(31.2, 30.0, 1500)).toBe('mamluk-sultanate');
    expect(holder(31.2, 30.0, 1530)).toBe('ottoman-empire');
  });

  it('open sea belongs to nobody and is not land', () => {
    expect(holder(18, 35, 1500)).toBeNull();
    expect(isLand(land, 18, 35)).toBe(false);
    expect(isLand(land, 33.2, 39.2)).toBe(true);
  });

  it('umbrella parents are carried as lineage (Electorate of Saxony → Holy Roman Empire)', () => {
    const res = resolvePlace(rows, entities, { lon: 12.65, lat: 51.87 }, 1517, { from: 1517, to: 1517 });
    expect(res.row?.id).toBe('electorate-of-saxony');
    expect(res.lineage.has('holy-roman-empire')).toBe(true);
  });

  it('blank land in the Caribbean resolves to its region, not to a polity', () => {
    const res = resolvePlace(rows, entities, { lon: -74.5, lat: 24.1 }, 1492, { from: 1492, to: 1492 });
    expect(res.row).toBeNull();
    expect(res.regions).toContain('caribbean');
  });

  it('the Anatolian place has the Ottoman lineage over the whole window', () => {
    const res = resolvePlace(rows, entities, { lon: 35.5, lat: 38.9 }, 1500, { from: 1485, to: 1515 });
    expect(res.lineage.has('ottoman-empire')).toBe(true);
    expect(res.sequence).toEqual([{ id: 'ottoman-empire', from: 1485, to: 1515 }]);
  });
});
