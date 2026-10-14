import type { Bounds, PlacePoint } from '../domain/types';

/**
 * The kinds of route the model may draw. Each has one look on the map (src/styles/ai.css), the same every time: an army's
 * advance or campaign, a retreat, a migration or flight, a trade or supply road. A route is an actual movement and the
 * only line the map draws: an arrow.
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
 * A place the model names as a stop of a route. Routes run between PLACES, never between the middles of polities: an
 * event of the data, a city of the gazetteer, a point, a polity (which stands for its capital in the year shown), or
 * the border of a polity toward another place (the point of that border nearest to it: where an army starts from a
 * front, not from a capital).
 */
export type PlaceRef =
  | { kind: 'polity'; id: string }
  | { kind: 'event'; id: string; name: string }
  | { kind: 'city'; id: string; name: string }
  | { kind: 'point'; point: PlacePoint; name?: string }
  | { kind: 'border'; id: string; toward: PlaceRef };

/** What one scene may hold at most: a map stays readable however much the model asks for. */
export const LIMITS = {
  highlights: 8,
  marks: 10,
  routes: 6,
  /** The stops of one route. */
  stops: 8,
  /** The sides of a conflict, and the polities of one side (or of the neutral ones). */
  sides: 3,
  sidePolities: 8,
  events: 10,
  changes: 6,
  label: 28,
  /** A sanity limit, not a shape: the number of scenes of an answer is the model's to decide. */
  steps: 60,
  /** The beats of a scene: its caption's sentences, one beat each (a sanity limit too). */
  beats: 12,
  title: 64,
  /** A scene's caption (the subtitle over the map): a few sentences, each of them a beat. */
  caption: 640,
} as const;

/**
 * One map action the model asked for, already checked against the data: polity ids exist and have borders
 * in the selected range, points lie on the map, the year lies inside the range, an event is one of the
 * app's own. `step` is 1-based and an action belongs to that scene alone; `beat` is 1-based too: the sentence of the
 * scene's caption it appears with.
 *
 * The model decides WHAT the map shows and the app decides HOW it looks, with one meaning for every kind of mark: an area
 * is territory or control (`sides` paints blocs, `territory` shows what a polity gained or lost; `highlight` only points at a
 * polity), an arrow is a movement (`route`), a point is a place or an event (`event`, `mark`). Nothing here moves the
 * camera: the app frames whatever a scene will show.
 */
export type MapAction =
  | { kind: 'highlight'; step: number; beat: number; polities: string[] }
  | { kind: 'route'; step: number; beat: number; via: PlaceRef[]; type: RouteType; label?: string; animate: boolean }
  | { kind: 'sides'; step: number; beat: number; sides: Side[]; neutral: string[] }
  | { kind: 'mark'; step: number; beat: number; point: PlacePoint; label: string }
  | { kind: 'event'; step: number; beat: number; id: string }
  | { kind: 'territory'; step: number; beat: number; polity: string; from: number; to: number }
  | { kind: 'set_year'; step: number; year: number };

/** A directed path through ordered places: a campaign, a march, a migration, a trade road. */
export interface Route {
  via: PlaceRef[];
  type: RouteType;
  label?: string;
  /** The arrow draws itself in when its beat comes (never when the reader asked for reduced motion). */
  animate: boolean;
}

/** One side of a conflict: a name and the polities that stand together. */
export interface Side {
  name: string;
  polities: string[];
}

/** A place the AI marks itself: for things the app's data does not know (a town, a ford, a port). */
export interface Mark {
  point: PlacePoint;
  label: string;
}

/** What a polity gained and lost between two years of the border data. */
export interface TerritoryChange {
  polity: string;
  from: number;
  to: number;
}

/**
 * What the AI shows on the map for one scene, all of its beats together (what the camera frames, what is said in words).
 * Polities are ids; where they lie depends on the year shown. A scene owns its drawing: nothing is inherited from the
 * scene before, and nothing is left behind for the scene after (but for the colours of the actors, which are the
 * narration's: see `Actors`).
 */
export interface Drawing {
  /** The polities the scene points at (emphasis: they keep their own colour). */
  highlights: string[];
  /** Directed paths through places. */
  routes: Route[];
  /** The sides of the conflict the scene is about: the blocs of its latest `sides`, the neutral ones next to them. */
  sides: Side[];
  neutral: string[];
  /** The model's own points, for places the data has no event for. */
  marks: Mark[];
  /** Events of the app's own data the scene talks about: each is a marker. */
  events: string[];
  /** Border changes the scene shows, in the order of their beats. */
  changes: TerritoryChange[];
  /**
   * The border year the scene starts at (inside the selected range): the one the model named, else the borders at the start
   * of the earliest event it shows (`Resolver.showYearOf`: the event's year, or the year before when a main party of it
   * ended in that year), else the `from` of its first territory change; undefined leaves the year to the reader.
   */
  year?: number;
}

