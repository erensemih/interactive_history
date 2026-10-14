import type { CapitalIndex } from '../data/capitals';
import type { PlaceIndex } from '../data/places';
import { pointInPolygon } from '../domain/geo';
import { overlaps } from '../domain/time';
import type { Bounds, BorderRow, Entity, HistoricalEvent, PlacePoint, PolygonCoords, YearRange } from '../domain/types';
import { eventKindOf, warSides } from './eventKinds';
import { normalizeName } from '../domain/names';
import { shortName } from '../ui/format';
import { withoutOpenReference } from '../ui/read/segments';
import type { PlaceRef } from './types';

/** What the resolver needs of the app's data (`AppData` fits). */
export interface ResolveData {
  entities: ReadonlyMap<string, Entity>;
  rows: readonly BorderRow[];
  /** The app's own events: what the model may point at instead of drawing a mark of its own. */
  events?: readonly HistoricalEvent[];
  /** The gazetteer and the table of capitals: where lines and routes begin, end and stop. */
  places?: PlaceIndex;
  capitals?: CapitalIndex;
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

export { normalizeName };

/** The map's own bounds (see MapView): a point outside them cannot be drawn. */
const LON_LIMIT = 179.9;
const LAT_MIN = -60;
const LAT_MAX = 82;

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

/**
 * A sentence or two for the page to show as it is (a subtitle): emphasis marks and markup are taken out without
 * leaving gaps in the sentence (the references to events, `[text](olay:id)`, stay: they are links), and it is cut
 * at `max` characters on a word.
 */
export function cleanCaption(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/[*_`#]+/g, '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  // (never in the middle of the name of an event: `[Mohaç](olay:moh` would be half a link)
  return `${withoutOpenReference(cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2)))).trimEnd()}…`;
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

  /**
   * The border row of `id` valid in `year`. (The correction layer may add a small piece to a polity for some years, an
   * island that the data left out: the polity's own row is the biggest one.)
   */
  rowAt(id: string, year: number): BorderRow | null {
    let best: BorderRow | null = null;
    for (const row of this.rowsById.get(id) ?? []) {
      if (row.from <= year && year <= row.to && (!best || row.area > best.area)) best = row;
    }
    return best;
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
   * The box of the part of a polity that a scene is about, in `year` (null without borders that year).
   *
   *  - With `around` (what lies around the places the scene puts on the map: its events, the ends of its lines, its marks):
   *    the parts of the polity that reach into it, each cut at its edge. A colony, an island group, an exclave, or the far end of
   *    a land that runs on for thousands of kilometres never stretches the view; a polity with no part there has nothing to show
   *    (null).
   *  - Without it: the polity's body, its biggest part and the parts that lie against it (Britain with Northern Ireland, not
   *    Aden or Iceland; the United States without Alaska and Greenland). A part as big as the homeland but far from it is
   *    not the homeland.
   */
  boundsAt(id: string, year: number, around?: Bounds | null): Bounds | null {
    const row = this.rowAt(id, year);
    if (!row) return null;
    const parts = this.partsOf(row);
    if (!parts.length) return around && !meets(row.bbox ?? row.box, around) ? null : (row.bbox ?? row.box);
    if (around) {
      let box: Bounds | null = null;
      for (const part of parts) {
        if (!meets(part.box, around)) continue;
        const cut: Bounds = [
          Math.max(part.box[0], around[0]),
          Math.max(part.box[1], around[1]),
          Math.min(part.box[2], around[2]),
          Math.min(part.box[3], around[3]),
        ];
        box = box ? unite(box, cut) : cut;
      }
      return box;
    }
    let body = this.bodyCache.get(row);
    if (!body) {
      const main = parts[0]!;
      const near: Bounds = [
        main.box[0] - BODY_GAP,
        main.box[1] - BODY_GAP,
        main.box[2] + BODY_GAP,
        main.box[3] + BODY_GAP,
      ];
      body = main.box;
      for (const part of parts.slice(1)) if (meets(part.box, near)) body = unite(body, part.box);
      this.bodyCache.set(row, body);
    }
    return body;
  }

  private readonly partCache = new WeakMap<BorderRow, Part[]>();
  private readonly bodyCache = new WeakMap<BorderRow, Bounds>();

  /** The parts (polygons) of a row with the box and the area of each, the biggest first. */
  private partsOf(row: BorderRow): Part[] {
    let parts = this.partCache.get(row);
    if (!parts) {
      parts = row.polys
        .map((poly) => ({ box: ringBounds(poly[0]!), area: ringArea(poly[0]!) }))
        .sort((a, b) => b.area - a.area);
      this.partCache.set(row, parts);
    }
    return parts;
  }

  /* --------------------------------------------------------------- events */

  /** The app's event with this id, or null. */
  eventById(id: string): HistoricalEvent | null {
    return this.eventsById.get(id) ?? null;
  }

  /**
   * The border year a step about this event shows: the borders at the event's start, not after it. A year's borders are how
   * that year ended, so the event's own year can already be a world without the event's parties (the Third Republic has no
   * borders in 1940, the year the Battle of France began in: its war line would fall back to the next party on its side).
   *  1. The event's year, or the latest of the three years before it in which the event can be drawn at all (a war needs
   *     both its sides, any other event one of its parties): the event may be what ended a party for good (Granada fell
   *     on 2 January 1492, Constantinople in 1453).
   *  2. Then, if a main party of the event (the first two the data lists and, in a war, the first of each side: the ends
   *     of its line) had borders the year before and has none in that year, it ended during the year: at the event's
   *     start it was still there, so the year before is shown (when the event can be drawn in it).
   */
  showYearOf(ev: HistoricalEvent): number {
    const sides = eventKindOf(ev.category) === 'war' ? warSides(ev) : null;
    const present = (y: number) =>
      sides
        ? sides.first.some((p) => this.rowAt(p, y)) && sides.second.some((p) => this.rowAt(p, y))
        : ev.parties.some((p) => this.rowAt(p, y));
    let year = ev.year;
    for (let y = ev.year; y >= ev.year - 3; y--) {
      if (present(y)) {
        year = y;
        break;
      }
    }
    const main = new Set([...ev.parties.slice(0, 2), ...(sides ? [sides.first[0], sides.second[0]] : [])]);
    const lost = [...main].some((p) => !!p && !this.rowAt(p, year) && !!this.rowAt(p, year - 1));
    return lost && present(year - 1) ? year - 1 : year;
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

  /* --------------------------------------------------------------- places */

  /** The capital of the polity in the year, from the table (null: the table does not know it). */
  capitalPoint(id: string, year: number): PlacePoint | null {
    const place = this.data.capitals?.at(id, year);
    return place ? { lon: place.lon, lat: place.lat } : null;
  }

  /**
   * "enlem, boylam" as a point ("52.23, 21.01"; an object with lat/lon or an array works too). A first number that
   * cannot be a latitude is taken to be the longitude, so a model that swaps them is still understood.
   */
  coordinates(value: unknown): PlacePoint | null {
    let a: number | null = null;
    let b: number | null = null;
    if (typeof value === 'string') {
      const m = /^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
      if (m) [a, b] = [Number(m[1]), Number(m[2])];
    } else if (Array.isArray(value) && value.length === 2) {
      [a, b] = [toNumber(value[0]), toNumber(value[1])];
    } else if (value && typeof value === 'object') {
      const o = value as Record<string, unknown>;
      const lat = toNumber(o.lat ?? o.latitude ?? o.enlem);
      const lon = toNumber(o.lon ?? o.lng ?? o.longitude ?? o.boylam);
      if (lat !== null && lon !== null) return this.point(lon, lat);
    }
    if (a === null || b === null) return null;
    return Math.abs(a) > 90 && Math.abs(b) <= 90 ? this.point(a, b) : this.point(b, a);
  }

  /**
   * The place a model reference means, or null: coordinates; an event of the data (its id; its place is the point); a
   * polity (its id; it stands for its capital in the year); a city of the gazetteer by any of its names (historical
   * ones too); a polity by its name; an event by its title. A polity that has no borders in the range is not a place.
   */
  placeRef(value: unknown, range: YearRange): PlaceRef | null {
    const point = this.coordinates(value);
    if (point) return { kind: 'point', point };
    if (typeof value !== 'string') return null;
    const raw = value.trim();
    if (!raw) return null;
    const ev = this.eventsById.get(raw);
    if (ev) return { kind: 'event', id: ev.id, name: ev.location.name };
    if (this.rowsById.has(raw)) return this.presentIn(raw, range) ? { kind: 'polity', id: raw } : null;
    const city = this.data.places?.find(raw)[0];
    if (city) return { kind: 'city', id: city.id, name: city.tr };
    const polity = this.polity(raw, range);
    if (polity) return { kind: 'polity', id: polity };
    const byTitle = this.event(raw);
    return byTitle ? { kind: 'event', id: byTitle.id, name: byTitle.location.name } : null;
  }

  /**
   * Where a place is on the map in `year`. A polity is its capital that year; where the table has none, the middle of its
   * biggest part (or, when `toward` says where the other end is, of the part nearest to it); null without borders.
   */
  placePoint(ref: PlaceRef, year: number, toward?: PlacePoint): PlacePoint | null {
    switch (ref.kind) {
      case 'point':
        return ref.point;
      case 'event': {
        const ev = this.eventsById.get(ref.id);
        return ev ? { lon: ev.location.lon, lat: ev.location.lat } : null;
      }
      case 'city': {
        const city = this.data.places?.byId(ref.id);
        return city ? { lon: city.lon, lat: city.lat } : null;
      }
      case 'polity':
        // a polity with no borders in the year is nowhere on the map, whatever the table says of its capital
        if (!this.rowAt(ref.id, year)) return null;
        return (
          this.capitalPoint(ref.id, year) ??
          (toward ? this.anchorToward(ref.id, year, toward) : this.anchorAt(ref.id, year))
        );
    }
  }

  /** What to call a place in words. */
  placeName(ref: PlaceRef): string {
    switch (ref.kind) {
      case 'polity':
        return this.nameOf(ref.id);
      case 'point':
        return ref.name ?? `${ref.point.lat.toFixed(2)}, ${ref.point.lon.toFixed(2)}`;
      default:
        return ref.name;
    }
  }

  /** Are the two references the same place? */
  samePlace(a: PlaceRef, b: PlaceRef): boolean {
    if (a.kind === 'point' && b.kind === 'point') return distanceKm(a.point, b.point) < 5;
    return a.kind === b.kind && a.kind !== 'point' && b.kind !== 'point' && a.id === b.id;
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

/** A part smaller than this share of its polity's biggest part is an exclave, not where the polity is joined from. */
const MAIN_PART = 0.2;

/** A polity's body (what is framed when a scene has no place to frame around): its biggest part and the parts within this many degrees of it. */
const BODY_GAP = 3;

interface Part {
  box: Bounds;
  area: number;
}

/** Do the two boxes share any ground? */
const meets = (a: Bounds, b: Bounds): boolean => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

const unite = (a: Bounds, b: Bounds): Bounds => [
  Math.min(a[0], b[0]),
  Math.min(a[1], b[1]),
  Math.max(a[2], b[2]),
  Math.max(a[3], b[3]),
];

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
