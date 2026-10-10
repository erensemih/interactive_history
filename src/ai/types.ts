import type { PlacePoint } from '../domain/types';

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
export const LIMITS = { highlights: 8, links: 6, marks: 8, label: 28, steps: 12, title: 64 } as const;

/**
 * One map action the model asked for, already checked against the data: polity ids exist and have borders
 * in the selected range, points lie on the map, the year lies inside the range. `step` is 1-based.
 */
export type MapAction =
  | { kind: 'highlight'; step: number; polities: string[] }
  | { kind: 'connect'; step: number; from: string; to: string; relation: Relation; label?: string }
  | { kind: 'mark'; step: number; point: PlacePoint; label: string }
  | { kind: 'set_year'; step: number; year: number }
  | { kind: 'focus'; step: number; polities: string[]; points: PlacePoint[] }
  | { kind: 'clear'; step: number };

export interface Link {
  from: string;
  to: string;
  relation: Relation;
  label?: string;
}

export interface Mark {
  point: PlacePoint;
  label: string;
}

/** What the AI has drawn on the map at one moment. Polities are ids; where they lie depends on the year shown. */
export interface Drawing {
  highlights: string[];
  links: Link[];
  marks: Mark[];
  /** The border year the AI asked for (inside the selected range); undefined leaves the year to the reader. */
  year?: number;
}

/** What the camera should bring into view (the only thing that may move the map). */
export interface FocusTarget {
  polities: string[];
  points: PlacePoint[];
}

/** A drawing with its polities turned into places on the map, for the year shown. */
export interface ResolvedLink extends Link {
  a: PlacePoint;
  b: PlacePoint;
}

export interface ResolvedDrawing {
  /** Polities that have borders in the year shown (the rest cannot be drawn and are left out). */
  highlightIds: string[];
  links: ResolvedLink[];
  marks: Mark[];
}

export const EMPTY_RESOLVED: ResolvedDrawing = { highlightIds: [], links: [], marks: [] };
