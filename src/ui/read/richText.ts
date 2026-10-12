import { html, type TemplateResult } from 'lit-html';
import { segmentsOf } from './segments';

/**
 * A paragraph's text as lit content: bold and italic marks turned into elements, a reference to an event
 * (`[text](olay:id)`) into a button the page listens to (`data-event`; `known` tells which ids are real events: an
 * unknown one stays plain text), everything else as text.
 */
export function inline(text: string, known?: (id: string) => boolean): TemplateResult[] {
  return segmentsOf(text).map((s) =>
    s.event !== undefined && (!known || known(s.event))
      ? html`<button type="button" class="evt-ref" data-event=${s.event}>${s.text}</button>`
      : s.bold
        ? html`<strong>${s.text}</strong>`
        : s.italic
          ? html`<em>${s.text}</em>`
          : html`${s.text}`,
  );
}

/** The id of the event a click landed on, when it landed on a reference (for one listener over a whole text). */
export function eventRefOf(target: EventTarget | null): string | null {
  const el = target instanceof Element ? target.closest<HTMLElement>('button.evt-ref') : null;
  return el?.dataset.event ?? null;
}
