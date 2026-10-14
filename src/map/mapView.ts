import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AppData } from '../data/load';
import { EMPTY_RESOLVED, type ColorKey, type FrameTarget, type ResolvedFrame } from '../ai/types';
import { unwrapNear, wrapLon } from '../domain/antimeridian';
import { frameBounds, framePadding, isFramed, projectWith, WIDE_LON } from '../domain/camera';
import { isLand, primaryAt, rowsContaining } from '../domain/geo';
import { revealMove, type Rect } from '../domain/reveal';
import type { Bounds, HistoricalEvent, PlacePoint } from '../domain/types';
import { AiDrawingLayer } from './aiLayer';
import { occupationKey, PolityLabels } from './labels';
import { EventMarkers, type MarkerStats, type Narrator, type ToldEvent } from './markers';
import { PlacePins } from './pin';
import { Projector } from './projection';
import { TerritoryLayer, type ChangeFlash } from './territoryLayer';
import { doubtImage, hatchImage, readTheme, stippleImage, type MapTheme } from './theme';

export interface MapCallbacks {
  /** Markers drawn vs. map events in the range, and why the rest are not drawn. */
  onMarkerStats?(stats: MarkerStats): void;
  /** A click on land. Never moves the map. */
  onPlaceClick(point: PlacePoint): void;
  /** A click on open water or outside any land. */
  onWaterClick(): void;
  /** Polity under the pointer (for the hover tooltip), or null; `noData` is true on land the border data does not cover. */
  onHoverPolity(id: string | null, clientX: number, clientY: number, noData: boolean): void;
  /** The borders of the shown year are not on the map yet (true) / are (false). Fired on change only. */
  onBordersLoading?(loading: boolean): void;
  onEventClick(id: string): void;
  onEventHover(id: string | null, el: HTMLElement | null): void;
  /** Map controls (zoom buttons, legend, counter) in map pixels: a revealed event must not hide behind them. */
  avoidRects(): Rect[];
}

/** Room kept clear around a revealed event: its dot, the year on its right and its name above it. */
const REVEAL_MARGIN = { top: 44, right: 60, bottom: 36, left: 36 };

/** How close the camera goes to a step's drawing: a lone mark is shown with its surroundings, not at street level. */
const FRAME_MAX_ZOOM = 5.2;
/** How much of the map fades while the AI lights some polities: paper laid over everything that is not lit. */
const SPOT_VEIL = 0.62;

/**
 * The borders are 2 700 rows over 200 years, 2.6 million points: far too much for the map's tile index to take
 * in one go (it would take half a minute). The map is handed only the rows that exist within this many years
 * either side of the shown year, and a new window when the year gets near its edge. Moving the year inside the
 * window only changes a filter, as it always did.
 */
const BORDER_WINDOW_HALF = 10;
/** A new window is asked for once the year is this close to the edge of the one the map has (unless that edge is the end of the data). */
const BORDER_WINDOW_MARGIN = 3;
/** Years change in a rush while the reader drags; a window is only asked for once they pause. */
const BORDER_WINDOW_DEBOUNCE_MS = 140;

const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [-108, -34],
  [146, 68],
];

/** The limits of the map: strictly inside ±180° (MapLibre 5.24 throws on a full-world maxBounds). */
const NORMAL_LIMITS: [[number, number], [number, number]] = [
  [-179.9, -60],
  [179.9, 82],
];
/** The limits of the wide view, which shows the world twice over so the Pacific is one piece: a world either side of Greenwich. */
const WIDE_LIMITS: [[number, number], [number, number]] = [
  [-WIDE_LON, -60],
  [WIDE_LON, 82],
];

/** Gentle at both ends and never abrupt in the middle, so a long zoom-out stays easy to follow. */
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;

const yearFilter = (year: number): ExpressionSpecification => [
  'all',
  ['<=', ['get', 'from'], year],
  ['>=', ['get', 'to'], year],
];

/** Rows of the given polities that are valid in `year` (an empty list matches nothing). */
const idsFilter = (year: number, ids: string[]): ExpressionSpecification => [
  'all',
  ['<=', ['get', 'from'], year],
  ['>=', ['get', 'to'], year],
  ['in', ['get', 'id'], ['literal', ids.length ? ids : ['\u0000none']]],
];

/**
 * The MapLibre map. Its job is to draw the borders of one year and to report what the user clicks.
 * Clicking a place, a marker or a control never moves it: the view changes through the user's own
 * drag, wheel, pinch, keyboard or zoom buttons, and in exactly two other cases: `revealEvent`, when
 * the user opens an event whose location is out of sight, and `frameTarget`, when the reader has the AI's
 * camera following ("Harita takibi") and a step of its narration becomes the active one (pan and zoom,
 * smoothly, only as far as it takes, and only when the drawing is not already framed well). Everything else
 * the AI draws is an overlay or a layer and leaves the camera alone. (Double-click zoom is disabled so a
 * click can never be mistaken for a camera command.)
 */
