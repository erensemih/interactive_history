import { html, nothing, render } from 'lit-html';
import type { AppData } from '../data/load';
import type { ViewModel } from '../state/derive';
import { dot } from './dot';

/**
 * The strip above the map: the selected place's name and which year's borders are drawn. It sits
 * outside the map, so it never covers a border or a marker, and its height is fixed so a longer name
 * can never resize the map (a resized map would look as if it had moved).
 */
export class MapHead {
  constructor(private readonly host: HTMLElement) {}

  render(vm: ViewModel) {
    const place = vm.places[0] ?? null;
    render(
      html`
        <h1 class="title-main" data-testid="title-main" data-has-place=${place ? 'true' : 'false'}>
          ${place ? html`<i class="title-pin" aria-hidden="true"></i>` : nothing}<span class="title-text"
            >${place ? place.title : 'Dünya'}</span
          >
        </h1>
        <p class="title-meta"><b data-testid="title-year">${vm.year}</b> yılının sınırları</p>
      `,
      this.host,
    );
  }
}

/** What floats over the map canvas: the zoom buttons and the colour legend. */
export class MapChrome {
  constructor(
    private readonly host: HTMLElement,
    private readonly data: AppData,
    private readonly actions: { zoomIn(): void; zoomOut(): void },
  ) {
    render(
      html`
        <div class="map-zoom" role="group" aria-label="Yakınlaştırma">
          <button type="button" class="zoom-btn" aria-label="Yakınlaştır" @click=${this.actions.zoomIn}>+</button>
          <button type="button" class="zoom-btn" aria-label="Uzaklaştır" @click=${this.actions.zoomOut}>−</button>
        </div>
        ${this.legend()}
      `,
      this.host,
    );
  }

  /** Untitled, and only about colour: which kind of event each dot colour is. (Nothing here is ranked.) */
  private legend() {
    return html`<ul class="legend" aria-label="Olay renkleri" data-testid="legend">
      ${this.data.categories.map((c) => html`<li data-category=${c.id}>${dot(c.id)}<span>${c.label}</span></li>`)}
    </ul>`;
  }
}
