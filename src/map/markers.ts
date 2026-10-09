import type { Map as MLMap } from 'maplibre-gl';
import { markerPriority, pickMarkers } from '../domain/events';
import { MARKER_SIZE } from '../domain/categories';
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
  /** Left out by the zoom-dependent budget or by collisions: zooming in reveals them. */
  thinned: number;
  /** Outside the current viewport: panning reveals them. */
  offscreen: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Event markers on the map. Which events exist here depends only on the time range; how many are
 * visible depends on zoom (a budget that favours importance) and on screen collisions. The selected
 * place never changes any of this: the map is the same for everyone.
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
  private previewId: string | null = null;
  private readonly cb: MarkerCallbacks;

  constructor(
    private readonly map: MLMap,
    container: HTMLElement,
    cb: MarkerCallbacks,
  ) {
    this.cb = cb;
    this.host = document.createElement('div');
    this.host.className = 'marker-layer';
    container.appendChild(this.host);
  }

  setEvents(events: HistoricalEvent[], focusYear: number, preview: HistoricalEvent | null = null) {
    this.previewId = preview && !events.some((e) => e.id === preview.id) ? preview.id : null;
    this.events = this.previewId && preview ? [...events, preview] : events;
    this.focusYear = focusYear;
    const ids = new Set(this.events.map((e) => e.id));
    for (const [id, el] of this.elements) {
      if (!ids.has(id)) {
        el.remove();
        this.elements.delete(id);
      }
    }
    for (const ev of this.events) if (!this.elements.has(ev.id)) this.create(ev);
    for (const [id, el] of this.elements) el.classList.toggle('is-preview', id === this.previewId);
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
    this.selectedId = id;
    for (const [eid, el] of this.elements) el.classList.toggle('is-selected', eid === id);
    this.lastKey = '';
    this.layout();
  }

  setHover(id: string | null) {
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
    el.dataset.id = ev.id;
    el.dataset.importance = String(ev.importance);
    el.setAttribute('aria-label', `${ev.title}, ${ev.dateLabel}, ${ev.location.name}`);
    el.innerHTML = `<span class="evt-mark">${markerSvg(ev.category, ev.importance)}</span><span class="evt-year">${ev.year}</span>`;
    // A drag that happens to start and end on a marker is a pan, not a click.
    let downAt: [number, number] | null = null;
    el.addEventListener('pointerdown', (e) => {
      downAt = [e.clientX, e.clientY];
    });
    el.addEventListener('click', (e) => {
      e.stopPropagation(); // never let a marker click double as a map click
      if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
      this.cb.onClick(ev.id);
    });
    el.addEventListener('pointerenter', () => this.cb.onHover(ev.id, el));
    el.addEventListener('pointerleave', () => this.cb.onHover(null, null));
    el.addEventListener('focus', () => this.cb.onHover(ev.id, el));
    el.addEventListener('blur', () => this.cb.onHover(null, null));
    this.host.appendChild(el);
    this.elements.set(ev.id, el);
    if (this.selectedId === ev.id) el.classList.add('is-selected');
    if (this.hoverId === ev.id) el.classList.add('is-hover');
  }

  layout(force = false) {
    const map = this.map;
    const canvas = map.getCanvas();
    const c = map.getCenter();
    const zoom = map.getZoom();
    const key = `${zoom.toFixed(3)}|${c.lng.toFixed(4)}|${c.lat.toFixed(4)}|${canvas.clientWidth}|${canvas.clientHeight}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const budgeted = pickMarkers(
      this.events.filter((e) => e.id !== this.previewId),
      { zoom, focusYear: this.focusYear },
    );
    const selected = this.selectedId ? this.events.find((e) => e.id === this.selectedId) : undefined;
    const realTotal = this.events.length - (this.previewId ? 1 : 0);
    const order = selected && !budgeted.includes(selected) ? [selected, ...budgeted] : budgeted;
    order.sort((a, b) => (a === selected ? -1 : b === selected ? 1 : markerPriority(a, b, this.focusYear)));

    const placed: Box[] = [];
    const shown = new Set<string>();
    let offscreen = 0;
    let collided = 0;
    for (const ev of order) {
      const p = map.project([ev.location.lon, ev.location.lat]);
      const box = markerBox(ev.importance);
      const d = MARKER_SIZE[ev.importance] ?? 14;
      if (p.x < -20 || p.y < -20 || p.x > W + 20 || p.y > H + 20) {
        offscreen++;
        continue;
      }
      const b: Box = { x: p.x - d / 2 - 3, y: p.y - d / 2 - 3, w: d + 6 + 34, h: d + 6 }; // + year label
      const clash = placed.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
      if (clash && ev !== selected) {
        collided++;
        continue;
      }
      placed.push(b);
      shown.add(ev.id);
      const el = this.elements.get(ev.id);
      if (!el) continue;
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      el.style.setProperty('--box', `${box}px`);
      el.style.zIndex = String(10 + ev.importance + (ev === selected ? 10 : 0));
      el.classList.remove('is-hidden');
    }
    const stats: MarkerStats = {
      shown: shown.size - (this.previewId && shown.has(this.previewId) ? 1 : 0),
      total: realTotal,
      thinned: realTotal - budgeted.length + collided,
      offscreen,
    };
    const statsKey = `${stats.shown}/${stats.total}/${stats.thinned}/${stats.offscreen}`;
    if (statsKey !== this.lastStats) {
      this.lastStats = statsKey;
      this.cb.onStats?.(stats);
    }
    for (const [id, el] of this.elements) {
      if (!shown.has(id)) {
        el.classList.add('is-hidden');
        if (document.activeElement === el) el.blur();
      }
    }
  }
}
