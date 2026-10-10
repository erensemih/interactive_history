import type { Map as MLMap } from 'maplibre-gl';
import type { Rect } from '../domain/reveal';
import type { PlacePoint } from '../domain/types';

/** Half the room a place's dot takes (the glow around it is only a fade). */
const DOT_REACH = 11;

/**
 * A solid red dot with a soft red glow at each selected place, so a click on blank land (where no
 * polity lights up) still answers "where did I click?". The dot is the mark; the glow only fades it
 * into the map. It follows the map's projection like every other overlay and never touches the
 * camera. One pin per place: the same element list serves two-place comparison later.
 */
export class PlacePins {
  private readonly host: HTMLElement;
  private readonly els: HTMLElement[] = [];
  private points: PlacePoint[] = [];
  private boxes: Rect[] = [];

  constructor(
    private readonly map: MLMap,
    container: HTMLElement,
  ) {
    this.host = document.createElement('div');
    this.host.className = 'pin-layer';
    this.host.setAttribute('aria-hidden', 'true');
    container.appendChild(this.host);
  }

  setPoints(points: PlacePoint[]) {
    this.points = points;
    while (this.els.length < points.length) {
      const el = document.createElement('div');
      el.className = 'pin';
      el.innerHTML = '<b class="pin-glow"></b><i class="pin-dot"></i>';
      this.host.appendChild(el);
      this.els.push(el);
    }
    this.els.forEach((el, i) => {
      el.hidden = i >= points.length;
      if (points[i] && el.dataset.at !== `${points[i]!.lon},${points[i]!.lat}`) {
        el.dataset.at = `${points[i]!.lon},${points[i]!.lat}`;
        // restart the arrival animation for a new place
        el.classList.remove('is-new');
        void el.offsetWidth;
        el.classList.add('is-new');
      }
    });
    this.layout();
  }

  layout() {
    const boxes: Rect[] = [];
    this.points.forEach((pt, i) => {
      const p = this.map.project([pt.lon, pt.lat]);
      if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
        this.els[i]!.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
        boxes.push({ left: p.x - DOT_REACH, top: p.y - DOT_REACH, right: p.x + DOT_REACH, bottom: p.y + DOT_REACH });
      }
    });
    this.boxes = boxes;
  }

  /** The room the dots take, in map pixels: labels keep clear of it. */
  rects(): readonly Rect[] {
    return this.boxes;
  }
}
