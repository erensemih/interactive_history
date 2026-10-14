import { ROUTE_WORD, type ResolvedFrame, type ResolvedRoute, type RouteType } from '../ai/types';
import type { Rect } from '../domain/reveal';
import type { PlacePoint } from '../domain/types';
import { placeFlags, type FlagAnchor, type FlagRequest } from './flags';
import type { Projector } from './projection';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The label font, as in the stylesheet (`.ai-flag`): the width is measured, not guessed. */
const FLAG_FONT = {
  mark: '500 13px "Newsreader Variable", Georgia, serif',
  route: '600 12px "Instrument Sans Variable", system-ui, sans-serif',
};
const FLAG_PAD_X = 16; // padding and border on both sides
const FLAG_H = 22;

/** What a point of the drawing takes up around itself, so no label is hung over it. */
const DIAMOND_REACH = 9;
const NUMBER_REACH = 10;
const GLYPH_REACH = 12;
const END_REACH = 6;

/** How long an arrow takes to fade away once its beat is over (it is gone at once for a reader who asked for reduced motion). */
const FADE_MS = 520;

const svg = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};

const keyOfMark = (m: { point: PlacePoint; label: string }) =>
  `${m.point.lon.toFixed(3)},${m.point.lat.toFixed(3)}|${m.label}`;
const keyOfRoute = (r: ResolvedRoute, replay: number) =>
  `${r.type}|${r.points.map((p) => `${p.lon.toFixed(2)},${p.lat.toFixed(2)}`).join('>')}|${r.label ?? ''}|${r.animate}|${replay}`;

/** The arrowhead of each route type, its tip at the origin and pointing along +x. */
const HEAD_SHAPE: Record<RouteType, string> = {
  advance: 'M0 0L-16 -8L-16 8Z',
  retreat: 'M0 0L-14 -7L-14 7Z',
  migration: 'M0 0L-12 -6L-12 6Z',
  trade: 'M0 0L-12 -5.5L-12 5.5Z',
};
/** How far the stroke stops short of the tip, so that its end does not show past the arrowhead. */
const HEAD_BACK = 9;

/**
 * One drawing of an arrow: the arrow itself, or (where it crosses the date line) its copy on the other side of the world, so
 * the part that leaves the map at one edge comes in at the other.
 */
interface RouteCopy {
  group: SVGGElement;
  casing: SVGPathElement;
  line: SVGPathElement;
  head: SVGPathElement;
  dots: SVGCircleElement[];
  /** Which copy of the world it lies in, relative to the arrow's own longitudes: 0, or ±1 (−1: 360° to the west). */
  shift: -1 | 0 | 1;
}

/**
 * A route: a curved arrow through its stops, one look per type (src/styles/ai.css). The arrowhead sits on the last stop;
 * the other stops are small dots. An animated route draws itself in (a mask that a stroke opens along the path). It is there
 * while its beat plays and fades away when the beat is over.
 */
interface RouteEl {
  route: ResolvedRoute;
  copies: RouteCopy[];
  reveal: SVGPathElement | null;
  maskId: string | null;
  flag: HTMLElement;
  flagW: number;
  /** The path as the last layout drew it, so a label can slide along it. */
  samples: { x: number; y: number }[];
  leaving: boolean;
}

/** A point the AI marks: a diamond with its label while its beat plays, a small numbered dot afterwards. */
interface MarkEl {
  point: PlacePoint;
  label: string;
  beat: number;
  now: boolean;
  pt: HTMLElement;
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

/** A label whose point lies more than this far outside the map is not shown: pushed back inside it would name nothing. */
const OFFSCREEN_SLACK = 14;

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * What the AI draws on the map, in pen and ink: the arrows of the beat that plays and its own labelled marks. It follows
 * the map's projection like every other overlay and never touches the camera. Areas (what it paints and points at) are map
 * layers drawn by MapView, and the events have their own markers (src/map/markers.ts); this is the part that does not belong to
 * a polygon. An arrow is a movement and nothing else: the only line the map draws.
 *
 * The drawing looks different from the data layers on purpose, in the same visual language: ink on paper, told apart by
 * pattern (solid, dashed, dotted) and never by hue, so it does not compete with the vermilion that means "your
 * selection" or with the colours of the event dots.
 *
 * Every label of it keeps clear of the other labels and of the markers: it is hung where nothing else is
 * (see `placeFlags`), on the first side of its point that is free, and then at a few places further out.
 */
export class AiDrawingLayer {
  private readonly host: HTMLElement;
  private readonly lines: SVGSVGElement;
  private readonly flags: HTMLElement;
  private readonly measure = document.createElement('canvas').getContext('2d')!;
  private readonly marks = new Map<string, MarkEl>();
  private readonly routes = new Map<string, RouteEl>();
  private readonly leaving = new Set<RouteEl>();
  private readonly defs: SVGDefsElement;
  private routeSeq = 0;
  private compact = false;
  private width = 0;
  private height = 0;

