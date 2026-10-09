import type { AppData } from '../data/load';
import { elsewhere, mapEventsInRange, nearestEvent, timelineEvents } from '../domain/events';
import { resolvePlace } from '../domain/geo';
import { detailDomain, displayYear } from '../domain/time';
import type { Entity, HistoricalEvent, PlaceResolution, YearRange } from '../domain/types';
import type { AppState } from './store';

/** One place's slice of the view: what the info panel column and the timeline lane show. */
export interface PlaceView {
  resolution: PlaceResolution;
  /** The polity holding the point at the shown year (null on blank land). */
  holder: Entity | null;
  regions: Entity[];
  /** Region/polity title for the heading. */
  title: string;
  /** Events on this place's timeline inside the detail domain. */
  timeline: HistoricalEvent[];
  /** Closest event in time, for the empty-state hint. */
  nearest: HistoricalEvent | null;
  /** Global events in the range that do not involve this place. */
  elsewhere: HistoricalEvent[];
}

export interface ViewModel {
  range: YearRange;
  year: number;
  cursor: number;
  domain: YearRange;
  /** Map content: depends only on the time range. */
  mapEvents: HistoricalEvent[];
  places: PlaceView[];
  selectedEvent: HistoricalEvent | null;
}

export function deriveView(state: AppState, data: AppData): ViewModel {
  const year = displayYear(state.range, state.cursor);
  const domain = detailDomain(state.range, data.extent);
  const mapEvents = mapEventsInRange(data.events, state.range);

  const places: PlaceView[] = state.places.map((point) => {
    const resolution = resolvePlace(data.rows, data.entities.values(), point, year, domain);
    const holder = resolution.row ? (data.entities.get(resolution.row.id) ?? null) : null;
    const regions = resolution.regions.map((id) => data.entities.get(id)).filter((e): e is Entity => !!e);
    const title = holder?.name ?? regions[0]?.name ?? 'Kayıtlı devlet yok';
    return {
      resolution,
      holder,
      regions,
      title,
      timeline: timelineEvents(data.events, resolution.lineage, domain),
      nearest: nearestEvent(data.events, resolution.lineage, year + 0.5),
      elsewhere: elsewhere(mapEvents, resolution.lineage),
    };
  });

  return {
    range: state.range,
    year,
    cursor: state.cursor,
    domain,
    mapEvents,
    places,
    selectedEvent: state.selectedEventId ? (data.eventsById.get(state.selectedEventId) ?? null) : null,
  };
}
