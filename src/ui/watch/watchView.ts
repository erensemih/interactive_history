import { html, nothing, render, type TemplateResult } from 'lit-html';
import { errorCopy } from '../../ai/errorCopy';
import { hasMore } from '../../ai/narration';
import { SPEED_IDS, SPEEDS, type Presentation, type SpeedId } from '../../ai/presentation';
import type { AiSession, AssistantItem } from '../../ai/session';
import type { Bloc } from '../../ai/types';
import { clsx } from '../format';
import { eventRefOf, inline } from '../read/richText';
import { plainText, withoutOpenReference } from '../read/segments';
import type { StepView } from '../../ai/narration';

export interface WatchActions {
  stop(): void;
  retry(): void;
  openPermissions(): void;
  /** "Metni oku": the full text of what is on screen. */
  read(): void;
  /** The cross: the answer goes away and the map is the reader's again. */
  close(): void;
  /** An event named in a caption or a text was clicked: the same as a click on that event in the timeline. */
  openEvent(id: string): void;
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
 * Watch: what the answer says, over the map, in one fixed place like a subtitle. Every answer is its step's short
 * caption: a narration with the controls to step through it (buttons, ← →, optional autoplay at a chosen speed), an
 * answer to a plain question as one step with nothing to step through and, under the caption, "Devamını oku" for the
 * full text (Read). The caption is never the whole of a long text. While the model is still thinking it says so, and a
 * failure is said where the answer would have been. The map itself is drawn by the page from the director's active
 * step.
 */
export class WatchView {
  readonly element: HTMLElement;
  private queued = false;

  constructor(private readonly deps: WatchDeps) {
    this.element = document.createElement('div');
    this.element.className = 'watch-host';
    this.element.dataset.testid = 'watch-host';
    // one listener over everything drawn here: the names of events in a caption or a short text are links, and a sentence of a
    // caption plays its beat again
    this.element.addEventListener('click', (e) => {
      const id = eventRefOf(e.target);
      if (id) {
        e.preventDefault();
        deps.actions.openEvent(id);
        return;
      }
      const beat = (e.target as HTMLElement | null)?.closest<HTMLElement>('.watch-beat');
      if (beat?.dataset.beat !== undefined) deps.presentation.replayBeat(Number(beat.dataset.beat));
    });
    this.draw();
  }

  /** Is this the id of an event of the app's data? (A reference to anything else stays plain text.) */
  private known = (id: string) => !!this.deps.session.resolver.eventById(id);

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
    else body = this.captions(item);
    render(body, this.element);
    this.keepBeatInView();
  }

