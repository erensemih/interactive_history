import type { Map as MLMap } from 'maplibre-gl';
import type { HistoricalEvent } from '../domain/types';
import { markerBox, markerSvg } from '../ui/markerShapes';

/**
 * Shows where the selected event happened when the map itself does not carry it (a local event picked
 * from a place's timeline). It is a selection overlay like the place pin, not a map marker: which
 * markers exist is decided by the time range alone, whatever is selected.
 */
export class EventPreview {
  private readonly host: HTMLElement;
  private readonly el: HTMLElement;
  private at: { lon: number; lat: number } | null = null;

  constructor(
    private readonly map: MLMap,
    container: HTMLElement,
  ) {
    this.host = document.createElement('div');
    this.host.className = 'pin-layer';
    this.host.setAttribute('aria-hidden', 'true');
    this.el = document.createElement('div');
    this.el.className = 'evt-preview';
    this.el.hidden = true;
    this.host.appendChild(this.el);
    container.appendChild(this.host);
  }

  set(ev: HistoricalEvent | null) {
    if (!ev) {
      this.at = null;
      this.el.hidden = true;
      delete this.el.dataset.id;
      return;
    }
    if (this.el.dataset.id !== ev.id) {
      this.el.dataset.id = ev.id;
      this.el.style.setProperty('--box', `${markerBox(ev.importance)}px`);
      this.el.innerHTML = `<span class="evt-mark">${markerSvg(ev.category, ev.importance)}</span><span class="evt-year">${ev.year}</span>`;
    }
    this.at = ev.location;
    this.el.hidden = false;
    this.layout();
  }

  layout() {
    if (!this.at) return;
    const p = this.map.project([this.at.lon, this.at.lat]);
    const visible = Number.isFinite(p.x) && Number.isFinite(p.y);
    this.el.hidden = !visible;
    if (visible) this.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
  }
}
