import { describe, expect, it } from 'vitest';
import {
  cellCentre,
  changedCells,
  changeOf,
  gridSize,
  rasterize,
  regionOf,
  type LandRow,
} from '../src/domain/territory';
import type { Bounds, PolygonCoords } from '../src/domain/types';
import { territoryChange, yearsChange } from '../src/map/territoryLayer';
import { mixHex, rgbOf } from '../src/map/theme';
import { shippedData } from './helpers/shipped';

/** A square of land (west, south, east, north) as a polygon. */
const square = (w: number, s: number, e: number, n: number): PolygonCoords => [
  [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ],
];
const REGION: Bounds = [0, 0, 10, 10];
const SIZE = { width: 20, height: 20 };
const at = (grid: { cells: Uint16Array; width: number }, x: number, y: number) => grid.cells[y * grid.width + x]!;

describe('gridSize', () => {
  it('has the longer side of a region at the size asked for, and cells that are square on the map', () => {
    const wide = gridSize([0, 0, 40, 10], 400);
    expect(wide.width).toBe(400);
    expect(wide.height).toBeLessThan(wide.width);
    const tall = gridSize([0, 0, 10, 40], 400);
    expect(tall.height).toBe(400);
    expect(tall.width).toBeLessThan(tall.height);
    // the map is Mercator: a degree of latitude is longer than a degree of longitude away from the equator
    const north = gridSize([0, 60, 20, 70], 400);
    expect(north.height).toBeGreaterThan(400 * (10 / 20));
  });
});

describe('rasterize', () => {
  it('lays each row’s land on a grid, a cell being the polity whose ground it lies in, and nobody’s where there is none', () => {
    const rows: LandRow[] = [{ id: 'a', polys: [square(0, 0, 5, 10)] }];
    const grid = rasterize(rows, REGION, SIZE);
    expect(grid.ids).toEqual(['a']);
    expect(at(grid, 2, 10)).toBe(1); // (x 2 of 20 is 1° east: inside the square)
    expect(at(grid, 15, 10)).toBe(0); // 7.5° east is outside it
    // about half the cells are the polity's
    const held = grid.cells.filter((c) => c === 1).length;
    expect(held).toBeGreaterThan(190);
    expect(held).toBeLessThan(210);
  });

  it('keeps the holes of a polygon holes, and lets the smaller of two rows lie on top', () => {
    const ring = square(1, 1, 9, 9)[0]!;
    const hole = square(4, 4, 6, 6)[0]!;
    const rows: LandRow[] = [
      { id: 'big', area: 100, polys: [[ring, hole]] },
      { id: 'small', area: 4, polys: [square(4.5, 4.5, 5.5, 5.5)] },
    ];
    const grid = rasterize(rows, REGION, SIZE);
    const owner = (x: number, y: number) => grid.ids[at(grid, x, y) - 1];
    expect(owner(4, 4)).toBe('big'); // (2.25° in from the edges: inside the big polygon)
    expect(owner(0, 0)).toBeUndefined(); // (outside)
    expect(owner(8, 9)).toBeUndefined(); // in the hole, outside the small polygon
    expect(owner(10, 10)).toBe('small'); // the small one lies in the hole
    // a small row on top of a big one's ground takes it over
    const over = rasterize(
      [
        { id: 'big', area: 100, polys: [[ring]] },
        { id: 'small', area: 4, polys: [square(4.5, 4.5, 5.5, 5.5)] },
      ],
      REGION,
      SIZE,
    );
    expect(over.ids[at(over, 10, 10) - 1]).toBe('small');
    expect(over.ids[at(over, 8, 9) - 1]).toBe('big');
  });

  it('numbers the polities as it is told, so grids of two years can be compared cell by cell', () => {
    const ids = ['x', 'a', 'y'];
    const grid = rasterize([{ id: 'a', polys: [square(0, 0, 10, 10)] }], REGION, SIZE, ids);
    expect(grid.ids).toBe(ids);
    expect(at(grid, 5, 5)).toBe(2);
  });
});

