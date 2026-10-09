/**
 * Visual identity of event categories. The category *ids and labels* live in the data
 * (public/data/categories.json); only how they look lives here, with a fallback so adding a new
 * category to the data never breaks the UI.
 *
 * Categories are told apart by colour alone: every marker is the same dot, the same size. Nothing
 * draws "importance" (that stays an internal way to thin a crowded map). With no second channel the
 * colours carry the whole load, so they were chosen and checked for it (dataviz palette validator,
 * all pairs, light surface #f5f0e4): no blue (blue is for water), nothing near the vermilion that
 * means "your selection", normal-vision ΔE ≥ 15.0, protan/deutan ΔE ≥ 7.7. The legend, the tooltip
 * and the event card all spell the category out in words, which is what makes that margin enough.
 */

export interface CategoryStyle {
  color: string;
}

export const CATEGORY_STYLES: Record<string, CategoryStyle> = {
  military: { color: '#8a3a13' }, // rust
  politics: { color: '#aa4ea2' }, // plum
  exploration: { color: '#008622' }, // green
  religion: { color: '#a3940f' }, // olive gold
  culture: { color: '#fe66a8' }, // pink
  disaster: { color: '#f29b5e' }, // orange
};

export const FALLBACK_STYLE: CategoryStyle = { color: '#6b6254' };

export function styleFor(category: string): CategoryStyle {
  // own keys only: a category named "constructor" or "__proto__" must not reach Object.prototype
  return Object.hasOwn(CATEGORY_STYLES, category) ? CATEGORY_STYLES[category]! : FALLBACK_STYLE;
}

/** Diameter in px of every event dot, on the map and on the timeline alike. */
export const MARKER_DIAMETER = 13;