export class MapView {
  readonly map: MLMap;
  private readonly theme: MapTheme;
  private readonly labels: PolityLabels;
  private readonly markers: EventMarkers;
  private readonly ai: AiDrawingLayer;
  private readonly pins: PlacePins;
  private readonly projector: Projector;
  private territory: TerritoryLayer | null = null;
  /**
   * The wide view: the map repeats the world either side of the date line and may be taken past ±180°, so a scene that
   * crosses the date line (Pearl Harbor and Japan) is framed as the one stretch of Pacific it is. It is on only while a scene
   * needs it and goes when the view is back inside the plain world.
   */
  private wide = false;
  private wantWide = false;
  /** Where the camera is on its way to (the box of the scene it was sent to frame), until it arrives. */
  private pendingFrame: Bounds | null = null;
  private year = 0;
  /** The years of rows in the map's border source: asked for ... */
  private borderWindow: [number, number] | null = null;
  /** ... and known to have arrived (until then the filters stay inside the window the map really has). */
  private borderLoaded: [number, number] | null = null;
  private windowTimer = 0;
  private windowBusy = false;
  private bordersLoading = false;
  /** Border rows valid in the shown year: hit-testing a pointer position only looks at these. */
  private rowsNow: AppData['rows'] = [];
  private selectedIds: string[] = [];
  private selectedLands: string[] = [];
  /** The polities the AI paints in their actor colour (the rest of the map fades back while there are any). */
  private aiPainted: ResolvedFrame['painted'] = [];
  /** The polities the playing beat points at: they keep their colour and are outlined. */
  private aiEmphasis: string[] = [];
  /** The paint of the AI's fill: each painted polity in its actor's colour, the polities only pointed at in their own tint. */
  private paintKey = '';
  private tintExpr: ExpressionSpecification | null = null;
  private hoverId: string | null = null;
  /** Somebody narrates the map (the AI, else the selected place): the event markers other than the ones the narrator or the reader brings are off the map. */
  private narrator: Narrator | null = null;
  private told: ToldEvent[] = [];
  private selectedEventId: string | null = null;
  /** The controls lying over the map in map pixels; they only change when the map or the page is resized. */
  private controls: Rect[] | null = null;
  private layoutFailed = false;
  private ready = false;
  private hoverQueued = false;
  private lastPointer: { x: number; y: number; cx: number; cy: number } | null = null;

