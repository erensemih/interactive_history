import { html, nothing, render, type TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { pickActive, type StepBox } from '../../ai/activeStep';
import type { AiContext } from '../../ai/context';
import type { Director } from '../../ai/director';
import { errorCopy } from '../../ai/errorCopy';
import { isStepped, shortOf, stepsOf, type StepView } from '../../ai/narration';
import type { Presentation } from '../../ai/presentation';
import type { AiSession, AssistantItem, ContextItem, UserItem } from '../../ai/session';
import { paragraphsOf, parseAnswer } from '../../ai/steps';
import type { AppData } from '../../data/load';
import { dot } from '../dot';
import { clsx, formatRange } from '../format';
import { scrollBehavior } from '../motion';
import { eventRefOf, inline } from './richText';
import { withoutOpenReference } from './segments';

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

export interface ReadActions {
  stop(): void;
  retry(): void;
  /** The reader pointed at a step ("Haritada göster"). */
  selectStep(itemId: string, n: number): void;
  /** The reader scrolled and a different step is now under the reading line. */
  readStep(itemId: string, n: number): void;
  openPermissions(): void;
  /** "İzle": back to the map and its captions, on the same step. */
  watch(): void;
  /** The cross: the text closes (the map and its captions come back). */
  close(): void;
  /** Between the panel beside the map and the full screen. */
  toggleSize(): void;
  /** An event named in a text was clicked: the same as a click on that event in the timeline. */
  openEvent(id: string): void;
}

export interface ReadDeps {
  session: AiSession;
  director: Director;
  presentation: Presentation;
  data: Pick<AppData, 'categories' | 'eventsById'>;
  actions: ReadActions;
  /** What the reader is looking at right now (place, range, open event). */
  context(): AiContext;
  /** On a phone the text is always full screen: there is no size to choose. */
  canResize(): boolean;
}

const ICON = {
  close: html`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none" />
  </svg>`,
  /** Out to the full screen. */
  expand: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5l-4.5 4.5M2.5 13.5L7 9"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  /** Back to the panel beside the map. */
  shrink: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M13 6H10V3M3 10h3v3M10 6l3.5-3.5M6 10l-3.5 3.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  map: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d="M2 4l4-1.5 4 1.5 4-1.5v9.5L10 13.5 6 12 2 13.5z M6 2.5V12M10 4v9.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.4"
      stroke-linejoin="round"
    />
  </svg>`,
};

/**
 * Read: the whole conversation as text. The reader asks (or asks for the history of a place), the answer arrives
 * as numbered steps (a narration) or as a short text, and the map shows whatever the step under the reader's eye
 * shows. Scrolling back restores an earlier step's map. It can sit beside the map or fill the screen (the page then
 * keeps a small map in a corner).
 *
 * It owns one persistent element and draws nothing while Watch is the view, so the page can put it away and back
 * without losing the answers or the reading position.
 */
export class ReadView {
  readonly element: HTMLElement;
  private queued = false;
  private visible = false;
  /** Beside the map or full screen, as of the last drawing (the text reflows when it changes). */
  private mode: string | null = null;
  private seen = 0;
  private savedScroll = 0;
  /**
   * Only the reader's own scrolling picks steps. A scroll the page causes itself (following an answer, bringing a
   * step into view, a layout that changed) must never take the map away from the step it has just shown.
   */
  private userScrollUntil = 0;
  /** The size of the scroll area when the reader last put a hand on it: a scroll after it changed size is the layout's doing. */
  private handSize = '';
  private scrollQueued = false;
  /** The reader scrolled the text themselves since the last question: the page stops following the answer. */
  private manual = false;
  /** An answer that has just finished is still followed for a moment, so its last lines and any error are seen. */
  private settleUntil = 0;
  private lastStatus = '';

  constructor(private readonly deps: ReadDeps) {
    this.element = document.createElement('section');
    this.element.className = 'chat';
    this.element.dataset.testid = 'chat';
    this.element.setAttribute('aria-label', 'Sohbet');
    // one listener over every text drawn here: the names of events in a text are links
    this.element.addEventListener('click', (e) => {
      const id = eventRefOf(e.target);
      if (!id) return;
      e.preventDefault();
      deps.actions.openEvent(id);
    });
    this.draw();
  }

  /** Is this the id of an event of the app's data? (A reference to anything else stays plain text.) */
  private known = (id: string) => this.deps.data.eventsById.has(id);

  /** Asks for a redraw on the next frame (streaming text arrives many times a second). */
  update() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  private scroller(): HTMLElement | null {
    return this.element.querySelector<HTMLElement>('.chat-scroll');
  }

  /* --------------------------------------------------------------- scrolling */

  private scrollTo(top: number) {
    this.scroller()?.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() });
  }

  /** Brings a step to the reading position: a little below the top, where the eye starts. */
  scrollToStep(itemId: string, n: number, always = false) {
    const scroller = this.scroller();
    const el = scroller?.querySelector<HTMLElement>(`[data-step="${itemId}:${n}"]`);
    if (!scroller || !el) return;
    const top = el.offsetTop;
    const visibleTop = scroller.scrollTop;
    const visibleBottom = visibleTop + scroller.clientHeight;
    // Already comfortably in view: leave the page where the reader put it.
    if (!always && top > visibleTop + 8 && el.offsetTop + Math.min(el.offsetHeight, 160) < visibleBottom - 8) return;
    this.userScrollUntil = 0;
    this.scrollTo(top - scroller.clientHeight * 0.16);
  }

  /** The text has just opened: it starts at the step the reader was on (Watch and Read share the step). */
  private scrollToActive() {
    const active = this.deps.director.active;
    if (active) this.scrollToStep(active.itemId, active.n, true);
    else if (this.scroller()) this.scroller()!.scrollTop = this.savedScroll;
  }

  private onScroll = () => {
    const scroller = this.scroller();
    if (scroller) this.savedScroll = scroller.scrollTop;
    const now = performance.now();
    if (now >= this.userScrollUntil) return; // not the reader's doing
    if (this.sizeOfScroller() !== this.handSize) {
      // the text was set again in another size (the panel grew or shrank) and the browser moved the scroll with it
      this.userScrollUntil = 0;
      return;
    }
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
    if (!scroller) return;
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
    const { session, presentation } = this.deps;
    const show = presentation.shown && presentation.view === 'read';
    if (!show) {
      if (this.visible) this.savedScroll = this.scroller()?.scrollTop ?? this.savedScroll;
      this.visible = false;
      render(nothing, this.element);
      return;
    }
    const entering = !this.visible;
    // The text is set again in another width when the panel grows or shrinks: the step being read stays where it was read.
    const resized = !entering && presentation.readMode !== this.mode;
    this.mode = presentation.readMode;
    this.visible = true;
    render(
      html`
        ${this.bar()}
        <div class="chat-body">
          <div
            class="chat-scroll"
            data-testid="chat-scroll"
            tabindex="-1"
            @scroll=${this.onScroll}
            @wheel=${this.takeOver}
            @touchmove=${this.takeOver}
            @keydown=${this.onKey}
            @pointerdown=${(e: PointerEvent) => {
              if (e.target === e.currentTarget) this.takeOver(); // the scrollbar itself
            }}
          >
            ${this.notice()}
            ${repeat(
              session.items,
              (i) => i.id,
              (i) => (i.kind === 'user' ? this.user(i) : i.kind === 'assistant' ? this.assistant(i) : this.divider(i)),
            )}
          </div>
        </div>
      `,
      this.element,
    );
    if (entering) {
      this.manual = true; // opening is not a new question: do not scroll away from the step we start on
      requestAnimationFrame(() => this.scrollToActive());
    } else if (resized) {
      this.userScrollUntil = 0;
      requestAnimationFrame(() => this.scrollToActive());
    } else this.follow();
  }

  private sizeOfScroller(): string {
    const s = this.scroller();
    return s ? `${s.clientWidth}x${s.clientHeight}` : '';
  }

  /** The reader's hand is on the scroll area: wheel, touch, scrolling keys or its scrollbar. */
  private takeOver = () => {
    this.manual = true;
    this.userScrollUntil = performance.now() + 1200;
    this.handSize = this.sizeOfScroller();
  };

  /** Only the keys that scroll count (Esc, Tab and the like leave the text where it is). */
  private onKey = (e: KeyboardEvent) => {
    if (SCROLL_KEYS.has(e.key)) this.takeOver();
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
    if (this.manual || !(running || performance.now() < this.settleUntil)) return;
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
    const { presentation, actions, context } = this.deps;
    const ctx = context();
    const place = ctx.places[0];
    const subject = `${place?.title ?? 'Dünya'} · ${formatRange(ctx.range)}`;
    const full = presentation.readMode === 'full';
    return html`<div class="chat-bar">
      <span class="chat-bar-title"
        ><svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M8 1.5l1.5 4.2 4.2 1.5-4.2 1.5L8 12.9 6.5 8.7 2.3 7.2l4.2-1.5z" fill="currentColor" /></svg
        ><span>Sohbet</span></span
      >
      <p class="chat-bar-subject" data-testid="read-subject" title=${subject}>${subject}</p>
      <button
        type="button"
        class="read-btn"
        data-testid="read-watch"
        title="Haritada izle"
        @click=${() => actions.watch()}
      >
        ${ICON.map}<span>İzle</span>
      </button>
      ${
        this.deps.canResize()
          ? html`<button
              type="button"
              class="icon-btn"
              data-testid="read-size"
              aria-label=${full ? 'Yan panele küçült' : 'Tam ekran'}
              aria-pressed=${full}
              title=${full ? 'Yan panele küçült' : 'Tam ekran'}
              @click=${() => actions.toggleSize()}
            >
              ${full ? ICON.shrink : ICON.expand}
            </button>`
          : nothing
      }
      <button
        type="button"
        class="icon-btn"
        data-testid="read-close"
        aria-label="Metni kapat"
        title="Metni kapat (Esc)"
        @click=${() => actions.close()}
      >
        ${ICON.close}
      </button>
    </div>`;
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
        html`<div class="chat-notice is-blocked" role="status" data-testid="chat-blocked-read">
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
    const stepped = isStepped(item);
    // A narration is its steps; a single-part answer is one unnumbered step, so it has a map to point at too.
    const views: StepView[] = stepped ? stepsOf(item) : this.shortAsStep(item);
    const preamble = stepped ? parseAnswer(item.text).preamble : '';
    const active = director.active;
    const isLast = session.items[session.items.length - 1] === item;
    const streaming = item.status === 'streaming';
    const copy = item.error ? errorCopy(item.error.code) : null;
    // the text arrives step by step: the caret sits where it is being written
    const writing = streaming ? views.reduce((last, v, i) => (v.hasText ? i : last), -1) : -1;
    return html`<article class="msg msg-ai" data-msg=${item.id} data-testid="chat-answer" data-status=${item.status}>
      ${
        item.status === 'waiting' && item.plan.empty
          ? html`<p class="chat-thinking" data-testid="chat-thinking-read" role="status">
              <span>Düşünüyor</span><i class="dots" aria-hidden="true"><b></b><b></b><b></b></i>
              <button type="button" class="link" @click=${() => actions.stop()}>Durdur</button>
            </p>`
          : nothing
      }
      ${preamble ? html`<p class="prose chat-preamble">${inline(streaming ? withoutOpenReference(preamble) : preamble, this.known)}</p>` : nothing}
      ${views.map((s, i) =>
        this.step(
          item,
          s,
          stepped,
          active?.itemId === item.id && active.n === s.n,
          i === writing || (streaming && !s.hasText && i === writing + 1),
        ),
      )}
      ${
        item.status === 'stopped'
          ? html`<p class="msg-tag" data-testid="chat-stopped-read">
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
          ? html`<div class="chat-error" role="alert" data-testid="chat-error-read" data-code=${item.error.code}>
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
                              data-testid="chat-retry-read"
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

  /** A single-part answer as the one step it is. */
  private shortAsStep(item: AssistantItem): StepView[] {
    const short = shortOf(item);
    if (!short.body.trim() && !short.title && item.plan.empty) return [];
    return [
      {
        n: 1,
        title: short.title,
        caption: '',
        body: short.body,
        hasText: short.body.trim().length > 0,
        hasScene: short.hasScene,
        year: null,
      },
    ];
  }

  private step(item: AssistantItem, s: StepView, numbered: boolean, active: boolean, caret: boolean): TemplateResult {
    const paragraphs = paragraphsOf(s.body);
    const mapped = s.hasScene;
    return html`<section
      class=${clsx('cs', numbered && 'is-numbered', active && 'is-active', mapped && 'has-map')}
      data-step=${`${item.id}:${s.n}`}
      data-n=${s.n}
      data-testid="chat-step"
      data-active=${active}
      aria-current=${active ? 'step' : 'false'}
      @click=${(e: Event) => {
        if (!eventRefOf(e.target)) this.onStepClick(item.id, s.n, mapped, active); // a click on an event's name opens the event, nothing more
      }}
    >
      ${numbered ? html`<span class="cs-n" aria-hidden="true">${s.n}</span>` : nothing}
      <div class="cs-body">
        ${s.title ? html`<h2 class="cs-title" data-testid="chat-step-title">${s.title}</h2>` : nothing}
        ${
          paragraphs.length
            ? paragraphs.map(
                (p, i) =>
                  html`<p class="prose">
                    ${inline(caret ? withoutOpenReference(p) : p, this.known)}${caret && i === paragraphs.length - 1 ? html`<i class="caret" aria-hidden="true"></i>` : nothing}
                  </p>`,
              )
            : s.caption
              ? html`<p class="prose cs-pending" data-testid="chat-step-pending">
                  ${inline(withoutOpenReference(s.caption), this.known)}${caret ? html`<i class="caret" aria-hidden="true"></i>` : nothing}
                </p>`
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
}
