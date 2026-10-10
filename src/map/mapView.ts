import maplibregl, { type ExpressionSpecification, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AppData } from '../data/load';
import { EMPTY_RESOLVED, type FrameTarget, type ResolvedDrawing } from '../ai/types';
import { frameBounds, framePadding, isFramed, projectWith } from '../domain/camera';
import { isLand, primaryAt, rowsContaining } from '../domain/geo';
import { unionBoundsAll, zoomOutToRevealAll, type Rect } from '../domain/reveal';
import type { HistoricalEvent, PlacePoint } from '../domain/types';
import { AiDrawingLayer } from './aiLayer';
import { PolityLabels } from './labels';
import { EventMarkers, type MarkerStats } from './markers';
import { PlacePins } from './pin';
import { hatchImage, inkHatchImage, readTheme, stippleImage, type MapTheme } from './theme';

export interface MapCallbacks {
  /** Markers drawn vs. map events in the range, and why the rest are not drawn. */
  onMarkerStats?(stats: MarkerStats): void;
  /** A click on land. Never moves the map. */
  onPlaceClick(point: PlacePoint): void;
  /** A click on open water or outside any land. */
  onWaterClick(): void;
  /** Polity under the pointer (for the hover tooltip), or null; `noData` is true on land the border data does not cover. */
  onHoverPolity(id: string | null, clientX: number, clientY: number, noData: boolean): void;
  onEventClick(id: string): void;
  onEventHover(id: string | null, el: HTMLElement | null): void;
  /** Map controls (zoom buttons, legend, counter) in map pixels: a revealed event must not hide behind them. */
  avoidRects(): Rect[];
}

/** Room kept clear around a revealed event: its dot, the year on its right and its name above it. */
const REVEAL_MARGIN = { top: 44, right: 60, bottom: 36, left: 36 };

/** How close the camera goes to a step's drawing: a lone mark is shown with its surroundings, not at street level. */
const FRAME_MAX_ZOOM = 5.2;

