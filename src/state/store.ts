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
  /** Selected places. One for now; the shape is ready for two-place comparison. */
  places: PlacePoint[];
  selectedEventId: string | null;
  hoverEventId: string | null;
}

export type Listener = (state: AppState, prev: AppState) => void;

export class Store {
  private current: AppState;
  private listeners = new Set<Listener>();

  constructor(initial: AppState, private readonly extent: YearRange) {
    this.current = initial;
  }

  get state(): AppState {
    return this.current;
  }

  get yearExtent(): YearRange {
    return this.extent;
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

  /* ------------------------------------------------------------- actions */

  /** Sets the range; `keepYear` keeps the displayed border year inside the new range when possible. */
  setRange(range: YearRange, opts: { keepCursor?: boolean } = {}) {
    const next = normalizeRange(range, this.extent);
    const prev = this.current;
    if (next.from === prev.range.from && next.to === prev.range.to) return;
    let cursor = prev.cursor;
    if (!opts.keepCursor) {
      // Keep the shown year's relative place inside the window when it is dragged or resized.
      cursor = next.from === next.to ? 0.5 : prev.cursor;
    }
    this.set({ range: next, cursor });
  }

  shiftBy(deltaYears: number) {
    this.setRange(shiftRange(this.current.range, deltaYears, this.extent), { keepCursor: true });
  }

  setPreset(spanYears: number) {
    this.setRange(presetRange(this.current.range, spanYears, this.extent));
  }

  /** Jumps to a displayed border year, widening nothing: clamps to the current range. */
  setDisplayYear(year: number) {
    this.set({ cursor: cursorFor(this.current.range, year) });
  }

  setCursor(cursor: number) {
    this.set({ cursor: Math.min(1, Math.max(0, cursor)) });
  }

  /** Focus a single year (e.g. "go to this event's year"). */
  focusYear(year: number, span = 1) {
    this.setRange(presetRange({ from: year, to: year }, span, this.extent));
  }

  selectPlace(point: PlacePoint | null) {
    this.set({ places: point ? [point] : [] });
  }

  selectEvent(id: string | null) {
    this.set({ selectedEventId: id });
  }

  hoverEvent(id: string | null) {
    this.set({ hoverEventId: id });
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
};