/* ---------------------------------------------------------------- the colours of the actors */

/**
 * The colour of an actor in a narration, by its part: the side the narration is about (`focus`), the sides against it
 * (`foe-1`, `foe-2`), the polities that stand aside or whose side is unclear (`neutral`). The same actor has the same
 * colour in every scene, and no two opposing sides ever share one.
 */
export type ColorKey = 'focus' | 'foe-1' | 'foe-2' | 'neutral';
export const COLOR_KEYS: readonly ColorKey[] = ['focus', 'foe-1', 'foe-2', 'neutral'];

/** A side as the map shows it: its name in its colour (the legend under the caption), and who stands on it. */
export interface Bloc {
  name: string;
  color: ColorKey;
  polities: string[];
}

/* ---------------------------------------------------------------- a scene at one moment */

/** Where a scene is: the beat that plays (0-based) and whether the scene has ended; `replay` changes when a beat is played again. */
export interface SceneClock {
  n: number;
  beat: number;
  done: boolean;
  replay: number;
}

/**
 * What a scene shows at one moment of its beats, before it is tied to a year: the arrows of the beat that plays, the
 * markers of the beats so far (the one that plays prominent, the others small numbered dots), the colours of the actors so
 * far, what the beat points at, and the changes of borders so far.
 */
export interface Frame {
  /** The border year of this moment (undefined: the reader's own). */
  year?: number;
  /** The polities the playing beat points at (never after the scene's end). */
  emphasis: string[];
  /** Every polity that has an actor colour, in the order it got it. */
  painted: { id: string; color: ColorKey }[];
  /** The sides in effect, for the names under the caption. */
  blocs: Bloc[];
  events: { id: string; beat: number; now: boolean }[];
  marks: { mark: Mark; beat: number; now: boolean }[];
  /** The arrows of the playing beat (none after the scene's end). */
  routes: { route: Route; beat: number }[];
  changes: { change: TerritoryChange; beat: number; now: boolean }[];
  /** Changes with every beat: a beat played again starts its animations again. */
  replay: number;
}

export const EMPTY_FRAME: Frame = {
  emphasis: [],
  painted: [],
  blocs: [],
  events: [],
  marks: [],
  routes: [],
  changes: [],
  replay: 0,
};

/* ---------------------------------------------------------------- a frame tied to a year */

/** A route with its stops turned into points on the map, for the year shown. */
export interface ResolvedRoute extends Route {
  /** The stops as points whose longitudes run on, so a route across the date line takes the short way (see `unwrapPath`). */
  points: PlacePoint[];
}

/** An event the scene talks about, as the map needs it: its marker's place and what it is called. */
export interface ResolvedEvent {
  id: string;
  title: string;
  category: string;
  point: PlacePoint;
  /** The beat it appears with (1-based): the number of its dot once the beat is over. */
  beat: number;
  /** Its beat is the one playing: the marker is prominent; else it is a small numbered dot. */
  now: boolean;
}

export interface ResolvedMark extends Mark {
  beat: number;
  now: boolean;
}

/** A change of borders ready to be drawn: the years, and the polity whose gain and loss it is (it has rows in both years). */
export interface ResolvedChange extends TerritoryChange {
  beat: number;
  /** The beat is playing: the gained and lost land flash. */
  now: boolean;
}

export interface ResolvedFrame {
  /** The border year the map shows at this moment. */
  year: number;
  /** The polities that stand out: the ones the playing beat points at. */
  emphasis: string[];
  /** The polities drawn in their actor colour (the ones with borders in the year shown). */
  painted: { id: string; color: ColorKey }[];
  blocs: Bloc[];
  events: ResolvedEvent[];
  marks: ResolvedMark[];
  routes: ResolvedRoute[];
  changes: ResolvedChange[];
  replay: number;
}

export const EMPTY_RESOLVED: ResolvedFrame = {
  year: 0,
  emphasis: [],
  painted: [],
  blocs: [],
  events: [],
  marks: [],
  routes: [],
  changes: [],
  replay: 0,
};

/**
 * Everything a scene puts on the map, as the camera sees it: points (event markers, the stops of the routes, marks) and
 * boxes (for each polity the scene points at or paints or changes, the part of it that the scene is about: the part that
 * reaches into the surroundings of the points, cut at their edge; its body where there are no points). The camera brings all of
 * it into view, once, when the scene begins; not the whole territory of the polities (their colonies, Alaska, Greenland).
 * Longitudes run on over the date line where the narrowest view is the one across it.
 */
export interface FrameTarget {
  boxes: Bounds[];
  points: PlacePoint[];
}
