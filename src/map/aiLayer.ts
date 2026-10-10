import type { Map as MLMap } from 'maplibre-gl';
import { RELATION_WORD, type Relation, type ResolvedDrawing, type ResolvedEvent, type ResolvedLink } from '../ai/types';
import type { Rect } from '../domain/reveal';
import type { PlacePoint } from '../domain/types';
import { placeFlags, type FlagAnchor, type FlagRequest } from './flags';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The label font, as in the stylesheet (`.ai-flag`): the width is measured, not guessed. */
const FLAG_FONT = {
  mark: '500 13px "Newsreader Variable", Georgia, serif',
  event: '600 13px "Newsreader Variable", Georgia, serif',
  link: '600 12px "Instrument Sans Variable", system-ui, sans-serif',
};
const FLAG_PAD_X = 16; // padding and border on both sides
const FLAG_H = 22;
/** How long an event's name may be on the map. */
const EVENT_NAME_MAX = 30;

/** What a point of the drawing takes up around itself, so no label is hung over it. */
const DIAMOND_REACH = 9;
const GLYPH_REACH = 12;
const END_REACH = 6;
/** An event marker's dot with its ring, and the year hanging beside it (src/map/markers.ts). */
const EVENT_DOT_REACH = 9;
const EVENT_YEAR_REACH = 43;

const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const keyOfLink = (l: ResolvedLink) =>
  `${l.relation}|${l.a.lon.toFixed(2)},${l.a.lat.toFixed(2)}|${l.b.lon.toFixed(2)},${l.b.lat.toFixed(2)}|${l.label ?? ''}`;
const keyOfMark = (m: { point: PlacePoint; label: string }) =>
  `${m.point.lon.toFixed(3)},${m.point.lat.toFixed(3)}|${m.label}`;

interface LinkEl {
  link: ResolvedLink;
  group: SVGGElement;
  casing: SVGPathElement;
  line: SVGPathElement;
  inner: SVGPathElement | null;
  glyph: SVGGElement;
  heads: SVGPathElement[];
  flag: HTMLElement;
  flagW: number;
}

interface MarkEl {
  mark: { point: PlacePoint; label: string };
  pt: HTMLElement;
  flag: HTMLElement;
  flagW: number;
}

/** An event the step talks about: its marker is the app's own (src/map/markers.ts); only its name hangs here. */
interface EventEl {
  event: ResolvedEvent;
  flag: HTMLElement;
  flagW: number;
}

/**
 * What the layout of the AI's labels has to keep clear of, in map pixels, from the other overlays of the map.
 * `hard` is what never gives way (markers, the place dot, the controls, names that are selected or pointed at);
 * `soft` is what may (the other polity names): a label takes a free place before it covers one of those, and
 * when it has to, the name underneath is told so it can give way.
 */
export interface AiLayoutEnv {
  hard: readonly Rect[];
  soft: readonly Rect[];
}

const NO_ENV: AiLayoutEnv = { hard: [], soft: [] };

/** Where along its line a relation's glyph may sit, the middle first: it slides off a marker or a name rather than hide under it. */
const GLYPH_AT = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82, 0.12, 0.88];

const crosses = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const coverage = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** A label whose point lies more than this far outside the map is not shown: pushed back inside it would name nothing. */
const OFFSCREEN_SLACK = 14;

/**
 * What the AI draws on the map, in pen and ink: relation lines between polities and labelled marks. It
 * follows the map's projection like every other overlay and never touches the camera. Polygons (the
 * highlight) are map layers drawn by MapView; this is the part that does not belong to a polygon. (The
 * events a step talks about are not drawn here: they appear with their own markers. Only their names are.)
 *
 * The drawing looks different from the data layers on purpose, in the same visual language: ink on paper,
 * told apart by pattern (solid, double, dashed, dotted) and never by hue, so it does not compete with the
 * vermilion that means "your selection" or with the colours of the event dots.
 *
 * Every label of it keeps clear of the other labels and of the markers: it is hung where nothing else is
 * (see `placeFlags`), on the first side of its point that is free, and then at a few places further out.
 */
export class AiDrawingLayer {
  private readonly host: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly flags: HTMLElement;
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  private readonly links = new Map<string, LinkEl>();
  private readonly marks = new Map<string, MarkEl>();
  private readonly events = new Map<string, EventEl>();
  /** The opened event shows its own name tag; its name here would say it twice. */
  private selectedEventId: string | null = null;
  private width = 0;
  private height = 0;

  constructor(
    private readonly map: MLMap,
    container: HTMLElement,
  ) {
    this.host = document.createElement('div');
    this.host.className = 'ai-layer';
    this.host.setAttribute('role', 'img');
    this.host.hidden = true;
    this.lines = svg('svg', { class: 'ai-links', 'aria-hidden': 'true' });
    this.flags = document.createElement('div');
    this.flags.className = 'ai-flags';
    this.host.append(this.lines, this.flags);
    container.appendChild(this.host);
  }

