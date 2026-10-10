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
export const LIMITS = { highlights: 8, links: 6, marks: 8, events: 6, label: 28, steps: 12, title: 64 } as const;

/**
 * One map action the model asked for, already checked against the data: polity ids exist and have borders
 * in the selected range, points lie on the map, the year lies inside the range, an event is one of the
 * app's own. `step` is 1-based; an action belongs to that step alone.
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
  highlights: string[];
  links: Link[];
  marks: Mark[];
  /** Events of the app's own data the step talks about: they appear with their own markers, not as marks. */
  events: string[];
  /** The border year the step asked for (inside the selected range); undefined leaves the year to the reader. */
  year?: number;
}

/** A drawing with its polities turned into places on the map, for the year shown. */
export interface ResolvedLink extends Link {
  a: PlacePoint;
  b: PlacePoint;
}

/** An event the step talks about, as the map needs it: which marker to show and where its name hangs. */
export interface ResolvedEvent {
  id: string;
  title: string;
  point: PlacePoint;
}

export interface ResolvedDrawing {
  /** Polities that have borders in the year shown (the rest cannot be drawn and are left out). */
  highlightIds: string[];
  links: ResolvedLink[];
  marks: Mark[];
  events: ResolvedEvent[];
}

export const EMPTY_RESOLVED: ResolvedDrawing = { highlightIds: [], links: [], marks: [], events: [] };

/**
 * Everything a step put on the map, as the camera sees it: boxes (the main parts of the highlighted
 * polities) and points (link ends, marks, events). The camera brings all of it into view.
 */
export interface FrameTarget {
  boxes: Bounds[];
  points: PlacePoint[];
}