  constructor(
    private readonly map: import('maplibre-gl').Map,
    container: HTMLElement,
    private readonly projector: Projector,
  ) {
    this.host = document.createElement('div');
    this.host.className = 'ai-layer';
    this.host.setAttribute('role', 'img');
    this.host.hidden = true;
    this.lines = svg('svg', { class: 'ai-links', 'aria-hidden': 'true' });
    this.defs = svg('defs');
    this.lines.appendChild(this.defs);
    this.flags = document.createElement('div');
    this.flags.className = 'ai-flags';
    this.host.append(this.lines, this.flags);
    container.appendChild(this.host);
  }

  private textWidth(text: string, font: string): number {
    this.measure.font = font;
    return Math.ceil(this.measure.measureText(text).width);
  }

  /**
   * Shows this frame: the arrows of the beat that plays (the ones of a beat that is over fade away) and the marks, each
   * prominent or a numbered dot. Elements of what stays are kept (so they do not blink), the rest come and go. Call `layout`
   * after.
   */
  setFrame(frame: ResolvedFrame, description = '') {
    const wantedRoutes = new Set(frame.routes.map((r) => keyOfRoute(r, frame.replay)));
    for (const [k, el] of this.routes) {
      if (wantedRoutes.has(k)) continue;
      this.routes.delete(k);
      this.retire(el);
    }
    for (const route of frame.routes) {
      const k = keyOfRoute(route, frame.replay);
      if (!this.routes.has(k)) this.routes.set(k, this.createRoute(route));
    }
    const wantedMarks = new Set(frame.marks.map(keyOfMark));
    for (const [k, el] of this.marks) {
      if (wantedMarks.has(k)) continue;
      el.pt.remove();
      el.flag.remove();
      this.marks.delete(k);
    }
    for (const mark of frame.marks) {
      const k = keyOfMark(mark);
      const had = this.marks.get(k);
      if (had) {
        had.now = mark.now;
        had.beat = mark.beat;
        this.styleMark(had);
      } else this.marks.set(k, this.createMark(mark));
    }
    this.host.hidden = !frame.routes.length && !frame.marks.length && !this.leaving.size;
    if (description) this.host.setAttribute('aria-label', `Yapay zekâ çizimi: ${description}`);
    else this.host.removeAttribute('aria-label');
    // The caller lays everything out next (it knows what else lies on the map): see `layout`.
  }

  /** An arrow whose beat is over: it fades away (and is gone at once for a reader who asked for reduced motion). */
  private retire(el: RouteEl) {
    if (reducedMotion()) return this.dispose(el);
    el.leaving = true;
    el.flag.hidden = true;
    for (const c of el.copies) c.group.classList.add('is-leaving');
    this.leaving.add(el);
    window.setTimeout(() => {
      this.leaving.delete(el);
      this.dispose(el);
      if (!this.routes.size && !this.marks.size && !this.leaving.size) this.host.hidden = true;
    }, FADE_MS);
  }

  private dispose(el: RouteEl) {
    for (const c of el.copies) c.group.remove();
    el.flag.remove();
    if (el.maskId) this.defs.querySelector(`#${el.maskId}`)?.remove();
  }

  /** On a small map (the little window of the full-screen reader) the drawing goes without its name tags, which would crowd it. */
  setCompact(on: boolean) {
    this.compact = on;
  }

  /* ------------------------------------------------------------- creation */

  private createCopy(route: ResolvedRoute, shift: RouteCopy['shift'], maskId: string | null): RouteCopy {
    const group = svg('g', { class: 'ai-route', 'data-type': route.type });
    const casing = svg('path', { class: 'casing' });
    const line = svg('path', { class: 'line' });
    const head = svg('path', { class: 'head', d: HEAD_SHAPE[route.type] });
    const dots = route.points.slice(0, -1).map(() => svg('circle', { class: 'stop', r: '3.8' }));
    group.append(casing, line, ...dots, head);
    if (maskId) {
      group.classList.add('is-animated');
      group.setAttribute('mask', `url(#${maskId})`);
    }
    this.lines.appendChild(group);
    return { group, casing, line, head, dots, shift };
  }

