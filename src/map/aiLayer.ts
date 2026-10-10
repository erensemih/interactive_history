import type { Map as MLMap } from 'maplibre-gl';
import { RELATION_WORD, type Relation, type ResolvedDrawing, type ResolvedLink } from '../ai/types';
import type { PlacePoint } from '../domain/types';
import { placeFlags, type FlagRequest } from './flags';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The label font, as in the stylesheet (`.ai-flag`): the width is measured, not guessed. */
const FLAG_FONT = {
  mark: '500 13px "Newsreader Variable", Georgia, serif',
  link: '600 12px "Instrument Sans Variable", system-ui, sans-serif',
};
const FLAG_PAD_X = 16; // padding and border on both sides
const FLAG_H = 22;

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

/**
 * What the AI draws on the map, in pen and ink: relation lines between polities and labelled marks. It
 * follows the map's projection like every other overlay and never touches the camera. Polygons (the
 * highlight) are map layers drawn by MapView; this is the part that does not belong to a polygon.
 *
 * The drawing looks different from the data layers on purpose, in the same visual language: ink on paper,
 * told apart by pattern (solid, double, dashed, dotted) and never by hue, so it does not compete with the
 * vermilion that means "your selection" or with the colours of the event dots.
 */
export class AiDrawingLayer {
  private readonly host: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly flags: HTMLElement;
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  private readonly links = new Map<string, LinkEl>();
  private readonly marks = new Map<string, MarkEl>();
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

  /** Shows this drawing: elements of what stays are kept (so they do not blink), the rest come and go. */
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
    const empty = !drawing.links.length && !drawing.marks.length;
    this.host.hidden = empty;
    if (description) this.host.setAttribute('aria-label', `Yapay zekâ çizimi: ${description}`);
    else this.host.removeAttribute('aria-label');
    this.layout();
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

  /* --------------------------------------------------------------- layout */

  /** Called on every map frame: puts everything where the map's projection says. */
  layout() {
    if (this.host.hidden) return;
    const canvas = this.map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.lines.setAttribute('width', String(width));
      this.lines.setAttribute('height', String(height));
    }

    const requests: FlagRequest[] = [];
    const pending: { id: string; el: HTMLElement }[] = [];

    for (const [k, el] of this.links) {
      const a = this.map.project([el.link.a.lon, el.link.a.lat]);
      const b = this.map.project([el.link.b.lon, el.link.b.lat]);
      if (![a.x, a.y, b.x, b.y].every(Number.isFinite)) continue;
      const arc = arcBetween(a, b);
      const d = `M${a.x.toFixed(1)} ${a.y.toFixed(1)}Q${arc.cx.toFixed(1)} ${arc.cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
      el.casing.setAttribute('d', d);
      el.line.setAttribute('d', d);
      el.inner?.setAttribute('d', d);
      el.glyph.setAttribute('transform', `translate(${arc.mx.toFixed(1)} ${arc.my.toFixed(1)})`);
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
      requests.push({
        id: k,
        x: arc.mx,
        y: arc.my,
        w: el.flagW,
        h: FLAG_H,
        prefer: arc.bulgesUp ? ['above', 'below', 'right', 'left'] : ['below', 'above', 'right', 'left'],
        gap: 14,
      });
      pending.push({ id: k, el: el.flag });
    }

    for (const [k, el] of this.marks) {
      const p = this.map.project([el.mark.point.lon, el.mark.point.lat]);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      el.pt.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      requests.push({
        id: `mark:${k}`,
        x: p.x,
        y: p.y,
        w: el.flagW,
        h: FLAG_H,
        prefer: ['right', 'left', 'above', 'below'],
        gap: 11,
      });
      pending.push({ id: `mark:${k}`, el: el.flag });
    }

    const placed = placeFlags(requests, { width, height });
    const byId = new Map(pending.map((p) => [p.id, p.el]));
    for (const f of placed) {
      const el = byId.get(f.id);
      if (el) el.style.transform = `translate(${f.left.toFixed(1)}px, ${f.top.toFixed(1)}px)`;
    }
  }
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