  private textWidth(text: string, font: string): number {
    this.measure.font = font;
    return Math.ceil(this.measure.measureText(text).width);
  }

  /** Shows this drawing: elements of what stays are kept (so they do not blink), the rest come and go. Call `layout` after. */
  setDrawing(drawing: ResolvedDrawing, description = '') {
    const wanted = new Set(drawing.links.map(keyOfLink));
    for (const [k, el] of this.links) {
      if (wanted.has(k)) continue;
      el.group.remove();
      el.flag.remove();
      this.links.delete(k);
    }
    for (const link of drawing.links) {
      const k = keyOfLink(link);
      if (!this.links.has(k)) this.links.set(k, this.createLink(link));
    }
    const wantedMarks = new Set(drawing.marks.map(keyOfMark));
    for (const [k, el] of this.marks) {
      if (wantedMarks.has(k)) continue;
      el.pt.remove();
      el.flag.remove();
      this.marks.delete(k);
    }
    for (const mark of drawing.marks) {
      const k = keyOfMark(mark);
      if (!this.marks.has(k)) this.marks.set(k, this.createMark(mark));
    }
    const wantedEvents = new Set(drawing.events.map((e) => e.id));
    for (const [k, el] of this.events) {
      if (wantedEvents.has(k)) continue;
      el.flag.remove();
      this.events.delete(k);
    }
    for (const event of drawing.events) {
      if (!this.events.has(event.id)) this.events.set(event.id, this.createEvent(event));
    }
    const empty = !drawing.links.length && !drawing.marks.length && !drawing.events.length;
    this.host.hidden = empty;
    if (description) this.host.setAttribute('aria-label', `Yapay zekâ çizimi: ${description}`);
    else this.host.removeAttribute('aria-label');
    // The caller lays everything out next (it knows what else lies on the map): see `layout`.
  }

  setSelectedEvent(id: string | null) {
    this.selectedEventId = id;
  }

  /* ------------------------------------------------------------- creation */

  private createLink(link: ResolvedLink): LinkEl {
    const group = svg('g', { class: 'ai-link', 'data-relation': link.relation });
    const casing = svg('path', { class: 'casing' });
    const line = svg('path', { class: 'line' });
    const inner = link.relation === 'alliance' ? svg('path', { class: 'inner' }) : null;
    const glyph = svg('g', { class: 'glyph' });
    const heads: SVGPathElement[] = [];
    group.append(casing, line);
    if (inner) group.append(inner);
    if (link.relation === 'trade') {
      for (let i = 0; i < 2; i++) {
        const head = svg('path', { class: 'head', d: 'M0 0L-10 -5.2L-10 5.2Z' });
        heads.push(head);
        group.append(head);
      }
    } else {
      group.append(svg('circle', { class: 'end', r: '3.6' }), svg('circle', { class: 'end', r: '3.6' }));
    }
    glyph.append(...glyphShapes(link.relation));
    group.append(glyph);
    this.lines.appendChild(group);

    const text = link.label ?? RELATION_WORD[link.relation];
    const flag = document.createElement('span');
    flag.className = 'ai-flag is-link';
    flag.dataset.relation = link.relation;
    flag.textContent = text;
    this.flags.appendChild(flag);
    return {
      link,
      group,
      casing,
      line,
      inner,
      glyph,
      heads,
      flag,
      flagW: this.textWidth(text, FLAG_FONT.link) + FLAG_PAD_X,
    };
  }

  private createMark(mark: { point: PlacePoint; label: string }): MarkEl {
    const pt = document.createElement('i');
    pt.className = 'ai-pt';
    this.flags.appendChild(pt);
    const flag = document.createElement('span');
    flag.className = 'ai-flag is-mark';
    flag.textContent = mark.label;
    this.flags.appendChild(flag);
    return { mark, pt, flag, flagW: this.textWidth(mark.label, FLAG_FONT.mark) + FLAG_PAD_X };
  }

  private createEvent(event: ResolvedEvent): EventEl {
    const text =
      event.title.length > EVENT_NAME_MAX ? `${event.title.slice(0, EVENT_NAME_MAX - 1).trimEnd()}…` : event.title;
    const flag = document.createElement('span');
    flag.className = 'ai-flag is-event';
    flag.dataset.event = event.id;
    flag.textContent = text;
    this.flags.appendChild(flag);
    return { event, flag, flagW: this.textWidth(text, FLAG_FONT.event) + FLAG_PAD_X };
  }

  /* --------------------------------------------------------------- layout */

