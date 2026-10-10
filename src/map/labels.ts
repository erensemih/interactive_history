import type { Map as MLMap } from 'maplibre-gl';
import type { AppData } from '../data/load';
import type { Rect } from '../domain/reveal';
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

/** A name that is drawn, where it lies (map pixels) and whether it may never give way (selected or pointed at by the AI). */
export interface LabelBox {
  rect: Rect;
  forced: boolean;
  key: string;
}

const hit = (a: Box, b: Rect) => a.x < b.right && b.left < a.x + a.w && a.y < b.bottom && b.top < a.y + a.h;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where a name that must stay may go to get out of the way: up or down first (names are wide), then sideways, nearer first. */
const NUDGES: [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-0.8, -0.8],
  [0.8, -0.8],
  [-0.8, 0.8],
  [0.8, 0.8],
];
const NUDGE_STEPS = [10, 20, 32, 46];

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
  private selected = new Set<string>();
  /** Polities the AI points at: labelled like the selected ones, in ink. */
  private emphasis = new Set<string>();
  private readonly measureCtx: CanvasRenderingContext2D;
  private readonly widthCache = new Map<string, number>();
  private lastKey = '';
  /** Room other things have claimed (the narrator's markers): a name that would sit on it is left out. */
  private avoid: Rect[] = [];
  /** The names drawn at the last layout, and which of them are giving way to an AI label right now. */
  private shown: LabelBox[] = [];
  private yielded = new Set<string>();

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

  /** The selected polities always get a label, even where size or collisions would drop it. */
  setSelected(ids: string[]) {
    this.selected = new Set(ids);
    this.lastKey = '';
    this.layout();
  }

  /** Names keep off these rectangles (except the selected and the AI's own, which never give way). */
  setAvoid(rects: readonly Rect[]) {
    const same =
      rects.length === this.avoid.length &&
      rects.every((r, i) => {
        const o = this.avoid[i]!;
        return r.left === o.left && r.top === o.top && r.right === o.right && r.bottom === o.bottom;
      });
    if (same) return;
    this.avoid = [...rects];
    this.lastKey = '';
  }

  /** The names drawn now and where they lie, for the labels that have to keep clear of them. */
  boxes(): readonly LabelBox[] {
    return this.shown;
  }

  /**
   * Names the AI's labels sit on give way: they fade out while the label is there and come back when it moves.
   * Never the selected polity's or the ones the AI points at.
   */
  yieldTo(rects: readonly Rect[]) {
    const next = new Set<string>();
    if (rects.length) {
      for (const b of this.shown) {
        if (b.forced) continue;
        if (
          rects.some(
            (r) => b.rect.left < r.right && r.left < b.rect.right && b.rect.top < r.bottom && r.top < b.rect.bottom,
          )
        )
          next.add(b.key);
      }
    }
    if (next.size === this.yielded.size && [...next].every((k) => this.yielded.has(k))) return;
    this.yielded = next;
    for (const [k, el] of this.elements) el.classList.toggle('is-yielded', next.has(k));
  }

  setEmphasis(ids: string[]) {
    if (ids.length === this.emphasis.size && ids.every((id) => this.emphasis.has(id))) return;
    this.emphasis = new Set(ids);
    this.lastKey = '';
    this.layout();
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

  /** `size` is the map's pixel size, read once per frame by the caller (reading it here would force a layout). */
  layout(force = false, size?: { width: number; height: number }) {
    const map = this.map;
    const canvas = map.getCanvas();
    const W = size?.width ?? canvas.clientWidth;
    const H = size?.height ?? canvas.clientHeight;
    const c = map.getCenter();
    const key = `${map.getZoom().toFixed(3)}|${c.lng.toFixed(4)}|${c.lat.toFixed(4)}|${W}|${H}`;
    if (!force && key === this.lastKey) return;
    this.lastKey = key;

    const zoom = map.getZoom();
    const world = 512 * 2 ** zoom; // px for 360° of longitude
    const placed: Box[] = [];
    const visible = new Set<string>();
    const shown: LabelBox[] = [];

    // While the AI narrates, the names that must stay (the selected polity's and the ones it points at) are laid out
    // first and step aside for the markers and for one another; every other name then keeps clear of them.
    // Without it everything is as it always was: in order of size, and the names that must stay go where they are.
    const careful = this.emphasis.size > 0 || this.avoid.length > 0;
    const must = (id: string) => this.selected.has(id) || this.emphasis.has(id);
    const order = careful
      ? [...this.candidates.filter((c) => must(c.row.id)), ...this.candidates.filter((c) => !must(c.row.id))]
      : this.candidates;

    for (const { row, name } of order) {
      const [lon, lat, r] = row.label!;
      const cosLat = Math.cos((lat * Math.PI) / 180);
      const kmPerPx = (40075.017 * Math.max(cosLat, 0.05)) / world;
      const side = Math.sqrt(row.area) / kmPerPx;
      const emphasised = this.emphasis.has(row.id);
      const selected = this.selected.has(row.id) || emphasised;
      if (side < MIN_SIDE_PX && !selected) continue;

      const p = map.project([lon, lat]);
      if (!(p.x >= -60 && p.y >= -30 && p.x <= W + 60 && p.y <= H + 30)) continue; // also rejects NaN

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
      let cx = p.x;
      let cy = p.y;
      let box: Box = { x: cx - w / 2 - 5, y: cy - h / 2 - 3, w: w + 10, h: h + 6 };
      const clashes = (b: Box) => placed.some((o) => overlap(b, o)) || this.avoid.some((r) => hit(b, r));
      if (!selected && clashes(box)) continue;
      if (selected && careful && clashes(box)) {
        // a name that must stay moves out of the way, as little as it takes, rather than sit on a marker or a name
        const spot = nudgeFree(box, clashes, W, H);
        if (spot) {
          cx += spot.dx;
          cy += spot.dy;
          box = { ...box, x: box.x + spot.dx, y: box.y + spot.dy };
        }
      }
      placed.push(box);

      const k = keyOf(row);
      visible.add(k);
      shown.push({
        rect: { left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h },
        forced: selected,
        key: k,
      });
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
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) translate(-50%, -50%)`;
      el.classList.toggle('is-caps', caps);
      el.classList.toggle('is-italic', italic);
      el.classList.toggle('is-selected', this.selected.has(row.id));
      el.classList.toggle('is-ai', emphasised);
      el.classList.toggle('is-yielded', this.yielded.has(k));
      el.classList.remove('is-hidden');
    }
    for (const [k, el] of this.elements) if (!visible.has(k)) el.classList.add('is-hidden');
    this.shown = shown;
  }
}

const keyOf = (row: BorderRow) => `${row.id}@${row.from}`;

/** The smallest move that takes a box clear of what it clashes with and keeps it on the map, or null. */
function nudgeFree(box: Box, clashes: (b: Box) => boolean, W: number, H: number): { dx: number; dy: number } | null {
  for (const step of NUDGE_STEPS) {
    for (const [ux, uy] of NUDGES) {
      const dx = ux * step;
      const dy = uy * step;
      const moved = { ...box, x: box.x + dx, y: box.y + dy };
      if (moved.x < 2 || moved.y < 2 || moved.x + moved.w > W - 2 || moved.y + moved.h > H - 2) continue;
      if (!clashes(moved)) return { dx, dy };
    }
  }
  return null;
}