  /** A long caption scrolls inside its box: the sentence that plays is kept in sight. */
  private keepBeatInView() {
    const box = this.element.querySelector<HTMLElement>('.watch-sentences');
    const now = box?.querySelector<HTMLElement>('[data-state="now"]');
    if (!box || !now || box.scrollHeight <= box.clientHeight + 1) return;
    const top = now.offsetTop;
    const bottom = top + now.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = Math.max(0, top - 2);
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 2;
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

  /**
   * The sides the scene shows at this moment: each side's name in the colour the map paints it (the same colour in every scene),
   * or the polities that stand aside or whose side is unclear, hatched. A scene that has none, in an answer that has sides in
   * another scene, keeps the row (empty): the box must keep its height from scene to scene, because the camera brings a scene into
   * view above it and the foot of the screen must not move under it.
   */
  private legend(blocs: readonly Bloc[], reserve: boolean): TemplateResult | typeof nothing {
    if (!blocs.length) {
      return reserve
        ? html`<ul class="watch-sides is-empty" aria-hidden="true">
            <li><i class="watch-side-swatch"></i><span>&nbsp;</span></li>
          </ul>`
        : nothing;
    }
    const { resolver } = this.deps.session;
    return html`<ul class="watch-sides" data-testid="watch-sides" aria-label="Taraflar">
      ${blocs.map(
        (bloc) =>
          html`<li
            data-side=${bloc.color}
            style=${`--side: var(--side-${bloc.color})`}
            title=${bloc.polities.map((id) => resolver.nameOf(id)).join(', ')}
          >
            <i class="watch-side-swatch" aria-hidden="true"></i><span>${bloc.name}</span>
          </li>`,
      )}
    </ul>`;
  }

  /**
   * The caption, sentence by sentence: the sentence that plays is emphasised, the ones to come are dimmed, the ones that have
   * played are as they are (a scene that has ended is all of them). A click on a sentence plays its beat again. The box is as
   * tall as the tallest caption of the answer (the longest ones are set invisibly beside it), so it keeps its height from scene
   * to scene; beyond a few lines it scrolls.
   */
  private sentences(step: StepView): TemplateResult {
    const { presentation: p } = this.deps;
    const clock = p.clock;
    const playing = clock && !clock.done && clock.n === step.n ? clock.beat : -1;
    const longest = p.steps
      .filter((s) => s.n !== step.n)
      .sort((a, b) => b.caption.length - a.caption.length)
      .slice(0, 3);
    return html`<div class="watch-caption">
      <p
        class="watch-sentences"
        data-testid="watch-caption"
        data-playing=${playing}
        data-held=${p.held}
        aria-live="polite"
        aria-atomic="true"
      >
        ${step.beats.map((sentence, k) => {
          const state = playing < 0 || k < playing ? 'past' : k === playing ? 'now' : 'next';
          return html`<span
              class="watch-beat"
              data-testid="watch-beat"
              data-beat=${k}
              data-state=${state}
              title=${step.beats.length > 1 ? 'Bu cümleyi yeniden oynat' : nothing}
              >${inline(withoutOpenReference(sentence), this.known)}</span
            >${k < step.beats.length - 1 ? ' ' : nothing}`;
        })}
      </p>
      ${longest.map((s) => html`<p class="watch-ghost" aria-hidden="true">${plainText(withoutOpenReference(s.caption))}</p>`)}
    </div>`;
  }

  /* ------------------------------------------------------ a narration in steps */

  private captions(item: AssistantItem): TemplateResult {
    const { presentation: p, actions } = this.deps;
    const steps = p.steps;
    const i = Math.max(0, p.index);
    const step = steps[i] ?? steps[0]!;
    // an answer to a plain question is one step: nothing to step through, so none of the stepping controls
    const several = steps.length > 1;
    const writing = item.status === 'streaming' || item.status === 'waiting';
    const err = item.error ? this.error(item) : null;
    const more = !several && hasMore(step);
    return html`<section
      class=${clsx('watch', several ? 'watch-steps' : 'watch-single')}
      data-testid="watch"
      data-step=${step.n}
      data-steps=${steps.length}
      role="region"
      aria-roledescription="anlatım"
      aria-label="Anlatım: ${plainText(step.title) || (several ? `adım ${i + 1}` : 'yanıt')}"
      data-avoid
    >
      <div class="watch-head">
        ${
          several
            ? html`<div class="watch-nav">
                <button
                  type="button"
                  class="watch-btn watch-nav-btn"
                  data-testid="watch-prev"
                  aria-label="Önceki adım"
                  aria-keyshortcuts="ArrowLeft"
                  title="Önceki adım (←)"
                  ?disabled=${!p.hasPrev}
                  @click=${() => p.prev()}
                >
                  ${ICON.prev}
                </button>
                <span
                  class="watch-count"
                  data-testid="watch-count"
                  aria-label=${`${i + 1}. adım, toplam ${steps.length}`}
                >
                  ${i + 1} / ${steps.length}
                </span>
                <button
                  type="button"
                  class="watch-btn watch-nav-btn"
                  data-testid="watch-next"
                  aria-label="Sonraki adım"
                  aria-keyshortcuts="ArrowRight"
                  title="Sonraki adım (→)"
                  ?disabled=${!p.hasNext}
                  @click=${() => p.next()}
                >
                  ${ICON.next}
                </button>
              </div>`
            : nothing
        }
        ${step.title ? html`<h2 class="watch-title" data-testid="watch-title">${step.title}</h2>` : nothing}
        ${
          writing
            ? html`<span class="watch-wip" data-testid="watch-writing"
                ><span class="watch-wip-text">Metin yazılıyor</span
                ><i class="dots" aria-hidden="true"><b></b><b></b><b></b></i
              ></span>`
            : nothing
        }
        <div class="watch-tools">
          ${
            several
              ? html`<button
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
                  <button
                    type="button"
                    class="watch-btn watch-read"
                    data-testid="watch-read"
                    aria-label="Metni oku"
                    title="Metni oku"
                    @click=${() => actions.read()}
                  >
                    ${ICON.lines}<span>Metni oku</span>
                  </button>`
              : nothing
          }
          <button
            type="button"
            class="watch-btn"
            data-testid="watch-close"
            aria-label=${several ? 'Anlatımı kapat' : 'Yanıtı kapat'}
            title="Kapat: harita yeniden sizin"
            @click=${() => actions.close()}
          >
            ${ICON.close}
          </button>
        </div>
      </div>
      ${this.sentences(step)} ${this.legend(p.frame?.blocs ?? [], item.plan.hasSides())}
      ${
        several
          ? nothing
          : // The place of "Devamını oku" is kept from the first moment (it shows once the text has more than the caption):
            // the box must not grow after the camera has framed the scene above it.
            html`<p class=${clsx('watch-more', !more && 'is-reserved')}>
              <button type="button" class="link" data-testid="watch-more" @click=${() => actions.read()}>
                Devamını oku
              </button>
            </p>`
      }
      ${this.notesOf(item)}${err ?? nothing}${this.stoppedLine(item)}
    </section>`;
  }
}
