import type { Bounds, PlacePoint } from '../domain/types';

/** How two polities are related on the map. Each relation has its own line style (src/map/aiLayer.ts). */
export type Relation = 'war' | 'alliance' | 'trade' | 'treaty';
export const RELATIONS: readonly Relation[] = ['war', 'alliance', 'trade', 'treaty'];
export const RELATION_WORD: Record<Relation, string> = {
  war: 'savaş',
  alliance: 'ittifak',
  trade: 'ticaret',
  treaty: 'antlaşma',
};

/**
 * The kinds of route the model may draw. Each has one look on the map (src/styles/ai.css), the same every time: an army's
 * advance or campaign, a retreat, a migration or flight, a trade or supply road.
 */
export type RouteType = 'advance' | 'retreat' | 'migration' | 'trade';
export const ROUTE_TYPES: readonly RouteType[] = ['advance', 'retreat', 'migration', 'trade'];
export const ROUTE_WORD: Record<RouteType, string> = {
  advance: 'ilerleyiş',
  retreat: 'geri çekilme',
  migration: 'göç',
  trade: 'ticaret yolu',
};

/**
 * A place the model names as the end of a line or the stop of a route. Lines and routes run between PLACES, never
 * between the middles of polities: an event of the data, a city of the gazetteer, a point, or a polity, which stands
 * for its capital in the year shown (the middle of its biggest part where the table of capitals does not know one).
 */
export type PlaceRef =
  | { kind: 'polity'; id: string }
  | { kind: 'event'; id: string; name: string }
  | { kind: 'city'; id: string; name: string }
  | { kind: 'point'; point: PlacePoint; name?: string };

/** What one drawing may hold at most: a map stays readable however much the model asks for. */
export const LIMITS = {
  highlights: 8,
  links: 6,
  marks: 8,
  routes: 4,
  /** The stops of one route. */
  stops: 8,
  /** The sides of a conflict, and the polities of one side. */
  sides: 3,
  sidePolities: 8,
  events: 6,
  label: 28,
  /** A sanity limit, not a shape: the number of scenes of an answer is the model's to decide. */
  steps: 60,
  title: 64,
  /** A step's caption (the subtitle over the map): a sentence or two. */
  caption: 340,
} as const;

/**
 * One map action the model asked for, already checked against the data: polity ids exist and have borders
 * in the selected range, points lie on the map, the year lies inside the range, an event is one of the
 * app's own. `step` is 1-based; an action belongs to that step alone.
 *
 * The model decides WHAT the map shows and the app decides HOW it looks: an `event` is drawn by the app in a
 * fixed way for its kind (its parties lit, a war's line running through its marker), a `highlight` only says
 * which polities stand out, `sides` groups polities into the sides of a conflict (the app paints each side as one
 * bloc), and `connect`, `route` and `mark` are the model's own lines, paths and points for what the data does not
 * know. Nothing here moves the camera: the app frames whatever a step shows.
 */
export type MapAction =
  | { kind: 'highlight'; step: number; polities: string[] }
  | { kind: 'connect'; step: number; from: PlaceRef; to: PlaceRef; relation: Relation; label?: string }
  | { kind: 'route'; step: number; via: PlaceRef[]; type: RouteType; label?: string; animate: boolean }
  | { kind: 'sides'; step: number; sides: Side[] }
  | { kind: 'mark'; step: number; point: PlacePoint; label: string }
  | { kind: 'event'; step: number; id: string }
  | { kind: 'set_year'; step: number; year: number };

export interface Link {
  from: PlaceRef;
  to: PlaceRef;
  relation: Relation;
  label?: string;
}

/** A directed path through ordered places: a campaign, a march, a migration, a trade road. */
export interface Route {
  via: PlaceRef[];
  type: RouteType;
  label?: string;
  /** The path draws itself when its step comes up (never when the reader asked for reduced motion). */
  animate: boolean;
}

