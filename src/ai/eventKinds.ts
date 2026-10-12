import type { HistoricalEvent } from '../domain/types';

/**
 * How an event of the data looks on the map is the app's decision, fixed by its category, so every event of a kind
 * looks the same way every time. A war (military) lights its parties and draws one line between the two sides that
 * runs through the event's own marker; every other kind lights its parties and shows its marker.
 */
export type EventKind = 'war' | 'plain';

export const eventKindOf = (category: string): EventKind => (category === 'military' ? 'war' : 'plain');

/** The two sides of a war event: who fought whom, each side as a list in the order the data gives them. */
export function warSides(ev: Pick<HistoricalEvent, 'parties' | 'versus'>): { first: string[]; second: string[] } | null {
  const [head, ...rest] = ev.parties;
  if (!head) return null;
  if (ev.versus?.length) {
    const second = ev.versus.filter((p) => p !== head);
    const first = ev.parties.filter((p) => !second.includes(p));
    return second.length ? { first, second } : null;
  }
  return rest.length ? { first: [head], second: rest } : null;
}
