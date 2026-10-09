import type { Map as MLMap } from 'maplibre-gl';
import { placeMarkers } from '../domain/placement';
import type { HistoricalEvent } from '../domain/types';
import { markerBox, markerSvg } from '../ui/markerShapes';

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

/** A pointer target should be at least 24 × 24 px (WCAG 2.5.8); small marks get an invisible larger box. */
const MIN_HIT = 24;

/**
 * Event markers on the map. Which events exist here depends only on the time range; how many are
 * visible depends on zoom (a budget spent on what is in view, most important first) and on screen
 * collisions. The selected place never changes any of this: the map is the same for everyone.
 *
 * Keyboard: the markers form one group with a single Tab stop; the arrow keys move between the visible
 * ones in reading order, so a screen full of markers does not turn into dozens of Tab stops.
 */
export class EventMarkers {
  private readonly host: HTMLElement;
  private readonly elements = new Map<string, HTMLButtonElement>();
  private events: HistoricalEvent[] = [];
  private focusYear = 0;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private lastKey = '';
  private lastStats = '';
  private size = { width: 0, height: 0 };
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

  setEvents(events: HistoricalEvent[], focusYear: number) {
    if (events === this.events && focusYear === this.focusYear) return;
    this.events = events;
    this.focusYear = focusYear;
    const ids = new Set(events.map((e) => e.id));
    for (const [id, el] of this.elements) {
      if (!ids.has(id)) {
        el.remove();
        this.elements.delete(id);
      }
    }
    for (const ev of events) if (!this.elements.has(ev.id)) this.create(ev);
    this.lastKey = '';
    this.layout();
  }

  setFocusYear(year: number) {
    if (year === this.focusYear) return;
    this.focusYear = year;
    this.lastKey = '';
    this.layout();
  }

  setSelected(id: string | null) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    for (const [eid, el] of this.elements) {
      el.classList.toggle('is-selected', eid === id);
      el.setAttribute('aria-pressed', String(eid === id));
    }
    this.lastKey = '';
    this.layout();
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
    el.dataset.importance = String(ev.importance);
    el.setAttribute('aria-label', `${ev.title}, ${ev.dateLabel}, ${ev.location.name}`);
    el.setAttribute('aria-pressed', String(this.selectedId === ev.id));
    el.innerHTML = `<span class="evt-mark">${markerSvg(ev.category, ev.importance)}</span><span class="evt-year">${ev.year}</span>`;
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
    el.addEventListener('pointerenter', () => this.cb.onHover(ev.id, el));
    el.addEventListener('pointerleave', () => this.cb.onHover(null, null));
    el.addEventListener('focus', () => {
      this.tabStop = ev.id;
      this.syncTabStops();
      this.cb.onHover(ev.id, el);
    });
    el.addEventListener('blur', () => this.cb.onHover(null, null));
    this.host.appendChild(el);
    this.elements.set(ev.id, el);
    if (this.selectedId === ev.id) el.classList.add('is-selected');
    if (this.hoverId === ev.id) el.classList.add('is-hover');
  }

  /* ---------------------------------------------------------------- keyboard */

  private syncTabStops() {
    for (const [id, el] of this.elements) el.tabIndex = id === this.tabStop && !el.classList.contains('is-hidden') ? 0 : -1;
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

    const { placed, offscreen, thinned } = placeMarkers({
      events: this.events,
      zoom,
      focusYear: this.focusYear,
      selectedId: this.selectedId,
      viewport: this.size,
      project: (ev) => map.project([ev.location.lon, ev.location.lat]),
    });

    const shown = new Set<string>();
    for (const { ev, x, y } of placed) {
      shown.add(ev.id);
      const el = this.elements.get(ev.id);
      if (!el) continue;
      const box = markerBox(ev.importance);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.setProperty('--box', `${box}px`);
      el.style.setProperty('--hit', `${Math.max(MIN_HIT, box)}px`);
      el.style.zIndex = String(10 + ev.importance + (ev.id === this.selectedId ? 10 : 0));
      el.classList.remove('is-hidden');
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

    const stats: MarkerStats = { shown: placed.length, total: this.events.length, thinned, offscreen };
    const statsKey = `${stats.shown}/${stats.total}/${stats.thinned}/${stats.offscreen}`;
    if (statsKey !== this.lastStats) {
      this.lastStats = statsKey;
      this.cb.onStats?.(stats);
    }
  }
}
