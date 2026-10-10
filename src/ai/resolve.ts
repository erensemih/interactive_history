import { pointInPolygon } from '../domain/geo';
import { overlaps } from '../domain/time';
import type { Bounds, BorderRow, Entity, HistoricalEvent, PlacePoint, PolygonCoords, YearRange } from '../domain/types';
import { shortName } from '../ui/format';

/** What the resolver needs of the app's data (`AppData` fits). */
export interface ResolveData {
  entities: ReadonlyMap<string, Entity>;
  rows: readonly BorderRow[];
  /** The app's own events: what the model may point at instead of drawing a mark of its own. */
  events?: readonly HistoricalEvent[];
}

export interface CatalogEntry {
  id: string;
  name: string;
  /** The first and last year inside the asked range in which the polity has borders. */
  from: number;
  to: number;
}

/** One of the app's events, as the model is told about it. */
export interface EventCatalogEntry {
  id: string;
  title: string;
  dateLabel: string;
  place: string;
}

/** The map's own bounds (see MapView): a point outside them cannot be drawn. */
const LON_LIMIT = 179.9;
const LAT_MIN = -60;
const LAT_MAX = 82;

const FOLD: Record<string, string> = { ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l' };

/** Lower case, accents and Turkish letters folded, everything but letters and digits turned into single spaces. */
export function normalizeName(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ıßæœøđł]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** A short label from the model: control characters and markdown marks removed, one line, at most `max` characters. */
export function cleanLabel(value: unknown, max: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value)
    .replace(/[\u0000-\u001f\u007f<>*_`#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Great-circle distance in kilometres. */
export function distanceKm(a: PlacePoint, b: PlacePoint): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** How far from an event's own place a free mark may lie and still be taken for that event. */
const SAME_PLACE_KM = 60;

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*-?\d+(?:[.,]\d+)?\s*$/.test(value)) return Number(value.replace(',', '.'));
  return null;
};

/**
 * Turns what the model wrote into things that exist in the app's data, or into nothing. A reference that
 * does not resolve is skipped by the caller without a word to the reader: the model may know a name the
 * border dataset does not, and a half-true drawing is worse than a missing one.
 */
export class Resolver {
  private readonly rowsById = new Map<string, BorderRow[]>();
  private readonly byName = new Map<string, Set<string>>();
  private readonly events: readonly HistoricalEvent[];
  private readonly eventsById = new Map<string, HistoricalEvent>();
  private readonly eventsByKey = new Map<string, HistoricalEvent>();
  private readonly eventsByTitle = new Map<string, HistoricalEvent[]>();

  constructor(private readonly data: ResolveData) {
    this.events = data.events ?? [];
    for (const ev of this.events) {
      this.eventsById.set(ev.id, ev);
      this.eventsByKey.set(normalizeName(ev.id), ev);
      const title = normalizeName(ev.title);
      const same = this.eventsByTitle.get(title);
      if (same) same.push(ev);
      else this.eventsByTitle.set(title, [ev]);
    }
    for (const row of data.rows) {
      const list = this.rowsById.get(row.id);
      if (list) list.push(row);
      else this.rowsById.set(row.id, [row]);
    }
    for (const list of this.rowsById.values()) list.sort((a, b) => a.from - b.from);
    for (const id of this.rowsById.keys()) {
      const entity = data.entities.get(id);
      const names = [id.replace(/-/g, ' '), entity?.name, entity?.name && shortName(entity.name), entity?.dataName];
      for (const name of names) {
        const key = name ? normalizeName(name) : '';
        if (!key) continue;
        const set = this.byName.get(key);
        if (set) set.add(id);
        else this.byName.set(key, new Set([id]));
      }
    }
  }

  nameOf(id: string): string {
    return this.data.entities.get(id)?.name ?? id;
  }

  /** The border row of `id` valid in `year`. */
  rowAt(id: string, year: number): BorderRow | null {
    for (const row of this.rowsById.get(id) ?? []) if (row.from <= year && year <= row.to) return row;
    return null;
  }

  /** Does the polity have borders at any time in the range? */
  presentIn(id: string, range: YearRange): boolean {
    return (this.rowsById.get(id) ?? []).some((r) => r.from <= range.to && r.to >= range.from);
  }

  /**
   * The polity a model reference means: its id, or its name as written in Turkish or in the dataset
   * (case, accents and a missing "İmparatorluğu" do not matter). Null when nothing, or more than one
   * polity present in the range, fits.
   */
  polity(ref: unknown, range: YearRange): string | null {
    if (typeof ref !== 'string') return null;
    const raw = ref.trim();
    if (!raw) return null;
    if (this.rowsById.has(raw)) return this.presentIn(raw, range) ? raw : null;
    const key = normalizeName(raw);
    if (!key) return null;
    const present = (ids: Iterable<string>) => [...ids].filter((id) => this.presentIn(id, range));
    const exact = present(this.byName.get(key) ?? []);
    if (exact.length === 1) return exact[0]!;
    if (exact.length > 1 || key.length < 4) return null;
    // "Osmanlı Devleti" for "Osmanlı İmparatorluğu": a name that starts like exactly one polity's name.
    const starts = new Set<string>();
    for (const [name, ids] of this.byName) {
      if (name.startsWith(`${key} `) || key.startsWith(`${name} `)) for (const id of present(ids)) starts.add(id);
    }
    return starts.size === 1 ? [...starts][0]! : null;
  }

  /** Where a polity is drawn from and to: the middle of its biggest part in `year`, or null without borders that year. */
  anchorAt(id: string, year: number): PlacePoint | null {
    const row = this.rowAt(id, year);
    if (!row) return null;
    if (row.label) return { lon: row.label[0], lat: row.label[1] };
    const b = row.bbox ?? row.box;
    return { lon: (b[0] + b[2]) / 2, lat: (b[1] + b[3]) / 2 };
  }

  private readonly towardCache = new Map<string, PlacePoint | null>();

  /**
   * Where a line to `toward` leaves this polity. Usually the middle of its biggest part; but a polity of
   * several big parts (the Ottoman Empire after 1517: Anatolia and the Balkans in one piece, Egypt in
   * another) is joined to the other end from the part nearest to it, so the line does not start across the sea.
   */
  anchorToward(id: string, year: number, toward: PlacePoint): PlacePoint | null {
    const key = `${id}|${year}|${toward.lon.toFixed(1)},${toward.lat.toFixed(1)}`;
    const cached = this.towardCache.get(key);
    if (cached !== undefined) return cached;
    const main = this.anchorAt(id, year);
    const row = this.rowAt(id, year);
    let best = main;
    if (main && row && row.polys.length > 1) {
      const parts = row.polys.map((poly) => ({ poly, area: ringArea(poly[0]!) })).sort((a, b) => b.area - a.area);
      const biggest = parts[0]!.area;
      let nearest = Infinity;
      for (const part of parts) {
        if (part.area < biggest * MAIN_PART) break; // an exclave or an island is not where a polity is joined from
        const at = partMiddle(part.poly) ?? main;
        const d = Math.hypot((at.lon - toward.lon) * Math.cos((toward.lat * Math.PI) / 180), at.lat - toward.lat);
        if (d < nearest) {
          nearest = d;
          best = at;
        }
      }
    }
    this.towardCache.set(key, best);
    return best;
  }

  /**
   * The bounding box of a polity's main parts in `year`: the parts that are not much smaller than its biggest
   * one, so an island or an exclave far away does not stretch the box over half the world. Null without borders.
   */
  boundsAt(id: string, year: number): Bounds | null {
    const row = this.rowAt(id, year);
    if (!row) return null;
    const key = `${id}@${row.from}`;
    const cached = this.boundsCache.get(key);
    if (cached !== undefined) return cached;
    let box: Bounds | null = null;
    if (row.polys.length) {
      const parts = row.polys.map((poly) => ({ poly, area: ringArea(poly[0]!) })).sort((a, b) => b.area - a.area);
      const biggest = parts[0]!.area;
      for (const part of parts) {
        if (part.area < biggest * MAIN_PART) break;
        const b = ringBounds(part.poly[0]!);
        box = box
          ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])]
          : b;
      }
    }
    box ??= row.bbox ?? row.box;
    this.boundsCache.set(key, box);
    return box;
  }

  private readonly boundsCache = new Map<string, Bounds>();

  /* --------------------------------------------------------------- events */

  /** The app's event with this id, or null. */
  eventById(id: string): HistoricalEvent | null {
    return this.eventsById.get(id) ?? null;
  }

  /**
   * The event a model reference means: its id (spelling and case do not matter), or its title when exactly one
   * event has it, or a title that starts that way ("Çaldıran" for "Çaldıran Muharebesi"). Null otherwise.
   */
  event(ref: unknown): HistoricalEvent | null {
    if (typeof ref !== 'string') return null;
    const raw = ref.trim();
    if (!raw) return null;
    const byId = this.eventsById.get(raw);
    if (byId) return byId;
    const key = normalizeName(raw);
    if (!key) return null;
    const byKey = this.eventsByKey.get(key);
    if (byKey) return byKey;
    const exact = this.eventsByTitle.get(key) ?? [];
    if (exact.length === 1) return exact[0]!;
    if (exact.length > 1 || key.length < 4) return null;
    const starts: HistoricalEvent[] = [];
    for (const [title, list] of this.eventsByTitle) {
      if (title.startsWith(`${key} `)) starts.push(...list);
    }
    return starts.length === 1 ? starts[0]! : null;
  }

  /**
   * The event of the app's data a free mark is really about: one of the range's events whose place or name is
   * what the label says (a year after it is fine: "Mohaç, 1526"), within a short distance of the marked point,
   * and the only such event. A mark for something the data knows is shown as the data's own marker instead.
   */
  eventFor(label: string, point: PlacePoint, range: YearRange): HistoricalEvent | null {
    const key = normalizeName(label);
    const core = key.replace(/\s+\d{3,4}$/, '');
    if (!core) return null;
    const year = /\b(\d{3,4})\s*$/.exec(key)?.[1];
    const hits = this.events.filter((ev) => {
      if (!overlaps(ev.start, ev.end, range.from, range.to + 1)) return false;
      if (distanceKm(point, ev.location) > SAME_PLACE_KM) return false;
      if (year !== undefined && (Number(year) < Math.floor(ev.start) - 1 || Number(year) > Math.ceil(ev.end)))
        return false;
      const place = normalizeName(ev.location.name);
      const title = normalizeName(ev.title);
      return core === place || core === title || title.startsWith(`${core} `);
    });
    return hits.length === 1 ? hits[0]! : null;
  }

  /** The events that overlap the range, for the prompt: what the model may point at (oldest first). */
  eventCatalog(range: YearRange): EventCatalogEntry[] {
    return this.events
      .filter((ev) => overlaps(ev.start, ev.end, range.from, range.to + 1))
      .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
      .map((ev) => ({ id: ev.id, title: ev.title, dateLabel: ev.dateLabel, place: ev.location.name }));
  }

  /** A point the map can show, rounded to about 100 m. */
  point(lon: unknown, lat: unknown): PlacePoint | null {
    const x = toNumber(lon);
    const y = toNumber(lat);
    if (x === null || y === null) return null;
    if (Math.abs(x) > LON_LIMIT || y < LAT_MIN || y > LAT_MAX) return null;
    return { lon: Math.round(x * 1000) / 1000, lat: Math.round(y * 1000) / 1000 };
  }

  /** A year inside the range, or null. */
  year(value: unknown, range: YearRange): number | null {
    const y = toNumber(value);
    if (y === null) return null;
    const year = Math.round(y);
    return year >= range.from && year <= range.to ? year : null;
  }

  /** The polities with borders in the range, for the prompt: what the model may point at. */
  catalog(range: YearRange): CatalogEntry[] {
    const out: CatalogEntry[] = [];
    for (const [id, rows] of this.rowsById) {
      const inside = rows.filter((r) => r.from <= range.to && r.to >= range.from);
      if (!inside.length) continue;
      out.push({
        id,
        name: this.nameOf(id),
        from: Math.max(range.from, Math.min(...inside.map((r) => r.from))),
        to: Math.min(range.to, Math.max(...inside.map((r) => r.to))),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'tr') || (a.id < b.id ? -1 : 1));
  }
}

/** A part smaller than this share of its polity's biggest part is an exclave, not where the polity is. */
const MAIN_PART = 0.2;

function ringBounds(ring: number[][]): Bounds {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    if (x! < w) w = x!;
    if (x! > e) e = x!;
    if (y! < s) s = y!;
    if (y! > n) n = y!;
  }
  return [w, s, e, n];
}

/** Shoelace area of a ring in square degrees (only compared between the parts of one polity). */
function ringArea(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j]![0]! + ring[i]![0]!) * (ring[j]![1]! - ring[i]![1]!);
  }
  return Math.abs(sum / 2);
}

/** A point well inside a polygon part: the point of a coarse grid over its box that lies inside and is nearest the box's middle. */
function partMiddle(poly: PolygonCoords): PlacePoint | null {
  const ring = poly[0]!;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [x, y] of ring) {
    if (x! < w) w = x!;
    if (x! > e) e = x!;
    if (y! < s) s = y!;
    if (y! > n) n = y!;
  }
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  let best: PlacePoint | null = null;
  let bestD = Infinity;
  const N = 8;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const x = w + ((e - w) * i) / N;
      const y = s + ((n - s) * j) / N;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bestD && pointInPolygon(x, y, poly)) {
        bestD = d;
        best = { lon: x, lat: y };
      }
    }
  }
  return best;
}
