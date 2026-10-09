import type { PlacePoint, YearRange } from '../domain/types';
import type { AppState } from './store';

export interface CameraView {
  lng: number;
  lat: number;
  zoom: number;
}

/** `v=zoom/lat/lng`: the map's own view, so a reload or a shared link opens where you were. */
export function parseCamera(hash: string): CameraView | null {
  const v = new URLSearchParams(hash.replace(/^#/, '')).get('v');
  if (!v) return null;
  const [zoom, lat, lng] = v.split('/').map(Number);
  if (![zoom, lat, lng].every((n) => Number.isFinite(n))) return null;
  if (Math.abs(lat!) > 85 || Math.abs(lng!) > 180 || zoom! < 0 || zoom! > 12) return null;
  return { zoom: zoom!, lat: lat!, lng: lng! };
}

/**
 * The view lives in the URL hash so a link reproduces it:
 *   #t=1450-1500&c=0.5&p=32.85,39.93&e=istanbul-fethi-1453&v=1.42/32.2/19
 * (`v` is the map camera, written after the user moves the map; it is restored, never driven by state.)
 */
export function stateToHash(s: AppState, camera?: CameraView | null): string {
  const parts = [`t=${s.range.from === s.range.to ? s.range.from : `${s.range.from}-${s.range.to}`}`];
  if (s.range.from !== s.range.to && Math.abs(s.cursor - 0.5) > 0.001) parts.push(`c=${s.cursor.toFixed(3)}`);
  if (s.places[0]) parts.push(`p=${s.places[0].lon.toFixed(3)},${s.places[0].lat.toFixed(3)}`);
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
      const from = Math.min(Math.max(Math.min(a, b), extent.from), extent.to);
      const to = Math.min(Math.max(Math.max(a, b), extent.from), extent.to);
      out.range = { from, to };
    }
  }
  const c = Number(params.get('c'));
  if (params.has('c') && Number.isFinite(c)) out.cursor = Math.min(1, Math.max(0, c));
  const p = params.get('p');
  if (p) {
    const [lon, lat] = p.split(',').map(Number);
    if (Number.isFinite(lon) && Number.isFinite(lat)) out.places = [{ lon, lat } as PlacePoint];
  }
  const e = params.get('e');
  if (e) out.selectedEventId = e;
  return out;
}
