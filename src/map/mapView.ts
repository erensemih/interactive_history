import maplibregl, { type ExpressionSpecification, type Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AppData } from '../data/load';
import { isLand, primaryAt, rowsContaining } from '../domain/geo';
import type { HistoricalEvent, PlacePoint } from '../domain/types';
import { PolityLabels } from './labels';
import { EventMarkers, type MarkerStats } from './markers';
import { PlacePins } from './pin';
import { EventPreview } from './preview';
import { hatchImage, readTheme, stippleImage, type MapTheme } from './theme';

export interface MapCallbacks {
  /** Markers drawn vs. map events in the range, and why the rest are not drawn. */
  onMarkerStats?(stats: MarkerStats): void;
  /** A click on land. Never moves the map. */
  onPlaceClick(point: PlacePoint): void;
  /** A click on open water or outside any land. */
  onWaterClick(): void;
  /** Polity under the pointer (for the hover tooltip), or null. */
  onHoverPolity(id: string | null, clientX: number, clientY: number): void;
  onEventClick(id: string): void;
  onEventHover(id: string | null, el: HTMLElement | null): void;
}

const INITIAL_BOUNDS: [[number, number], [number, number]] = [
  [-108, -34],
  [146, 68],
];

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
 * It has no method that moves the camera: the view changes only through the user's own drag, wheel,
 * pinch, keyboard or zoom buttons. (Double-click zoom is disabled so a click can never be mistaken
 * for a camera command.)
 */
export class MapView {
  readonly map: MLMap;
  private readonly theme: MapTheme;
  private readonly labels: PolityLabels;
  private readonly markers: EventMarkers;
  private readonly pins: PlacePins;
  private readonly preview: EventPreview;
  private year = 0;
  /** Border rows valid in the shown year: hit-testing a pointer position only looks at these. */
  private rowsNow: AppData['rows'] = [];
  private selectedIds: string[] = [];
  private hoverId: string | null = null;
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
            fitBoundsOptions: { padding: { top: 56, bottom: 16, left: 16, right: 16 }, animate: false },
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
      dragRotate: false,
      pitchWithRotate: false,
      doubleClickZoom: false,
      touchPitch: false,
      maxPitch: 0,
      fadeDuration: 0,
    });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation(); // north stays up: Shift+arrows would turn the map otherwise
    touch.addEventListener('change', (e) =>
      e.matches ? this.map.cooperativeGestures.enable() : this.map.cooperativeGestures.disable(),
    );

    const canvasContainer = this.map.getCanvasContainer();
    this.labels = new PolityLabels(this.map, canvasContainer, data);
    this.pins = new PlacePins(this.map, canvasContainer);
    this.preview = new EventPreview(this.map, canvasContainer);
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
      cb.onHoverPolity(null, 0, 0);
    });
    this.map.on('dragstart', () => {
      this.map.getCanvas().style.cursor = '';
    });
  }

  /* ------------------------------------------------------------ layers */

  private onLoad() {
    const t = this.theme;
    const map = this.map;
    map.addImage('hatch', hatchImage(t.accent), { pixelRatio: 2 });
    map.addImage('stipple', stippleImage(t.ink3), { pixelRatio: 2 });

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
      this.labels.layout(force, size);
      this.pins.layout();
      this.preview.layout();
      this.markers.layout(force, size);
    } catch (err) {
      // A bad record must not stop the map's frame loop (and with it the 'load' event).
      if (!this.layoutFailed) console.error('[harita] bindirme katmanları çizilemedi', err);
      this.layoutFailed = true;
    }
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

  /**
   * Where the selected event happened, when it is not one of the map's events (a local event picked on
   * a timeline). Drawn as a selection overlay, not as a marker: the markers stay the range's own set.
   */
  setPreviewEvent(ev: HistoricalEvent | null) {
    this.preview.set(ev);
  }

  /** The selected places, drawn as pins. */
  setPlaces(points: PlacePoint[]) {
    this.pins.setPoints(points);
  }

  setSelectedEvent(id: string | null) {
    this.markers.setSelected(id);
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
      this.cb.onHoverPolity(row?.id ?? null, p.cx, p.cy);
    });
  }

  private setHoverPolity(id: string | null) {
    if (id === this.hoverId) return;
    this.hoverId = id;
    this.applyHover();
  }
}
