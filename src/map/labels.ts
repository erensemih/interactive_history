import type { Map as MLMap } from 'maplibre-gl';
import type { AppData } from '../data/load';
import type { BorderRow } from '../domain/types';

interface Candidate {
  row: BorderRow;
  name: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const FONT_FAMILY = '"Newsreader Variable", Georgia, serif';
const MIN_SIDE_PX = 34;
const MAX_FONT = 25;
const MIN_FONT = 10;

/**
 * Polity names, typeset like an atlas: big realms get spaced capitals, small ones modest italics.
 * They are real DOM text (web fonts, Turkish dotted İ via lang="tr"), positioned from the map's
 * projection every frame, and thinned by size and collision. Labels never intercept the pointer.
 */
export class PolityLabels {
  private readonly host: HTMLElement;
  private readonly elements = new Map<string, HTMLElement>();
  private candidates: Candidate[] = [];
  private selectedId: string | null = null;
  private readonly measureCtx: CanvasRenderingContext2D;
  private readonly widthCache = new Map<string, number>();
  private lastKey = '';

  constructor(
    private readonly map: MLMap,
    container: HTMLElement,
    private readonly data: AppData,
  ) {
    this.host = document.createElement('div');
    this.host.className = 'label-layer';
    this.host.setAttribute('aria-hidden', 'true');
    container.appendChild(this.host);
    this.measureCtx = document.createElement('canvas').getContext('2d')!;
    // Text is measured on a canvas; re-measure once the web font has actually loaded.
    document.fonts?.addEventListener('loadingdone', () => {
      this.widthCache.clear();
      this.layout(true);
    });
  }

  setYear(year: number) {
    const out: Candidate[] = [];
    for (const row of this.data.rows) {
      if (row.from > year || row.to < year || !row.label) continue;
      const ent = this.data.entities.get(row.id);
      if (!ent) continue;
      out.push({ row, name: ent.name });
    }
    out.sort((a, b) => b.row.area - a.row.area);
    this.candidates = out;
    this.lastKey = '';
    // Drop elements of polities that are gone this year.
    const keep = new Set(out.map((c) => keyOf(c.row)));
    for (const [k, el] of this.elements) {
      if (!keep.has(k)) {
        el.remove();
        this.elements.delete(k);
      }
    }
    this.layout();
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    for (const [k, el] of this.elements) el.classList.toggle('is-selected', id !== null && k.startsWith(`${id}@`));
  }

  private textWidth(text: string, weight: number, italic: boolean, caps: boolean, spacingEm: number): number {
    const key = `${text}|${weight}|${italic}|${caps}|${spacingEm}`;
    let w = this.widthCache.get(key);
    if (w === undefined) {
      this.measureCtx.font = `${italic ? 'italic ' : ''}${weight} 100px ${FONT_FAMILY}`;
      const t = caps ? text.toLocaleUpperCase('tr') : text;
      w = this.measureCtx.measureText(t).width / 100 + spacingEm * t.length;
      this.widthCache.set(key, w);
    }
    return w;
  }

  layout(force = false) {
    const map = this.map;
    const canvas = map.getCanvas();
    const c = map.getCenter();
    const key = `${map.getZoom().toFixed(3)}|${c.lng.toFixed(4)}|${c.lat.toFixed(4)}|${canvas.clientWidth}|${canvas.clientHeight}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    const zoom = map.getZoom();
    const world = 512 * 2 ** zoom; // px for 360° of longitude
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const placed: Box[] = [];
    const visible = new Set<string>();

    for (const { row, name } of this.candidates) {
      const [lon, lat, r] = row.label!;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const kmPerPx = (40075.017 * Math.max(cosLat, 0.05)) / world;
      const side = Math.sqrt(row.area) / kmPerPx;
      const selected = row.id === this.selectedId;
      if (side < MIN_SIDE_PX && !selected) continue;

      const p = map.project([lon, lat]);
      if (p.x < -60 || p.y < -30 || p.x > W + 60 || p.y > H + 30) continue;

      // Room available for the text: from the inscribed circle, capped by the polygon's width.
      const degPx = world / 360;
      const bboxW = row.bbox ? (row.bbox[2] - row.bbox[0]) * degPx : side;
      const room = Math.min(bboxW * 0.96, Math.max(r * degPx * 3.4, side * 0.5));

      let fs = Math.min(MAX_FONT, Math.max(MIN_FONT, 7 + side * 0.075));
      const big = fs >= 17.5;
      const caps = big;
      const spacing = big ? 0.14 : 0.02;
      const weight = big ? 500 : 450;
      const italic = !big;

      let lines = [name];
      let w = this.textWidth(name, weight, italic, caps, spacing) * fs;
      if (w > room) {
        const words = name.split(' ');
        if (words.length > 1) {
          const mid = Math.ceil(words.length / 2);
          lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
          w = Math.max(...lines.map((l) => this.textWidth(l, weight, italic, caps, spacing))) * fs;
        }
      }
      if (w > room) {
        fs = Math.max(MIN_FONT, fs * (room / w));
        w = Math.max(...lines.map((l) => this.textWidth(l, weight, italic, caps, spacing))) * fs;
      }
      if (w > room * 1.06 || fs < MIN_FONT) {
        if (!selected) continue;
      }
      const h = fs * 1.15 * lines.length;
      const box: Box = { x: p.x - w / 2 - 5, y: p.y - h / 2 - 3, w: w + 10, h: h + 6 };
      if (
        !selected &&
        placed.some((b) => box.x < b.x + b.w && b.x < box.x + box.w && box.y < b.y + b.h && b.y < box.y + box.h)
      )
        continue;
      placed.push(box);

      const k = keyOf(row);
      visible.add(k);
      let el = this.elements.get(k);
      if (!el) {
        el = document.createElement('div');
        el.className = 'plabel';
        this.host.appendChild(el);
        this.elements.set(k, el);
      }
      const text = lines.join('\n');
      if (el.dataset.text !== text) {
        el.dataset.text = text;
        el.textContent = text;
      }
      el.style.fontSize = `${fs.toFixed(1)}px`;
      el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle('is-caps', caps);
      el.classList.toggle('is-italic', italic);
      el.classList.toggle('is-selected', selected);
      el.classList.remove('is-hidden');
    }
    for (const [k, el] of this.elements) if (!visible.has(k)) el.classList.add('is-hidden');
  }
}

const keyOf = (row: BorderRow) => `${row.id}@${row.from}`;