/** One side of a conflict: a name and the polities that stand together. The app paints each side as one bloc. */
export interface Side {
  name: string;
  polities: string[];
}

/** A place the AI marks itself: for things the app's data does not know (a town, a ford, a port). */
export interface Mark {
  point: PlacePoint;
  label: string;
}

/**
 * What the AI shows on the map for one step. Polities are ids; where they lie depends on the year shown.
 * A step owns its drawing: nothing is inherited from the step before, and nothing is left behind for the
 * step after.
 */
export interface Drawing {
  /** The polities the step says stand out, besides the parties of its events (those are lit by the app). */
  highlights: string[];
  /** The model's own lines, for relations the data has no event for. */
  links: Link[];
  /** Directed paths through places. */
  routes: Route[];
  /** The sides of the conflict the step is about: each is painted as one bloc. */
  sides: Side[];
  /** The model's own points, for places the data has no event for. */
  marks: Mark[];
  /** Events of the app's own data the step talks about: the app draws each by its kind, with its own marker. */
  events: string[];
  /**
   * The border year the step shows (inside the selected range): the one the model named, else the borders at the start
   * of the earliest event it shows (`Resolver.showYearOf`: the event's year, or the year before when a main party of it
   * ended in that year); undefined leaves the year to the reader.
   */
  year?: number;
}

/** A drawing with its polities turned into places on the map, for the year shown. */
export interface ResolvedLink extends Link {
  a: PlacePoint;
  b: PlacePoint;
}

/** A route with its stops turned into points on the map, for the year shown. */
export interface ResolvedRoute extends Route {
  points: PlacePoint[];
}

/** A side of the conflict in the year shown: its place in the drawing's order (which fixes its colour) and the polities of it that have borders then. */
export interface ResolvedSide {
  /** 0-based position among the drawing's sides: the side's colour is the app's `index`th bloc colour. */
  index: number;
  name: string;
  polities: string[];
}

/**
 * The two sides of a war event, as the map draws them: a line leaves each side from the capital of its first party
 * (that year's capital; the middle of its biggest part where the table of capitals has none) and runs through the
 * event's marker, so the marker and the line read as one thing.
 */
export interface ResolvedWar {
  aId: string;
  bId: string;
  /** Where the line leaves the first side's polity, and the second's. */
  a: PlacePoint;
  b: PlacePoint;
}

/** An event the step talks about, as the map needs it: its marker's place, its parties, and its war line if it has one. */
export interface ResolvedEvent {
  id: string;
  title: string;
  category: string;
  point: PlacePoint;
  /** The event's parties that have borders in the year shown: lit with the rest of the step's polities. */
  parties: string[];
  war?: ResolvedWar;
}

export interface ResolvedDrawing {
  /**
   * The polities in the spotlight, with borders in the year shown (the rest cannot be drawn and are left out):
   * the ones the model named, the parties of the events it shows, and the ends of its own lines. They are drawn
   * solid and vivid while everything else fades.
   */
  spotIds: string[];
  /** The model's own lines (a war line the data already draws for an event is not repeated here). */
  links: ResolvedLink[];
  routes: ResolvedRoute[];
  /** The sides that have at least one polity with borders in the year shown. */
  sides: ResolvedSide[];
  marks: Mark[];
  events: ResolvedEvent[];
}

export const EMPTY_RESOLVED: ResolvedDrawing = {
  spotIds: [],
  links: [],
  routes: [],
  sides: [],
  marks: [],
  events: [],
};

/**
 * Everything a step put on the map, as the camera sees it: points (event markers, the ends of the lines, the stops of the
 * routes, marks) and boxes (for each polity in the spotlight, the part of it that the scene is about: the part that reaches
 * into the surroundings of the points, cut at their edge; its body where there are no points). The camera brings all of it
 * into view, not the whole territory of the polities (their colonies, Alaska, Greenland).
 */
export interface FrameTarget {
  boxes: Bounds[];
  points: PlacePoint[];
}
