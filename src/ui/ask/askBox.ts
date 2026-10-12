import { html, nothing, render, type TemplateResult } from 'lit-html';
import type { AiContext } from '../../ai/context';
import type { Director } from '../../ai/director';
import { errorCopy } from '../../ai/errorCopy';
import type { Presentation } from '../../ai/presentation';
import { TIER_LABEL, type ModelTier } from '../../ai/provider';
import type { AiSession } from '../../ai/session';
import type { AppData } from '../../data/load';
import { dot } from '../dot';
import { clsx } from '../format';

export interface AskActions {
  send(text: string): void;
  narrate(): void;
  stop(): void;
  newChat(): void;
  setFollowing(on: boolean): void;
  setTier(tier: ModelTier): void;
  openPermissions(): void;
  /** The cross on the open-event chip: close the event card. */
  dropEvent(): void;
  /** The button beside the box: the conversation, as full text. */
  toggleRead(): void;
}

export interface AskDeps {
  session: AiSession;
  director: Director;
  presentation: Presentation;
  data: Pick<AppData, 'categories' | 'eventsById'>;
  actions: AskActions;
  /** What the reader is looking at right now (place, range, open event). */
  context(): AiContext;
}

const TIER_HINT: Record<ModelTier, string> = {
  quick: 'En çabuk; kısa ve sade',
  default: 'Günlük kullanım için',
  complex: 'En ayrıntılı; en yavaş',
};

const ICON = {
  send: html`<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path
      d="M8 13V3.5M3.8 7.2L8 3l4.2 4.2"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  stop: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="3.5" y="3.5" width="9" height="9" rx="1.6" fill="currentColor" />
  </svg>`,
  gear: html`<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      d="M3 4.5h6.2M12.2 4.5H13M3 11.5h1M7.2 11.5H13"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      fill="none"
    />
    <circle cx="10.7" cy="4.5" r="1.7" fill="none" stroke="currentColor" stroke-width="1.5" />
    <circle cx="5.5" cy="11.5" r="1.7" fill="none" stroke="currentColor" stroke-width="1.5" />
  </svg>`,
  close: html`<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
    <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none" />
  </svg>`,
  /** The conversation as text: a few lines on a page. */
  lines: html`<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3 4h10M3 7.3h10M3 10.6h6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
  </svg>`,
  spark: html`<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5z" fill="currentColor" />
  </svg>`,
};

/**
 * The question box: always there, just above the timeline. It owns the draft, the event chip ("the open event is
 * added to the question"), the settings (speed of the answers, "Harita takibi", clearing the conversation) and
 * the notes about where the answers come from. It does not know how an answer is shown: that is the caption
 * over the map (Watch) and the reader (Read).
 */
export class AskBox {
  readonly element: HTMLElement;
  private queued = false;
  private menuOpen = false;
  /** The question over the map sent the reader to the setting: "Harita takibi" is marked for a moment. */
  private pointFollow = false;
  private focused = false;
  private drawing = false;
  private readonly onDocPointer = (e: PointerEvent) => {
    if (this.menuOpen && !(e.target as HTMLElement).closest('.ask-menu, [data-menu-button]')) {
      this.menuOpen = false;
      this.draw();
    }
  };

