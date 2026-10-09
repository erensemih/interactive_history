/**
 * Visual identity of event categories. The category *ids and labels* live in the data
 * (public/data/categories.json); only how they look lives here, with a fallback so adding a new
 * category to the data never breaks the UI.
 *
 * Colours were validated with the dataviz palette checker for the worst case, any two markers
 * side by side (all-pairs, light surface #f4efe4): normal-vision ΔE ≥ 19.3, protan/deutan ΔE ≥ 10.0,
 * contrast ≥ 3:1. Shape is the secondary channel, so colour is never the only cue.
 */

export type MarkerShape = 'diamond' | 'square' | 'triangle' | 'circle' | 'star' | 'hexagon';

export interface CategoryStyle {
  color: string;
  shape: MarkerShape;
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  military: { color: '#842a64', shape: 'diamond' },
  politics: { color: '#1f4aa9', shape: 'square' },
  exploration: { color: '#089487', shape: 'triangle' },
  religion: { color: '#4a5b01', shape: 'circle' },
  culture: { color: '#9575e2', shape: 'star' },
  disaster: { color: '#c2783a', shape: 'hexagon' },
};

export const FALLBACK_STYLE: CategoryStyle = { color: '#5b5346', shape: 'circle' };

export function styleFor(category: string): CategoryStyle {
  // own keys only: a category named "constructor" or "__proto__" must not reach Object.prototype
  return Object.hasOwn(CATEGORY_STYLES, category) ? CATEGORY_STYLES[category]! : FALLBACK_STYLE;
}

/** Marker diameter in px per importance level (3–5 on the map; 1–5 on timelines). */
export const MARKER_SIZE: Record<number, number> = { 1: 10, 2: 12, 3: 14, 4: 19, 5: 25 };

export const IMPORTANCE_LABELS: Record<number, string> = {
  1: 'Yerel ayrıntı',
  2: 'Yerel önem',
  3: 'Önemli',
  4: 'Çok önemli',
  5: 'Dönüm noktası',
};
