import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { boundsOf, inBounds, pointInPolygon } from '../domain/geo';
import type { BorderProps, BorderRow, Bounds, PlacePoint, PolygonCoords } from '../domain/types';
import { DELTA_ENCODING, decodeGeometry, encodeGeometry, type EncodedMeta } from './borderCodec';
import { polysOf } from './borderStore';

/**
 * The correction layer for the Second World War (public/data/corrections/ww2.json). The border dataset itself
 * (Cliopatria) is never edited: its file stays as the pipeline made it, and these entries are applied on top of it
 * when the page loads. Every entry carries a note and a source. It is small on purpose: only the gaps that break a
 * narration of the war, not an accuracy pass.
 */
export interface CorrectionsDoc {
  meta: {
    title: string;
    note: string;
    sources?: { name: string; url?: string }[];
    /** What the layer leaves wrong, so that nobody takes the map for more than it is. */
    knownGaps?: string[];
  };
  /** Changes to the rows the map draws. */
  rows?: RowCorrection[];
  /** The word for each occupying polity ("nazi-germany" → "Alman işgali"). */
  occupierLabels?: Record<string, string>;
  /** Areas that the border data draws as the land of their occupier, and that the page names as occupied. */
  occupations?: OccupationEntry[];
}

export type RowCorrection = { id: string; from: number; to: number; note: string; source: string } & (
  | {
      /**
       * A new row for the years from–to with the shape of an existing one (the polity's row of `of.year`). `keep`
       * leaves out the parts of the shape that lie outside these boxes ([west, south, east, north], or a list of
       * them): Cliopatria's Nazi Germany carries a hundred and fifty stray islands and enclaves far from Germany.
       */
      op: 'copy';
      of: { id: string; year: number };
      keep?: Bounds | Bounds[];
    }
  | {
      /** A new row with a shape of its own: GeoJSON polygons ([ring, ...holes] of [lon, lat]). */
      op: 'add';
      name?: string;
      polygons: number[][][][];
    }
);

export interface OccupationEntry {
  id: string;
  /** The land as people know it: "Polonya". */
  name: string;
  /** The land's shape: the row of this polity in this year (before the occupation). */
  area: { id: string; year: number };
  /**
   * Narrows the area to a box [west, south, east, north] when the polity's shape holds more than the occupied land.
   * A list of boxes is their union (they must not overlap).
   */
  box?: Bounds | Bounds[];
  /** Polities whose land the data draws it as while it was occupied. Only where one of them holds a point is it occupied. */
  occupiers: string[];
  from: number;
  to: number;
  /** Where the name goes on the map. */
  at: [number, number];
  note: string;
  source: string;
}

/** An occupied place, as the page tells it. */
export interface Occupation {
  id: string;
  name: string;
  /** "Alman işgali". */
  label: string;
  occupier: string;
}

/** A name tag for an occupied land on the map. */
export interface OccupationLabel extends Occupation {
  lon: number;
  lat: number;
  /** The land's area in km², so that the tag is sized like a polity's name. */
  area: number;
}

export type BordersRaw = FeatureCollection<Geometry, BorderProps> & { meta?: EncodedMeta };

/** What the page says of an occupation by a polity that has no word of its own in `occupierLabels`. */
const DEFAULT_LABEL = 'işgal';

/* ------------------------------------------------------------------ geometry */

/** A box or a list of boxes, as a list (null: no box). */
export function boxesOf(box: Bounds | Bounds[] | undefined | null): Bounds[] | null {
  if (!box || !box.length) return null;
  return Array.isArray(box[0]) ? (box as Bounds[]) : [box as Bounds];
}

const inBoxes = (boxes: Bounds[] | null, x: number, y: number) => !boxes || boxes.some((b) => inBounds(b, x, y));