describe('changeOf and changedCells', () => {
  const before = rasterize([{ id: 'a', polys: [square(0, 0, 5, 10)] }], REGION, SIZE, ['a']);
  const after = rasterize([{ id: 'a', polys: [square(2, 0, 8, 10)] }], REGION, SIZE, ['a']);

  it('is what a polity gained and what it lost between two grids', () => {
    const c = changeOf(before, after, 'a');
    expect(c.gainedCells).toBeGreaterThan(0);
    expect(c.lostCells).toBeGreaterThan(0);
    // it gained the strip from 5° to 8° and lost the one from 0° to 2°: 3° and 2° wide, 10° tall, 2 cells to the degree
    expect(c.gainedCells).toBeGreaterThanOrEqual(110);
    expect(c.gainedCells).toBeLessThanOrEqual(130);
    expect(c.lostCells).toBeGreaterThanOrEqual(70);
    expect(c.lostCells).toBeLessThanOrEqual(90);
    expect(c.gained[10 * 20 + 13]).toBe(1); // 6.5° east
    expect(c.lost[10 * 20 + 1]).toBe(1); // 0.5° east
    expect(c.gained[10 * 20 + 1]).toBe(0);
    expect(c.lost[10 * 20 + 13]).toBe(0);
  });

  it('is nothing for a polity that was not in the grids, and for two grids of different sizes', () => {
    const none = changeOf(before, after, 'nobody');
    expect(none.gainedCells + none.lostCells).toBe(0);
    const other = rasterize([], REGION, { width: 10, height: 10 }, ['a']);
    expect(changeOf(before, other, 'a').gainedCells).toBe(0);
    expect(changedCells(before, other).count).toBe(0);
  });

  it('marks the cells whose holder is another in the later grid, whoever it is', () => {
    const b = rasterize([{ id: 'b', polys: [square(0, 0, 10, 10)] }], REGION, SIZE, ['a', 'b']);
    const c = rasterize(
      [
        { id: 'a', polys: [square(0, 0, 5, 10)] },
        { id: 'b', polys: [square(5, 0, 10, 10)] },
      ],
      REGION,
      SIZE,
      ['a', 'b'],
    );
    const { mask, count } = changedCells(b, c);
    expect(count).toBeGreaterThan(190); // the western half went from b to a
    expect(count).toBeLessThan(210);
    expect(mask[10 * 20 + 2]).toBe(1);
    expect(mask[10 * 20 + 15]).toBe(0);
    expect(changedCells(c, c).count).toBe(0);
  });
});

describe('regionOf and cellCentre', () => {
  it('is the box around some boxes, grown by a margin and kept inside the map', () => {
    expect(regionOf([])).toBeNull();
    const r = regionOf([{ box: [10, 20, 30, 40] }, { box: [25, 15, 50, 35] }], 0.1)!;
    expect(r[0]).toBeLessThan(10);
    expect(r[1]).toBeLessThan(15);
    expect(r[2]).toBeGreaterThan(50);
    expect(r[3]).toBeGreaterThan(40);
    const big = regionOf([{ box: [-180, -80, 180, 89] }])!;
    expect(big).toEqual([-179.9, -60, 179.9, 82]);
  });

  it('is where the middle of a cell lies on the map, the inverse of where the rasteriser put it', () => {
    const grid = { bounds: [0, 40, 20, 60] as Bounds, width: 100, height: 100 };
    const c = cellCentre(grid, 0, 0);
    expect(c.lon).toBeCloseTo(0.1, 6);
    expect(c.lat).toBeLessThan(60);
    expect(c.lat).toBeGreaterThan(59.8);
    const mid = cellCentre(grid, 49.5, 49.5);
    expect(mid.lon).toBeCloseTo(10, 6);
  });
});

