import type { Map as MLMap } from 'maplibre-gl';
import { placeMarkers } from '../domain/placement';
import type { HistoricalEvent } from '../domain/types';
import { dotMarkup } from '../ui/dot';

export interface MarkerCallbacks {
  onClick(id: string): void;
  onHover(id: string | null, el: HTMLElement | null): void;
  /** What is drawn of the range's map events, and why the rest is not. */
  onStats?(stats: MarkerStats): void;
}

export interface MarkerStats {
  shown: number;
  total: number;
  /** In view but left out by the zoom budget or by collisions: zooming in reveals them. */
  thinned: number;
  /** Outside the current viewport: panning reveals them. */
  offscreen: number;
}

/** The pointer target of every marker (WCAG 2.5.8 asks for at least 24 × 24 px); the dot itself is smaller. */
const HIT = 24;
/** Breathing room kept between a selected marker's label and the edge of the map. */
const CALLOUT_EDGE = 8;
/** The name tag: its widest size (CSS max-width) and the room its padding adds around the text. */
const CALLOUT_MAX = 280;
const CALLOUT_PAD = 20;

/**
 * Event markers on the map: one kind of dot, coloured by category, nothing else. Which events exist
 * here depends only on the time range; how many are visible depends on zoom (a budget spent on what
 * is in view) and on screen collisions. The selected place never changes any of this.
 *
 * The one exception is the event the user has opened: it is always drawn, even when the zoom budget
 * or its importance would have hidden it, and it is unmistakable (halo, ripple, name beside it).
 *
 * Keyboard: the markers form one group with a single Tab stop; the arrow keys move between the visible
 * ones in reading order, so a screen full of markers does not turn into dozens of Tab stops.
 */
export class EventMarkers {
  private readonly host: HTMLElement;
  private readonly elements = new Map<string, HTMLButtonElement>();
  /** The range's map events (what the stats chip counts). */
  private events: HistoricalEvent[] = [];
  /** The opened event; may be one the range's set does not contain. */
  private selected: HistoricalEvent | null = null;
  private focusYear = 0;
  private hoverId: string | null = null;
  private lastKey = '';
  private lastStats = '';
  private size = { width: 0, height: 0 };
  private calloutWidth = 0;
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  /** The one marker in the Tab order (roving tabindex). */
  private tabStop: string | null = null;
  /** Visible markers, left to right then top to bottom. */
  private reading: string[] = [];
  private readonly cb: MarkerCallbacks;

  constructor(
    private readonly map: MLMap,
    container: HTMLElement,
    cb: MarkerCallbacks,
  ) {
    this.cb = cb;
    this.host = document.createElement('div');
    this.host.className = 'marker-layer';
    this.host.setAttribute('role', 'group');
    this.host.setAttribute('aria-label', 'Haritadaki olaylar. Aralarında gezinmek için ok tuşlarını kullanın.');
    this.host.addEventListener('keydown', this.onKeyDown);
    container.appendChild(this.host);
  }

  /** Everything that gets a marker element: the range's events plus the opened one. */
  private all(): HistoricalEvent[] {
    const s = this.selected;
    return s && !this.events.some((e) => e.id === s.id) ? [...this.events, s] : this.events;
  }

  private sync() {
    const all = this.all();
    const ids = new Set(all.map((e) => e.id));
    for (const [id, el] of this.elements) {
      if (!ids.has(id)) {
        el.remove();
        this.elements.delete(id);
      }
    }
    for (const ev of all) if (!this.elements.has(ev.id)) this.create(ev);
    for (const [id, el] of this.elements) {
      const on = id === this.selected?.id;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-pressed', String(on));
    }
    this.lastKey = '';
    this.layout();
  }

  setEvents(events: HistoricalEvent[], focusYear: number) {
    if (events === this.events && focusYear === this.focusYear) return;
    this.events = events;
    this.focusYear = focusYear;
    this.sync();
  }

  setFocusYear(year: number) {
    if (year === this.focusYear) return;
    this.focusYear = year;
    this.lastKey = '';
    this.layout();
  }

  setSelected(ev: HistoricalEvent | null) {
    if (ev?.id === this.selected?.id) return;
    this.selected = ev;
    this.calloutWidth = ev ? this.calloutWidthOf(ev.title) : 0;
    this.sync();
  }

  setHover(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    for (const [eid, el] of this.elements) el.classList.toggle('is-hover', eid === id);
  }

  /** Elements currently shown, for tests and tooltips. */
  visibleIds(): string[] {
    return [...this.elements].filter(([, el]) => !el.classList.contains('is-hidden')).map(([id]) => id);
  }