const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Area of a ring on the sphere in km² (Chamberlain–Duquette); the ring may be open or closed. */
export function ringAreaKm2(ring: number[][]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x1, y1] = ring[j]!;
    const [x2, y2] = ring[i]!;
    sum += (x2! - x1!) * RAD * (2 + Math.sin(y1! * RAD) + Math.sin(y2! * RAD));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

/** Area of a polygon (outer ring minus its holes) in km². */
export function polygonAreaKm2(poly: PolygonCoords): number {
  let area = ringAreaKm2(poly[0]!);
  for (let h = 1; h < poly.length; h++) area -= ringAreaKm2(poly[h]!);
  return Math.max(0, area);
}

/** Sutherland–Hodgman: the ring cut to the box (the pieces stay joined by edges along the box's border). */
function clipRing(ring: number[][], [w, s, e, n]: Bounds): number[][] {
  const same = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];
  let pts = ring.length > 1 && same(ring[0]!, ring[ring.length - 1]!) ? ring.slice(0, -1) : ring;
  const pass = (inside: (p: number[]) => boolean, at: (a: number[], b: number[]) => number[]) => {
    const out: number[][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      const ia = inside(a);
      if (ia) out.push(a);
      if (ia !== inside(b)) out.push(at(a, b));
    }
    pts = out;
  };
  const alongX = (x: number) => (a: number[], b: number[]) => [
    x,
    a[1]! + ((b[1]! - a[1]!) * (x - a[0]!)) / (b[0]! - a[0]!),
  ];
  const alongY = (y: number) => (a: number[], b: number[]) => [
    a[0]! + ((b[0]! - a[0]!) * (y - a[1]!)) / (b[1]! - a[1]!),
    y,
  ];
  pass((p) => p[0]! >= w, alongX(w));
  pass((p) => p[0]! <= e, alongX(e));
  pass((p) => p[1]! >= s, alongY(s));
  pass((p) => p[1]! <= n, alongY(n));
  return pts;
}

