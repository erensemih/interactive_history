import { MARKER_DIAMETER } from './categories';
import { markerBudget, markerPriority } from './events';
import type { HistoricalEvent } from './types';

export interface PlacementInput {
  /** The range's map events. Which events exist never depends on the selected place. */
  events: HistoricalEvent[];
  zoom: number;
  /** The displayed border year; breaks importance ties. */
  focusYear: number;
  /** An event that must be drawn whenever it is in view, budget and collisions aside. */
  selectedId: string | null;
  /** More events of the same kind (the ones the AI is talking about): drawn whenever they are in view. */
  keepIds?: ReadonlySet<string>;
  viewport: { width: number; height: number };
  /** Screen position (px, relative to the map) of an event's location. */
  project: (ev: HistoricalEvent) => { x: number; y: number };
}

export interface PlacedMarker {
  ev: HistoricalEvent;
  x: number;
  y: number;
}

export interface PlacementResult {
  /** Drawn markers, most important first. */
  placed: PlacedMarker[];
  /** Outside the viewport: panning reveals them. */
  offscreen: number;
  /** In view but left out by the zoom budget or by a collision: zooming in reveals them. */
  thinned: number;
}

/** Slack around the viewport (px) within which a marker still counts as in view. */
const VIEW_MARGIN = 20;
/** Room the year label next to a mark needs, for collisions. */
const LABEL_ROOM = 34;
/** The paper ring and ink hairline around a dot. */
const RING = 5;

/**
 * Chooses which markers are drawn. The budget is spent on what is *in view*, most important first
 * (importance is only ever used here, to thin a crowded map; it is never drawn), so zooming into a
 * region fills it up instead of spending the budget on events elsewhere on Earth.
 * Pure: the same events, camera and viewport always give the same markers.
 */
export function placeMarkers(input: PlacementInput): PlacementResult {
  const { zoom, focusYear, selectedId, keepIds, viewport, project } = input;
  const kept = (id: string) => id === selectedId || !!keepIds?.has(id);
  // The events that must be drawn go first (the opened one before the rest), so nothing else takes their place.
  const order = [...input.events].sort(
    (a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId) ||
      Number(kept(b.id)) - Number(kept(a.id)) ||
      markerPriority(a, b, focusYear),
  );

  const budget = markerBudget(zoom);
  const boxes: Array<{ x: number; y: number; w: number; h: number }> = [];
  const placed: PlacedMarker[] = [];
  let offscreen = 0;
  let thinned = 0;

  for (const ev of order) {
    const p = project(ev);
    const inView =
      Number.isFinite(p.x) &&
      Number.isFinite(p.y) &&
      p.x >= -VIEW_MARGIN &&
      p.y >= -VIEW_MARGIN &&
      p.x <= viewport.width + VIEW_MARGIN &&
      p.y <= viewport.height + VIEW_MARGIN;
    if (!inView) {
      offscreen++;
      continue;
    }
    const isSelected = kept(ev.id);
    if (!isSelected && placed.length >= budget) {
      thinned++;
      continue;
    }
    const d = MARKER_DIAMETER + RING;
    const box = { x: p.x - d / 2 - 3, y: p.y - d / 2 - 3, w: d + 6 + LABEL_ROOM, h: d + 6 };
    const clash = boxes.some(
      (o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h,
    );
    if (clash && !isSelected) {
      thinned++;
      continue;
    }
    boxes.push(box);
    placed.push({ ev, x: p.x, y: p.y });
  }
  return { placed, offscreen, thinned };
}
