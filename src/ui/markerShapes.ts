import { MARKER_SIZE, styleFor, type MarkerShape } from '../domain/categories';

/**
 * One marker vocabulary for the whole app. The same function draws the map markers, the timeline
 * nodes, the legend entries and the panel badges, so a mark means the same thing everywhere.
 *
 * Size encodes importance, shape encodes category (colour reinforces it), a paper ring keeps the mark
 * readable over any border or tint. All coordinates live in a 24×24 box centred on (12, 12).
 */

const SHAPES: Record<MarkerShape, string> = {
  circle: '<circle cx="12" cy="12" r="8"/>',
  square: '<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="2.2"/>',
  diamond: '<path d="M12 2.4 21.6 12 12 21.6 2.4 12Z" stroke-linejoin="round"/>',
  triangle: '<path d="M12 3.2 21 19.4H3Z" stroke-linejoin="round"/>',
  hexagon: '<path d="M12 2.8 20 7.4v9.2L12 21.2 4 16.6V7.4Z" stroke-linejoin="round"/>',
  star: '<path d="m12 2.4 2.7 6.1 6.6.6-5 4.4 1.5 6.5L12 16.6 6.2 20l1.5-6.5-5-4.4 6.6-.6Z" stroke-linejoin="round"/>',
};

/** Ring width in the 24-unit box: 2 visible px at the nominal size once paint-order hides the inner half. */
const RING = 4;

export function markerInner(shape: MarkerShape, color: string): string {
  return `<g class="mk-shape" fill="${color}" stroke="var(--paper)" stroke-width="${RING}" paint-order="stroke fill">${SHAPES[shape]}</g>`;
}

/** Full <svg> markup. `diameter` is the nominal size of the shape itself in px. */
export function markerSvg(category: string, importance: number, opts: { diameter?: number } = {}): string {
  const { color, shape } = styleFor(category);
  const d = opts.diameter ?? MARKER_SIZE[importance] ?? 14;
  const box = Math.round(d * 1.5);
  return `<svg class="mk" viewBox="0 0 24 24" width="${box}" height="${box}" aria-hidden="true" focusable="false">${markerInner(shape, color)}</svg>`;
}

export function markerBox(importance: number, diameter?: number): number {
  return Math.round((diameter ?? MARKER_SIZE[importance] ?? 14) * 1.5);
}
