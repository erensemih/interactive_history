import type { HistoricalEvent } from '../domain/types';

/**
 * What kind an event is matters to the app in one place: which borders its scene shows (`Resolver.showYearOf`). A war
 * (military) needs both its sides on the map at the event's start, any other event one of its parties. Nothing is drawn by
 * kind any more: an event is shown by its own marker, and who is lit, painted or joined by an arrow is the model's to say.
 */
export type EventKind = 'war' | 'plain';

export const eventKindOf = (category: string): EventKind => (category === 'military' ? 'war' : 'plain');

/** The two sides of a war event: who fought whom, each side as a list in the order the data gives them. */
export function warSides(
  ev: Pick<HistoricalEvent, 'parties' | 'versus'>,
): { first: string[]; second: string[] } | null {
  const [head, ...rest] = ev.parties;
  if (!head) return null;
  if (ev.versus?.length) {
    const second = ev.versus.filter((p) => p !== head);
    const first = ev.parties.filter((p) => !second.includes(p));
    return second.length ? { first, second } : null;
  }
  return rest.length ? { first: [head], second: rest } : null;
}
