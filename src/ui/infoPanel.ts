import { html, nothing, render, type TemplateResult } from 'lit-html';
import { unsafeSVG } from 'lit-html/directives/unsafe-svg.js';
import type { AppData } from '../data/load';
import { IMPORTANCE_LABELS, styleFor } from '../domain/categories';
import type { Entity, HistoricalEvent, SourceRef } from '../domain/types';
import type { PlaceView, ViewModel } from '../state/derive';
import type { Store } from '../state/store';
import { clsx, formatArea, formatRange } from './format';
import { markerSvg } from './markerShapes';

/**
 * The right-hand info panel. It is a stack of cards (event on top, place below) and, below them,
 * the "elsewhere at the same time" list. Each place gets its own `placeCard`, so showing two places
 * side by side later means rendering two columns of the same cards.
 */
export class InfoPanel {
  /** Entities whose long summary the reader has unfolded. */
  private readonly unfolded = new Set<string>();

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    private readonly data: AppData,
  ) {}

  render(vm: ViewModel) {
    const ev = vm.selectedEvent;
    const place = vm.places[0] ?? null;
    render(
      html`
        ${ev ? this.eventCard(ev, vm) : nothing} ${place ? this.placeCard(place, vm, !!ev) : this.introCard()}
        ${this.elsewhereList(vm, place)}
      `,
      this.host,
    );
  }

  /* ---------------------------------------------------------------- intro */

  private introCard(): TemplateResult {
    return html`<section class="card card-intro">
      <p class="eyebrow">Aynı Zamanda</p>
      <h2 class="card-title">Aynı sırada, dünyanın başka yerlerinde ne oluyordu?</h2>
      <p class="prose">
        Cetvelden bir zaman aralığı, haritadan bir yer seçin. Harita o dönemin sınırlarını ve dünya tarihi için önemli
        olayları gösterir; seçtiğiniz yerin kendi olayları ise aşağıdaki çizelgede ayrıca belirir.
      </p>
      <ul class="intro-steps">
        <li><span class="step">1</span> Cetvelde aralığı sürükleyin veya yıl girin.</li>
        <li><span class="step">2</span> Haritada bir devletin üzerine tıklayın. Harita yerinden oynamaz.</li>
        <li><span class="step">3</span> İşaretçilere ve çizelgedeki olaylara tıklayıp ayrıntıyı buradan okuyun.</li>
      </ul>
    </section>`;
  }

  /* ---------------------------------------------------------------- place */

  private placeCard(place: PlaceView, vm: ViewModel, compact: boolean): TemplateResult {
    const holder = place.holder;
    const row = place.resolution.row;
    const regions = place.regions;
    const lead = holder ?? regions[0] ?? null;
    const parents = (row?.up ?? []).map((id) => this.data.entities.get(id)).filter((e): e is Entity => !!e);
    const sequence = place.resolution.sequence;
    const inWindowSeq = sequence.filter((s) => s.to >= vm.range.from && s.from <= vm.range.to);

    return html`<section class=${clsx('card card-place', compact && 'is-compact')} data-testid="place-card">
      <div class="card-top">
        <span class="eyebrow">Seçili yer · ${vm.year}</span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Yer seçimini kaldır"
          title="Seçimi kaldır"
          @click=${() => this.store.selectPlace(null)}
        >
          ${closeIcon()}
        </button>
      </div>
      <h2 class="card-title" data-testid="place-title">${place.title}</h2>
      ${
        parents.length
          ? html`<p class="card-sub">
              ${parents.map((p) => p.name).join(' · ')} ${parents.length > 1 ? 'üyesi' : 'üyesi'}
            </p>`
          : nothing
      }
      ${
        holder
          ? html`${
              holder.summary
                ? this.summary(holder.id, holder.summary)
                : html`<p class="prose muted">
                    Bu devlet için henüz ayrıntılı bir özet eklenmedi. Sınır verisi ve olay kayıtları yine de
                    geçerlidir.
                  </p>`
            }`
          : lead
            ? html`<p class="prose">${lead.summary ?? ''}</p>
                <p class="prose muted">
                  Bu dönemde bu noktada sınır verisinde kayıtlı bir devlet yok; bölge, devletsiz topluluklarla ya da
                  veri kapsamı dışında kalıyor olabilir.
                </p>`
            : html`<p class="prose muted">
                Bu dönemde bu noktada sınır verisinde kayıtlı bir devlet yok. Haritada noktalı gösterilen alanlar, veri
                kümesinin kapsamı dışındadır.
              </p>`
      }
      ${
        inWindowSeq.length > 1
          ? html`<div class="facts">
              <h3 class="facts-title">Bu noktanın egemenleri</h3>
              <ol class="sovereigns">
                ${inWindowSeq.map((s) => {
                  const e = this.data.entities.get(s.id);
                  return html`<li class=${clsx(s.id === holder?.id && 'is-now')}>
                    <i
                      class="sw"
                      style=${`background: ${e?.tint != null ? `var(--tint-${e.tint})` : 'var(--paper-3)'}`}
                    ></i>
                    <span class="sv-name">${e?.name ?? s.id}</span>
                    <span class="sv-years">${s.from === s.to ? s.from : `${s.from}–${s.to}`}</span>
                  </li>`;
                })}
              </ol>
            </div>`
          : nothing
      }
      ${
        row
          ? html`<dl class="facts-grid">
              <div>
                <dt>Sınır verisi dönemi</dt>
                <dd>
                  ${formatRange({ from: Math.max(row.from, this.data.extent.from), to: Math.min(row.to, this.data.extent.to) })}
                </dd>
              </div>
              <div>
                <dt>Yüzölçümü (veri kümesine göre)</dt>
                <dd>≈ ${formatArea(row.area)}</dd>
              </div>
            </dl>`
          : nothing
      }
      ${holder ? this.entityLinks(holder) : nothing}
    </section>`;
  }

  /** A long summary shows its first lines and unfolds on request, so the list below stays visible. */
  private summary(id: string, text: string): TemplateResult {
    const long = text.length > 330;
    const open = !long || this.unfolded.has(id);
    return html`<p class=${clsx('prose', long && !open && 'is-folded')}>${text}</p>
      ${
        long
          ? html`<button
              type="button"
              class="more"
              aria-expanded=${open}
              @click=${() => {
                if (open) this.unfolded.delete(id);
                else this.unfolded.add(id);
                this.store.refresh();
              }}
            >
              ${open ? 'Daha az göster' : 'Devamını oku'}
            </button>`
          : nothing
      }`;
  }

  private entityLinks(e: Entity): TemplateResult {
    const wp = e.wikipedia
      ? `https://en.wikipedia.org/wiki/${encodeURIComponent(e.wikipedia.replace(/ /g, '_'))}`
      : null;
    const wd = e.wikidata ? `https://www.wikidata.org/wiki/${e.wikidata}` : null;
    if (!wp && !wd) return html``;
    return html`<p class="links">
      <span class="links-label">Kaynak</span>
      ${wp ? html`<a href=${wp} target="_blank" rel="noopener noreferrer">Vikipedi (İngilizce)</a>` : nothing}
      ${wd ? html`<a href=${wd} target="_blank" rel="noopener noreferrer">Vikiveri ${e.wikidata}</a>` : nothing}
    </p>`;
  }

  /* ---------------------------------------------------------------- event */

  private eventCard(ev: HistoricalEvent, vm: ViewModel): TemplateResult {
    const cat = this.data.categories.find((c) => c.id === ev.category);
    const style = styleFor(ev.category);
    const parties = ev.parties.map((id) => this.data.entities.get(id)?.name ?? id);
    const span = vm.range.to - vm.range.from + 1;
    return html`<section class="card card-event" data-testid="event-card" style=${`--c: ${style.color}`}>
      <div class="card-top">
        <span class="badge">
          ${unsafeSVG(markerSvg(ev.category, ev.importance, { diameter: 13 }))}
          <span>${cat?.label ?? ev.category}</span>
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Olayı kapat"
          title="Olayı kapat"
          @click=${() => this.store.selectEvent(null)}
        >
          ${closeIcon()}
        </button>
      </div>
      <h2 class="card-title" data-testid="event-title">${ev.title}</h2>
      <p class="event-when">
        <time>${ev.dateLabel}</time>
        <span class="dot">·</span>
        <span>${ev.location.name}</span>
      </p>
      <p class="prose">${ev.summary}</p>
      <div class="importance" title=${IMPORTANCE_LABELS[ev.importance] ?? ''}>
        <span class="importance-dots" aria-hidden="true"
          >${[1, 2, 3, 4, 5].map((n) => html`<i class=${clsx(n <= ev.importance && 'on')}></i>`)}</span
        >
        <span
          >${IMPORTANCE_LABELS[ev.importance]} ·
          ${ev.importance >= 3 ? 'haritada gösterilir' : 'yalnızca çizelgede'}</span
        >
      </div>
      <div class="parties">
        <span class="parties-label">Taraflar</span>
        ${parties.map((p) => html`<span class="pill">${p}</span>`)}
      </div>
      <p class="links">
        <span class="links-label">Kaynak</span>
        ${ev.sources.map((s) => this.sourceLink(s))}
      </p>
      <div class="card-actions">
        <button type="button" class="btn" @click=${() => this.store.focusYear(ev.year, span)}>
          Haritayı ${ev.year} yılına getir
        </button>
        <button
          type="button"
          class="link only-narrow"
          @click=${() => document.querySelector('.map-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          ↑ Haritaya dön
        </button>
      </div>
    </section>`;
  }

  private sourceLink(s: SourceRef): TemplateResult {
    if (s.kind === 'wikipedia') {
      const lang = s.lang === 'en' ? 'İngilizce' : s.lang === 'tr' ? 'Türkçe' : s.lang;
      return html`<a href=${s.url} target="_blank" rel="noopener noreferrer">Vikipedi (${lang}): ${s.title}</a>`;
    }
    if (s.kind === 'wikidata')
      return html`<a href=${s.url} target="_blank" rel="noopener noreferrer">Vikiveri ${s.id}</a>`;
    return html`<a href=${s.url} target="_blank" rel="noopener noreferrer">${s.title}</a>`;
  }

  /* ------------------------------------------------------------ elsewhere */

  private elsewhereList(vm: ViewModel, place: PlaceView | null): TemplateResult {
    const list = place ? place.elsewhere : vm.mapEvents;
    const title = place ? 'Aynı sırada, başka yerlerde' : 'Bu aralıkta dünyada olanlar';
    const sorted = [...list].sort((a, b) => a.start - b.start || b.importance - a.importance);
    return html`<section class="elsewhere" aria-labelledby="elsewhere-title" data-testid="elsewhere">
      <div class="elsewhere-head">
        <h3 id="elsewhere-title" class="eyebrow">${title}</h3>
        <span class="count">${sorted.length}</span>
      </div>
      ${
        sorted.length === 0
          ? html`<p class="prose muted">
              Bu aralıkta haritada gösterilecek küresel bir olay kaydı yok. Aralığı genişletmeyi deneyin.
            </p>`
          : html`<ul class="evlist">
              ${sorted.map((e) => this.listItem(e))}
            </ul>`
      }
    </section>`;
  }

  private listItem(e: HistoricalEvent): TemplateResult {
    const selected = this.store.state.selectedEventId === e.id;
    return html`<li>
      <button
        type="button"
        class=${clsx('row', selected && 'is-selected', this.store.state.hoverEventId === e.id && 'is-hover')}
        data-id=${e.id}
        @click=${() => this.store.selectEvent(selected ? null : e.id)}
        @pointerenter=${() => this.store.hoverEvent(e.id)}
        @pointerleave=${() => this.store.hoverEvent(null)}
        @focus=${() => this.store.hoverEvent(e.id)}
        @blur=${() => this.store.hoverEvent(null)}
      >
        <span class="row-mark">${unsafeSVG(markerSvg(e.category, e.importance, { diameter: 10 }))}</span>
        <span class="row-body">
          <span class="row-title">${e.title}</span>
          <span class="row-meta">${e.dateLabel} · ${e.location.name}</span>
        </span>
      </button>
    </li>`;
  }
}

function closeIcon(): TemplateResult {
  return html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
  </svg>`;
}
