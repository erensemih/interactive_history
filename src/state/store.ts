import { cursorFor, displayYear, normalizeRange, presetRange, shiftRange } from '../domain/time';
import type { PlacePoint, YearRange } from '../domain/types';

/**
 * Everything the user can change. Note what is *not* here: the map's centre and zoom. Selecting a
 * place or an event never touches the map view; only the user's own drag/zoom does.
 */
export interface AppState {
  /** The selected time range (inclusive years). Drives the map's content. */
  range: YearRange;
  /** 0..1: where inside the range the shown borders sit. */
  cursor: number;
  /** Selected places (at most MAX_PLACES). A list so two-place comparison needs no change of shape. */
  places: PlacePoint[];
  selectedEventId: string | null;
  hoverEventId: string | null;
  /** The reading-companion chat takes the info panel's place. Not part of the link: a conversation does not travel with it. */
  chatOpen: boolean;
}

export type Listener = (state: AppState, prev: AppState) => void;

/** How many places can be selected at once. The state, the URL and the panel are built for a list;
 *  raising this (and giving the timeline one lane per place) is what comparison mode needs. */
export const MAX_PLACES = 1;

export class Store {
  private current: AppState;
  private listeners = new Set<Listener>();

  constructor(
    initial: AppState,
    private readonly extent: YearRange,
  ) {
    this.current = initial;
  }

  get state(): AppState {
    return this.current;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<AppState>) {
    const prev = this.current;
    const next = { ...prev, ...patch };
    // Cheap structural no-op check so listeners are not woken for nothing.
    if ((Object.keys(patch) as (keyof AppState)[]).every((k) => Object.is(prev[k], next[k]))) return;
    this.current = next;
    for (const fn of this.listeners) fn(next, prev);
  }

  /** Replaces the whole state (a link opened in this tab). */
  replace(next: AppState) {
    const prev = this.current;
    this.current = next;
    for (const fn of this.listeners) fn(next, prev);
  }

  /** Re-notify listeners without changing state (for purely visual, view-local toggles). */
  refresh() {
    for (const fn of this.listeners) fn(this.current, this.current);
  }

  /* ------------------------------------------------------------- actions */

  /** Sets the range (clamped to the dataset). The cursor keeps its relative place inside the window. */
  setRange(range: YearRange) {
    const next = normalizeRange(range, this.extent);
    const prev = this.current;
    if (next.from === prev.range.from && next.to === prev.range.to) return;
    this.set({ range: next, cursor: next.from === next.to ? 0.5 : prev.cursor });
  }

  shiftBy(deltaYears: number) {
    this.setRange(shiftRange(this.current.range, deltaYears, this.extent));
  }

  /** Jumps to a displayed border year, widening nothing: clamps to the current range. */
  setDisplayYear(year: number) {
    this.set({ cursor: cursorFor(this.current.range, year) });
  }

  /** Focus a single year (e.g. "go to this event's year"). */
  focusYear(year: number, span = 1) {
    this.setRange(presetRange({ from: year, to: year }, span, this.extent));
  }

  /** Replaces the selection with this place (or clears it). */
  selectPlace(point: PlacePoint | null) {
    this.set({ places: point ? [point] : [] });
  }

  selectEvent(id: string | null) {
    this.set({ selectedEventId: id });
  }

  hoverEvent(id: string | null) {
    this.set({ hoverEventId: id });
  }

  setChat(open: boolean) {
    this.set({ chatOpen: open });
  }

  get shownYear(): number {
    return displayYear(this.current.range, this.current.cursor);
  }
}

export const DEFAULT_STATE: AppState = {
  range: { from: 1490, to: 1520 },
  cursor: 0.5,
  places: [],
  selectedEventId: null,
  hoverEventId: null,
  chatOpen: false,
};