  private create(ev: HistoricalEvent) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'evt is-hidden';
    el.tabIndex = -1;
    el.dataset.id = ev.id;
    el.setAttribute('aria-label', `${ev.title}, ${ev.dateLabel}, ${ev.location.name}`);
    el.setAttribute('aria-pressed', 'false');
    // The opened event's name is drawn by CSS from data-title (generated content), so the button's own text
    // stays exactly its year: the visible label is then part of the accessible name, as WCAG 2.5.3 asks.
    el.dataset.title = ev.title;
    el.innerHTML = `<span class="evt-mark">${dotMarkup(ev.category)}</span><span class="evt-year">${ev.year}</span>`;
    // A drag that happens to start and end on a marker is a pan, not a click. (A keyboard click has
    // detail 0 and no position, so it is never mistaken for one.)
    let downAt: [number, number] | null = null;
    el.addEventListener('pointerdown', (e) => {
      downAt = [e.clientX, e.clientY];
    });
    el.addEventListener('pointercancel', () => {
      downAt = null;
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // never let a marker click double as a map click
      const dragged = downAt !== null && e.detail > 0 && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5;
      downAt = null;
      if (!dragged) this.cb.onClick(ev.id);
    });
    el.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'touch') this.cb.onHover(ev.id, el);
    });
    el.addEventListener('pointerleave', () => this.cb.onHover(null, null));
    el.addEventListener('focus', () => {
      this.tabStop = ev.id;
      this.syncTabStops();
      // keyboard focus names the marker; the focus a tap leaves behind must not (the tap opens the event)
      if (el.matches(':focus-visible')) this.cb.onHover(ev.id, el);
    });
    el.addEventListener('blur', () => this.cb.onHover(null, null));
    this.host.appendChild(el);
    this.elements.set(ev.id, el);
    if (this.hoverId === ev.id) el.classList.add('is-hover');
  }

  /* ---------------------------------------------------------------- keyboard */

  private syncTabStops() {
    for (const [id, el] of this.elements)
      el.tabIndex = id === this.tabStop && !el.classList.contains('is-hidden') ? 0 : -1;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const current = (e.target as HTMLElement | null)?.closest<HTMLElement>('.evt')?.dataset.id;
    if (!current || this.reading.length === 0) return;
    const at = this.reading.indexOf(current);
    let next: string | undefined;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = this.reading[Math.min(this.reading.length - 1, at + 1)];
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = this.reading[Math.max(0, at - 1)];
    else if (e.key === 'Home') next = this.reading[0];
    else if (e.key === 'End') next = this.reading[this.reading.length - 1];
    else return;
    // The map's own keyboard handler would pan on these keys; here they move focus instead.
    e.preventDefault();
    e.stopPropagation();
    if (next) this.elements.get(next)?.focus();
  };

  /* ------------------------------------------------------------------ layout */

  /** Positions the markers for the current camera. `size` is the map's pixel size, read once per frame by the caller. */
  layout(force = false, size?: { width: number; height: number }) {
    const map = this.map;
    if (size) this.size = size;
    else if (!this.size.width) {
      const canvas = map.getCanvas();
      this.size = { width: canvas.clientWidth, height: canvas.clientHeight };
    }
    const c = map.getCenter();
    const zoom = map.getZoom();
    const key = `${zoom.toFixed(3)}|${c.lng.toFixed(4)}|${c.lat.toFixed(4)}|${this.size.width}|${this.size.height}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    const selectedId = this.selected?.id ?? null;
    const { placed, offscreen, thinned } = placeMarkers({
      events: this.all(),
      zoom,
      focusYear: this.focusYear,
      selectedId,
      viewport: this.size,
      project: (ev) => map.project([ev.location.lon, ev.location.lat]),
    });

    const shown = new Set<string>();
    for (const { ev, x, y } of placed) {
      shown.add(ev.id);
      const el = this.elements.get(ev.id);
      if (!el) continue;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      const isSelected = ev.id === selectedId;
      el.style.zIndex = String(isSelected ? 30 : 10);
      el.classList.remove('is-hidden');
      if (isSelected) this.placeCallout(el, x, y);
    }

    this.reading = placed
      .slice()
      .sort((a, b) => a.x - b.x || a.y - b.y)
      .map((p) => p.ev.id);
    if (!this.tabStop || !shown.has(this.tabStop)) this.tabStop = placed[0]?.ev.id ?? null;

    for (const [id, el] of this.elements) {
      if (shown.has(id)) continue;
      el.classList.add('is-hidden');
      if (document.activeElement === el) {
        // The focused marker went out of view (zoom, pan): hand focus to one that is still there.
        const heir = this.tabStop && this.elements.get(this.tabStop);
        if (heir && heir !== el) heir.focus({ preventScroll: true });
        else el.blur();
      }
    }
    this.syncTabStops();

    const rangeIds = new Set(this.events.map((e) => e.id));
    const stats: MarkerStats = {
      shown: placed.filter((p) => rangeIds.has(p.ev.id)).length,
      total: this.events.length,
      thinned,
      offscreen,
    };
    const statsKey = `${stats.shown}/${stats.total}/${stats.thinned}/${stats.offscreen}`;
    if (statsKey !== this.lastStats) {
      this.lastStats = statsKey;
      this.cb.onStats?.(stats);
    }
  }

  /** The name tag's width: its text in the tag's font, plus padding, capped like the CSS (max-width). */
  private calloutWidthOf(title: string): number {
    this.measure.font = '600 12.5px "Instrument Sans Variable", system-ui, sans-serif';
    return Math.min(CALLOUT_MAX, this.measure.measureText(title).width + CALLOUT_PAD);
  }

  /** The opened event's name sits beside its dot: above it, or below near the top edge, and kept inside the map. */
  private placeCallout(el: HTMLElement, x: number, y: number) {
    const half = this.calloutWidth / 2;
    const shift =
      x - half < CALLOUT_EDGE
        ? CALLOUT_EDGE - (x - half)
        : x + half > this.size.width - CALLOUT_EDGE
          ? this.size.width - CALLOUT_EDGE - (x + half)
          : 0;
    el.dataset.callout = y < HIT + 40 ? 'below' : 'above';
    el.style.setProperty('--shift', `${shift.toFixed(1)}px`);
  }
}