describe('what the border data says changed hands (shipped data, 1800–2000)', () => {
  const data = shippedData();
  const cell = (m: { bounds: Bounds; width: number; height: number }, lon: number, lat: number) => {
    // the cell of a place in a mask (Mercator rows)
    const y = (p: number) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (p * Math.PI) / 360)) / (2 * Math.PI);
    const x0 = (m.bounds[0] + 180) / 360;
    const x1 = (m.bounds[2] + 180) / 360;
    const y0 = y(m.bounds[3]);
    const y1 = y(m.bounds[1]);
    const fx = ((lon + 180) / 360 - x0) / (x1 - x0);
    const fy = (y(lat) - y0) / (y1 - y0);
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return -1;
    return Math.floor(fy * m.height) * m.width + Math.floor(fx * m.width);
  };

  it('the Soviet Union gained the east of Poland and the Baltic lands from 1939 to 1940, and lost next to nothing', () => {
    const europe: Bounds = [-12, 35, 45, 62];
    const found = territoryChange(data, 'union-of-soviet-socialist-republics', 1939, 1940, europe)!;
    expect(found).not.toBeNull();
    const { masks } = found;
    expect(masks.lostCells).toBeLessThan(masks.gainedCells * 0.05); // (a few cells where a border was redrawn)
    expect(masks.gainedCells).toBeGreaterThan(1000);
    expect(masks.gained[cell(masks, 24.03, 49.84)]).toBe(1); // Lviv
    expect(masks.gained[cell(masks, 25.32, 54.68)]).toBe(1); // Vilnius
    expect(masks.gained[cell(masks, 37.6, 55.75)] ?? 0).toBe(0); // Moscow was always theirs (and lies outside the region of the change)
    expect(masks.gained[cell(masks, 21.0, 52.23)] ?? 0).toBe(0); // Warsaw was not: it went to the other side
    // the region is the part of the view where something moved, not the whole of the Union
    expect(found.bounds[2] - found.bounds[0]).toBeLessThan(45);
    expect(found.bounds[0]).toBeGreaterThanOrEqual(europe[0]);
    expect(found.bounds[2]).toBeLessThanOrEqual(europe[2]);
  });

  it('is only what changed in view: a change nowhere near it is not pointed at, and without a view it is all of it', () => {
    expect(territoryChange(data, 'union-of-soviet-socialist-republics', 1939, 1940, [-120, 25, -70, 50])).toBeNull();
    const all = territoryChange(data, 'union-of-soviet-socialist-republics', 1939, 1940)!;
    expect(all.masks.gainedCells).toBeGreaterThan(1000);
  });

  it('Germany lost, from 1944 to 1945, what the war had given it, and gained next to nothing', () => {
    const found = territoryChange(data, 'nazi-germany', 1944, 1945)!;
    expect(found.masks.gainedCells).toBeLessThan(found.masks.lostCells * 0.02);
    expect(found.masks.lostCells).toBeGreaterThan(1000);
    const warsaw = cell(found.masks, 21.0, 52.23);
    expect(found.masks.lost[warsaw]).toBe(1);
    expect(found.masks.lost[cell(found.masks, 13.4, 52.52)] ?? 0).toBe(0); // Berlin stayed
  });

  it('is nothing for a polity that did not change, or that is not there in either year', () => {
    expect(territoryChange(data, 'united-states-of-america', 1936, 1937)).toBeNull(); // the same rows
    expect(territoryChange(data, 'atlantis', 1939, 1940)).toBeNull();
    expect(territoryChange(data, 'second-polish-republic', 1941, 1942)).toBeNull(); // gone in both
  });

  it('shows what changed hands between two years within a region, and is nothing when nothing did', () => {
    const europe: Bounds = [-12, 35, 45, 62];
    const found = yearsChange(data, 1938, 1939, europe)!;
    expect(found).not.toBeNull();
    expect(found.mask.filter(Boolean).length).toBeGreaterThan(50);
    expect(yearsChange(data, 1936, 1937, [-12, 35, 20, 62])).toBeNull(); // (the same borders)
    expect(yearsChange(data, 1939, 1939, europe)).toBeNull();
  });

  it('is nothing when so much changed that pointing at it would cover the map', () => {
    expect(yearsChange(data, 1820, 1950, [-12, 35, 45, 62])).toBeNull();
  });
});

describe('colours', () => {
  it('reads #rrggbb and #rgb, and is grey for what it cannot read', () => {
    expect(rgbOf('#ff8000')).toEqual([255, 128, 0]);
    expect(rgbOf('#f80')).toEqual([255, 136, 0]);
    expect(rgbOf('nonsense')).toEqual([128, 128, 128]);
  });

  it('mixes two colours: nothing of the second at 0, all of it at 1', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#2f6fb8', '#1f1b16', 0)).toBe('#2f6fb8');
  });
});
