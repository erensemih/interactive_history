import { html, nothing, render, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import type { AppData } from '../data/load';
import { styleFor } from '../domain/categories';
import type { Entity, HistoricalEvent, SourceRef } from '../domain/types';
import { selectionsOf, type PlaceView, type SelectionRef, type ViewModel } from '../state/derive';
import { panelLayout } from '../state/panelLayout';
import type { Store } from '../state/store';
import type { ChatView } from './chat/chatView';
import { dot } from './dot';
import { clsx, formatArea, formatRange } from './format';
import { scrollBehavior } from './motion';

/** A card is either read in full or folded into a one-line header. */
type Variant = 'full' | 'compact';

/** What the panel needs of the reading companion: its view, and the three things a card can start. */
export interface PanelAi {
  chat: ChatView;
  /** "Bu yerin tarihini anlat": opens the chat and starts a narration. */
  narrate(): void;
  /** Opens the chat to ask something. */
  openChat(): void;
  /** "Bunu sohbette sor": sends the event into the conversation. */
  askAboutEvent(ev: HistoricalEvent): void;
  /** One question at a time: while an answer is being written, asking about an event waits. */
  busy(): boolean;
}

const SPARK = html`<svg class="spark" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
  <path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5z" fill="currentColor" />
</svg>`;

/**
 * The right-hand info panel. What it shows is decided by `panelLayout` from a list of selection
 * references (type + id); each reference becomes a card through `card()`, in one of two sizes. The
 * selected place is the context and an opened event the focus: with only a place selected the panel
 * describes the place; with an event open it describes the event and the place folds into a header
 * above it. Nothing here is written for "one place plus one event": a comparison mode would pass two
 * references and lay the focus cards out in two columns.
 *
 * Below the cards sits the "elsewhere at the same time" list.
 *
 * With the chat open the panel is the conversation instead: the place (or "Dünya") is its one-line
 * header, and an opened event is a sheet over it, so closing the event returns to the same chat.
 */
export class InfoPanel {
  /** Entities whose long summary the reader has unfolded. */
  private readonly unfolded = new Set<string>();

  /** Was the chat on screen at the last render? (It is put back, not rebuilt: see ChatView.attached.) */
  private chatShown = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly store: Store,
    private readonly data: AppData,
    private readonly ai: PanelAi,
  ) {}

  render(vm: ViewModel) {
    const { places, event } = selectionsOf(vm);
    const layout = panelLayout(places, event, this.store.state.chatOpen);
    this.host.classList.toggle('is-chat', layout.chat);
    if (layout.chat) {
      this.renderChat(vm, layout.sheet);
      return;
    }
    this.chatShown = false;
    render(
      html`
        ${
          layout.context.length
            ? html`<div class="panel-context" data-testid="panel-context">
                ${layout.context.map((ref) => this.card(ref, vm, 'compact'))}
              </div>`
            : nothing
        }
        ${
          layout.focus.length
            ? html`<div
                class="panel-focus"
                data-testid="panel-focus"
                style=${styleMap({ '--cols': String(layout.focus.length) })}
              >
                ${layout.focus.map((ref) => this.card(ref, vm, 'full'))}
              </div>`
            : this.introCard()
        }
        ${this.elsewhereList(vm)}
      `,
      this.host,
    );
  }

  /* ----------------------------------------------------------------- chat */

  private renderChat(vm: ViewModel, sheet: SelectionRef | null) {
    const ev = sheet ? this.data.eventsById.get(sheet.id) : null;
    this.ai.chat.setSheet(ev ? this.eventCard(ev, vm) : null);
    const entering = !this.chatShown;
    this.chatShown = true;
    render(
      html`<div class="panel-context panel-context-chat" data-testid="panel-context">${this.chatSubject(vm, !!ev)}</div>
        ${this.ai.chat.element}`,
      this.host,
    );
    if (entering) {
      // On a touch screen focusing the question box would pop the keyboard up over the conversation.
      this.ai.chat.attached(!window.matchMedia('(pointer: coarse)').matches);
      // One column: bring the conversation up under the map, which stays in sight above it.
      if (window.matchMedia('(max-width: 900px)').matches) {
        requestAnimationFrame(() =>
          this.host.closest('aside')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }),
        );
      }
    }
  }

  /**
   * What the conversation is about, in the one-line form the place takes whenever it is context: its name and
   * the range. It is also the way back: out of the event sheet into the chat, out of the chat into the place card.
   */
  private chatSubject(vm: ViewModel, sheetOpen: boolean): TemplateResult {
    const place = vm.places[0];
    const label = place?.title ?? 'Dünya';
    return html`<button
      type="button"
      class="line line-place"
      data-testid="place-line"
      title=${sheetOpen ? 'Sohbete dön' : 'Bilgi paneline dön'}
      aria-label=${`${sheetOpen ? 'Sohbete dön' : 'Bilgi paneline dön'}: ${label}, ${formatRange(vm.range)}`}
      @click=${() => (sheetOpen ? this.store.selectEvent(null) : this.store.setChat(false))}
    >
      <span class="line-back" aria-hidden="true">‹</span>
      <span class="line-name">${label}</span>
      <span class="line-range">${formatRange(vm.range)}</span>
    </button>`;
  }

  /** One card for one selection reference. Unknown references (a place that was cleared meanwhile) draw nothing. */
  private card(ref: SelectionRef, vm: ViewModel, variant: Variant): TemplateResult | typeof nothing {
    if (ref.type === 'place') {
      const place = vm.places.find((p) => p.id === ref.id);
      if (!place) return nothing;
      return variant === 'full' ? this.placeCard(place, vm) : this.placeLine(place, vm);
    }
    const ev = this.data.eventsById.get(ref.id);
    if (!ev) return nothing;
    return variant === 'full' ? this.eventCard(ev, vm) : this.eventLine(ev);
  }

  /** Closing a card removes the button that had focus; keep keyboard users in the panel instead of dropping them on <body>. */
  private close(action: () => void) {
    const hadFocus = this.host.contains(document.activeElement);
    action();
    if (hadFocus) this.host.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- intro */

  private introCard(): TemplateResult {
    return html`<section class="card card-intro">
      <p class="eyebrow">Aynı Zamanda</p>
      <h2 class="card-title">Aynı sırada, dünyanın başka yerlerinde ne oluyordu?</h2>
      <p class="prose">
        Alttaki cetvelden bir zaman aralığı, haritadan bir yer seçin. Harita o dönemin sınırlarını ve dünyanın dört bir
        yanından bir olay seçkisini gösterir; seçtiğiniz yerin kendi olayları ise aşağıdaki çizelgede ayrıca belirir.
      </p>
      <ul class="intro-steps">
        <li><span class="step">1</span> Cetvelde aralığı sürükleyin; kenarlarından uzunluğunu ayarlayın.</li>
        <li><span class="step">2</span> Haritada bir devletin üzerine tıklayın. Harita yerinden oynamaz.</li>
        <li><span class="step">3</span> İşaretçilere ve çizelgedeki noktalara tıklayıp ayrıntıyı buradan okuyun.</li>
        <li>
          <span class="step">4</span> Bir yer seçtikten sonra sohbette tarihini dinleyin; harita anlatılanı çizer.
        </li>
      </ul>
      <div class="card-actions">
        <button type="button" class="btn" data-testid="intro-chat" @click=${() => this.ai.openChat()}>
          ${SPARK} Sohbeti aç
        </button>
      </div>
    </section>`;
  }

  /* ---------------------------------------------------------------- place */

  /** The place folded into one line: its name and the selected time range. Clicking it returns to the place's own card. */
  private placeLine(place: PlaceView, vm: ViewModel): TemplateResult {
    return html`<button
      type="button"
      class="line line-place"
      data-testid="place-line"
      title="Yerin ayrıntısına dön"
      aria-label=${`Yerin ayrıntısına dön: ${place.title}, ${formatRange(vm.range)}`}
      @click=${() => this.store.selectEvent(null)}
    >
      <span class="line-back" aria-hidden="true">‹</span>
      <span class="line-name">${place.title}</span>
      <span class="line-range">${formatRange(vm.range)}</span>
    </button>`;
  }

  private placeCard(place: PlaceView, vm: ViewModel): TemplateResult {
    const holder = place.holder;
    const row = place.resolution.row;
    const regions = place.regions;
    const lead = holder ?? regions[0] ?? null;
    const parents = (row?.up ?? []).map((id) => this.data.entities.get(id)).filter((e): e is Entity => !!e);
    const sequence = place.resolution.sequence;
    const inWindowSeq = sequence.filter((s) => s.to >= vm.range.from && s.from <= vm.range.to);

    return html`<section class="card card-place" data-testid="place-card">
      <div class="card-top">
        <span class="eyebrow">Seçili yer · ${vm.year}</span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Yer seçimini kaldır"
          title="Seçimi kaldır"
          @click=${() => this.close(() => this.store.selectPlace(null))}
        >
          ${closeIcon()}
        </button>
      </div>
      <h2 class="card-title" data-testid="place-title">${place.title}</h2>
      ${parents.length ? html`<p class="card-sub">${parents.map((p) => p.name).join(' · ')} üyesi</p>` : nothing}
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
      <div class="card-actions chat-cta">
        <button type="button" class="btn btn-solid" data-testid="place-narrate" @click=${() => this.ai.narrate()}>
          ${SPARK} Bu yerin tarihini anlat
        </button>
        <button type="button" class="link" data-testid="place-ask" @click=${() => this.ai.openChat()}>Soru sor</button>
      </div>
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
    const wd = e.wikidata && /^Q\d+$/.test(e.wikidata) ? `https://www.wikidata.org/wiki/${e.wikidata}` : null;
    if (!wp && !wd) return html``;
    return html`<p class="links">
      <span class="links-label">Kaynak</span>
      ${wp ? html`<a href=${wp} target="_blank" rel="noopener noreferrer">Vikipedi (İngilizce)</a>` : nothing}
      ${wd ? html`<a href=${wd} target="_blank" rel="noopener noreferrer">Vikiveri ${e.wikidata}</a>` : nothing}
    </p>`;
  }

  /* ---------------------------------------------------------------- event */

  /** The event folded into one line (for the day a place is the focus and an event the context). */
  private eventLine(ev: HistoricalEvent): TemplateResult {
    return html`<button
      type="button"
      class="line line-event"
      data-testid="event-line"
      title="Olayın ayrıntısına dön"
      aria-label=${`Olayın ayrıntısına dön: ${ev.title}, ${ev.dateLabel}`}
      @click=${() => this.store.selectEvent(ev.id)}
    >
      <span class="line-back" aria-hidden="true">‹</span>
      ${dot(ev.category)}
      <span class="line-name">${ev.title}</span>
      <span class="line-range">${ev.dateLabel}</span>
    </button>`;
  }

  private eventCard(ev: HistoricalEvent, vm: ViewModel): TemplateResult {
    const cat = this.data.categories.find((c) => c.id === ev.category);
    const style = styleFor(ev.category);
    const parties = ev.parties.map((id) => this.data.entities.get(id)?.name ?? id);
    const span = vm.range.to - vm.range.from + 1;
    return html`<section class="card card-event" data-testid="event-card" style=${`--c: ${style.color}`}>
      <div class="card-top">
        <span class="badge">
          ${dot(ev.category)}
          <span>${cat?.label ?? ev.category}</span>
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Olayı kapat"
          title="Olayı kapat"
          @click=${() => this.close(() => this.store.selectEvent(null))}
        >
          ${closeIcon()}
        </button>
      </div>
      <h2 class="card-title" data-testid="event-title" tabindex="-1">${ev.title}</h2>
      <p class="event-when">
        <span data-testid="event-date">${ev.dateLabel}</span>
        <span class="sep">·</span>
        <span>${ev.location.name}</span>
      </p>
      <p class="prose">${ev.summary}</p>
      <div class="parties">
        <span class="parties-label">Taraflar</span>
        ${parties.map((p) => html`<span class="pill">${p}</span>`)}
      </div>
      <p class="links">
        <span class="links-label">Kaynak</span>
        ${ev.sources.map((s) => this.sourceLink(s))}
      </p>
      <div class="card-actions">
        <button
          type="button"
          class="btn btn-solid"
          data-testid="event-ask"
          ?disabled=${this.ai.busy()}
          title=${this.ai.busy() ? 'Bir yanıt yazılırken yeni soru sorulamaz' : 'Bu olayı sohbete gönder'}
          @click=${() => this.ai.askAboutEvent(ev)}
        >
          ${SPARK} Bunu sohbette sor
        </button>
        <button type="button" class="btn" @click=${() => this.store.focusYear(ev.year, span)}>
          Haritayı ${ev.year} yılına getir
        </button>
        <button
          type="button"
          class="link only-narrow"
          @click=${() => document.querySelector('.map-col')?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })}
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

  private elsewhereList(vm: ViewModel): TemplateResult {
    const list = vm.elsewhere;
    const title = vm.places.length ? 'Aynı sırada, başka yerlerde' : 'Bu aralıkta dünyada olanlar';
    const sorted = [...list].sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1));
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
        aria-pressed=${selected}
        @click=${() => this.store.selectEvent(selected ? null : e.id)}
        @pointerenter=${() => this.store.hoverEvent(e.id)}
        @pointerleave=${() => this.store.hoverEvent(null)}
        @focus=${() => this.store.hoverEvent(e.id)}
        @blur=${() => this.store.hoverEvent(null)}
      >
        <span class="row-mark">${dot(e.category)}</span>
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
