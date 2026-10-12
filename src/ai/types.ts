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

/** What one drawing may hold at most: a map stays readable however much the model asks for. */
export const LIMITS = {
  highlights: 8,
  links: 6,
  marks: 8,
  events: 6,
  label: 28,
  steps: 12,
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
 * which polities stand out, and `connect` and `mark` are the model's own lines and points for what the data
 * does not know. Nothing here moves the camera: the app frames whatever a step shows.
 */
export type MapAction =
  | { kind: 'highlight'; step: number; polities: string[] }
  | { kind: 'connect'; step: number; from: string; to: string; relation: Relation; label?: string }
  | { kind: 'mark'; step: number; point: PlacePoint; label: string }
  | { kind: 'event'; step: number; id: string }
  | { kind: 'set_year'; step: number; year: number };

export interface Link {
  from: string;
  to: string;
  relation: Relation;
  label?: string;
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
  /** The model's own points, for places the data has no event for. */
  marks: Mark[];
  /** Events of the app's own data the step talks about: the app draws each by its kind, with its own marker. */
  events: string[];
  /**
   * The border year the step shows (inside the selected range): the one the model named, else the year of the
   * earliest event it shows; undefined leaves the year to the reader.
   */
  year?: number;
}

/** A drawing with its polities turned into places on the map, for the year shown. */
export interface ResolvedLink extends Link {
  a: PlacePoint;
  b: PlacePoint;
}

/**
 * The two sides of a war event, as the map draws them: a line leaves each side's polity from the part nearest the
 * event and runs through the event's marker, so the marker and the line read as one thing.
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
  marks: Mark[];
  events: ResolvedEvent[];
}

export const EMPTY_RESOLVED: ResolvedDrawing = {
  spotIds: [],
  links: [],
  marks: [],
  events: [],
};

/**
 * Everything a step put on the map, as the camera sees it: boxes (the main parts of the polities in the
 * spotlight) and points (event markers, the ends of the lines, marks). The camera brings all of it into view.
 */
export interface FrameTarget {
  boxes: Bounds[];
  points: PlacePoint[];
}