  constructor(
    container: HTMLElement,
    private readonly data: AppData,
    private readonly cb: MapCallbacks,
    initialView: { lng: number; lat: number; zoom: number } | null = null,
  ) {
    this.theme = readTheme(data.tintCount);
    // On touch devices the map sits inside a scrolling page: one finger scrolls the page, two move the
    // map. A mouse (even in a narrow window) keeps the wheel for zooming.
    const touch = window.matchMedia('(pointer: coarse)');
    this.map = new maplibregl.Map({
      container,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'sea', type: 'background', paint: { 'background-color': this.theme.sea } }],
      },
      // First placement only: either the view from the address bar or the dataset's whole extent.
      ...(initialView
        ? { center: [initialView.lng, initialView.lat] as [number, number], zoom: initialView.zoom }
        : {
            bounds: INITIAL_BOUNDS,
            fitBoundsOptions: { padding: { top: 12, bottom: 12, left: 12, right: 12 }, animate: false },
          }),
      cooperativeGestures: touch.matches,
      locale: {
        'Map.Title': 'Harita',
        'CooperativeGesturesHandler.WindowsHelpText': 'Haritayı yakınlaştırmak için Ctrl + fare tekerleğini kullanın',
        'CooperativeGesturesHandler.MacHelpText': 'Haritayı yakınlaştırmak için ⌘ + fare tekerleğini kullanın',
        'CooperativeGesturesHandler.MobileHelpText': 'Haritayı kaydırmak için iki parmak kullanın',
      },
      minZoom: 1.1,
      maxZoom: 9,
      maxBounds: NORMAL_LIMITS,
      renderWorldCopies: false,
      attributionControl: false,
      // The panel changes the map's size by itself (PanelWidth resizes the map once, its left edge held in
      // place); MapLibre's own tracking would then resize it a second time. We watch the container instead.
      trackResize: false,
      dragRotate: false,
      pitchWithRotate: false,
      doubleClickZoom: false,
      touchPitch: false,
      maxPitch: 0,
      fadeDuration: 0,
    });
    new ResizeObserver(() => this.fitToContainer()).observe(container);
    this.map.on('resize', () => (this.controls = null));
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation(); // north stays up: Shift+arrows would turn the map otherwise
    touch.addEventListener('change', (e) =>
      e.matches ? this.map.cooperativeGestures.enable() : this.map.cooperativeGestures.disable(),
    );

    const canvasContainer = this.map.getCanvasContainer();
    this.projector = new Projector(this.map, () => this.wide);
    this.labels = new PolityLabels(this.map, this.projector, canvasContainer, data);
    // Above the polity labels, below the pin and the event markers (the DOM order decides at equal z-index).
    this.ai = new AiDrawingLayer(this.map, canvasContainer, this.projector);
    this.pins = new PlacePins(this.projector, canvasContainer);
    this.markers = new EventMarkers(this.map, this.projector, canvasContainer, {
      onClick: (id) => cb.onEventClick(id),
      onHover: (id, el) => cb.onEventHover(id, el),
      onStats: (stats) => cb.onMarkerStats?.(stats),
    });

    this.map.on('load', () => this.onLoad());
    // Layout runs inside the render event so DOM overlays move in the very frame the canvas does.
    this.map.on('render', () => this.layoutOverlays());
    this.map.on('click', (e) => this.onMapClick(wrapLon(e.lngLat.lng), e.lngLat.lat));
    this.map.on('mousemove', (e) => {
      if ((e.originalEvent.target as HTMLElement | null)?.closest?.('.evt')) {
        // Over an event marker: its own tooltip is showing, not the polity's.
        this.lastPointer = null;
        this.setHoverPolity(null);
        return;
      }
      this.lastPointer = { x: e.point.x, y: e.point.y, cx: e.originalEvent.clientX, cy: e.originalEvent.clientY };
      this.queueHover();
    });
    this.map.on('mouseout', (e) => {
      // Moving from the map onto a marker also leaves the canvas; the marker's own tooltip takes over.
      const to = (e.originalEvent as MouseEvent).relatedTarget as HTMLElement | null;
      if (to?.closest?.('.evt')) return;
      this.lastPointer = null;
      this.setHoverPolity(null);
      cb.onHoverPolity(null, 0, 0, false);
    });
    this.map.on('dragstart', () => {
      this.map.getCanvas().style.cursor = '';
    });
    // The camera has come to rest: the wide view goes when the view is back inside the plain world and nothing asks for it.
    this.map.on('moveend', () => {
      this.pendingFrame = null;
      this.settleWide();
    });
  }

  /** The container changed size by some other means (a window resize, a rotated phone): resize about the centre, as usual. */
  private fitToContainer() {
    const box = this.map.getContainer();
    const canvas = this.map.getCanvas();
    if (box.clientWidth === canvas.clientWidth && box.clientHeight === canvas.clientHeight) return;
    this.map.resize();
  }

  /* ------------------------------------------------------------ layers */

  private onLoad() {
    const t = this.theme;
    const map = this.map;
    map.addImage('hatch', hatchImage(t.accent), { pixelRatio: 2 });
    map.addImage('doubt', doubtImage(t.ink), { pixelRatio: 2 });
    map.addImage('stipple', stippleImage(t.ink3), { pixelRatio: 2 });

    map.addSource('land', { type: 'geojson', data: this.data.land, tolerance: 0.2, buffer: 16, maxzoom: 9 });
    const first = this.windowFor(this.year);
    this.borderWindow = this.borderLoaded = first;
    map.addSource('borders', {
      type: 'geojson',
      data: this.data.borders.window(first[0], first[1]),
      tolerance: 0.25,
      buffer: 16,
      maxzoom: 9,
    });

    const tintExpr = [
      'match',
      ['get', 'tint'],
      ...t.tints.flatMap((c, i) => [i, c]),
      t.tints[0] ?? '#e7dbc4',
    ] as unknown as ExpressionSpecification;
    this.tintExpr = tintExpr;
    const zoomWidth = (a: number, b: number, c: number): ExpressionSpecification => [
      'interpolate',
      ['linear'],
      ['zoom'],
      1,
      a,
      4.5,
      b,
      8,
      c,
    ];

    map.addLayer({ id: 'land-base', type: 'fill', source: 'land', paint: { 'fill-color': t.nodata } });
    map.addLayer({ id: 'land-nodata', type: 'fill', source: 'land', paint: { 'fill-pattern': 'stipple' } });
    map.addLayer({
      id: 'polity-fill',
      type: 'fill',
      source: 'borders',
      filter: yearFilter(this.filterYear()),
      paint: { 'fill-color': tintExpr },
    });
    map.addLayer({
      id: 'polity-line',
      type: 'line',
      source: 'borders',
      filter: yearFilter(this.filterYear()),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.borderInk, 'line-width': zoomWidth(0.35, 0.9, 1.6), 'line-opacity': 0.55 },
    });
    map.addLayer({
      id: 'polity-hover',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.hoverIds()),
      paint: { 'fill-color': t.accent, 'fill-opacity': 0.13 },
    });
    map.addLayer({
      id: 'polity-selected-fill',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.selectedIds),
      paint: { 'fill-color': t.accent, 'fill-opacity': 0.2 },
    });
    map.addLayer({
      id: 'polity-selected-hatch',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.selectedIds),
      paint: { 'fill-pattern': 'hatch' },
    });
    map.addLayer({
      id: 'polity-selected-glow',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.selectedIds),
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': t.accent,
        'line-width': zoomWidth(5, 9, 14),
        'line-blur': zoomWidth(4, 6, 9),
        'line-opacity': 0.35,
      },
    });
    map.addLayer({
      id: 'polity-selected-line',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.selectedIds),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.accent, 'line-width': zoomWidth(1.4, 2.4, 3), 'line-opacity': 0.95 },
    });
    map.addLayer({
      id: 'coast',
      type: 'line',
      source: 'land',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.coast, 'line-width': zoomWidth(0.5, 0.9, 1.5), 'line-opacity': 0.85 },
    });
    // What the AI paints and points at. While it paints (the actors of a narration) or points at polities, a veil of paper lies
    // over everything below (the sea, the land, every polity, the coast) and fades it back; no blur, only less of everything.
    // The painted polities are then drawn above it, solid in their actor's colour (a polity that is only pointed at keeps its own
    // tint), with thin borders; the ones whose side is unclear are hatched; the ones pointed at are cut out of the veil by a
    // paper rim and a pen outline.
    map.addLayer({
      id: 'ai-veil',
      type: 'background',
      paint: {
        'background-color': t.paper,
        'background-opacity': 0,
        'background-opacity-transition': { duration: 380 },
      },
    });
    map.addLayer({
      id: 'ai-fill',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.aiIds()),
      paint: { 'fill-color': tintExpr, 'fill-opacity': 1 },
    });
    map.addLayer({
      id: 'ai-doubt',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.neutralIds()),
      paint: { 'fill-pattern': 'doubt' },
    });
    map.addLayer({
      id: 'ai-border',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.aiIds()),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.borderInk, 'line-width': zoomWidth(0.5, 1.1, 1.8), 'line-opacity': 0.8 },
    });
    map.addLayer({
      id: 'ai-casing',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.aiEmphasis),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.paper, 'line-width': zoomWidth(3.8, 5.6, 7.6), 'line-opacity': 0.92 },
    });
    map.addLayer({
      id: 'ai-line',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.filterYear(), this.aiEmphasis),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.ink, 'line-width': zoomWidth(1.4, 2.1, 2.9), 'line-opacity': 0.95 },
    });

    this.territory = new TerritoryLayer(
      map,
      this.data,
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      'ai-casing',
      () => this.flashRegion(),
    );

    this.ready = true;
    this.applyYear();
    // The year was set before the map was ready: the first window is for that year, so the "loading" the header was told
    // about then is over, and a year that has moved on since gets its own window.
    this.reportLoading();
    this.ensureWindow();
    this.layoutOverlays(true);
  }

  /** The window of years to hand the map for `year`: centred on it, pushed back inside the data's extent. */
  private windowFor(year: number): [number, number] {
    const { from, to } = this.data.extent;
    let a = year - BORDER_WINDOW_HALF;
    let b = year + BORDER_WINDOW_HALF;
    if (a < from) [a, b] = [from, Math.min(to, b + (from - a))];
    if (b > to) [a, b] = [Math.max(from, a - (b - to)), to];
    return [a, b];
  }

  /** Is `year` safely inside `w`: away from its edges, except where the edge is the end of the data? */
  private windowCovers(w: [number, number] | null, year: number): boolean {
    if (!w) return false;
    const { from, to } = this.data.extent;
    const lo = w[0] <= from ? from : w[0] + BORDER_WINDOW_MARGIN;
    const hi = w[1] >= to ? to : w[1] - BORDER_WINDOW_MARGIN;
    return year >= lo && year <= hi;
  }

  /** The year the filters use: the shown year, or, while the rows for it are still on their way, the nearest year the map has. */
  private filterYear(): number {
    const w = this.borderLoaded;
    return w ? Math.min(Math.max(this.year, w[0]), w[1]) : this.year;
  }

  /** The rows of the shown year are in the map (a new window is not pending). */
  bordersReady(): boolean {
    const w = this.borderLoaded;
    return !!w && this.year >= w[0] && this.year <= w[1];
  }

  private reportLoading() {
    const loading = !this.bordersReady();
    if (loading === this.bordersLoading) return;
    this.bordersLoading = loading;
    this.cb.onBordersLoading?.(loading);
  }

  private ensureWindow() {
    if (!this.ready || this.windowTimer || this.windowBusy) return;
    if (this.windowCovers(this.borderWindow, this.year)) return;
    this.windowTimer = window.setTimeout(() => {
      this.windowTimer = 0;
      this.loadWindow();
    }, BORDER_WINDOW_DEBOUNCE_MS);
  }

  private loadWindow() {
    const src = this.map.getSource('borders') as GeoJSONSource | undefined;
    if (!src) return;
    const win = this.windowFor(this.year);
    if (this.borderWindow && win[0] === this.borderWindow[0] && win[1] === this.borderWindow[1]) return;
    this.borderWindow = win;
    this.windowBusy = true;
    const arrived = () => {
      if (!this.map.isSourceLoaded('borders')) return;
      this.map.off('sourcedata', onData);
      this.windowBusy = false;
      this.borderLoaded = win;
      this.applyYear();
      this.reportLoading();
      this.ensureWindow(); // the year may have moved on while this one loaded
    };
    const onData = (e: { sourceId?: string }) => {
      if (e.sourceId === 'borders') arrived();
    };
    this.map.on('sourcedata', onData);
    src.setData(this.data.borders.window(win[0], win[1]));
  }

  private applyYear() {
    if (!this.ready) return;
    const m = this.map;
    m.setFilter('polity-fill', yearFilter(this.filterYear()));
    m.setFilter('polity-line', yearFilter(this.filterYear()));
    this.applySelection();
    this.applyHover();
    this.applyAi();
  }

  /** Every polity the AI has something to say about: painted or pointed at. */
  private aiIds(): string[] {
    return [...new Set([...this.aiPainted.map((p) => p.id), ...this.aiEmphasis])];
  }

  private neutralIds(): string[] {
    return this.aiPainted.filter((p) => p.color === 'neutral').map((p) => p.id);
  }

  private applyAi() {
    if (!this.ready) return;
    const year = this.filterYear();
    const ids = this.aiIds();
    for (const id of ['ai-fill', 'ai-border']) this.map.setFilter(id, idsFilter(year, ids));
    for (const id of ['ai-casing', 'ai-line']) this.map.setFilter(id, idsFilter(year, this.aiEmphasis));
    this.map.setFilter('ai-doubt', idsFilter(year, this.neutralIds()));
    // the rest of the map fades only while something is painted or pointed at
    this.map.setPaintProperty('ai-veil', 'background-opacity', ids.length ? SPOT_VEIL : 0);
    this.applyPaint();
  }

  /** The painted polities are one colour each, the colour of their actor; the others keep their own tint. */
  private applyPaint() {
    if (!this.ready || !this.tintExpr) return;
    const key = this.aiPainted.map((p) => `${p.id}:${p.color}`).join('|');
    if (key === this.paintKey) return;
    this.paintKey = key;
    const byColor = new Map<ColorKey, string[]>();
    for (const p of this.aiPainted) byColor.set(p.color, [...(byColor.get(p.color) ?? []), p.id]);
    const paint = byColor.size
      ? ([
          'match',
          ['get', 'id'],
          ...[...byColor].flatMap(([color, ids]) => [ids, this.theme.actors[color]]),
          this.tintExpr,
        ] as unknown as ExpressionSpecification)
      : this.tintExpr;
    this.map.setPaintProperty('ai-fill', 'fill-color', paint);
  }

  private applySelection() {
    if (!this.ready) return;
    for (const id of [
      'polity-selected-fill',
      'polity-selected-hatch',
      'polity-selected-glow',
      'polity-selected-line',
    ]) {
      this.map.setFilter(id, idsFilter(this.filterYear(), this.selectedIds));
    }
  }

  private applyHover() {
    if (!this.ready) return;
    this.map.setFilter('polity-hover', idsFilter(this.filterYear(), this.hoverIds()));
  }

  /** The hovered polity, unless it is already selected (no hover tint on top of the selection). */
  private hoverIds(): string[] {
    return this.hoverId && !this.selectedIds.includes(this.hoverId) ? [this.hoverId] : [];
  }

  private layoutOverlays(force = false) {
    // The size is read once, before any overlay writes styles, so the frame does not force extra layouts.
    const canvas = this.map.getCanvas();
    const size = { width: canvas.clientWidth, height: canvas.clientHeight };
    try {
      // Markers and the place dot first: they cannot move, so every label is laid out around them.
      this.markers.layout(force, size);
      this.pins.layout();
      this.labels.setAvoid(this.narratorRoom());
      this.labels.layout(force, size);
      const names = this.labels.boxes();
      const yields = this.ai.layout({
        hard: [
          ...this.markers.rects(),
          ...this.pins.rects(),
          ...this.controlRects(),
          ...names.filter((n) => n.forced).map((n) => n.rect),
        ],
        soft: names.filter((n) => !n.forced).map((n) => n.rect),
      });
      this.labels.yieldTo(yields);
    } catch (err) {
      // A bad record must not stop the map's frame loop (and with it the 'load' event).
      if (!this.layoutFailed) console.error('[harita] bindirme katmanları çizilemedi', err);
      this.layoutFailed = true;
    }
  }

  /** The controls over the map (zoom buttons, legend, the note), in map pixels; empty ones do not count. */
  private controlRects(): Rect[] {
    this.controls ??= this.cb.avoidRects().filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0);
    return this.controls;
  }

  /** The page changed what lies over the map (the note appeared, the legend went): measure the controls again. */
  controlsChanged() {
    this.controls = null;
  }

  /** The map is a small window (the full-screen reader): what the AI drew keeps its shapes and leaves its name tags out. */
  setCompact(on: boolean) {
    this.ai.setCompact(on);
    if (this.ready) this.layoutOverlays(true);
  }

  /** Something over the map appeared, went or changed size: the labels are placed again around what is there now. */
  overlaysChanged() {
    this.controls = null;
    if (this.ready) this.layoutOverlays(true);
  }

  /* --------------------------------------------------------- public API */

  /** The year whose borders are drawn. */
  setYear(year: number) {
    if (year === this.year && this.ready) return;
    this.year = year;
    this.rowsNow = this.data.rows.filter((r) => r.from <= year && year <= r.to);
    this.labels.setYear(year);
    this.markers.setFocusYear(year);
    this.applyYear();
    this.reportLoading();
    this.ensureWindow();
  }

  /**
   * The polities to highlight (those holding the selected places), and the occupied lands the selected places lie in: the
   * name of such a land ("Polonya (Alman işgali)") stays on the map like the selected polity's, pin or no pin beside it.
   */
  setSelectedPolities(ids: string[], lands: string[] = []) {
    const same =
      ids.length === this.selectedIds.length &&
      ids.every((id, i) => id === this.selectedIds[i]) &&
      lands.length === this.selectedLands.length &&
      lands.every((id, i) => id === this.selectedLands[i]);
    if (same) return;
    this.selectedIds = ids;
    this.selectedLands = lands;
    this.labels.setSelected([...ids, ...lands.map(occupationKey)]);
    this.applySelection();
    this.applyHover();
  }

  /** Events eligible for the map: decided by the time range alone, never by the selected place. */
  setEvents(events: HistoricalEvent[], focusYear: number) {
    this.markers.setEvents(events, focusYear);
  }

  /** The selected places, drawn as pins. */
  setPlaces(points: PlacePoint[]) {
    this.pins.setPoints(points);
  }

  /** The opened event: always drawn (even if the range's set or the zoom budget would hide it) and highlighted. */
  setSelectedEvent(ev: HistoricalEvent | null) {
    if (ev?.id === this.selectedEventId) return;
    this.selectedEventId = ev?.id ?? null;
    this.markers.setSelected(ev);
    this.layoutOverlays(); // names and labels keep clear of the marker that has just come or gone, with no map frame to wait for
  }

  /**
   * Who narrates the map: the AI (its answer is on screen), the selected place, or nobody. With a narrator the
   * event markers leave the map: only the opened event and the ones the AI talks about stay or come. With nobody,
   * everything is as it always was.
   */
  setNarrator(who: Narrator | null) {
    if (who === this.narrator) return;
    this.narrator = who;
    this.syncNarrator();
    this.layoutOverlays();
  }

  private syncNarrator() {
    this.markers.setNarrator(this.narrator, this.told);
    this.labels.setAvoid(this.narratorRoom());
  }

  /** What the polity names keep clear of while somebody narrates: the few markers on the map and the place dot. */
  private narratorRoom(): Rect[] {
    return this.narrator ? [...this.markers.rects(), ...this.pins.rects()] : [];
  }

  /**
   * What the AI shows at this moment of its scene, for the year shown: the polygons (what it paints and points at) are map
   * layers, the arrows and marks an overlay, the events markers. Replacing it never touches the camera.
   */
  setAiFrame(frame: ResolvedFrame | null, description = '') {
    if (!frame) {
      // nothing asks for the wide view any more: it goes as soon as the view is back inside the plain world
      this.wantWide = false;
      this.settleWide();
    }
    const f = frame ?? EMPTY_RESOLVED;
    const same = (a: readonly string[], b: readonly string[]) =>
      a.length === b.length && a.every((id, i) => id === b[i]);
    const changed =
      !same(f.emphasis, this.aiEmphasis) ||
      !same(
        f.painted.map((p) => `${p.id}:${p.color}`),
        this.aiPainted.map((p) => `${p.id}:${p.color}`),
      );
    if (changed) {
      this.aiPainted = f.painted;
      this.aiEmphasis = f.emphasis;
      this.labels.setEmphasis(this.aiIds());
      this.applyAi();
    }
    this.ai.setFrame(f, description);
    this.territory?.setChanges(this.flashesOf(f), f.replay);
    const told: ToldEvent[] = f.events.flatMap((e) => {
      const event = this.data.eventsById.get(e.id);
      return event ? [{ event, beat: e.beat, now: e.now }] : [];
    });
    const sameTold =
      told.length === this.told.length &&
      told.every(
        (t, i) => t.event === this.told[i]!.event && t.beat === this.told[i]!.beat && t.now === this.told[i]!.now,
      );
    if (!sameTold) {
      this.told = told;
      this.syncNarrator();
    }
    this.layoutOverlays(); // the new labels are placed around what is on the map now, with no map frame to wait for
  }

  /** The changes of borders whose beat plays now, each in its polity's colour on the map. */
  private flashesOf(frame: ResolvedFrame): ChangeFlash[] {
    return frame.changes
      .filter((c) => c.now)
      .map((c) => ({
        key: `${c.beat}|${c.polity}|${c.from}|${c.to}`,
        polity: c.polity,
        from: c.from,
        to: c.to,
        color: this.colorOf(c.polity),
      }));
  }

  /** The colour a polity is drawn in: its actor's while the narration paints it, else its own tint. */
  private colorOf(id: string): string {
    const painted = this.aiPainted.find((p) => p.id === id);
    if (painted) return this.theme.actors[painted.color];
    const tint = this.data.entities.get(id)?.tint;
    return this.theme.tints[typeof tint === 'number' ? tint : 0] ?? this.theme.tints[0] ?? '#e7dbc4';
  }

  /**
   * The year under a narration moved (a scene begins in another year, a beat changes the borders): whatever changed hands within
   * view, and within the scene the camera is on its way to, is pointed at for a moment.
   */
  flashYears(from: number, to: number) {
    if (!this.ready || !this.territory || from === to) return;
    this.territory.flashYears(from, to, this.flashRegion());
  }

  /** The part of the world a flash is about: what is in view and what the camera is on its way to, inside the plain world. */
  private flashRegion(): Bounds {
    const view = this.map.getBounds();
    let box: Bounds = [view.getWest(), view.getSouth(), view.getEast(), view.getNorth()];
    const next = this.pendingFrame;
    if (next)
      box = [
        Math.min(box[0], next[0]),
        Math.min(box[1], next[1]),
        Math.max(box[2], next[2]),
        Math.max(box[3], next[3]),
      ];
    return [Math.max(-179.9, box[0]), Math.max(-60, box[1]), Math.min(179.9, box[2]), Math.min(82, box[3])];
  }

  /** Nothing of the AI's is on the map any more: the flashes go too. */
  clearFlashes() {
    this.territory?.clear();
  }

  /**
   * Brings an event into view if it is out of sight, changing the camera as little as possible: the map
   * zooms out about its current centre just far enough (nothing pans, and the view the user was in stays
   * inside the new one), eased so the user can follow where it went. If even the widest view the map has
   * (a small window sits at its minimum zoom) cannot show it, the map goes that wide and its centre moves the
   * shortest way that brings the event inside the margins, within the map's limits. Does nothing when the
   * event is already visible, so clicking a marker never moves the map, and revealing the same event twice
   * never moves it again.
   */
  revealEvent(ev: HistoricalEvent) {
    this.bringIntoView([ev.location]);
  }

  /**
   * Brings what a step of the AI's narration put on the map into view: pan and zoom, as far as it takes and
   * no further, eased so the reader can follow where it went. Does nothing (and says so) when the drawing is
   * already framed well, so two steps in one region do not make the map breathe. Returns whether it moved.
   */
  frameTarget(target: FrameTarget): boolean {
    if (!this.ready) return false;
    const bounds = frameBounds(target.boxes, target.points);
    if (!bounds) return false;
    const map = this.map;
    const canvas = map.getCanvas();
    const size = { width: canvas.clientWidth, height: canvas.clientHeight };
    if (size.width < 120 || size.height < 120) return false;
    // a scene across the date line is framed in the wide view, as the one stretch of the Pacific it is
    this.wantWide = bounds[0] < -180 || bounds[2] > 180;
    if (this.wantWide) this.setWide(true);
    const padding = framePadding(this.controlRects(), size);
    const fit = map.cameraForBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      { padding, maxZoom: FRAME_MAX_ZOOM },
    );
    if (!fit?.center || fit.zoom === undefined || !Number.isFinite(fit.zoom)) return false;
    const c = map.getCenter();
    const middle = maplibregl.LngLat.convert(fit.center);
    // (the map may call the same place by another name, 190° or −170°: the camera is compared in the bounds' own terms)
    const now = { lng: unwrapNear(c.lng, middle.lng), lat: c.lat, zoom: map.getZoom() };
    if (isFramed(bounds, now, fit.zoom, size, padding)) {
      this.settleWide();
      return false;
    }
    const to = projectWith(now, size, middle.lng, middle.lat);
    const travel = Math.hypot(to.x - size.width / 2, to.y - size.height / 2);
    const duration = Math.round(
      Math.min(2400, Math.max(800, 700 + 420 * Math.abs(fit.zoom - now.zoom) + 0.7 * travel)),
    );
    this.pendingFrame = bounds;
    map.easeTo({ center: fit.center, zoom: fit.zoom, duration, easing: easeInOutSine });
    return true;
  }

  /**
   * The wide view on or off. On, the map shows the world twice over and may be taken past ±180°; off, it is the plain world with
   * its edges. It goes off only when the view lies inside the plain world: taking the limits away from under a camera that is
   * outside them makes the map pull its centre back with a jump.
   */
  private setWide(on: boolean) {
    if (on === this.wide || !this.ready) return;
    this.wide = on;
    this.map.setRenderWorldCopies(on);
    this.map.setMaxBounds(on ? WIDE_LIMITS : NORMAL_LIMITS);
    this.layoutOverlays(true);
  }

  /** The view is inside the plain world and no scene asks for the wide one: back to the plain world. */
  private settleWide() {
    if (!this.wide || this.wantWide) return;
    const view = this.map.getBounds();
    const inside = view.getWest() >= NORMAL_LIMITS[0][0] && view.getEast() <= NORMAL_LIMITS[1][0];
    const centred =
      Math.abs(this.map.getCenter().lng) < NORMAL_LIMITS[1][0] && this.map.getZoom() <= this.map.getMinZoom() + 0.01;
    if (inside || centred) this.setWide(false);
  }

  /** Is the map showing the world twice over, as it does for a scene across the date line? */
  isWide(): boolean {
    return this.wide;
  }

  private bringIntoView(points: PlacePoint[]) {
    if (!this.ready || !points.length) return;
    const map = this.map;
    const canvas = map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const offsets = points.map((pt) => {
      const p = this.projector.near(pt.lon, pt.lat);
      return { dx: p.x - width / 2, dy: p.y - height / 2 };
    });
    // The map's limits in map pixels: the view stays inside them, so the centre cannot be moved past them.
    const bounds = map.getMaxBounds();
    const nw = bounds && map.project(bounds.getNorthWest());
    const se = bounds && map.project(bounds.getSouthEast());
    const move = revealMove({
      offsets,
      width,
      height,
      margin: REVEAL_MARGIN,
      avoid: this.cb.avoidRects(),
      zoom: map.getZoom(),
      minZoom: map.getMinZoom(),
      limits: nw && se ? { left: nw.x, top: nw.y, right: se.x, bottom: se.y } : null,
    });
    if (!move) return;
    const levels = map.getZoom() - move.zoom;
    const travel = Math.hypot(move.pan.x, move.pan.y);
    map.easeTo({
      zoom: move.zoom,
      // no centre unless it has to move: a plain zoom-out keeps the centre exactly where it is
      ...(travel > 0 ? { center: map.unproject([width / 2 + move.pan.x, height / 2 + move.pan.y]) } : {}),
      duration: Math.min(2600, 900 + 500 * levels + 0.7 * travel),
      easing: easeInOutSine,
    });
  }

  setHoverEvent(id: string | null) {
    this.markers.setHover(id);
  }

  /** Resolves once the first frame with all sources and tiles has been drawn (or after `timeoutMs`). */
  whenDrawn(timeoutMs = 25000): Promise<void> {
    return new Promise((resolve) => {
      const done = () => resolve();
      const timer = window.setTimeout(done, timeoutMs);
      this.map.once('idle', () => {
        window.clearTimeout(timer);
        done();
      });
    });
  }

  visibleMarkerIds(): string[] {
    return this.markers.visibleIds();
  }

  /* ------------------------------------------------------ interactions */

  private pick(lon: number, lat: number) {
    return primaryAt(rowsContaining(this.rowsNow, lon, lat), this.year);
  }

  private onMapClick(lon: number, lat: number) {
    if (!isLand(this.data.landParts, lon, lat)) {
      this.cb.onWaterClick();
      return;
    }
    this.cb.onPlaceClick({ lon, lat });
  }

  private queueHover() {
    if (this.hoverQueued) return;
    this.hoverQueued = true;
    requestAnimationFrame(() => {
      this.hoverQueued = false;
      const p = this.lastPointer;
      if (!p || !this.ready) return;
      const ll = this.map.unproject([p.x, p.y]);
      const lng = wrapLon(ll.lng);
      const onLand = isLand(this.data.landParts, lng, ll.lat);
      const row = onLand ? this.pick(lng, ll.lat) : null;
      this.setHoverPolity(row?.id ?? null);
      this.map.getCanvas().style.cursor = onLand ? 'pointer' : '';
      this.cb.onHoverPolity(row?.id ?? null, p.cx, p.cy, onLand && !row);
    });
  }

  private setHoverPolity(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.applyHover();
  }
}