  private createRoute(route: ResolvedRoute): RouteEl {
    let reveal: SVGPathElement | null = null;
    let maskId: string | null = null;
    if (route.animate && !reducedMotion()) {
      // the path draws itself in: a mask over the whole route, opened by a stroke that grows along the same path
      maskId = `ai-route-mask-${++this.routeSeq}`;
      const mask = svg('mask', {
        id: maskId,
        maskUnits: 'userSpaceOnUse',
        x: '-200',
        y: '-200',
        width: '6000',
        height: '4000',
      });
      reveal = svg('path', { class: 'reveal', pathLength: '1' });
      mask.appendChild(reveal);
      this.defs.appendChild(mask);
    }
    // a route over the date line is drawn twice: where it leaves the map at one edge it comes in at the other
    const lons = route.points.map((p) => p.lon);
    const shifts: RouteCopy['shift'][] = [0];
    if (Math.max(...lons) > 180) shifts.push(-1);
    if (Math.min(...lons) < -180) shifts.push(1);
    const copies = shifts.map((s) => this.createCopy(route, s, maskId));
    const text = route.label ?? ROUTE_WORD[route.type];
    const flag = document.createElement('span');
    flag.className = 'ai-flag is-route';
    flag.dataset.type = route.type;
    flag.textContent = text;
    this.flags.appendChild(flag);
    return {
      route,
      copies,
      reveal,
      maskId,
      flag,
      flagW: this.textWidth(text, FLAG_FONT.route) + FLAG_PAD_X,
      samples: [],
      leaving: false,
    };
  }

  private createMark(mark: { point: PlacePoint; label: string; beat: number; now: boolean }): MarkEl {
    const pt = document.createElement('i');
    pt.className = 'ai-pt';
    this.flags.appendChild(pt);
    const flag = document.createElement('span');
    flag.className = 'ai-flag is-mark';
    flag.textContent = mark.label;
    this.flags.appendChild(flag);
    const el: MarkEl = {
      point: mark.point,
      label: mark.label,
      beat: mark.beat,
      now: mark.now,
      pt,
      flag,
      flagW: this.textWidth(mark.label, FLAG_FONT.mark) + FLAG_PAD_X,
    };
    this.styleMark(el);
    return el;
  }

  /** A mark is a diamond with its label while its beat plays, and a small numbered dot (the number of its beat) after it. */
  private styleMark(el: MarkEl) {
    el.pt.classList.toggle('is-dot', !el.now);
    el.pt.dataset.n = String(el.beat);
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
    // What the drawing itself takes up: its own points and arrow ends. No label is hung over them.
    const own: Rect[] = [];
    const reach = (x: number, y: number, r: number): Rect => ({ left: x - r, top: y - r, right: x + r, bottom: y + r });
    const world = this.projector.worldWidth();

    for (const [k, el] of [...this.routes, ...[...this.leaving].map((r) => ['', r] as const)]) {
      const leaving = el.leaving;
      // the stops as the arrow runs: longitudes run on over the date line, so the path is where the short way goes
      const base = el.route.points.map((pt) => this.projector.exact(pt.lon, pt.lat));
      if (!base.every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y))) continue;
      let primary: ReturnType<typeof routePath> | null = null;
      for (const copy of el.copies) {
        const dx = copy.shift * -world;
        const pts = base.map((pt) => ({ x: pt.x + dx, y: pt.y }));
        const path = routePath(pts);
        if (copy.shift === 0) primary = path;
        copy.casing.setAttribute('d', path.d);
        copy.line.setAttribute('d', path.d);
        // the head only where the tip is: the other copy shows the part of the path that crosses over
        copy.head.setAttribute(
          'transform',
          `translate(${path.tip.x.toFixed(1)} ${path.tip.y.toFixed(1)}) rotate(${path.angle.toFixed(1)})`,
        );
        copy.head.style.display =
          el.route.points[el.route.points.length - 1]!.lon > 180 === (copy.shift === -1) ? '' : 'none';
        copy.dots.forEach((dot, i) =>
          dot.setAttribute('transform', `translate(${pts[i]!.x.toFixed(1)} ${pts[i]!.y.toFixed(1)})`),
        );
        if (!leaving) for (const pt of pts) own.push(reach(pt.x, pt.y, END_REACH));
        if (copy.shift === 0 && el.reveal) el.reveal.setAttribute('d', path.d);
      }
      if (!primary) continue;
      el.samples = primary.samples;
      if (leaving) continue;
      own.push(reach(primary.tip.x, primary.tip.y, GLYPH_REACH));
      const where = (f: number) => pointAlong(primary!.samples, f);
      const spots = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8].map(where).filter(onMap);
      el.flag.hidden = this.compact || !spots.length;
      if (el.flag.hidden) continue;
      const first = spots[0]!;
      const prefer: FlagAnchor['prefer'] = ['above', 'below', 'right', 'left'];
      requests.push({
        id: k,
        x: first.x,
        y: first.y,
        w: el.flagW,
        h: FLAG_H,
        prefer,
        gap: 13,
        alternates: spots.slice(1).map((at) => ({ x: at.x, y: at.y, gap: 12, prefer: prefer.slice(0, 2) })),
      });
      pending.push({ id: k, el: el.flag });
    }

    for (const [k, el] of this.marks) {
      const p = this.projector.near(el.point.lon, el.point.lat);
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      el.pt.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
      own.push(reach(p.x, p.y, el.now ? DIAMOND_REACH : NUMBER_REACH));
      el.flag.hidden = this.compact || !el.now || !onMap(p);
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

/** The point `f` (0..1) of the way along a sampled path, by length. */
function pointAlong(samples: readonly { x: number; y: number }[], f: number): { x: number; y: number } {
  if (samples.length < 2) return samples[0] ?? { x: 0, y: 0 };
  const lengths: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    lengths.push(lengths[i - 1]! + Math.hypot(samples[i]!.x - samples[i - 1]!.x, samples[i]!.y - samples[i - 1]!.y));
  }
  const total = lengths[lengths.length - 1]! || 1;
  const want = Math.min(1, Math.max(0, f)) * total;
  let i = 1;
  while (i < lengths.length - 1 && lengths[i]! < want) i++;
  const span = lengths[i]! - lengths[i - 1]! || 1;
  const t = (want - lengths[i - 1]!) / span;
  return {
    x: samples[i - 1]!.x + (samples[i]!.x - samples[i - 1]!.x) * t,
    y: samples[i - 1]!.y + (samples[i]!.y - samples[i - 1]!.y) * t,
  };
}

