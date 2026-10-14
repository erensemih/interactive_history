import { mercator } from './camera';
import type { Bounds, PolygonCoords } from './types';

/**
 * Who held which ground in a year, as a raster: the borders of a year laid on a grid, each cell the polity whose land it
 * lies in. Two years' grids give what a polity gained and lost between them (`changeOf`). A grid is in Web Mercator, like
 * the map, so a mask made from it lies on the map as it is; it is as fine as `maxSide` cells along its longer side allow
 * (a region of a few hundred kilometres is a few hundred cells across).
 */
export interface OwnerGrid {
  /** The region it covers, in degrees (west, south, east, north). */
  bounds: Bounds;
  width: number;
  height: number;
  /** The polity of each cell, as an index into `ids` plus one; 0 where no polity holds it. Rows run north to south. */
  cells: Uint16Array;
  ids: readonly string[];
}

/** One polity's land in one year: what a grid is made of. */
export interface LandRow {
  id: string;
  /** Square kilometres, only used to put the small pieces over the big ones. */
  area?: number;
  polys: readonly PolygonCoords[];
}

/** The cells a region of the map is cut into: `maxSide` along the longer side, as many along the other as keep the cells square. */
export function gridSize(bounds: Bounds, maxSide = 1600): { width: number; height: number } {
  const nw = mercator(bounds[0], bounds[3]);
  const se = mercator(bounds[2], bounds[1]);
  const w = Math.max(1e-9, se.x - nw.x);
  const h = Math.max(1e-9, se.y - nw.y);
  const width = w >= h ? maxSide : Math.max(8, Math.round((maxSide * w) / h));
  const height = w >= h ? Math.max(8, Math.round((maxSide * h) / w)) : maxSide;
  return { width, height };
}

/**
 * The ground of `rows` on a grid over `bounds` (each polygon filled by the even-odd rule, so its holes are holes; where two
 * rows overlap the smaller one lies on top). `ids` fixes the numbering of the polities, so grids of two years can be compared.
 */
export function rasterize(
  rows: readonly LandRow[],
  bounds: Bounds,
  size: { width: number; height: number },
  ids: readonly string[] = [...new Set(rows.map((r) => r.id))],
): OwnerGrid {
  const { width, height } = size;
  const cells = new Uint16Array(width * height);
  const nw = mercator(bounds[0], bounds[3]);
  const se = mercator(bounds[2], bounds[1]);
  const sx = width / Math.max(1e-9, se.x - nw.x);
  const sy = height / Math.max(1e-9, se.y - nw.y);
  const index = new Map(ids.map((id, i) => [id, i + 1]));
  const biggestFirst = [...rows].sort((a, b) => (b.area ?? 0) - (a.area ?? 0));
  for (const row of biggestFirst) {
    const owner = index.get(row.id);
    if (!owner) continue;
    for (const poly of row.polys) {
      const crossings = new Map<number, number[]>();
      for (const ring of poly) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const a = ring[j]!;
          const b = ring[i]!;
          const pa = mercator(a[0]!, a[1]!);
          const pb = mercator(b[0]!, b[1]!);
          let x0 = (pa.x - nw.x) * sx;
          let y0 = (pa.y - nw.y) * sy;
          let x1 = (pb.x - nw.x) * sx;
          let y1 = (pb.y - nw.y) * sy;
          if (y0 === y1) continue;
          if (y0 > y1) [x0, y0, x1, y1] = [x1, y1, x0, y0];
          // the scanlines whose centre (y + 0.5) the edge crosses
          const first = Math.max(0, Math.ceil(y0 - 0.5));
          const last = Math.min(height - 1, Math.ceil(y1 - 0.5) - 1);
          for (let y = first; y <= last; y++) {
            const x = x0 + ((y + 0.5 - y0) / (y1 - y0)) * (x1 - x0);
            const list = crossings.get(y);
            if (list) list.push(x);
            else crossings.set(y, [x]);
          }
        }
      }
      for (const [y, xs] of crossings) {
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const from = Math.max(0, Math.ceil(xs[k]! - 0.5));
          const to = Math.min(width - 1, Math.ceil(xs[k + 1]! - 0.5) - 1);
          for (let x = from; x <= to; x++) cells[y * width + x] = owner;
        }
      }
    }
  }
  return { bounds, width, height, cells, ids };
}

/** What a polity gained and lost between two grids over the same region: a mask for each (1 where it did). */
export interface TerritoryMasks {
  width: number;
  height: number;
  bounds: Bounds;
  gained: Uint8Array;
  lost: Uint8Array;
  gainedCells: number;
  lostCells: number;
}

/** The ground `id` has in `after` and had not in `before` (gained), and the ground it had in `before` and has not in `after` (lost). */
export function changeOf(before: OwnerGrid, after: OwnerGrid, id: string): TerritoryMasks {
  const owner = before.ids.indexOf(id) + 1;
  const gained = new Uint8Array(after.cells.length);
  const lost = new Uint8Array(after.cells.length);
  let gainedCells = 0;
  let lostCells = 0;
  if (owner > 0 && before.cells.length === after.cells.length) {
    for (let i = 0; i < after.cells.length; i++) {
      const was = before.cells[i] === owner;
      const is = after.cells[i] === owner;
      if (is && !was) {
        gained[i] = 1;
        gainedCells++;
      } else if (was && !is) {
        lost[i] = 1;
        lostCells++;
      }
    }
  }
  return { width: after.width, height: after.height, bounds: after.bounds, gained, lost, gainedCells, lostCells };
}

/** The cells whose holder is not the same in the two grids (a polity of one year that the other does not have counts as nobody). */
export function changedCells(before: OwnerGrid, after: OwnerGrid): { mask: Uint8Array; count: number } {
  const mask = new Uint8Array(after.cells.length);
  let count = 0;
  if (before.cells.length !== after.cells.length) return { mask, count };
  for (let i = 0; i < after.cells.length; i++) {
    if (before.cells[i] !== after.cells[i]) {
      mask[i] = 1;
      count++;
    }
  }
  return { mask, count };
}

/** The box of the polygons of two rows together (west, south, east, north), grown by a margin and kept inside the map. */
export function regionOf(rows: readonly { box: Bounds }[], margin = 0.04): Bounds | null {
  if (!rows.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const r of rows) {
    w = Math.min(w, r.box[0]);
    s = Math.min(s, r.box[1]);
    e = Math.max(e, r.box[2]);
    n = Math.max(n, r.box[3]);
  }
  const dx = (e - w) * margin + 0.3;
  const dy = (n - s) * margin + 0.3;
  return [Math.max(-179.9, w - dx), Math.max(-60, s - dy), Math.min(179.9, e + dx), Math.min(82, n + dy)];
}

/** The longitude and latitude of the middle of a cell (for tests and for placing a label on a mask). */
export function cellCentre(grid: Pick<OwnerGrid, 'bounds' | 'width' | 'height'>, x: number, y: number) {
  const nw = mercator(grid.bounds[0], grid.bounds[3]);
  const se = mercator(grid.bounds[2], grid.bounds[1]);
  const mx = nw.x + ((x + 0.5) / grid.width) * (se.x - nw.x);
  const my = nw.y + ((y + 0.5) / grid.height) * (se.y - nw.y);
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
  return { lon: mx * 360 - 180, lat };
}
