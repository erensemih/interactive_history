import { html, nothing, render, type TemplateResult } from 'lit-html';
import { errorCopy } from '../../ai/errorCopy';
import { shortOf } from '../../ai/narration';
import { SPEED_IDS, SPEEDS, type Presentation, type SpeedId } from '../../ai/presentation';
import type { AiSession, AssistantItem } from '../../ai/session';
import { paragraphsOf } from '../../ai/steps';
import { clsx } from '../format';
import { inline } from '../read/richText';

export interface WatchActions {
  stop(): void;
  retry(): void;
  openPermissions(): void;
  /** "Metni oku": the full text of what is on screen. */
  read(): void;
  /** The cross: the answer goes away and the map is the reader's again. */
  close(): void;
}

export interface WatchDeps {
  session: AiSession;
  presentation: Presentation;
  actions: WatchActions;
}

const ICON = {
  prev: html`<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      d="M10 3.5L5.5 8l4.5 4.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  next: html`<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
    <path
      d="M6 3.5L10.5 8 6 12.5"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>`,
  play: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M5 3.2v9.6L12.6 8z" fill="currentColor" />
  </svg>`,
  pause: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <rect x="4" y="3.2" width="2.8" height="9.6" rx="0.8" fill="currentColor" />
    <rect x="9.2" y="3.2" width="2.8" height="9.6" rx="0.8" fill="currentColor" />
  </svg>`,
  close: html`<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <path d="M3.5 3.5l9 9m0-9l-9 9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none" />
  </svg>`,
  lines: html`<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3 4h10M3 7.3h10M3 10.6h6.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none" />
  </svg>`,
};

/**
 * Watch: what the answer says, over the map, in one fixed place like a subtitle. A narration is its step's short
 * caption with the controls to step through it (buttons, ← →, optional autoplay at a chosen speed); a
 * single-part answer is its short text. While the model is still thinking it says so, and a failure is said
 * where the answer would have been. The map itself is drawn by the page from the director's active step.
 */
export class WatchView {
  readonly element: HTMLElement;
  private queued = false;

  constructor(private readonly deps: WatchDeps) {
    this.element = document.createElement('div');
    this.element.className = 'watch-host';
    this.element.dataset.testid = 'watch-host';
    this.draw();
  }

  update() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.draw();
    });
  }

  private draw() {
    const { presentation, session } = this.deps;
    if (!presentation.shown || presentation.view !== 'watch') {
      render(nothing, this.element);
      return;
    }
    const latest = [...session.items].reverse().find((i): i is AssistantItem => i.kind === 'assistant');
    const item = presentation.item ?? latest;
    if (!item) {
      render(nothing, this.element);
      return;
    }
    const written = item.text.trim().length > 0;
    const nothingYet = item.plan.empty && !written;
    let body: TemplateResult;
    if (nothingYet && (item.status === 'waiting' || item.status === 'streaming')) body = this.thinking();
    else if (nothingYet) body = this.ended(item);
    else if (presentation.stepped) body = this.captions(item);
    else body = this.short(item);
    render(body, this.element);
  }

  /* --------------------------------------------------------------- states */

  private thinking(): TemplateResult {
    const { actions } = this.deps;
    return html`<section class="watch watch-quiet" data-testid="chat-thinking" role="status" data-avoid>
      <p class="watch-thinking">
        <span>Düşünüyor</span><i class="dots" aria-hidden="true"><b></b><b></b><b></b></i>
      </p>
      <button type="button" class="link" data-testid="watch-stop" @click=${() => actions.stop()}>Durdur</button>
    </section>`;
  }

  /** "Durduruldu · Yeniden dene": the reader stopped the answer; what was there stays. */
  private stoppedLine(item: AssistantItem): TemplateResult | typeof nothing {
    if (item.status !== 'stopped') return nothing;
    const { session, actions } = this.deps;
    const isLast = session.items[session.items.length - 1] === item;
    return html`<p class="watch-stopped" data-testid="chat-stopped" role="status">
      Durduruldu${
        isLast && !session.busy
          ? html` · <button type="button" class="link" @click=${() => actions.retry()}>Yeniden dene</button>`
          : nothing
      }
    </p>`;
  }

  /** What the page has to say about this answer (that the map could not be drawn on, say): a quiet line. */
  private notesOf(item: AssistantItem): TemplateResult | typeof nothing {
    if (!item.notes.length) return nothing;
    return html`${item.notes.map((n) => html`<p class="watch-note" data-testid="watch-note">${n}</p>`)}`;
  }

  /** The answer ended with nothing to show: stopped, or failed. */
  private ended(item: AssistantItem): TemplateResult {
    const { session, actions } = this.deps;
    const isLast = session.items[session.items.length - 1] === item;
    if (item.status === 'stopped') {
      return html`<section class="watch watch-quiet" data-testid="chat-stopped" role="status" data-avoid>
        <p class="watch-thinking">Durduruldu</p>
        <span class="watch-actions">
          ${
            isLast && !session.busy
              ? html`<button type="button" class="link" @click=${() => actions.retry()}>Yeniden dene</button>`
              : nothing
          }
          <button type="button" class="icon-btn" aria-label="Kapat" title="Kapat" @click=${() => actions.close()}>
            ${ICON.close}
          </button>
        </span>
      </section>`;
    }
    return this.error(item) ?? html`${nothing}`;
  }

  private error(item: AssistantItem): TemplateResult | null {
    const { session, actions } = this.deps;
    if (!item.error) return null;
    const copy = errorCopy(item.error.code);
    const isLast = session.items[session.items.length - 1] === item;
    return html`<section
      class="watch watch-error"
      role="alert"
      data-testid="chat-error"
      data-code=${item.error.code}
      data-avoid
    >
      <div class="watch-error-text">
        <strong>${copy.title}</strong>
        <p>${copy.hint}</p>
      </div>
      <div class="watch-actions">
        ${
          copy.retry && isLast && !session.busy
            ? html`<button type="button" class="btn btn-small" data-testid="chat-retry" @click=${() => actions.retry()}>
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
        <button type="button" class="icon-btn" aria-label="Kapat" title="Kapat" @click=${() => actions.close()}>
          ${ICON.close}
        </button>
      </div>
    </section>`;
  }

  /* ------------------------------------------------------ a narration in steps */

  private captions(item: AssistantItem): TemplateResult {
    const { presentation: p, actions } = this.deps;
    const steps = p.steps;
    const i = Math.max(0, p.index);
    const step = steps[i]!;
    const writing = item.status === 'streaming' || item.status === 'waiting';
    const err = item.error ? this.error(item) : null;
    return html`<section
      class="watch watch-steps"
      data-testid="watch"
      data-step=${step.n}
      role="region"
      aria-roledescription="anlatım"
      aria-label="Anlatım: ${step.title || `adım ${i + 1}`}"
      data-avoid
    >
      <div class="watch-head">
        <span class="watch-count" data-testid="watch-count" aria-label=${`${i + 1}. adım, toplam ${steps.length}`}>
          ${i + 1} / ${steps.length}
        </span>
        <h2 class="watch-title" data-testid="watch-title">${step.title}</h2>
        ${
          writing
            ? html`<span class="watch-wip" data-testid="watch-writing"
                >Metin yazılıyor<i class="dots" aria-hidden="true"><b></b><b></b><b></b></i
              ></span>`
            : nothing
        }
      </div>
      <p class="watch-caption" data-testid="watch-caption" aria-live="polite" aria-atomic="true">${step.caption}</p>
      ${this.notesOf(item)}${err ?? nothing}${this.stoppedLine(item)}
      <div class="watch-controls">
        <button
          type="button"
          class="watch-btn"
          data-testid="watch-prev"
          aria-label="Önceki adım"
          aria-keyshortcuts="ArrowLeft"
          title="Önceki adım (←)"
          ?disabled=${!p.hasPrev}
          @click=${() => p.prev()}
        >
          ${ICON.prev}
        </button>
        <button
          type="button"
          class="watch-btn"
          data-testid="watch-next"
          aria-label="Sonraki adım"
          aria-keyshortcuts="ArrowRight"
          title="Sonraki adım (→)"
          ?disabled=${!p.hasNext}
          @click=${() => p.next()}
        >
          ${ICON.next}
        </button>
        <ol class="watch-pips" aria-label="Adımlar">
          ${steps.map(
            (s, k) =>
              html`<li>
                <button
                  type="button"
                  class=${clsx('watch-pip', k === i && 'is-on', k < i && 'is-past')}
                  data-testid="watch-pip"
                  data-n=${s.n}
                  aria-label=${`${k + 1}. adım${s.title ? `: ${s.title}` : ''}`}
                  aria-current=${k === i ? 'step' : 'false'}
                  title=${s.title}
                  @click=${() => p.go(s.n)}
                ></button>
              </li>`,
          )}
        </ol>
        <button
          type="button"
          class=${clsx('watch-btn', 'watch-play', p.playing && 'is-on')}
          data-testid="watch-play"
          aria-pressed=${p.playing}
          aria-label=${p.playing ? 'Otomatik oynatmayı duraklat' : 'Otomatik oynat'}
          title=${p.playing ? 'Duraklat' : 'Kendiliğinden ilerlesin'}
          @click=${() => p.toggle()}
        >
          ${p.playing ? ICON.pause : ICON.play}<span>${p.playing ? 'Duraklat' : 'Oynat'}</span>
        </button>
        <label class="watch-speed">
          <span class="sr-only">Oynatma hızı</span>
          <select
            data-testid="watch-speed"
            aria-label="Oynatma hızı"
            title="Oynatma hızı"
            @change=${(e: Event) => p.setSpeed((e.target as HTMLSelectElement).value as SpeedId)}
          >
            ${SPEED_IDS.map((id) => html`<option value=${id} ?selected=${p.speed === id}>${SPEEDS[id].label}</option>`)}
          </select>
        </label>
        <span class="watch-spacer"></span>
        <button type="button" class="watch-btn watch-read" data-testid="watch-read" @click=${() => actions.read()}>
          ${ICON.lines}<span>Metni oku</span>
        </button>
        <button
          type="button"
          class="watch-btn"
          data-testid="watch-close"
          aria-label="Anlatımı kapat"
          title="Kapat: harita yeniden sizin"
          @click=${() => actions.close()}
        >
          ${ICON.close}
        </button>
      </div>
    </section>`;
  }

  /* ----------------------------------------------------- a single-part answer */

  private short(item: AssistantItem): TemplateResult {
    const { actions } = this.deps;
    const text = shortOf(item);
    const paragraphs = paragraphsOf(text.body);
    const writing = item.status === 'streaming' || item.status === 'waiting';
    const err = item.error ? this.error(item) : null;
    return html`<section
      class="watch watch-short"
      data-testid="watch-short"
      role="region"
      aria-label="Yanıt"
      data-avoid
    >
      <div class="watch-text" data-testid="watch-text" aria-live="polite">
        ${text.title ? html`<h2 class="watch-title">${text.title}</h2>` : nothing}
        ${
          paragraphs.length
            ? paragraphs.map(
                (p, i) =>
                  html`<p>
                    ${inline(p)}${writing && i === paragraphs.length - 1 ? html`<i class="caret" aria-hidden="true"></i>` : nothing}
                  </p>`,
              )
            : html`<p><i class="caret" aria-hidden="true"></i></p>`
        }
      </div>
      ${this.notesOf(item)}${err ?? nothing}${this.stoppedLine(item)}
      <div class="watch-controls">
        <span class="watch-spacer"></span>
        <button type="button" class="watch-btn watch-read" data-testid="watch-read" @click=${() => actions.read()}>
          ${ICON.lines}<span>Metni oku</span>
        </button>
        <button
          type="button"
          class="watch-btn"
          data-testid="watch-close"
          aria-label="Yanıtı kapat"
          title="Kapat: harita yeniden sizin"
          @click=${() => actions.close()}
        >
          ${ICON.close}
        </button>
      </div>
    </section>`;
  }
}