/** Area in km² of the polygons cut to the boxes (null: not cut). The boxes must not overlap. */
export function clippedAreaKm2(polys: PolygonCoords[], boxes: Bounds[] | null): number {
  if (!boxes) return polys.reduce((sum, poly) => sum + polygonAreaKm2(poly), 0);
  let total = 0;
  for (const box of boxes) {
    for (const poly of polys) {
      let area = ringAreaKm2(clipRing(poly[0]!, box));
      for (let h = 1; h < poly.length; h++) area -= ringAreaKm2(clipRing(poly[h]!, box));
      total += Math.max(0, area);
    }
  }
  return total;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const roundBounds = (b: Bounds): Bounds => [round2(b[0]), round2(b[1]), round2(b[2]), round2(b[3])];

/** Closed rings (the closing point is added when the ring does not repeat its first point). */
function closedPolygons(polys: number[][][][]): PolygonCoords[] {
  return polys.map((poly) =>
    poly.map((ring) => {
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      return first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
    }),
  );
}

/* ----------------------------------------------------------------- row corrections */

const yearsOf = (from: number, to: number) => (from === to ? `${from}` : `${from}–${to}`);

type BorderFeature = Feature<Geometry, BorderProps>;

/** The collections that have had their corrections applied (applying twice would add every row twice). */
const applied = new WeakSet<object>();

/**
 * Applies the row corrections to the border file as it was read, before the page builds its rows from it: rows are
 * added (`add`, `copy`) at the end of the file, so that they paint over the rows they correct. The rows that are already
 * in the file are not touched (a copy shares the encoded shape of its source). Returns what was applied, for the
 * console. A reference to a row or a polity that is not in the file throws: then the data is wrong.
 */
export function applyRowCorrections(raw: BordersRaw, doc: CorrectionsDoc | null): string[] {
  const corrections = doc?.rows;
  if (!corrections?.length || applied.has(raw)) return [];
  applied.add(raw);

  const encoded = raw.meta?.encoding === DELTA_ENCODING;
  const scale = raw.meta?.scale ?? 100;
  const original = raw.features as BorderFeature[];
  const fresh: BorderFeature[] = [];
  const lines: string[] = [];

  /** The shapes of a feature of the file as plain polygons. */
  const polygonsOfFeature = (f: BorderFeature): PolygonCoords[] =>
    polysOf(encoded ? decodeGeometry(f.geometry, scale) : f.geometry);
  const geometryOf = (polys: PolygonCoords[]): Geometry =>
    encoded
      ? encodeGeometry(polys, scale)
      : polys.length === 1
        ? { type: 'Polygon', coordinates: polys[0]! }
        : { type: 'MultiPolygon', coordinates: polys };

  corrections.forEach((c, i) => {
    const what = `düzeltme ${i + 1} (${c.id} ${yearsOf(c.from, c.to)})`;
    if (!Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from > c.to) {
      throw new Error(`${what}: yıl aralığı geçersiz`);
    }
    if (c.op === 'copy') {
      // the source: the polity's row that is valid in that year (the biggest, if the file holds more than one)
      let source: BorderFeature | null = null;
      for (const f of original) {
        const p = f.properties;
        if (p.id !== c.of.id || p.from > c.of.year || p.to < c.of.year) continue;
        if (!source || p.area > source.properties.area) source = f;
      }
      if (!source) throw new Error(`${what}: kaynak satır yok (${c.of.id}, ${c.of.year})`);
      const sameId = c.id === source.properties.id;
      const props: BorderProps = {
        ...source.properties,
        id: c.id,
        from: c.from,
        to: c.to,
        ...(sameId ? {} : { label: null, up: [] }),
      };
      let geometry = source.geometry;
      let parts =
        source.geometry.type === 'Polygon' ? 1 : (source.geometry as { coordinates: unknown[] }).coordinates.length;
      const keep = boxesOf(c.keep);
      if (keep) {
        const kept = polygonsOfFeature(source).filter((poly) => {
          const b = boundsOf([poly]);
          return keep.some((k) => b[0] >= k[0] && b[1] >= k[1] && b[2] <= k[2] && b[3] <= k[3]);
        });
        if (!kept.length) throw new Error(`${what}: "keep" kutuları kaynağın hiçbir parçasını içermiyor`);
        geometry = geometryOf(kept);
        props.box = roundBounds(boundsOf(kept));
        parts = kept.length;
      }
      fresh.push({ type: 'Feature', properties: props, geometry });
      lines.push(`${c.id} ${yearsOf(c.from, c.to)}: ${c.of.year} satırının şekli kopyalandı (${parts} parça)`);
      return;
    }
    if (c.op === 'add') {
      if (!original.some((f) => f.properties.id === c.id)) throw new Error(`${what}: "${c.id}" sınır dosyasında yok`);
      let polys: PolygonCoords[];
      let geometry: Geometry;
      try {
        polys = closedPolygons(c.polygons);
        geometry = geometryOf(polys);
        // what the file will hold is what the page draws: measure the shape after it went through the grid
        polys = polysOf(encoded ? decodeGeometry(geometry, scale) : geometry);
      } catch (err) {
        throw new Error(`${what}: şekil geçersiz (${(err as Error).message})`);
      }
      let biggest = polys[0]!;
      for (const poly of polys) if (ringAreaKm2(poly[0]!) > ringAreaKm2(biggest[0]!)) biggest = poly;
      const area = Math.round(clippedAreaKm2(polys, null));
      fresh.push({
        type: 'Feature',
        properties: {
          id: c.id,
          from: c.from,
          to: c.to,
          area,
          // a patch is not a polity of its own: it must not get a second name
          label: null,
          bbox: roundBounds(boundsOf([biggest])),
          box: roundBounds(boundsOf(polys)),
          up: [],
        },
        geometry,
      });
      lines.push(`${c.id} ${yearsOf(c.from, c.to)}: ${c.name ?? 'yama'} eklendi (${area} km²)`);
      return;
    }
    throw new Error(`${what}: bilinmeyen işlem "${(c as { op?: string }).op}"`);
  });

  raw.features.push(...fresh);
  return lines;
}

/* ------------------------------------------------------------------ occupations */

interface Prepared {
  entry: OccupationEntry;
  /** The row whose shape is the land (the pre-war row of the occupied country). */
  row: BorderRow;
  boxes: Bounds[] | null;
  /** The land's area in km², worked out the first time a name tag needs it. */
  areaKm2: number | null;
}

/**
 * The lands the border data draws as their occupier's, and names as occupied (Warsaw in 1942: not "Nazi Almanyası" but
 * "Polonya · Alman işgali"). An occupation applies at a point in a year when the year is within the entry's years, the
 * row that holds the point then (the page passes it in) belongs to one of the entry's occupiers, and the point lies
 * within the land: inside the shape of the pre-war row and, if the entry has a box, inside the box. Of several
 * entries that would apply, the first in the file wins.
 */
export class OccupationIndex {
  private readonly items: Prepared[] = [];
  private readonly words: Record<string, string>;

  constructor(doc: CorrectionsDoc | null, rows: readonly BorderRow[]) {
    this.words = doc?.occupierLabels ?? {};
    const entries = doc?.occupations ?? [];
    if (!entries.length) return;
    const byId = new Map<string, BorderRow[]>();
    for (const row of rows) {
      const list = byId.get(row.id);
      if (list) list.push(row);
      else byId.set(row.id, [row]);
    }
    for (const entry of entries) {
      // the row of the polity valid in that year; the biggest, where a correction has added a patch beside it
      let row: BorderRow | null = null;
      for (const r of byId.get(entry.area.id) ?? []) {
        if (r.from > entry.area.year || r.to < entry.area.year) continue;
        if (!row || r.area > row.area) row = r;
      }
      if (!row) throw new Error(`işgal "${entry.id}": ${entry.area.id} için ${entry.area.year} yılının satırı yok`);
      this.items.push({ entry, row, boxes: boxesOf(entry.box), areaKm2: null });
    }
  }

  private wordFor(occupier: string): string {
    return this.words[occupier] ?? DEFAULT_LABEL;
  }

  /** The occupation that applies at the point in the year, given the row that holds the point then (null: none). */
  at(point: PlacePoint, year: number, holder: BorderRow | null): Occupation | null {
    if (!holder) return null;
    for (const { entry, row, boxes } of this.items) {
      if (year < entry.from || year > entry.to || !entry.occupiers.includes(holder.id)) continue;
      if (!inBoxes(boxes, point.lon, point.lat) || !inBounds(row.box, point.lon, point.lat)) continue;
      if (!row.polys.some((poly) => pointInPolygon(point.lon, point.lat, poly))) continue;
      return { id: entry.id, name: entry.name, label: this.wordFor(holder.id), occupier: holder.id };
    }
    return null;
  }

  /** The name tags to put on the map in the year: one per occupied land whose tag point an occupier holds. */
  labels(year: number, holderAt: (lon: number, lat: number) => BorderRow | null): OccupationLabel[] {
    const out: OccupationLabel[] = [];
    for (const item of this.items) {
      const { entry } = item;
      if (year < entry.from || year > entry.to) continue;
      const [lon, lat] = entry.at;
      const holder = holderAt(lon, lat);
      if (!holder || !entry.occupiers.includes(holder.id)) continue;
      let area = item.row.area;
      if (item.boxes) {
        // a land narrowed from a bigger row is sized by what is left of the shape, not by the row (the USSR's 22 million km²)
        item.areaKm2 ??= Math.round(clippedAreaKm2(item.row.polys, item.boxes)) || item.row.area;
        area = item.areaKm2;
      }
      out.push({
        id: entry.id,
        name: entry.name,
        label: this.wordFor(holder.id),
        occupier: holder.id,
        lon,
        lat,
        area,
      });
    }
    return out;
  }
}
