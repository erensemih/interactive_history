import { overlaps } from '../domain/time';
import type { HistoricalEvent } from '../domain/types';
import type { AiContext } from './context';

/** At most this many steps: a narration should not be tiring to watch. */
export const OUTLINE_MAX = 6;
/** Fewer events than this and there is nothing to outline: the model tells it as it sees fit. */
export const OUTLINE_MIN = 3;

/** One step of the app's outline: an event of the data, the turning point the step is about. */
export interface OutlineStep {
  id: string;
  title: string;
  dateLabel: string;
  place: string;
  year: number;
}

/**
 * The outline of a narration, made by the app from the data and nothing else: the main turning points of what was
 * asked about, in date order, one step each. It depends only on the subject (the place and the range), so the same ask
 * in the same context always gets the same outline, and with it the same number of steps, the same events and the
 * same order, however the model words them. (The map year, the open event and the conversation are not part of it.)
 *
 *  - with a place: the events whose parties include the polity that held it (or its parents, or the region) in the range,
 *    the same ones its timeline lists; without one: every event of the range;
 *  - the most important first (importance, then the earlier date, then the id), `OUTLINE_MAX` of them, then in date order.
 */
export function narrationOutline(context: AiContext, events: readonly HistoricalEvent[]): OutlineStep[] {
  const lineage = new Set(context.places.flatMap((p) => p.lineage));
  const { from, to } = context.range;
  const chosen = events
    .filter((e) => overlaps(e.start, e.end, from, to + 1) && (!lineage.size || e.parties.some((p) => lineage.has(p))))
    .sort((a, b) => b.importance - a.importance || a.start - b.start || (a.id < b.id ? -1 : 1))
    .slice(0, OUTLINE_MAX)
    .sort((a, b) => a.start - b.start || b.importance - a.importance || (a.id < b.id ? -1 : 1));
  if (chosen.length < OUTLINE_MIN) return [];
  return chosen.map((e) => ({ id: e.id, title: e.title, dateLabel: e.dateLabel, place: e.location.name, year: e.year }));
}
