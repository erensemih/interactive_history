import type { Map as MLMap } from 'maplibre-gl';
import type { AppData } from '../data/load';
import {
  cellCentre,
  changeOf,
  changedCells,
  gridSize,
  rasterize,
  regionOf,
  type LandRow,
  type OwnerGrid,
  type TerritoryMasks,
} from '../domain/territory';
import type { BorderRow, Bounds } from '../domain/types';
import { mixHex, rgbOf } from './theme';

/** A change of borders to show: what `polity` gained and lost between two years of the border data. */
export interface ChangeFlash {
  /** The same key is the same flash: it plays once, and again only when the whole set is played again. */
  key: string;
  polity: string;
  from: number;
  to: number;
  /** The polity's colour on the map (an actor's, else its own tint). */
  color: string;
}

/** The coarse grid finds where a polity's borders moved; the fine one, over just that region, is what is drawn. */
const COARSE_SIDE = 480;
const FINE_SIDE = 1400;
const YEARS_SIDE = 900;
/** Years apart beyond which a change of borders is a different world, not a change worth pointing at. */
export const FLASH_MAX_YEARS = 25;
/** When more than this share of the land in view changed hands, the flash would cover the map and say nothing. */
const TOO_MUCH = 0.5;

/** How a flash looks in time (milliseconds): it comes at once, stays a moment, and fades. */
const COME_MS = 140;
const HOLD_MS = 900;
const FADE_MS = 1900;
const RETIRE_MS = 260;
/** With reduced motion nothing fades: the flash is there as long as its beat plays, a year change's for this long. */
const STILL_MS = 2200;
const STILL_OPACITY = 0.78;

interface Layer {
  id: string;
  /** The opacity it settles at while it holds. */
  peak: number;
  /** How long it holds before it fades. */
  hold: number;
}

interface Flash {
  key: string;
  layers: Layer[];
  timers: number[];
  gone: boolean;
}

const rowsOf = (data: Pick<AppData, 'rows'>, id: string, year: number): BorderRow[] =>
  data.rows.filter((r) => r.id === id && r.from <= year && year <= r.to);

const landOf = (rows: readonly BorderRow[]): LandRow[] => rows.map((r) => ({ id: r.id, area: r.area, polys: r.polys }));

/** The corners of a region in the order an image source wants them: north-west, north-east, south-east, south-west. */
const cornersOf = (b: Bounds): [[number, number], [number, number], [number, number], [number, number]] => [
  [b[0], b[3]],
  [b[2], b[3]],
  [b[2], b[1]],
  [b[0], b[1]],
];

/** The share of the changed cells that may lie beyond each edge of the region that is drawn: a few stray cells far away are noise. */
const STRAY = 0.015;

/**
 * The box of the cells some masks mark, as a region in degrees grown by a margin (null: no cell). The few cells that lie far from
 * all the others (a border redrawn by a hair in a place the change is not about) do not stretch it: a hundredth or so of the cells
 * at each edge is left out, so the region is where the change is.
 */
function boxOfCells(grid: Pick<OwnerGrid, 'bounds' | 'width' | 'height'>, masks: readonly Uint8Array[]): Bounds | null {
  const cols = new Uint32Array(grid.width);
  const rows = new Uint32Array(grid.height);
  let total = 0;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const at = y * grid.width + x;
      if (!masks.some((m) => m[at])) continue;
      cols[x]!++;
      rows[y]!++;
      total++;
    }
  }
  if (!total) return null;
  const strays = total >= 200 ? Math.floor(total * STRAY) : 0;
  const trimmed = (histogram: Uint32Array): [number, number] => {
    let lo = 0;
    let seen = 0;
    while (lo < histogram.length - 1 && seen + histogram[lo]! <= strays) seen += histogram[lo++]!;
    let hi = histogram.length - 1;
    seen = 0;
    while (hi > lo && seen + histogram[hi]! <= strays) seen += histogram[hi--]!;
    return [lo, hi];
  };
  const [x0, x1] = trimmed(cols);
  const [y0, y1] = trimmed(rows);
  const nw = cellCentre(grid, x0 - 0.5, y0 - 0.5);
  const se = cellCentre(grid, x1 + 0.5, y1 + 0.5);
  const dx = (se.lon - nw.lon) * 0.12 + 0.2;
  const dy = (nw.lat - se.lat) * 0.12 + 0.2;
  const b = grid.bounds;
  return [
    Math.max(b[0], nw.lon - dx),
    Math.max(b[1], se.lat - dy),
    Math.min(b[2], se.lon + dx),
    Math.min(b[3], nw.lat + dy),
  ];
}

