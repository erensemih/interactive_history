import { html, type TemplateResult } from 'lit-html';
import { segmentsOf } from './segments';

/** A paragraph's text as lit content: bold and italic marks turned into elements, everything else as text. */
export function inline(text: string): TemplateResult[] {
  return segmentsOf(text).map((s) =>
    s.bold ? html`<strong>${s.text}</strong>` : s.italic ? html`<em>${s.text}</em>` : html`${s.text}`,
  );
}
