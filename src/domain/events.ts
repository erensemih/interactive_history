import { formatDateRange, overlaps, parseDate, rangeInterval } from './time';
import type { HistoricalEvent, Importance, SourceRef, YearRange } from './types';

/** Events at or above this importance are "globally important": they get a marker on the map. */
export const MAP_MIN_IMPORTANCE: Importance = 3;

/* ------------------------------------------------------------ normalisation */

interface RawDate {
  start: string;
  end?: string;
  approximate?: boolean;
}

export interface RawEvent {
  id: string;
  title: { tr: string };
  summary: { tr: string };
  date: string | RawDate;
  location: { name: { tr: string }; coordinates: [number, number] };
  importance: number;
  category: string;
  parties: string[];
  sources: Array<{ wikipedia?: string; wikidata?: string; lang?: string; url?: string; title?: string }>;
}

export function sourceUrl(src: RawEvent['sources'][number]): SourceRef | null {
  if (src.wikipedia) {
    const lang = src.lang ?? 'en';
    return {
      kind: 'wikipedia',
      title: src.wikipedia,
      lang,
      url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(src.wikipedia.replace(/ /g, '_'))}`,
    };
  }
  if (src.wikidata) return { kind: 'wikidata', id: src.wikidata, url: `https://www.wikidata.org/wiki/${src.wikidata}` };
  if (src.url) return { kind: 'url', title: src.title ?? src.url, url: src.url };
  return null;
}

export function normalizeEvent(raw: RawEvent, set: string): HistoricalEvent {
  const rd: RawDate = typeof raw.date === 'string' ? { start: raw.date } : raw.date;
  const start = parseDate(rd.start);
  const end = rd.end ? parseDate(rd.end) : null;
  const approximate = rd.approximate === true;
  const startAt = start.start;
  const endAt = Math.max(end ? end.end : start.end, start.end);
  return {
    id: raw.id,
    title: raw.title.tr,
    summary: raw.summary.tr,
    start: startAt,
    end: endAt,
    approximate,
    range: end !== null,
    dateLabel: formatDateRange(start, end, approximate),
    year: start.year,
    location: { name: raw.location.name.tr, lon: raw.location.coordinates[0], lat: raw.location.coordinates[1] },
    importance: raw.importance as Importance,
    category: raw.category,
    parties: raw.parties,
    sources: raw.sources.map(sourceUrl).filter((s): s is SourceRef => s !== null),
    set,
  };
}

/* ---------------------------------------------------------------- selection */

export function inRange(ev: HistoricalEvent, range: YearRange): boolean {
  const [a, b] = rangeInterval(range);
  return overlaps(ev.start, ev.end, a, b);
}

/** Events eligible for the map in this time range. Independent of any selected place. */
export function mapEventsInRange(events: HistoricalEvent[], range: YearRange): HistoricalEvent[] {
  return events.filter((e) => e.importance >= MAP_MIN_IMPORTANCE && inRange(e, range));
}

/** How many markers the map may carry at a zoom level: world view stays calm, zooming in adds more. */
export function markerBudget(zoom: number): number {
  return Math.max(6, Math.round(10 * 2 ** (0.8 * (zoom - 1.8))));
}

/** Importance first, then closeness to the displayed border year, then id (stable). */
export function markerPriority(a: HistoricalEvent, b: HistoricalEvent, focusYear: number): number {
  if (a.importance !== b.importance) return b.importance - a.importance;
  const da = Math.abs((a.start + a.end) / 2 - focusYear - 0.5);
  const db = Math.abs((b.start + b.end) / 2 - focusYear - 0.5);
  if (da !== db) return da - db;
  return a.id < b.id ? -1 : 1;
}

export function pickMarkers(
  candidates: HistoricalEvent[],
  opts: { zoom: number; focusYear: number },
): HistoricalEvent[] {
  const sorted = [...candidates].sort((a, b) => markerPriority(a, b, opts.focusYear));
  return sorted.slice(0, markerBudget(opts.zoom));
}

/** Events on a place's timeline: any party in the place's lineage, inside the window. No distance test. */
export function timelineEvents(events: HistoricalEvent[], lineage: Set<string>, window: YearRange): HistoricalEvent[] {
  const [a, b] = rangeInterval(window);
  return events
    .filter((e) => overlaps(e.start, e.end, a, b) && e.parties.some((p) => lineage.has(p)))
    .sort((x, y) => x.start - y.start || y.importance - x.importance || (x.id < y.id ? -1 : 1));
}

/** The place's event closest in time to `t` (for the empty-state hint). */
export function nearestEvent(events: HistoricalEvent[], lineage: Set<string>, t: number): HistoricalEvent | null {
  let best: HistoricalEvent | null = null;
  let bestDist = Infinity;
  for (const e of events) {
    if (!e.parties.some((p) => lineage.has(p))) continue;
    const d = t < e.start ? e.start - t : t > e.end ? t - e.end : 0;
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

/** Events that are not about this place (the "elsewhere at the same time" list). */
export function elsewhere(events: HistoricalEvent[], lineage: Set<string> | null): HistoricalEvent[] {
  if (!lineage) return events;
  return events.filter((e) => !e.parties.some((p) => lineage.has(p)));
}