/** The part two boxes have in common (null: they do not meet). */
function intersect(a: Bounds, b: Bounds): Bounds | null {
  const box: Bounds = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  return box[0] < box[2] && box[1] < box[3] ? box : null;
}

/**
 * What `polity` gained and lost between two years, over the smallest region that holds all of it: a coarse pass over the
 * polity's whole extent finds where its borders moved, a fine one over just that region gives the cells that are drawn.
 * With `within` (the part of the world that is in view) only what changed there is looked at: a polity's borders move a little
 * all along a coast and in far-off corners, and a change that is nowhere near the view is not what is being pointed at.
 */
export function territoryChange(
  data: Pick<AppData, 'rows'>,
  polity: string,
  from: number,
  to: number,
  within?: Bounds,
): { masks: TerritoryMasks; bounds: Bounds } | null {
  const before = rowsOf(data, polity, from);
  const after = rowsOf(data, polity, to);
  if (!before.length && !after.length) return null;
  const whole = regionOf([...before, ...after].map((r) => ({ box: r.box })));
  const region = whole && (within ? intersect(whole, within) : whole);
  if (!region) return null;
  const ids = [polity];
  const coarseSize = gridSize(region, COARSE_SIDE);
  const a = rasterize(landOf(before), region, coarseSize, ids);
  const b = rasterize(landOf(after), region, coarseSize, ids);
  const coarse = changeOf(a, b, polity);
  if (coarse.gainedCells + coarse.lostCells === 0) return null;
  const fineRegion = boxOfCells(a, [coarse.gained, coarse.lost]);
  if (!fineRegion) return null;
  const size = gridSize(fineRegion, FINE_SIDE);
  const masks = changeOf(
    rasterize(landOf(before), fineRegion, size, ids),
    rasterize(landOf(after), fineRegion, size, ids),
    polity,
  );
  if (masks.gainedCells + masks.lostCells === 0) return null;
  return { masks, bounds: fineRegion };
}

/** The ground that changed hands between two years within a region, as cells (null: none, or so much that it says nothing). */
export function yearsChange(
  data: Pick<AppData, 'rows'>,
  from: number,
  to: number,
  region: Bounds,
): { mask: Uint8Array; width: number; height: number; bounds: Bounds } | null {
  const valid = (year: number) => data.rows.filter((r) => r.from <= year && year <= r.to);
  const before = valid(from);
  const after = valid(to);
  const ids = [...new Set([...before, ...after].map((r) => r.id))];
  const size = gridSize(region, YEARS_SIDE);
  const a = rasterize(landOf(before), region, size, ids);
  const b = rasterize(landOf(after), region, size, ids);
  const { mask, count } = changedCells(a, b);
  if (!count) return null;
  let held = 0;
  for (let i = 0; i < b.cells.length; i++) if (a.cells[i] || b.cells[i]) held++;
  if (held && count / held > TOO_MUCH) return null;
  return { mask, width: size.width, height: size.height, bounds: region };
}

/** A canvas as a PNG the map can take as an image. */
function pngOf(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * The land a polity gained, as a lighter shade of its colour with a darker rim where it borders what it did not gain: the map under
 * it already shows the land in the polity's colour, so the flash is what stands out from that (and then fades into it).
 */
function gainedImage(masks: TerritoryMasks, color: string): string {
  const { width, height, gained } = masks;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const fill = rgbOf(mixHex(color, '#ffffff', 0.5));
  const rim = rgbOf(mixHex(color, '#1f1b16', 0.55));
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && gained[y * width + x] === 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!gained[y * width + x]) continue;
      const edge = !has(x - 1, y) || !has(x + 1, y) || !has(x, y - 1) || !has(x, y + 1);
      const rgb = edge ? rim : fill;
      const at = (y * width + x) * 4;
      img.data[at] = rgb[0];
      img.data[at + 1] = rgb[1];
      img.data[at + 2] = rgb[2];
      img.data[at + 3] = edge ? 255 : 215;
    }
  }
  ctx.putImageData(img, 0, 0);
  return pngOf(canvas);
}

