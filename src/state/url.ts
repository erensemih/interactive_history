import type { PlacePoint, YearRange } from '../domain/types';
import { MAX_PLACES, type AppState } from './store';

export interface CameraView {
  lng: number;
  lat: number;
  zoom: number;
}

/** Web-Mercator limit: beyond it a latitude cannot be drawn. */
const MAX_LAT = 85.05;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const toNumber = (raw: string | undefined): number | null => (raw !== undefined && NUMBER.test(raw) ? Number(raw) : null);

/**
 * `v=zoom/lat/lng`: the map's own view, so a reload or a shared link opens where the user was.
 * Anything malformed or out of range is ignored (the default framing is used instead).
 */
export function parseCamera(hash: string): CameraView | null {
  const v = new URLSearchParams(hash.replace(/^#/, '')).get('v');
  if (!v) return null;
  const parts = v.split('/');
  if (parts.length !== 3) return null;
  const [zoom, lat, lng] = parts.map(toNumber);
  if (zoom == null || lat == null || lng == null) return null;
  if (Math.abs(lat) > MAX_LAT || Math.abs(lng) > 180 || zoom < 0 || zoom > 12) return null;
  return { zoom, lat, lng };
}

/** `lon,lat` with both parts present and on the map; anything else is not a place. */
export function parsePlace(raw: string): PlacePoint | null {
  const [lon, lat, ...rest] = raw.split(',').map(toNumber);
  if (rest.length || lon == null || lat == null) return null;
  if (Math.abs(lon) > 180 || Math.abs(lat) > MAX_LAT) return null;
  return { lon, lat };
}

/**
 * The view lives in the URL hash so a link reproduces it:
 *   #t=1450-1500&c=0.5&p=32.85,39.93&e=istanbul-fethi-1453&v=1.42/32.2/19
 * (`p` repeats for each selected place; `v` is the map camera, which is written only once the user
 * has moved the map themselves, and is restored on load, never driven by state.)
 */
export function stateToHash(s: AppState, camera?: CameraView | null): string {
  const parts = [`t=${s.range.from === s.range.to ? s.range.from : `${s.range.from}-${s.range.to}`}`];
  if (s.range.from !== s.range.to && Math.abs(s.cursor - 0.5) > 0.001) parts.push(`c=${s.cursor.toFixed(3)}`);
  for (const p of s.places) parts.push(`p=${p.lon.toFixed(3)},${p.lat.toFixed(3)}`);
  if (s.selectedEventId) parts.push(`e=${encodeURIComponent(s.selectedEventId)}`);
  if (camera) parts.push(`v=${camera.zoom.toFixed(2)}/${camera.lat.toFixed(3)}/${camera.lng.toFixed(3)}`);
  return `#${parts.join('&')}`;
}

export function hashToPartialState(hash: string, extent: YearRange): Partial<AppState> {
  const out: Partial<AppState> = {};
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const t = params.get('t');
  if (t) {
    const m = /^(\d{3,4})(?:-(\d{3,4}))?$/.exec(t);
    if (m) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      // A range wholly outside the dataset is not "the nearest year": it is ignored.
      if (hi >= extent.from && lo <= extent.to) {
        out.range = { from: Math.max(lo, extent.from), to: Math.min(hi, extent.to) };
      }
    }
  }
  const c = toNumber(params.get('c') ?? undefined);
  if (c !== null) out.cursor = Math.min(1, Math.max(0, c));
  const places = params
    .getAll('p')
    .map(parsePlace)
    .filter((p): p is PlacePoint => p !== null)
    .slice(0, MAX_PLACES);
  if (places.length) out.places = places;
  const e = params.get('e');
  if (e) out.selectedEventId = e;
  return out;
}
