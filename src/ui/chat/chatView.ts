import { html, nothing, render, type TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { pickActive, type StepBox } from '../../ai/activeStep';
import type { AiContext } from '../../ai/context';
import type { Director } from '../../ai/director';
import { isEmptyDrawing, type TurnPlan } from '../../ai/drawing';
import { errorCopy } from '../../ai/errorCopy';
import { TIER_LABEL, type ModelTier } from '../../ai/provider';
import type { AiSession, AssistantItem, ContextItem, UserItem } from '../../ai/session';
import { alignWithPlan, paragraphsOf, parseAnswer, type Section } from '../../ai/steps';
import type { AppData } from '../../data/load';
import { dot } from '../dot';
import { clsx } from '../format';
import { scrollBehavior } from '../motion';
import { inline } from './richText';

export interface ChatActions {
  send(text: string): void;
  narrate(): void;
  stop(): void;
  retry(): void;
  newChat(): void;
  /** The reader pointed at a step ("Haritada göster"). */
  selectStep(itemId: string, n: number): void;
  /** The reader scrolled and a different step is now under the reading line. */
  readStep(itemId: string, n: number): void;
  setFollowing(on: boolean): void;
  setTier(tier: ModelTier): void;
  openPermissions(): void;
  /** The cross on the open-event chip: close the event card. */
  dropEvent(): void;
}

export interface ChatDeps {
  session: AiSession;
  director: Director;
  data: Pick<AppData, 'categories' | 'eventsById'>;
  actions: ChatActions;
  /** What the reader is looking at right now (place, range, open event). */
  context(): AiContext;
}

const TIER_HINT: Record<ModelTier, string> = {
  quick: 'En çabuk; kısa ve sade',
  default: 'Günlük kullanım için',
  complex: 'En ayrıntılı; en yavaş',
};

const SPARK = html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
  <path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5z" fill="currentColor" />
</svg>`;

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
};

/** Does this step of the answer change the map? (A step that draws nothing has nothing to show.) */
function hasMap(plan: TurnPlan, n: number): boolean {
  if (plan.empty) return false;
  const d = plan.drawingAt(n);
  return !isEmptyDrawing(d) || d.year !== undefined;
}

/**
 * The reading companion: a conversation that takes the info panel's place. The reader asks (or asks for the
 * history of the place), the answer arrives as numbered steps, and the map shows whatever the step under the
 * reader's eye shows. Scrolling back restores an earlier step's map.
 *
 * It owns one persistent element so the panel can take it out and put it back (to show the place card, or
 * another view) without losing the draft, the answers or the reading position.
 */
export class ChatView {
  readonly element: HTMLElement;
  private sheet: TemplateResult | null = null;
  private queued = false;
  private menuOpen = false;
  /** The question over the map sent the reader here: "Harita takibi" is marked for a moment so it is easy to find. */
  private pointFollow = false;
  private seen = 0;
  private savedScroll = 0;
  /**
   * Only the reader's own scrolling picks steps. A scroll the page causes itself (following an answer, bringing a
   * step into view, a layout that changed) must never take the map away from the step it has just shown.
   */
  private userScrollUntil = 0;
  private scrollQueued = false;
  /** The reader scrolled the chat themselves since the last question: the page stops following the answer. */
  private manual = false;
  /** An answer that has just finished is still followed for a moment, so its last lines and any error are seen. */
  private settleUntil = 0;
  private lastStatus = '';
  private readonly onDocPointer = (e: PointerEvent) => {
    if (this.menuOpen && !(e.target as HTMLElement).closest('.chat-menu, [data-menu-button]')) {
      this.menuOpen = false;
      this.draw();
    }
  };

  constructor(private readonly deps: ChatDeps) {
    this.element = document.createElement('section');
    this.element.className = 'chat';
    this.element.dataset.testid = 'chat';
    this.element.setAttribute('aria-label', 'Sohbet');
    document.addEventListener('pointerdown', this.onDocPointer, true);
    this.element.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.menuOpen) {
        e.stopPropagation();
        this.menuOpen = false;
        this.draw();
        this.element.querySelector<HTMLElement>('[data-menu-button]')?.focus();
      }
    });
    this.draw();
  }

  /** The event card, shown over the conversation (which stays where it is underneath). */
  setSheet(sheet: TemplateResult | null) {
    this.sheet = sheet;
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

  /** The panel put the chat back: bring back where the reader was reading. */
  attached(focus = false) {
    requestAnimationFrame(() => {
      const scroller = this.scroller();
      if (scroller) scroller.scrollTop = this.savedScroll;
      if (focus) this.focusComposer();
    });
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

  focusComposer() {
    this.element.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true });
  }

  private scroller(): HTMLElement | null {
    return this.element.querySelector<HTMLElement>('.chat-scroll');
  }

  /* --------------------------------------------------------------- scrolling */

  private scrollTo(top: number) {
    this.scroller()?.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
  }

  /** Brings a step to the reading position: a little below the top, where the eye starts. */
  scrollToStep(itemId: string, n: number) {
    const scroller = this.scroller();
    const el = scroller?.querySelector<HTMLElement>(`[data-step="${itemId}:${n}"]`);
    if (!scroller || !el) return;
    const top = el.offsetTop;
    const visibleTop = scroller.scrollTop;
    const visibleBottom = visibleTop + scroller.clientHeight;
    // Already comfortably in view: leave the page where the reader put it.
    if (top > visibleTop + 8 && el.offsetTop + Math.min(el.offsetHeight, 160) < visibleBottom - 8) return;
    this.scrollTo(top - scroller.clientHeight * 0.16);
  }

  private onScroll = () => {
    const scroller = this.scroller();
    if (scroller) this.savedScroll = scroller.scrollTop;
    const now = performance.now();
    if (now >= this.userScrollUntil) return; // not the reader's doing
    this.userScrollUntil = Math.max(this.userScrollUntil, now + 300); // a flick keeps scrolling by itself for a while
    if (this.scrollQueued) return;
    this.scrollQueued = true;
    requestAnimationFrame(() => {
      this.scrollQueued = false;
      this.pickStep();
    });
  };

  /** Which step is the reader on? Whatever is under the reading line. */
  private pickStep() {
    const scroller = this.scroller();
    if (!scroller || this.sheet) return;
    const top = scroller.getBoundingClientRect().top;
    const boxes: StepBox[] = [...scroller.querySelectorAll<HTMLElement>('[data-step]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { key: el.dataset.step!, top: r.top - top, bottom: r.bottom - top };
    });
    const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
    const key = pickActive(boxes, { top: 0, bottom: scroller.clientHeight, atEnd });
    if (!key) return;
    const at = key.lastIndexOf(':');
    this.deps.actions.readStep(key.slice(0, at), Number(key.slice(at + 1)));
  }

  /* ------------------------------------------------------------------ drawing */

  private draw() {
    const { session } = this.deps;
    const ctx = this.deps.context();
    render(
      html`
        ${this.bar()}
        <div class="chat-body">
          <div
            class="chat-scroll"
            data-testid="chat-scroll"
            tabindex="-1"
            ?inert=${!!this.sheet}
            aria-hidden=${this.sheet ? 'true' : 'false'}
            @scroll=${this.onScroll}
            @wheel=${this.takeOver}
            @touchmove=${this.takeOver}
            @keydown=${this.takeOver}
            @pointerdown=${(e: PointerEvent) => {
              if (e.target === e.currentTarget) this.takeOver(); // the scrollbar itself
            }}
          >
            ${this.notice()}
            ${
              session.items.length
                ? repeat(
                    session.items,
                    (i) => i.id,
                    (i) =>
                      i.kind === 'user' ? this.user(i) : i.kind === 'assistant' ? this.assistant(i) : this.divider(i),
                  )
                : this.empty(ctx)
            }
          </div>
          ${this.sheet ? html`<div class="chat-sheet" data-testid="event-sheet">${this.sheet}</div>` : nothing}
        </div>
        ${this.composer(ctx)}
      `,
      this.element,
    );
    this.follow();
  }

  /** The reader's hand is on the scroll area: wheel, touch, keys or its scrollbar. */
  private takeOver = () => {
    this.manual = true;
    this.userScrollUntil = performance.now() + 1200;
  };

  /**
   * While an answer is being written the page follows it, like any chat: the newest line stays in view, but
   * never so far that the question above it scrolls out. A long narration therefore ends up with its question
   * at the top, ready to be read from the first step; and as soon as the reader scrolls, the page leaves them alone.
   */
  private follow() {
    const items = this.deps.session.items;
    const grew = items.length > this.seen;
    this.seen = items.length;
    const answer = items[items.length - 1];
    const ask = items[items.length - 2];
    if (answer?.kind !== 'assistant') return;
    if (grew && ask?.kind === 'user') this.manual = false; // a new question: follow again
    const running = answer.status === 'waiting' || answer.status === 'streaming';
    const status = `${answer.id}:${answer.status}`;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      if (!running) this.settleUntil = performance.now() + 500;
    }
    if (this.manual || this.sheet || !(running || performance.now() < this.settleUntil)) return;
    const scroller = this.scroller();
    const answerEl = this.element.querySelector<HTMLElement>(`[data-msg="${answer.id}"]`);
    if (!scroller || !answerEl) return;
    const askEl = ask?.kind === 'user' ? this.element.querySelector<HTMLElement>(`[data-msg="${ask.id}"]`) : null;
    const bottom = answerEl.offsetTop + answerEl.offsetHeight + 24;
    const shown = scroller.scrollTop + scroller.clientHeight;
    if (bottom <= shown) return;
    const target = Math.min(scroller.scrollTop + (bottom - shown), askEl ? askEl.offsetTop - 12 : Infinity);
    if (target > scroller.scrollTop) scroller.scrollTop = target;
  }

  private bar(): TemplateResult {
    const { session, director, actions } = this.deps;
    const following = director.following;
    return html`
      <div class="chat-bar">
        <span class="chat-bar-title">${SPARK}<span>Sohbet</span></span>
        ${
          !following && director.active
            ? html`<button
                type="button"
                class="chat-free"
                data-testid="chat-follow-off"
                title="Harita sizin elinizde. Adımlar haritayı yeniden izlesin."
                @click=${() => actions.setFollowing(true)}
              >
                Harita takibi kapalı · <span>aç</span>
              </button>`
            : nothing
        }
        <button
          type="button"
          class="icon-btn chat-gear"
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
          this.menuOpen
            ? html`<div class="chat-menu" role="group" aria-label="Sohbet ayarları" data-testid="chat-menu">
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
                <label
                  class=${clsx('chat-opt', 'chat-switch', this.pointFollow && 'is-pointed')}
                  data-testid="chat-follow-row"
                >
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
                      >Açıkken harita, her adımın çizimlerini görünür kılacak biçimde yumuşakça kayar ve yakınlaşır.
                      Küçük kaydırmalar bunu kapatmaz; haritayı çok uzağa götürürseniz size sorulur.</small
                    ></span
                  >
                </label>
                <button
                  type="button"
                  class="chat-menu-clear"
                  data-testid="chat-new"
                  @click=${() => {
                    this.menuOpen = false;
                    actions.newChat();
                  }}
                >
                  Sohbeti temizle
                </button>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  /** Where the answers come from, and what stops them. */
  private notice(): TemplateResult | typeof nothing {
    const { session, actions } = this.deps;
    const parts: TemplateResult[] = [];
    if (session.provider?.kind === 'mock') {
      parts.push(
        html`<p class="chat-notice" data-testid="chat-mock-notice">
          <b>Deneme kipi.</b> Claude bu ortamda yok; yanıtlar komut dosyasından geliyor. Sayfa bir Claude
          görüntüleyicisinde açılınca gerçek yanıtlar gelir.
        </p>`,
      );
    }
    if (session.blocked) {
      const copy = errorCopy(session.blocked.code);
      parts.push(
        html`<div class="chat-notice is-blocked" role="status" data-testid="chat-blocked">
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
    }
    return parts.length ? html`${parts}` : nothing;
  }

  private empty(ctx: AiContext): TemplateResult {
    const { actions, session } = this.deps;
    const place = ctx.places[0];
    const off = session.busy || !!session.blocked;
    return html`<div class="chat-empty" data-testid="chat-empty">
      <p class="eyebrow">Haritayla birlikte okuyun</p>
      <h2 class="chat-empty-title">
        ${place ? `${place.title} ve çevresi, ${ctx.range.from === ctx.range.to ? ctx.range.from : `${ctx.range.from}–${ctx.range.to}`}` : 'Seçtiğiniz dönemde dünya'}
      </h2>
      <p class="prose">
        Bir yerin tarihini anlatmasını ya da sorunuzu yanıtlamasını isteyin. Anlatım ilerledikçe harita, anlatılanı
        gösterir: devletleri vurgular, aralarındaki ilişkiyi çizer, anlatılan olayı kendi işaretiyle koyar. Her adım
        haritayı kendi çizimleriyle gösterir ve <i>Harita takibi</i> açıkken harita o çizimlere yumuşakça kayar. Bu
        sırada olay işaretleri haritadan çekilir (çizelgede durur); bir olaya tıklarsanız ya da anlatım ondan söz ederse
        haritada belirir.
      </p>
      <div class="chat-suggest">
        <button
          type="button"
          class="btn btn-solid"
          data-testid="chat-narrate"
          ?disabled=${off}
          @click=${() => actions.narrate()}
        >
          ${place ? 'Bu yerin tarihini anlat' : 'Bu aralıkta dünyada olanları anlat'}
        </button>
        <button
          type="button"
          class="chat-chip"
          ?disabled=${off}
          @click=${() => actions.send(place ? 'Bu dönemde komşuları kimlerdi?' : 'Bu aralıktaki en önemli gelişme neydi?')}
        >
          ${place ? 'Bu dönemde komşuları kimlerdi?' : 'Bu aralıktaki en önemli gelişme neydi?'}
        </button>
        <button
          type="button"
          class="chat-chip"
          ?disabled=${off}
          @click=${() => actions.send('Bunları birbirine bağlayan şey neydi?')}
        >
          Bunları birbirine bağlayan şey neydi?
        </button>
      </div>
    </div>`;
  }

  private user(item: UserItem): TemplateResult {
    const ev = item.event ? this.deps.data.eventsById.get(item.event.id) : null;
    return html`<div class="msg msg-user" data-msg=${item.id} data-testid="chat-user">
      <p>${item.text}</p>
      ${
        item.event
          ? html`<span class="chat-chip is-static" data-testid="chat-user-event"
              >${dot(ev?.category ?? item.event.category)}<span>${item.event.title}</span
              ><small>${item.event.dateLabel}</small></span
            >`
          : nothing
      }
    </div>`;
  }

  private divider(item: ContextItem): TemplateResult {
    return html`<div class="chat-context" role="separator" data-testid="chat-context-change" data-msg=${item.id}>
      <span class="chat-context-tag">Bağlam değişti</span>
      <span class="chat-context-line"
        ><s>${item.from}</s><i aria-hidden="true">→</i><b data-testid="chat-context-to">${item.to}</b></span
      >
    </div>`;
  }

  private assistant(item: AssistantItem): TemplateResult {
    const { session, director, actions } = this.deps;
    const parsed = parseAnswer(item.text);
    const sections =
      item.status === 'streaming' || item.status === 'waiting'
        ? parsed.sections
        : alignWithPlan(parsed.sections, item.plan.numbers(), (n) => item.plan.titleOf(n));
    const numbered = item.mode === 'narration' || sections.length > 1 || !!sections[0]?.title;
    const active = director.active;
    const isLast = session.items[session.items.length - 1] === item;
    const streaming = item.status === 'streaming';
    const copy = item.error ? errorCopy(item.error.code) : null;
    return html`<article class="msg msg-ai" data-msg=${item.id} data-testid="chat-answer" data-status=${item.status}>
      ${
        item.status === 'waiting'
          ? html`<p class="chat-thinking" data-testid="chat-thinking" role="status">
              <span>Düşünüyor</span><i class="dots" aria-hidden="true"><b></b><b></b><b></b></i>
              <button type="button" class="link" @click=${() => actions.stop()}>Durdur</button>
            </p>`
          : nothing
      }
      ${parsed.preamble ? html`<p class="prose chat-preamble">${inline(parsed.preamble)}</p>` : nothing}
      ${sections.map((s, i) =>
        this.step(
          item,
          s,
          numbered,
          active?.itemId === item.id && active.n === s.n,
          streaming && i === sections.length - 1,
        ),
      )}
      ${
        item.status === 'stopped'
          ? html`<p class="msg-tag" data-testid="chat-stopped">
              Durduruldu${
                isLast && !session.busy
                  ? html` · <button type="button" class="link" @click=${() => actions.retry()}>Yeniden dene</button>`
                  : nothing
              }
            </p>`
          : nothing
      }
      ${item.truncated ? html`<p class="msg-note">Yanıt uzunluk sınırında kesildi; daha kısa bir şey isteyin.</p>` : nothing}
      ${item.notes.map((n) => html`<p class="msg-note" data-testid="chat-note">${n}</p>`)}
      ${
        copy && item.error
          ? html`<div class="chat-error" role="alert" data-testid="chat-error" data-code=${item.error.code}>
              <strong>${copy.title}</strong>
              <p>${copy.hint}</p>
              ${
                (copy.retry && isLast && !session.busy) || copy.permissions
                  ? html`<div class="chat-error-actions">
                      ${
                        copy.retry && isLast && !session.busy
                          ? html`<button
                              type="button"
                              class="btn btn-small"
                              data-testid="chat-retry"
                              @click=${() => actions.retry()}
                            >
                              Yeniden dene
                            </button>`
                          : nothing
                      }
                      ${
                        copy.permissions
                          ? html`<button type="button" class="btn btn-small" @click=${() => actions.openPermissions()}>
                              İzinleri aç
                            </button>`
                          : nothing
                      }
                    </div>`
                  : nothing
              }
            </div>`
          : nothing
      }
    </article>`;
  }

  private step(item: AssistantItem, s: Section, numbered: boolean, active: boolean, caret: boolean): TemplateResult {
    const mapped = hasMap(item.plan, s.n);
    const title = s.title || item.plan.titleOf(s.n) || '';
    const paragraphs = paragraphsOf(s.body);
    return html`<section
      class=${clsx('cs', numbered && 'is-numbered', active && 'is-active', mapped && 'has-map')}
      data-step=${`${item.id}:${s.n}`}
      data-n=${s.n}
      data-testid="chat-step"
      data-active=${active}
      aria-current=${active ? 'step' : 'false'}
      @click=${() => this.onStepClick(item.id, s.n, mapped, active)}
    >
      ${numbered ? html`<span class="cs-n" aria-hidden="true">${s.n}</span>` : nothing}
      <div class="cs-body">
        ${title ? html`<h2 class="cs-title" data-testid="chat-step-title">${title}</h2>` : nothing}
        ${
          paragraphs.length
            ? paragraphs.map(
                (p, i) =>
                  html`<p class="prose">
                    ${inline(p)}${caret && i === paragraphs.length - 1 ? html`<i class="caret" aria-hidden="true"></i>` : nothing}
                  </p>`,
              )
            : caret
              ? html`<p class="prose"><i class="caret" aria-hidden="true"></i></p>`
              : nothing
        }
        ${
          mapped
            ? html`<div class="cs-map">
                ${
                  active
                    ? html`<span class="cs-live" data-testid="chat-step-live"
                        ><i aria-hidden="true"></i>Haritada gösteriliyor</span
                      >`
                    : html`<button
                        type="button"
                        class="cs-show"
                        data-testid="chat-step-show"
                        @click=${(e: Event) => {
                          e.stopPropagation();
                          this.pointAt(item.id, s.n);
                        }}
                      >
                        Haritada göster
                      </button>`
                }
              </div>`
            : nothing
        }
      </div>
    </section>`;
  }

  /** A click anywhere on a step (not a text selection, not a link) shows that step's map. */
  private onStepClick(itemId: string, n: number, mapped: boolean, active: boolean) {
    if (!mapped || active) return;
    if (window.getSelection()?.toString()) return;
    this.pointAt(itemId, n);
  }

  private pointAt(itemId: string, n: number) {
    this.userScrollUntil = 0; // scrolling that was already under way must not take the choice back
    this.deps.actions.selectStep(itemId, n);
    this.scrollToStep(itemId, n);
  }

  private composer(ctx: AiContext): TemplateResult {
    const { session, actions } = this.deps;
    const busy = session.busy;
    const blocked = !!session.blocked;
    const ev = ctx.event;
    const place = ctx.places[0];
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
      ${
        ev
          ? html`<div class="composer-event" data-testid="chat-event-chip">
              <span class="chat-chip is-static"
                >${dot(this.deps.data.eventsById.get(ev.id)?.category ?? ev.category)}<span>${ev.title}</span></span
              >
              <span class="composer-event-hint">açık olay, soruya eklenir</span>
              <button
                type="button"
                class="icon-btn"
                aria-label="Olay kartını kapat"
                title="Olay kartını kapat"
                @click=${() => actions.dropEvent()}
              >
                ${ICON.close}
              </button>
            </div>`
          : nothing
      }
      <div class="composer-row">
        <textarea
          rows="1"
          data-testid="chat-input"
          aria-label="Mesajınız"
          placeholder=${
            blocked
              ? 'Claude bu sayfada kullanılamıyor'
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