/** Hatching over ground: bold diagonal stripes in a colour, with a pale wash between them. */
function hatchedImage(mask: Uint8Array, width: number, height: number, color: string, wash: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  const stripe = rgbOf(color);
  const pale = rgbOf('#f5f0e4');
  // the stripes keep their width on the screen however fine the grid is: a few cells, whatever the region
  const period = Math.max(7, Math.round(Math.min(width, height) / 70));
  const thick = Math.max(2, Math.round(period * 0.38));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      const on = (x + y) % period < thick;
      const rgb = on ? stripe : pale;
      const at = (y * width + x) * 4;
      img.data[at] = rgb[0];
      img.data[at + 1] = rgb[1];
      img.data[at + 2] = rgb[2];
      img.data[at + 3] = on ? 235 : Math.round(255 * wash);
    }
  }
  ctx.putImageData(img, 0, 0);
  return pngOf(canvas);
}

/**
 * Shows that borders changed. When a scene says a polity gained and lost land between two years, or the year the map shows
 * moves under a narration, the ground that changed hands is pointed at for a moment: what a polity gained comes in its
 * colour with a darker rim, what it lost (and, for a plain change of year, whatever changed hands) comes as stripes, and both
 * fade. The map underneath already shows the new borders; this is only the finger on what moved. With reduced motion they do
 * not fade: they are there while their beat plays.
 *
 * Each flash lies on the map as an image of its own, placed by its corners, so the map moves it with the borders. The region it
 * is drawn over is the smallest that holds what changed.
 */
export class TerritoryLayer {
  private readonly flashes = new Map<string, Flash>();
  private serial = 0;
  private years: Flash | null = null;
  /** The change flashes that were asked for last: the set is compared, not replayed. */
  private asked = '';

  constructor(
    private readonly map: MLMap,
    private readonly data: Pick<AppData, 'rows'>,
    private readonly reduced: () => boolean,
    /** Is the layer below which a flash is put on the map (so outlines stay above it). */
    private readonly before: string,
    /** The part of the world that is in view (or on its way into it), where what changed is pointed at. */
    private readonly inView: () => Bounds,
  ) {}

  /** The changes whose beat plays now (empty when none): the ones not shown yet come, the ones that are gone leave. */
  setChanges(flashes: readonly ChangeFlash[], replay: number) {
    const key = `${replay}|${flashes.map((f) => `${f.key}:${f.color}`).join(',')}`;
    if (key === this.asked) return;
    this.asked = key;
    const want = new Set(flashes.map((f) => `${f.key}|${replay}`));
    for (const [id, flash] of this.flashes) if (!want.has(id)) this.retire(flash, id);
    for (const f of flashes) {
      const id = `${f.key}|${replay}`;
      if (this.flashes.has(id)) continue;
      const flash: Flash = { key: id, layers: [], timers: [], gone: false };
      this.flashes.set(id, flash);
      // (the work is done after this frame: rasterising a polity's borders takes a moment)
      flash.timers.push(window.setTimeout(() => this.playChange(flash, f), 0));
    }
  }

  /** The year under a narration moved from `from` to `to`: whatever changed hands within `region` is pointed at. */
  flashYears(from: number, to: number, region: Bounds) {
    if (from === to || Math.abs(to - from) > FLASH_MAX_YEARS) return;
    this.clearYears();
    const flash: Flash = { key: `years|${from}|${to}|${++this.serial}`, layers: [], timers: [], gone: false };
    this.years = flash;
    flash.timers.push(
      window.setTimeout(() => {
        if (flash.gone) return;
        const found = yearsChange(this.data, from, to, region);
        if (!found) return;
        const url = hatchedImage(found.mask, found.width, found.height, '#1f1b16', 0.32);
        this.show(flash, [{ url, bounds: found.bounds, peak: 0.9, hold: HOLD_MS }], STILL_MS);
      }, 0),
    );
  }

  /** Nothing is flashing any more (the answer was closed, the scene changed). */
  clear() {
    this.asked = '';
    for (const [id, flash] of this.flashes) this.retire(flash, id);
    this.clearYears();
  }

  private clearYears() {
    if (!this.years) return;
    this.retire(this.years, null);
    this.years = null;
  }

