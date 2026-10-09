import { html, render, type TemplateResult } from 'lit-html';
import { unsafeSVG } from 'lit-html/directives/unsafe-svg.js';
import type { AppData } from '../data/load';
import { MARKER_SIZE, styleFor } from '../domain/categories';
import type { ViewModel } from '../state/derive';
import { formatRange } from './format';
import { markerSvg } from './markerShapes';

/** What sits on top of the map canvas: the title, zoom buttons and the legend. */
export class MapChrome {
  constructor(
    private readonly host: HTMLElement,
    private readonly data: AppData,
    private readonly actions: { zoomIn(): void; zoomOut(): void },
  ) {}

  render(vm: ViewModel) {
    const place = vm.places[0] ?? null;
    const eyebrow = place ? (place.holder ? 'Seçili yer' : 'Seçili yer · devlet kaydı yok') : 'Seçili yer yok';
    render(
      html`
        <div class="map-title" data-testid="map-title" data-has-place=${place ? 'true' : 'false'}>
          <p class="eyebrow">${eyebrow}</p>
          <h1 class="title-main" data-testid="title-main">${place ? place.title : 'Dünya'}</h1>
          <p class="title-meta">
            <span><b data-testid="title-year">${vm.year}</b> yılının sınırları</span>
            <span class="sep" aria-hidden="true">·</span>
            <span>seçili aralık ${formatRange(vm.range)}</span>
          </p>
        </div>

        <div class="map-zoom" role="group" aria-label="Yakınlaştırma">
          <button type="button" class="zoom-btn" aria-label="Yakınlaştır" @click=${this.actions.zoomIn}>+</button>
          <button type="button" class="zoom-btn" aria-label="Uzaklaştır" @click=${this.actions.zoomOut}>−</button>
        </div>

        ${this.legend()}
      `,
      this.host,
    );
  }

  private legend(): TemplateResult {
    return html`<details class="legend">
      <summary>
        <span>Okuma kılavuzu</span>
        <span class="legend-strip" aria-hidden="true"
          >${this.data.categories.map((c) => unsafeSVG(markerSvg(c.id, 3, { diameter: 9 })))}</span
        >
      </summary>
      <div class="legend-body">
        <div class="legend-col">
          <p class="legend-h">Olay türü: şekil ve renk</p>
          <ul class="legend-cats">
            ${this.data.categories.map(
              (c) =>
                html`<li>
                  ${unsafeSVG(markerSvg(c.id, 3, { diameter: 11 }))}
                  <span>${c.label}</span>
                </li>`,
            )}
          </ul>
        </div>
        <div class="legend-col">
          <p class="legend-h">Boyut: önem</p>
          <ul class="legend-sizes" aria-label="İşaretçi boyutları">
            ${[3, 4, 5].map(
              (n) =>
                html`<li>
                  ${unsafeSVG(markerSvg('politics', n, { diameter: MARKER_SIZE[n] }))}
                  <span>${n === 3 ? 'önemli' : n === 4 ? 'çok önemli' : 'dönüm noktası'}</span>
                </li>`,
            )}
          </ul>
          <p class="legend-h">Zemin</p>
          <ul class="legend-ground">
            <li><i class="sw sw-polity"></i><span>Devlet (renk yalnızca komşuları ayırır)</span></li>
            <li><i class="sw sw-nodata"></i><span>Noktalı: bu dönem için sınır verisi yok</span></li>
          </ul>
        </div>
      </div>
    </details>`;
  }

  /** Category colour swatch helper for external users (legend in other places). */
  static colorOf(category: string) {
    return styleFor(category).color;
  }
}