/**
 * The curve of a route through its projected stops: a gentle arc for two, a smooth curve through all of them (a
 * Catmull-Rom spline as cubic Béziers) for more. It ends `HEAD_BACK` pixels before the last stop, where the arrowhead
 * begins; `tip` is the last stop and `angle` the direction the path arrives from, in degrees.
 */
export function routePath(pts: readonly { x: number; y: number }[]): {
  d: string;
  tip: { x: number; y: number };
  angle: number;
  samples: { x: number; y: number }[];
} {
  type P = { x: number; y: number };
  const f = (n: number) => n.toFixed(1);
  const segments: [P, P, P, P][] = []; // start, control 1, control 2, end
  if (pts.length === 2) {
    const [a, b] = [pts[0]!, pts[1]!];
    const arc = arcBetween(a, b);
    segments.push([
      a,
      { x: a.x + (2 / 3) * (arc.cx - a.x), y: a.y + (2 / 3) * (arc.cy - a.y) },
      { x: b.x + (2 / 3) * (arc.cx - b.x), y: b.y + (2 / 3) * (arc.cy - b.y) },
      b,
    ]);
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!;
      const p1 = pts[i]!;
      const p2 = pts[i + 1]!;
      const p3 = pts[i + 2] ?? p2;
      segments.push([
        p1,
        { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
        { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
        p2,
      ]);
    }
  }
  const last = segments[segments.length - 1]!;
  const tip = last[3];
  const dx = tip.x - last[2].x || 1e-6;
  const dy = tip.y - last[2].y || 0;
  const len = Math.hypot(dx, dy) || 1;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  // the stroke stops short of the tip (no more than half of the last segment)
  const back = Math.min(HEAD_BACK, Math.hypot(tip.x - last[0].x, tip.y - last[0].y) / 2);
  const end = { x: tip.x - (dx / len) * back, y: tip.y - (dy / len) * back };
  const drawn: [P, P, P, P][] = segments.map((seg, i) =>
    i === segments.length - 1 ? [seg[0], seg[1], seg[2], end] : seg,
  );
  let d = `M${f(drawn[0]![0].x)} ${f(drawn[0]![0].y)}`;
  const samples: P[] = [drawn[0]![0]];
  for (const [p0, p1, p2, p3] of drawn) {
    d += `C${f(p1.x)} ${f(p1.y)} ${f(p2.x)} ${f(p2.y)} ${f(p3.x)} ${f(p3.y)}`;
    for (let k = 1; k <= 14; k++) {
      const t = k / 14;
      const u = 1 - t;
      samples.push({
        x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
        y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
      });
    }
  }
  return { d, tip, angle, samples };
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