  constructor(private readonly deps: AskDeps) {
    this.element = document.createElement('section');
    this.element.className = 'ask';
    this.element.dataset.testid = 'ask';
    this.element.setAttribute('aria-label', 'Soru kutusu');
    this.element.setAttribute('data-avoid', '');
    document.addEventListener('pointerdown', this.onDocPointer, true);
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.menuOpen) {
        e.stopPropagation();
        this.menuOpen = false;
        this.draw();
        this.element.querySelector<HTMLElement>('[data-menu-button]')?.focus();
      }
    });
    this.element.addEventListener('focusin', () => this.setFocused(true));
    this.element.addEventListener('focusout', (e) => {
      if (!this.element.contains(e.relatedTarget as Node | null)) this.setFocused(false);
    });
    this.draw();
  }

  private setFocused(on: boolean) {
    if (this.focused === on) return;
    this.focused = on;
    this.draw();
  }

  /** Asks for a redraw on the next frame (streaming text arrives many times a second). */
  update() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  focus() {
    this.element.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  }

  /** Opens the settings and marks "Harita takibi", which is where the question over the map sends the reader. */
  openSettings() {
    this.menuOpen = true;
    this.pointFollow = true;
    this.draw();
    this.element.querySelector<HTMLInputElement>('[data-testid=chat-follow]')?.focus({ preventScroll: true });
    window.setTimeout(() => {
      this.pointFollow = false;
      this.draw();
    }, 3200);
  }

  /* ------------------------------------------------------------------ drawing */

  private draw() {
    // Taking the focused element off the page (a closed menu, a chip that went away) makes the browser fire its
    // focusout in the middle of this very render. That event asks for a redraw too: it is done right after, not inside.
    if (this.drawing) {
      this.update();
      return;
    }
    this.drawing = true;
    try {
      const { director, presentation } = this.deps;
      const ctx = this.deps.context();
      const free = !director.following && presentation.narrating;
      render(
        html`
          ${this.notes()} ${free ? this.freeChip() : nothing} ${this.suggestions(ctx)} ${this.eventChip(ctx)}
          ${this.composer(ctx)} ${this.menuOpen ? this.menu() : nothing}
        `,
        this.element,
      );
    } finally {
      this.drawing = false;
    }
  }

  /** Where the answers come from, and what stops them. */
  private notes(): TemplateResult | typeof nothing {
    const { session, actions } = this.deps;
    const parts: TemplateResult[] = [];
    if (session.blocked) {
      const copy = errorCopy(session.blocked.code);
      parts.push(
        html`<div class="ask-note is-blocked" role="status" data-testid="chat-blocked">
          <b>${copy.title}.</b> ${copy.hint}
          ${
            copy.permissions
              ? html`<button type="button" class="btn btn-small" @click=${() => actions.openPermissions()}>
                  İzinleri aç
                </button>`
              : nothing
          }
        </div>`,
      );
    } else if (session.provider?.kind === 'mock') {
      parts.push(
        html`<p class="ask-note" data-testid="ask-mock-note">
          <b>Deneme kipi:</b> Claude yok, yanıtlar komut dosyasından geliyor.
        </p>`,
      );
    }
    return parts.length ? html`${parts}` : nothing;
  }

  /** "Harita takibi kapalı · aç": the camera is the reader's; one click gives it back to the narration. */
  private freeChip(): TemplateResult {
    return html`<button
      type="button"
      class="ask-free"
      data-testid="chat-follow-off"
      title="Harita sizin elinizde. Adımlar haritayı yeniden izlesin."
      @click=${() => this.deps.actions.setFollowing(true)}
    >
      Harita takibi kapalı · <span>aç</span>
    </button>`;
  }

  /** Before the first question: a few things to try, while the box has the reader's attention. */
  private suggestions(ctx: AiContext): TemplateResult | typeof nothing {
    const { session, actions } = this.deps;
    // (They stay while the settings are open: taking them away when the box loses focus would move the menu from under the pointer.)
    if (session.items.length || !(this.focused || this.menuOpen) || session.busy || session.blocked) return nothing;
    const place = ctx.places[0];
    const questions = [
      place ? 'Bu dönemde komşuları kimlerdi?' : 'Bu aralıktaki en önemli gelişme neydi?',
      'Bunları birbirine bağlayan şey neydi?',
    ];
    return html`<div class="ask-suggest" data-testid="chat-suggest" @mousedown=${(e: Event) => e.preventDefault()}>
      <button type="button" class="chat-chip is-primary" data-testid="chat-narrate" @click=${() => actions.narrate()}>
        ${ICON.spark}${place ? 'Bu yerin tarihini anlat' : 'Bu aralıkta dünyada olanları anlat'}
      </button>
      ${questions.map(
        (q) => html`<button type="button" class="chat-chip" @click=${() => actions.send(q)}>${q}</button>`,
      )}
    </div>`;
  }

  private eventChip(ctx: AiContext): TemplateResult | typeof nothing {
    const ev = ctx.event;
    if (!ev) return nothing;
    return html`<div class="composer-event" data-testid="chat-event-chip">
      <span class="chat-chip is-static"
        >${dot(this.deps.data.eventsById.get(ev.id)?.category ?? ev.category)}<span>${ev.title}</span></span
      >
      <span class="composer-event-hint">açık olay, soruya eklenir</span>
      <button
        type="button"
        class="icon-btn"
        aria-label="Olay kartını kapat"
        title="Olay kartını kapat"
        @click=${() => this.deps.actions.dropEvent()}
      >
        ${ICON.close}
      </button>
    </div>`;
  }

  private composer(ctx: AiContext): TemplateResult {
    const { session, presentation, actions } = this.deps;
    const busy = session.busy;
    const blocked = !!session.blocked;
    const ev = ctx.event;
    const place = ctx.places[0];
    const hasChat = session.items.length > 0;
    const narrow = window.matchMedia('(max-width: 900px)').matches;
    const reading = presentation.shown && presentation.view === 'read';
    const submit = (e: Event) => {
      e.preventDefault();
      const box = this.element.querySelector<HTMLTextAreaElement>('textarea');
      if (!box || busy || blocked) return;
      const text = box.value.trim();
      if (!text) return;
      box.value = '';
      this.resize(box);
      this.syncSend();
      actions.send(text);
    };
    return html`<form class="composer" data-testid="chat-composer" @submit=${submit}>
      <div class="composer-row">
        <span class="composer-mark" aria-hidden="true">${ICON.spark}</span>
        <textarea
          rows="1"
          data-testid="chat-input"
          aria-label="Sorunuz"
          placeholder=${
            blocked
              ? 'Claude bu sayfada kullanılamıyor'
              : narrow
                ? 'Bir şey sorun…' // the box is narrow; the question is about whatever the card shows
                : ev
                  ? `“${ev.title}” hakkında sorun…`
                  : place
                    ? `${place.title} hakkında sorun…`
                    : 'Bu dönem hakkında sorun…'
          }
          ?disabled=${blocked}
          @input=${(e: Event) => {
            this.resize(e.target as HTMLTextAreaElement);
            this.syncSend();
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) submit(e);
          }}
        ></textarea>
        ${
          hasChat
            ? html`<button
                type="button"
                class=${clsx('icon-btn', 'ask-read', reading && 'is-on')}
                data-testid="read-toggle"
                aria-label=${reading ? 'Metni kapat' : 'Sohbetin metnini aç'}
                aria-pressed=${reading}
                title=${reading ? 'Metni kapat' : 'Sohbetin metnini oku'}
                @click=${() => actions.toggleRead()}
              >
                ${ICON.lines}${busy && !reading ? html`<i class="ask-read-dot" aria-hidden="true"></i>` : nothing}
              </button>`
            : nothing
        }
        <button
          type="button"
          class="icon-btn ask-gear"
          data-menu-button
          data-testid="chat-settings"
          aria-label="Sohbet ayarları"
          aria-haspopup="true"
          aria-expanded=${this.menuOpen}
          title="Sohbet ayarları"
          @click=${() => {
            this.menuOpen = !this.menuOpen;
            this.draw();
          }}
        >
          ${ICON.gear}
        </button>
        ${
          busy
            ? html`<button
                type="button"
                class="send is-stop"
                data-testid="chat-stop"
                aria-label="Durdur"
                title="Durdur"
                @click=${() => actions.stop()}
              >
                ${ICON.stop}
              </button>`
            : html`<button
                type="submit"
                class="send"
                data-testid="chat-send"
                aria-label="Gönder"
                title="Gönder (Enter)"
                ?disabled=${blocked}
              >
                ${ICON.send}
              </button>`
        }
      </div>
    </form>`;
  }

  /** The settings: the speed of the answers, the camera, and a fresh start. */
  private menu(): TemplateResult {
    const { session, director, actions } = this.deps;
    const following = director.following;
    return html`<div class="ask-menu" role="group" aria-label="Sohbet ayarları" data-testid="chat-menu">
      <fieldset>
        <legend>Yanıt hızı</legend>
        ${(['quick', 'default', 'complex'] as const).map(
          (tier) =>
            html`<label class="chat-opt">
              <input
                type="radio"
                name="tier"
                .checked=${session.tier === tier}
                @change=${() => actions.setTier(tier)}
              />
              <span><b>${TIER_LABEL[tier]}</b><small>${TIER_HINT[tier]}</small></span>
            </label>`,
        )}
      </fieldset>
      <label class=${clsx('chat-opt', 'chat-switch', this.pointFollow && 'is-pointed')} data-testid="chat-follow-row">
        <input
          type="checkbox"
          role="switch"
          data-testid="chat-follow"
          .checked=${following}
          @change=${(e: Event) => actions.setFollowing((e.target as HTMLInputElement).checked)}
        />
        <span
          ><b>Harita takibi</b
          ><small
            >Açıkken harita, her adımın çizimlerini görünür kılacak biçimde yumuşakça kayar ve yakınlaşır. Küçük
            kaydırmalar bunu kapatmaz; haritayı çok uzağa götürürseniz size sorulur.</small
          ></span
        >
      </label>
      <button
        type="button"
        class="ask-menu-clear"
        data-testid="chat-new"
        @click=${() => {
          this.menuOpen = false;
          actions.newChat();
        }}
      >
        Sohbeti temizle
      </button>
    </div>`;
  }

  private resize(box: HTMLTextAreaElement) {
    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, 132)}px`;
  }

  /** The send button is dead while there is nothing to send. */
  private syncSend() {
    const box = this.element.querySelector<HTMLTextAreaElement>('textarea');
    const send = this.element.querySelector<HTMLButtonElement>('button.send:not(.is-stop)');
    if (box && send) send.classList.toggle('is-idle', !box.value.trim());
  }
}
