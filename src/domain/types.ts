/** Shared domain types. Everything user-facing is Turkish; ids and code are English. */

/** Inclusive year range the user selects, e.g. 1450–1500. A single year is from === to. */
export interface YearRange {
  from: number;
  to: number;
}

export type Bounds = [west: number, south: number, east: number, north: number];

/* ------------------------------------------------------------------ entities */

export type EntityKind = 'polity' | 'region';

/** A polity or region that events can involve and places can belong to. */
export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  summary?: string;
  /** Regions only: rough geographic extent, used to attach blank-land places to a region. */
  bounds?: Bounds;
  /** Derived from the border dataset (polities only). */
  wikipedia?: string;
  wikidata?: string;
  /** Present only as a parent in the dataset ("umbrella"): has no polygons of its own. */
  umbrella?: boolean;
  /** Stable index into the map tint palette (graph-coloured so neighbours differ). */
  tint?: number | null;
  firstYear?: number;
  lastYear?: number;
  dataName?: string;
}

/* ------------------------------------------------------------------- borders */

/** Polygon ring list: [outer, ...holes]; each ring is [lon, lat][]. */
export type PolygonCoords = number[][][];

export interface BorderProps {
  id: string;
  from: number;
  to: number;
  /** Area in km² as reported by the dataset. */
  area: number;
  /** [lon, lat, inscribed radius in degrees] for the biggest part. */
  label: [number, number, number] | null;
  bbox: Bounds | null;
  /** Parent entity ids ("member of") at that time. */
  up?: string[];
  tint?: number | null;
}

export interface BorderRow extends BorderProps {
  polys: PolygonCoords[];
  /** bbox of the whole geometry, for fast rejection. */
  box: Bounds;
}

/* -------------------------------------------------------------------- events */

export type Importance = 1 | 2 | 3 | 4 | 5;

export type SourceRef =
  | { kind: 'wikipedia'; title: string; lang: string; url: string }
  | { kind: 'wikidata'; id: string; url: string }
  | { kind: 'url'; title: string; url: string };

export interface HistoricalEvent {
  id: string;
  title: string;
  summary: string;
  /** Fractional years; half-open interval [start, end). */
  start: number;
  end: number;
  approximate: boolean;
  /** True when the data gives an explicit end date (draws a duration bar on timelines). */
  range: boolean;
  /** Human readable Turkish date, e.g. "6 Nisan – 29 Mayıs 1453". */
  dateLabel: string;
  /** The year used when the UI needs a single year for the event (start). */
  year: number;
  location: { name: string; lon: number; lat: number };
  importance: Importance;
  category: string;
  parties: string[];
  sources: SourceRef[];
  set: string;
}

export interface CategoryDef {
  id: string;
  label: string;
}

/* -------------------------------------------------------------------- places */

/** The user's selection: a point on the map. What it belongs to depends on the year. */
export interface PlacePoint {
  lon: number;
  lat: number;
}

/** One stretch of time during which a place belonged to one polity. */
export interface SovereigntySegment {
  id: string;
  from: number;
  to: number;
}

export interface PlaceResolution {
  point: PlacePoint;
  /** Polity (border row) holding the point at the display year; null on blank land. */
  row: BorderRow | null;
  /** Region entities whose bounds contain the point. */
  regions: string[];
  /** Who held the point during the detail window, oldest first. */
  sequence: SovereigntySegment[];
  /** Entity ids (holders, their parents, regions) whose events belong on this place's timeline. */
  lineage: Set<string>;
}
