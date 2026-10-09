import { html, type TemplateResult } from 'lit-html';
import { MARKER_DIAMETER, styleFor } from '../domain/categories';

/**
 * The one event mark of the app: a plain dot in the category's colour, with a paper ring and an ink
 * hairline so it reads on any tint. Same shape, same size everywhere (map, timeline, legend, panel).
 */
export function dotMarkup(category: string, diameter = MARKER_DIAMETER): string {
  return `<i class="dot" style="--c:${styleFor(category).color};--d:${diameter}px" aria-hidden="true"></i>`;
}

export function dot(category: string, diameter = MARKER_DIAMETER): TemplateResult {
  return html`<i class="dot" style=${`--c:${styleFor(category).color};--d:${diameter}px`} aria-hidden="true"></i>`;
}
