import type { AppData } from '../data/load';
import { elsewhere, mapEventsInRange, nearestEvent, timelineEvents } from '../domain/events';
import { resolvePlace } from '../domain/geo';
import { detailDomain, displayYear } from '../domain/time';
import type { Entity, HistoricalEvent, PlacePoint, PlaceResolution, YearRange } from '../domain/types';
import type { AppState } from './store';

/**
 * What a card in the info panel is about: a place or an event, by id. The panel is driven by these
 * references, so any combination of cards (a place, an event, two of either) is just a different list.
 */
export type SelectionRef = { type: 'place'; id: string } | { type: 'event'; id: string };

/** A place is a point on the map; its id is that point, rounded to ~100 m. */
export const placeId = (p: PlacePoint): string => `${p.lon.toFixed(3)},${p.lat.toFixed(3)}`;

/** One place's slice of the view: what the info panel column and the timeline lane show. */
export interface PlaceView {
  /** `placeId` of the clicked point (the `id` of this place's `SelectionRef`). */
  id: string;
  point: PlacePoint;
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
}

export interface ViewModel {
  range: YearRange;
  year: number;
  cursor: number;
  domain: YearRange;
  /** Map content: depends only on the time range. */
  mapEvents: HistoricalEvent[];
  places: PlaceView[];
  /** Map events that involve none of the selected places (all of them when nothing is selected). */
  elsewhere: HistoricalEvent[];
  selectedEvent: HistoricalEvent | null;
}

/**
 * `yearOverride` is the year the AI's current step asks for; it only counts inside the selected range.
 * The reader's own cursor stays in the state, untouched, and comes back when the override goes away.
 */
export function deriveView(state: AppState, data: AppData, yearOverride: number | null = null): ViewModel {
  const asked = yearOverride !== null && yearOverride >= state.range.from && yearOverride <= state.range.to;
  const year = asked ? yearOverride : displayYear(state.range, state.cursor);
  const domain = detailDomain(state.range, data.extent);
  const mapEvents = mapEventsInRange(data.events, state.range);

  const places: PlaceView[] = state.places.map((point) => {
    const resolution = resolvePlace(data.rows, data.entities.values(), point, year, domain);
    const holder = resolution.row ? (data.entities.get(resolution.row.id) ?? null) : null;
    const regions = resolution.regions.map((id) => data.entities.get(id)).filter((e): e is Entity => !!e);
    const title = holder?.name ?? regions[0]?.name ?? 'Kayıtlı devlet yok';
    return {
      id: placeId(point),
      point,
      resolution,
      holder,
      regions,
      title,
      timeline: timelineEvents(data.events, resolution.lineage, domain),
      nearest: nearestEvent(data.events, resolution.lineage, year + 0.5),
    };
  });
  const lineages = new Set(places.flatMap((p) => [...p.resolution.lineage]));

  return {
    range: state.range,
    year,
    cursor: state.cursor,
    domain,
    mapEvents,
    places,
    elsewhere: places.length ? elsewhere(mapEvents, lineages) : mapEvents,
    selectedEvent: state.selectedEventId ? (data.eventsById.get(state.selectedEventId) ?? null) : null,
  };
}

/** The selections the current state describes: every selected place, and the opened event if there is one. */
export function selectionsOf(vm: ViewModel): { places: SelectionRef[]; event: SelectionRef | null } {
  return {
    places: vm.places.map((p) => ({ type: 'place' as const, id: p.id })),
    event: vm.selectedEvent ? { type: 'event' as const, id: vm.selectedEvent.id } : null,
  };
}