  /**
   * Called on every map frame: puts everything where the map's projection says. `env` is what the other
   * overlays take up. Returns the soft rectangles (polity names) a label had to sit on: those names give way.
   */
  layout(env: AiLayoutEnv = NO_ENV): Rect[] {
    if (this.host.hidden) return [];
    const canvas = this.map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.lines.setAttribute('width', String(width));
      this.lines.setAttribute('height', String(height));
    }

    const onMap = (pt: { x: number; y: number }) =>
      pt.x >= -OFFSCREEN_SLACK &&
      pt.y >= -OFFSCREEN_SLACK &&
      pt.x <= width + OFFSCREEN_SLACK &&
      pt.y <= height + OFFSCREEN_SLACK;
    const requests: FlagRequest[] = [];
    const pending: { id: string; el: HTMLElement }[] = [];
    // What the drawing itself takes up: its own points, glyphs and line ends. No label is hung over them.
    const own: Rect[] = [];
    const reach = (x: number, y: number, r: number): Rect => ({ left: x - r, top: y - r, right: x + r, bottom: y + r });

    // Events first: their names hang from markers that cannot move. Then marks, then lines, whose labels can slide along them.
    for (const [id, el] of this.events) {
      const p = this.map.project([el.event.point.lon, el.event.point.lat]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      el.flag.hidden = id === this.selectedEventId || !onMap(p);
      if (el.flag.hidden) continue;
      requests.push({
        id: `event:${id}`,
        x: p.x,
        y: p.y,
        w: el.flagW,
        h: FLAG_H,
        prefer: ['above', 'below', 'left', 'right'],
        gap: EVENT_DOT_REACH + 4,
        alternates: [
          // beyond the year that hangs at the marker's right
          { x: p.x, y: p.y, gap: EVENT_YEAR_REACH + 3, prefer: ['right'] },
          ...diagonals(p.x, p.y, EVENT_DOT_REACH + 3),
          // and further out, where the nearby places are taken
          { x: p.x, y: p.y, gap: EVENT_DOT_REACH + 26, prefer: ['above', 'below', 'left'] },
          ...diagonals(p.x, p.y, EVENT_DOT_REACH + 28),
          { x: p.x, y: p.y, gap: EVENT_YEAR_REACH + 30, prefer: ['right'] },
        ],
      });
      pending.push({ id: `event:${id}`, el: el.flag });
    }

    for (const [k, el] of this.marks) {
      const p = this.map.project([el.mark.point.lon, el.mark.point.lat]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      el.pt.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      own.push(reach(p.x, p.y, DIAMOND_REACH));
      el.flag.hidden = !onMap(p);
      if (el.flag.hidden) continue;
      requests.push({
        id: `mark:${k}`,
        x: p.x,
        y: p.y,
        w: el.flagW,
        h: FLAG_H,
        prefer: ['right', 'left', 'above', 'below'],
        gap: 11,
        alternates: [
          { x: p.x, y: p.y, gap: 24, prefer: ['right', 'left', 'above', 'below'] },
          ...diagonals(p.x, p.y, 10),
          { x: p.x, y: p.y, gap: 40, prefer: ['right', 'left', 'above', 'below'] },
          ...diagonals(p.x, p.y, 34),
        ],
      });
      pending.push({ id: `mark:${k}`, el: el.flag });
    }

    for (const [k, el] of this.links) {
      const a = this.map.project([el.link.a.lon, el.link.a.lat]);
      const b = this.map.project([el.link.b.lon, el.link.b.lat]);
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const arc = arcBetween(a, b);
      const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${arc.cx.toFixed(1)} ${arc.cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      el.casing.setAttribute('d', d);
      el.line.setAttribute('d', d);
      el.inner?.setAttribute('d', d);
      // The glyph sits in the middle of its line, or nearby where the middle is taken by a marker or a name.
      const along = GLYPH_AT.map((t) => pointOn(a, arc, b, t));
      const spots = along.filter(onMap);
      const clearOf = (rects: readonly Rect[]) =>
        spots.find((pt) => {
          const box = reach(pt.x, pt.y, GLYPH_REACH);
          return !rects.some((o) => crosses(box, o));
        });
      // Where nothing is clear (a short line with markers along it), the place that covers the least.
      const leastCovered = () => {
        const rects = [...env.hard, ...own];
        const cost = (pt: { x: number; y: number }) =>
          rects.reduce((sum, o) => sum + coverage(reach(pt.x, pt.y, GLYPH_REACH), o), 0);
        return spots.reduce<{ x: number; y: number } | undefined>(
          (best, pt) => (!best || cost(pt) < cost(best) ? pt : best),
          undefined,
        );
      };
      const glyph =
        clearOf([...env.hard, ...env.soft, ...own]) ?? clearOf([...env.hard, ...own]) ?? leastCovered() ?? along[0]!;
      el.glyph.setAttribute('transform', `translate(${glyph.x.toFixed(1)} ${glyph.y.toFixed(1)})`);
      const ends = el.group.querySelectorAll<SVGCircleElement>('circle.end');
      if (ends.length === 2) {
        ends[0]!.setAttribute('transform', `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)})`);
        ends[1]!.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)})`);
      }
      if (el.heads.length === 2) {
        // arrowheads at both ends, pointing outward along the arc
        const angleB = (Math.atan2(b.y - arc.cy, b.x - arc.cx) * 180) / Math.PI;
        const angleA = (Math.atan2(a.y - arc.cy, a.x - arc.cx) * 180) / Math.PI;
        el.heads[0]!.setAttribute(
          'transform',
          `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${angleB.toFixed(1)})`,
        );
        el.heads[1]!.setAttribute(
          'transform',
          `translate(${a.x.toFixed(1)} ${a.y.toFixed(1)}) rotate(${angleA.toFixed(1)})`,
        );
      }
      own.push(reach(glyph.x, glyph.y, GLYPH_REACH), reach(a.x, a.y, END_REACH), reach(b.x, b.y, END_REACH));
      el.flag.hidden = !spots.length; // the line lies outside the map: its label would name nothing
      if (el.flag.hidden) continue;
      const prefer: FlagAnchor['prefer'] = arc.bulgesUp
        ? ['above', 'below', 'right', 'left']
        : ['below', 'above', 'right', 'left'];
      requests.push({
        id: k,
        x: glyph.x,
        y: glyph.y,
        w: el.flagW,
        h: FLAG_H,
        prefer,
        gap: 14,
        // the label may slide along its line: nearer one end, then the other, then further out
        alternates: [0.4, 0.6, 0.3, 0.7, 0.22, 0.78, 0.14, 0.86]
          .map((t) => pointOn(a, arc, b, t))
          .filter(onMap)
          .map((at) => ({ x: at.x, y: at.y, gap: 12, prefer: prefer.slice(0, 2) })),
      });
      pending.push({ id: k, el: el.flag });
    }

    const placed = placeFlags(requests, { width, height }, [...env.hard, ...own], env.soft);
    const byId = new Map(pending.map((p) => [p.id, p.el]));
    const yields: Rect[] = [];
    for (const f of placed) {
      const el = byId.get(f.id);
      if (el) {
        el.style.transform = `translate(${f.left.toFixed(1)}px, ${f.top.toFixed(1)}px)`;
        el.dataset.clear = String(f.clear);
      }
      yields.push(...f.yields);
    }
    return yields;
  }
}

/** The four places diagonally beside a point, for a label that finds no free side. */
function diagonals(x: number, y: number, r: number): FlagAnchor[] {
  return [
    { x: x + r, y: y - r - 8, gap: 0, prefer: ['right'] },
    { x: x - r, y: y - r - 8, gap: 0, prefer: ['left'] },
    { x: x + r, y: y + r + 8, gap: 0, prefer: ['right'] },
    { x: x - r, y: y + r + 8, gap: 0, prefer: ['left'] },
  ];
}

/** A gentle arc between two points: bulges upward (or, for a vertical pair, to the east) by a fifth of the distance. */
function arcBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  const bulge = Math.min(110, Math.max(16, len * 0.2));
  const mx0 = (a.x + b.x) / 2;
  const my0 = (a.y + b.y) / 2;
  const cx = mx0 + nx * bulge * 2; // the control point lies twice as far as the curve's middle
  const cy = my0 + ny * bulge * 2;
  return { cx, cy, mx: 0.25 * a.x + 0.5 * cx + 0.25 * b.x, my: 0.25 * a.y + 0.5 * cy + 0.25 * b.y, bulgesUp: ny <= 0 };
}

/** The point at `t` (0..1) along the arc. */
function pointOn(
  a: { x: number; y: number },
  arc: { cx: number; cy: number },
  b: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * arc.cx + t * t * b.x,
    y: u * u * a.y + 2 * u * t * arc.cy + t * t * b.y,
  };
}

/** The mark in the middle of a relation line: crossed swords' ×, a diamond for a treaty, a dot for the rest. */
function glyphShapes(relation: Relation): SVGElement[] {
  if (relation === 'war') {
    return [
      svg('circle', { class: 'disc', r: '9.5' }),
      svg('path', { class: 'cross', d: 'M-4.2 -4.2L4.2 4.2M4.2 -4.2L-4.2 4.2' }),
    ];
  }
  if (relation === 'treaty') return [svg('path', { class: 'diamond', d: 'M0 -8L8 0L0 8L-8 0Z' })];
  if (relation === 'alliance')
    return [svg('circle', { class: 'disc', r: '5.2' }), svg('circle', { class: 'core', r: '2.4' })];
  return [svg('circle', { class: 'disc', r: '4.4' })];
}
