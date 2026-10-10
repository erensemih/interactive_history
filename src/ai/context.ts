import type { AppData } from '../data/load';
import type { HistoricalEvent, PlacePoint, YearRange } from '../domain/types';
import type { ViewModel } from '../state/derive';
import { formatRange } from '../ui/format';

/** What the reader asks for: the history of the place (steps), or an answer to a question (one step). */
export type Mode = 'narration' | 'qa';

export interface ContextPlace {
  /** `placeId` of the clicked point. */
  id: string;
  point: PlacePoint;
  /** Name shown for it: the polity holding it in the year shown, else its region. */
  title: string;
  holder: { id: string; name: string } | null;
  regions: string[];
  /** Entity ids (holders, their parents, regions) whose events belong to this place. */
  lineage: string[];
  /**
   * The time range this place is read in. Today every place shares the selected range; the list shape and
   * this per-place field are what pins with a range of their own will fill in.
   */
  range: YearRange;
  /** Who held the point inside its range, oldest first. */
  sovereigns: { id: string; name: string; from: number; to: number }[];
}

export interface ContextEvent {
  id: string;
  title: string;
  category: string;
  dateLabel: string;
  placeName: string;
  summary: string;
  parties: string[];
  point: PlacePoint;
}

/** Everything the app knows about what the reader is looking at, passed to the model with every question. */
export interface AiContext {
  range: YearRange;
  /** The border year shown on the map. */
  year: number;
  places: ContextPlace[];
  /** The event card that is open, if any. */
  event: ContextEvent | null;
}

export function contextEvent(ev: HistoricalEvent, data: Pick<AppData, 'entities'>): ContextEvent {
  return {
    id: ev.id,
    title: ev.title,
    category: ev.category,
    dateLabel: ev.dateLabel,
    placeName: ev.location.name,
    summary: ev.summary,
    parties: ev.parties.map((id) => data.entities.get(id)?.name ?? id),
    point: { lon: ev.location.lon, lat: ev.location.lat },
  };
}

export function contextFromView(vm: ViewModel, data: Pick<AppData, 'entities'>): AiContext {
  const { range } = vm;
  return {
    range,
    year: vm.year,
    places: vm.places.map((p) => ({
      id: p.id,
      point: p.point,
      title: p.title,
      holder: p.holder ? { id: p.holder.id, name: p.holder.name } : null,
      regions: p.regions.map((r) => r.name),
      lineage: [...p.resolution.lineage],
      range,
      sovereigns: p.resolution.sequence
        .filter((s) => s.to >= range.from && s.from <= range.to)
        .map((s) => ({
          id: s.id,
          name: data.entities.get(s.id)?.name ?? s.id,
          from: Math.max(s.from, range.from),
          to: Math.min(s.to, range.to),
        })),
    })),
    event: vm.selectedEvent ? contextEvent(vm.selectedEvent, data) : null,
  };
}

/**
 * What a conversation is about, as far as a change should be pointed out in the chat: the places and the
 * range they are read in. The border year and the open event are not part of it (moving the cursor or
 * opening a card is not a new subject).
 */
export function subjectKey(ctx: AiContext): string {
  if (!ctx.places.length) return `world@${ctx.range.from}-${ctx.range.to}`;
  return ctx.places.map((p) => `${p.id}@${p.range.from}-${p.range.to}`).join(';');
}

/** "Osmanlı İmparatorluğu · 1500–1550", or "Dünya · 1500–1550" without a place. */
export function subjectLabel(ctx: AiContext): string {
  if (!ctx.places.length) return `Dünya · ${formatRange(ctx.range)}`;
  return ctx.places.map((p) => `${p.title} · ${formatRange(p.range)}`).join(' + ');
}
