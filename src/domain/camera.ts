import type { Bounds } from './types';
import type { Rect } from './reveal';

/** Where a map camera is: its centre and zoom (the map never rotates or tilts). */
export interface Camera {
  lng: number;
  lat: number;
  zoom: number;
}

export interface MapSize {
  width: number;
  height: number;
}

/** Pixels the world is wide at zoom 0 (MapLibre's tile size). */
const WORLD_PX = 512;
const MAX_MERCATOR_LAT = 85.0511;

/** Web Mercator, in world units: x and y both run 0..1 over the whole map. */
export function mercator(lng: number, lat: number): { x: number; y: number } {
  const phi = (Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat)) * Math.PI) / 180;
  return { x: (lng + 180) / 360, y: 0.5 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / (2 * Math.PI) };
}

/** Where a place lies on a map of `size` pixels looking through `camera` (the map's own projection, without the map). */
export function projectWith(camera: Camera, size: MapSize, lng: number, lat: number): { x: number; y: number } {
  const world = WORLD_PX * 2 ** camera.zoom;
  const c = mercator(camera.lng, camera.lat);
  const p = mercator(lng, lat);
  return { x: size.width / 2 + (p.x - c.x) * world, y: size.height / 2 + (p.y - c.y) * world };
}

/**
 * How far a camera has been taken from where the page left it: the pan as a share of the smaller side of the
 * map, and the zoom as levels. These are what "a small movement" and "a substantial one" are measured by.
 */
export function cameraDrift(from: Camera, to: Camera, size: MapSize): { pan: number; zoom: number } {
  const a = mercator(from.lng, from.lat);
  const b = mercator(to.lng, to.lat);
  const world = WORLD_PX * 2 ** from.zoom;
  const px = Math.hypot((b.x - a.x) * world, (b.y - a.y) * world);
  return { pan: px / Math.max(1, Math.min(size.width, size.height)), zoom: Math.abs(to.zoom - from.zoom) };
}

/**
 * What counts as a substantial move: a third of the map's smaller side, or more than one step of the zoom
 * buttons. A nudge, a short drag, one click of + or − is only the reader looking around.
 */
export const SUBSTANTIAL = { pan: 0.34, zoom: 1.25 } as const;

export function isSubstantial(drift: { pan: number; zoom: number }, limit = SUBSTANTIAL): boolean {
  return drift.pan >= limit.pan || drift.zoom >= limit.zoom;
}

/**
 * Remembers the camera the page itself last settled on (a step brought into view, an event revealed, the
 * map resized) and judges the reader's own moves against it. Their moves add up from that reference, so
 * three short drags in one direction are a substantial move, and a drag back and forth is none.
 */
export class CameraWatch {
  private ref: Camera | null = null;

  /** The page moved (or kept) the camera: this is the new reference. */
  settle(camera: Camera) {
    this.ref = camera;
  }

  /** The reader moved the map and it has come to rest at `camera`: is that far from where the page left it? */
  judge(camera: Camera, size: MapSize): boolean {
    if (!this.ref) {
      this.ref = camera; // nothing to compare with yet
      return false;
    }
    return isSubstantial(cameraDrift(this.ref, camera, size));
  }
}

/* ------------------------------------------------------------------- framing */

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Room kept clear around what is brought into view, on top of whatever the controls take. */
export const FRAME_MARGIN: Padding = { top: 48, right: 48, bottom: 48, left: 48 };

/**
 * The padding a framed drawing needs so that it ends up clear of the controls lying over the map. A control
 * in a corner is cleared along its shorter way out (the zoom buttons by the right edge, the legend by the
 * bottom one), not by shrinking the view on both sides.
 */
export function framePadding(controls: readonly Rect[], size: MapSize, base: Padding = FRAME_MARGIN): Padding {
  const out = { ...base };
  for (const r of controls) {
    const way = [
      { side: 'top' as const, by: r.bottom, ok: r.top < size.height * 0.4 },
      { side: 'bottom' as const, by: size.height - r.top, ok: r.bottom > size.height * 0.6 },
      { side: 'left' as const, by: r.right, ok: r.left < size.width * 0.4 },
      { side: 'right' as const, by: size.width - r.left, ok: r.right > size.width * 0.6 },
    ].filter((w) => w.ok && w.by > 0);
    if (!way.length) continue;
    const best = way.reduce((a, b) => (b.by < a.by ? b : a));
    out[best.side] = Math.max(out[best.side], best.by + 12);
  }
  // never so much that nothing is left to frame in
  const maxX = size.width * 0.4;
  const maxY = size.height * 0.4;
  out.left = Math.min(out.left, maxX);
  out.right = Math.min(out.right, maxX);
  out.top = Math.min(out.top, maxY);
  out.bottom = Math.min(out.bottom, maxY);
  return out;
}

/** The box around everything a step puts on the map, never thinner than `minSpan` degrees (a lone mark still gets a sensible view). */
export function frameBounds(
  boxes: readonly Bounds[],
  points: readonly { lon: number; lat: number }[],
  minSpan = { lon: 7, lat: 4.5 },
): Bounds | null {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const b of boxes) {
    w = Math.min(w, b[0]);
    s = Math.min(s, b[1]);
    e = Math.max(e, b[2]);
    n = Math.max(n, b[3]);
  }
  for (const p of points) {
    w = Math.min(w, p.lon);
    s = Math.min(s, p.lat);
    e = Math.max(e, p.lon);
    n = Math.max(n, p.lat);
  }
  if (![w, s, e, n].every(Number.isFinite)) return null;
  if (e - w < minSpan.lon) {
    const mid = (e + w) / 2;
    w = mid - minSpan.lon / 2;
    e = mid + minSpan.lon / 2;
  }
  if (n - s < minSpan.lat) {
    const mid = (n + s) / 2;
    s = mid - minSpan.lat / 2;
    n = mid + minSpan.lat / 2;
  }
  return [Math.max(-179.9, w), Math.max(-60, s), Math.min(179.9, e), Math.min(82, n)];
}

/**
 * Is the box already well framed by `camera`? All of it inside the padded view, at about the zoom a fit
 * would give (`fitZoom`), and centred well enough. A drawing that is framed is left alone: the map does not
 * breathe from step to step when two steps lie in the same region.
 */
export function isFramed(
  bounds: Bounds,
  camera: Camera,
  fitZoom: number,
  size: MapSize,
  padding: Padding,
  tolerance = { zoom: 0.55, centre: 0.22 },
): boolean {
  if (Math.abs(camera.zoom - fitZoom) > tolerance.zoom) return false;
  const nw = projectWith(camera, size, bounds[0], bounds[3]);
  const se = projectWith(camera, size, bounds[2], bounds[1]);
  const view = {
    left: padding.left - 4,
    top: padding.top - 4,
    right: size.width - padding.right + 4,
    bottom: size.height - padding.bottom + 4,
  };
  if (nw.x < view.left || nw.y < view.top || se.x > view.right || se.y > view.bottom) return false;
  const cx = (nw.x + se.x) / 2 - (view.left + view.right) / 2;
  const cy = (nw.y + se.y) / 2 - (view.top + view.bottom) / 2;
  const room = Math.min(view.right - view.left, view.bottom - view.top);
  return Math.hypot(cx, cy) <= tolerance.centre * room;
}