  private playChange(flash: Flash, f: ChangeFlash) {
    if (flash.gone) return;
    const found = territoryChange(this.data, f.polity, f.from, f.to, this.inView());
    if (!found) return;
    const { masks, bounds } = found;
    const images: { url: string; bounds: Bounds; peak: number; hold: number }[] = [];
    if (masks.lostCells)
      images.push({
        url: hatchedImage(masks.lost, masks.width, masks.height, mixHex(f.color, '#1f1b16', 0.42), 0.3),
        bounds,
        peak: 0.95,
        hold: HOLD_MS * 0.7,
      });
    if (masks.gainedCells) images.push({ url: gainedImage(masks, f.color), bounds, peak: 0.92, hold: HOLD_MS });
    this.show(flash, images, null);
  }

  /** Puts the images on the map, brings them in, and lets them go (after `still` ms with reduced motion; null: when retired). */
  private show(
    flash: Flash,
    images: readonly { url: string; bounds: Bounds; peak: number; hold: number }[],
    still: number | null,
  ) {
    if (flash.gone || !images.length) return;
    const reduced = this.reduced();
    for (const image of images) {
      const id = `terr-${++this.serial}`;
      this.map.addSource(id, { type: 'image', url: image.url, coordinates: cornersOf(image.bounds) });
      this.map.addLayer(
        {
          id,
          type: 'raster',
          source: id,
          paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'linear' },
        },
        this.map.getLayer(this.before) ? this.before : undefined,
      );
      flash.layers.push({ id, peak: image.peak, hold: image.hold });
    }
    // The image arrives a moment after the source is added: the flash starts when it is on the map.
    const begin = () => {
      if (flash.gone) return;
      for (const layer of flash.layers) this.bringIn(flash, layer, reduced, still);
    };
    const ids = flash.layers.map((l) => l.id);
    const ready = () => ids.every((id) => !this.map.getSource(id) || this.map.isSourceLoaded(id));
    if (ready()) return begin();
    const onData = () => {
      if (flash.gone) return void this.map.off('sourcedata', onData);
      if (!ready()) return;
      this.map.off('sourcedata', onData);
      begin();
    };
    this.map.on('sourcedata', onData);
    flash.timers.push(window.setTimeout(() => this.map.off('sourcedata', onData), 4000));
  }

  private bringIn(flash: Flash, layer: Layer, reduced: boolean, still: number | null) {
    const set = (opacity: number, ms: number) => {
      if (!this.map.getLayer(layer.id)) return;
      this.map.setPaintProperty(layer.id, 'raster-opacity-transition', { duration: ms, delay: 0 });
      this.map.setPaintProperty(layer.id, 'raster-opacity', opacity);
    };
    if (reduced) {
      set(STILL_OPACITY, 0);
      if (still !== null) flash.timers.push(window.setTimeout(() => this.retire(flash, null), still));
      return;
    }
    set(layer.peak, COME_MS);
    flash.timers.push(
      window.setTimeout(() => set(0, FADE_MS), layer.hold),
      window.setTimeout(() => this.dropLayer(layer.id), layer.hold + FADE_MS + 240),
    );
  }

  private dropLayer(id: string) {
    if (this.map.getLayer(id)) this.map.removeLayer(id);
    if (this.map.getSource(id)) this.map.removeSource(id);
  }

  /** The flash ends: its images are taken off the map (they fade out quickly first, unless motion is reduced). */
  private retire(flash: Flash, id: string | null) {
    if (flash.gone) return;
    flash.gone = true;
    for (const t of flash.timers) window.clearTimeout(t);
    flash.timers = [];
    if (id !== null) this.flashes.delete(id);
    if (this.years === flash) this.years = null;
    const reduced = this.reduced();
    for (const layer of flash.layers) {
      if (reduced || !this.map.getLayer(layer.id)) {
        this.dropLayer(layer.id);
        continue;
      }
      this.map.setPaintProperty(layer.id, 'raster-opacity-transition', { duration: RETIRE_MS, delay: 0 });
      this.map.setPaintProperty(layer.id, 'raster-opacity', 0);
      window.setTimeout(() => this.dropLayer(layer.id), RETIRE_MS + 60);
    }
    flash.layers = [];
  }
}