const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [-108, -34],
  [146, 68],
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
  private year = 0;
  /** Border rows valid in the shown year: hit-testing a pointer position only looks at these. */
  private rowsNow: AppData['rows'] = [];
  private selectedIds: string[] = [];
  /** Polities the AI has highlighted. */
  private aiIds: string[] = [];
  private hoverId: string | null = null;
  /** The chat is open: the AI narrates, and the event markers other than the ones it or the reader brings are off the map. */
  private narrator = false;
  private toldIds: string[] = [];
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
      // Strictly inside ±180°: MapLibre 5.24 throws on a full-world maxBounds.
      maxBounds: [
        [-179.9, -60],
        [179.9, 82],
      ],
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
    this.labels = new PolityLabels(this.map, canvasContainer, data);
    // Above the polity labels, below the pin and the event markers (the DOM order decides at equal z-index).
    this.ai = new AiDrawingLayer(this.map, canvasContainer);
    this.pins = new PlacePins(this.map, canvasContainer);
    this.markers = new EventMarkers(this.map, canvasContainer, {
      onClick: (id) => cb.onEventClick(id),
      onHover: (id, el) => cb.onEventHover(id, el),
      onStats: (stats) => cb.onMarkerStats?.(stats),
    });

    this.map.on('load', () => this.onLoad());
    // Layout runs inside the render event so DOM overlays move in the very frame the canvas does.
    this.map.on('render', () => this.layoutOverlays());
    this.map.on('click', (e) => this.onMapClick(e.lngLat.lng, e.lngLat.lat));
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
    map.addImage('stipple', stippleImage(t.ink3), { pixelRatio: 2 });
    map.addImage('ink-hatch', inkHatchImage(t.ink), { pixelRatio: 2 });

    map.addSource('land', { type: 'geojson', data: this.data.land, tolerance: 0.2, buffer: 16, maxzoom: 9 });
    map.addSource('borders', {
      type: 'geojson',
      data: this.data.borders,
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

    // Shallow-water glow: only the sea side shows, because land is painted over its inland half.
    map.addLayer({
      id: 'coast-glow',
      type: 'line',
      source: 'land',
      paint: {
        'line-color': t.seaDeep,
        'line-width': zoomWidth(3, 9, 16),
        'line-blur': zoomWidth(2, 6, 10),
        'line-opacity': 0.55,
      },
    });
    map.addLayer({ id: 'land-base', type: 'fill', source: 'land', paint: { 'fill-color': t.nodata } });
    map.addLayer({ id: 'land-nodata', type: 'fill', source: 'land', paint: { 'fill-pattern': 'stipple' } });
    map.addLayer({
      id: 'polity-fill',
      type: 'fill',
      source: 'borders',
      filter: yearFilter(this.year),
      paint: { 'fill-color': tintExpr },
    });
    map.addLayer({
      id: 'polity-line',
      type: 'line',
      source: 'borders',
      filter: yearFilter(this.year),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.borderInk, 'line-width': zoomWidth(0.35, 0.9, 1.6), 'line-opacity': 0.55 },
    });
    map.addLayer({
      id: 'polity-hover',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.year, this.hoverIds()),
      paint: { 'fill-color': t.accent, 'fill-opacity': 0.13 },
    });
    map.addLayer({
      id: 'polity-selected-fill',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.year, this.selectedIds),
      paint: { 'fill-color': t.accent, 'fill-opacity': 0.2 },
    });
    map.addLayer({
      id: 'polity-selected-hatch',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.year, this.selectedIds),
      paint: { 'fill-pattern': 'hatch' },
    });
    map.addLayer({
      id: 'polity-selected-glow',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.year, this.selectedIds),
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
      filter: idsFilter(this.year, this.selectedIds),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.accent, 'line-width': zoomWidth(1.4, 2.4, 3), 'line-opacity': 0.95 },
    });
    // The AI's highlight: a light ink wash, fine ink hatching and a pen outline on a paper rim.
    map.addLayer({
      id: 'ai-fill',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.year, this.aiIds),
      paint: { 'fill-color': t.ink, 'fill-opacity': 0.07 },
    });
    map.addLayer({
      id: 'ai-hatch',
      type: 'fill',
      source: 'borders',
      filter: idsFilter(this.year, this.aiIds),
      paint: { 'fill-pattern': 'ink-hatch' },
    });
    map.addLayer({
      id: 'ai-casing',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.year, this.aiIds),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.paper, 'line-width': zoomWidth(3.8, 5.6, 7.6), 'line-opacity': 0.92 },
    });
    map.addLayer({
      id: 'ai-line',
      type: 'line',
      source: 'borders',
      filter: idsFilter(this.year, this.aiIds),
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.ink, 'line-width': zoomWidth(1.3, 2, 2.8), 'line-opacity': 0.95 },
    });
    map.addLayer({
      id: 'coast',
      type: 'line',
      source: 'land',
      layout: { 'line-join': 'round' },
      paint: { 'line-color': t.coast, 'line-width': zoomWidth(0.5, 0.9, 1.5), 'line-opacity': 0.85 },
    });

    this.ready = true;
    this.applyYear();
    this.layoutOverlays(true);
  }

  private applyYear() {
    if (!this.ready) return;
    const m = this.map;
    m.setFilter('polity-fill', yearFilter(this.year));
    m.setFilter('polity-line', yearFilter(this.year));
    this.applySelection();
    this.applyHover();
    this.applyAi();
  }

  private applyAi() {
    if (!this.ready) return;
    for (const id of ['ai-fill', 'ai-hatch', 'ai-casing', 'ai-line']) {
      this.map.setFilter(id, idsFilter(this.year, this.aiIds));
    }
  }

  private applySelection() {
    if (!this.ready) return;
    for (const id of [
      'polity-selected-fill',
      'polity-selected-hatch',
      'polity-selected-glow',
      'polity-selected-line',
    ]) {
      this.map.setFilter(id, idsFilter(this.year, this.selectedIds));
    }
  }

  private applyHover() {
    if (!this.ready) return;
    this.map.setFilter('polity-hover', idsFilter(this.year, this.hoverIds()));
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

  /* --------------------------------------------------------- public API */

  /** The year whose borders are drawn. */
  setYear(year: number) {
    if (year === this.year && this.ready) return;
    this.year = year;
    this.rowsNow = this.data.rows.filter((r) => r.from <= year && year <= r.to);
    this.labels.setYear(year);
    this.markers.setFocusYear(year);
    this.applyYear();
  }

  /** The polities to highlight (those holding the selected places). */
  setSelectedPolities(ids: string[]) {
    if (ids.length === this.selectedIds.length && ids.every((id, i) => id === this.selectedIds[i])) return;
    this.selectedIds = ids;
    this.labels.setSelected(ids);
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
    this.ai.setSelectedEvent(this.selectedEventId);
    this.layoutOverlays(); // names and labels keep clear of the marker that has just come or gone, with no map frame to wait for
  }

  /**
   * The chat is open (the AI narrates) or closed. Open, the event markers leave the map: only the opened
   * event and the ones the AI talks about stay or come. Closed, everything is as it always was.
   */
  setNarrator(on: boolean) {
    if (on === this.narrator) return;
    this.narrator = on;
    this.syncNarrator();
    this.layoutOverlays();
  }

  private syncNarrator() {
    const told = this.toldIds.flatMap((id) => {
      const ev = this.data.eventsById.get(id);
      return ev ? [ev] : [];
    });
    this.markers.setNarrator(this.narrator, told);
    this.labels.setAvoid(this.narratorRoom());
  }

  /** What the polity names keep clear of while the AI narrates: the few markers on the map and the place dot. */
  private narratorRoom(): Rect[] {
    return this.narrator ? [...this.markers.rects(), ...this.pins.rects()] : [];
  }

  /**
   * The AI's drawing for the year shown (the polygons are map layers, lines and marks are an overlay).
   * Replacing it never touches the camera.
   */
  setAiDrawing(drawing: ResolvedDrawing | null, description = '') {
    const d = drawing ?? EMPTY_RESOLVED;
    const same = d.highlightIds.length === this.aiIds.length && d.highlightIds.every((id, i) => id === this.aiIds[i]);
    if (!same) {
      this.aiIds = d.highlightIds;
      this.labels.setEmphasis(this.aiIds);
      this.applyAi();
    }
    this.ai.setDrawing(d, description);
    const told = d.events.map((e) => e.id);
    if (told.length !== this.toldIds.length || told.some((id, i) => id !== this.toldIds[i])) {
      this.toldIds = told;
      this.syncNarrator();
    }
    this.layoutOverlays(); // the new labels are placed around what is on the map now, with no map frame to wait for
  }

  /**
   * Brings an event into view if it is out of sight, changing the camera as little as possible: the map
   * zooms out about its current centre just far enough (nothing pans, and the view the user was in stays
   * inside the new one), eased so the user can follow where it went. If even the widest view cannot show
   * it, the map falls back to the smallest view that holds the old view and the event. Does nothing when
   * the event is already visible, so clicking a marker never moves the map.
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
    const now = { lng: c.lng, lat: c.lat, zoom: map.getZoom() };
    if (isFramed(bounds, now, fit.zoom, size, padding)) return false;
    const centre = maplibregl.LngLat.convert(fit.center);
    const to = projectWith(now, size, centre.lng, centre.lat);
    const travel = Math.hypot(to.x - size.width / 2, to.y - size.height / 2);
    const duration = Math.round(
      Math.min(2400, Math.max(800, 700 + 420 * Math.abs(fit.zoom - now.zoom) + 0.7 * travel)),
    );
    map.easeTo({ center: fit.center, zoom: fit.zoom, duration, easing: easeInOutSine });
    return true;
  }

  private bringIntoView(points: PlacePoint[]) {
    if (!this.ready || !points.length) return;
    const map = this.map;
    const canvas = map.getCanvas();
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const offsets = points.map((pt) => {
      const p = map.project([pt.lon, pt.lat]);
      return { dx: p.x - width / 2, dy: p.y - height / 2 };
    });
    const levels = zoomOutToRevealAll({
      offsets,
      width,
      height,
      margin: REVEAL_MARGIN,
      avoid: this.cb.avoidRects(),
    });
    if (levels === 0) return;
    const zoom = map.getZoom() - levels - 0.05;
    if (Number.isFinite(levels) && zoom >= map.getMinZoom()) {
      map.easeTo({ zoom, duration: Math.min(2600, 900 + 500 * levels), easing: easeInOutSine });
      return;
    }
    const b = map.getBounds();
    const [w, s, e, n] = unionBoundsAll([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], points);
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      {
        padding: {
          top: REVEAL_MARGIN.top + 16,
          right: REVEAL_MARGIN.right + 16,
          bottom: REVEAL_MARGIN.bottom + 16,
          left: REVEAL_MARGIN.left + 16,
        },
        duration: 1800,
        easing: easeInOutSine,
      },
    );
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
      const onLand = isLand(this.data.landParts, ll.lng, ll.lat);
      const row = onLand ? this.pick(ll.lng, ll.lat) : null;
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
