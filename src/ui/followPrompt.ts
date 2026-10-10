import { html, nothing, render } from 'lit-html';
import type { Director } from '../ai/director';

/** How long the question waits unanswered before it quietly goes away (it comes back only after another far move). */
const ASK_MS = 20_000;
/** How long "Harita takibi kapatıldı" stays after the reader let the camera go. */
const SAID_MS = 7_000;
/** A pointer or the keyboard on the card holds it; this is how long it waits to look again. */
const HOLD_MS = 5_000;

type Shown = 'none' | 'asking' | 'released';

/**
 * The small question over the map, shown after the reader has moved the map a long way while the camera was
 * following the narration: "should the steps stop following the map?". It is not a dialog: it takes no
 * focus, covers a corner of the map for a while, goes away by itself, and asks only once in a conversation
 * if the answer is "keep following". It also says where the setting lives, so the reader learns they can
 * change it there without ever being asked again.
 */
export class FollowPrompt {
  private shown: Shown = 'none';
  private timer = 0;

  constructor(
    private readonly host: HTMLElement,
    private readonly deps: { director: Director; openSettings(): void },
  ) {
    host.classList.add('follow-host');
    host.setAttribute('role', 'status');
    host.setAttribute('aria-live', 'polite');
    this.draw();
  }

  /** Called whenever the director changes, and with every render of the page (`chatOpen`: the chat is on screen). */
  update(chatOpen = true) {
    const { director } = this.deps;
    if (!chatOpen) {
      // The question belongs to the chat: with the chat closed it goes away, deciding nothing.
      if (director.askingToRelease) director.dismissQuestion();
      if (this.shown !== 'none') this.show('none');
      return;
    }
    if (director.askingToRelease) {
      this.show('asking', ASK_MS, () => director.dismissQuestion());
    } else if (this.shown === 'asking') {
      // answered or gone: if the reader let the camera go, say so once, with where to get it back
      if (director.following) this.show('none');
      else this.show('released', SAID_MS, () => this.show('none'));
    } else if (this.shown === 'released' && director.following) {
      this.show('none');
    }
  }

  private show(next: Shown, ms = 0, then: () => void = () => undefined) {
    if (next === this.shown && next === 'asking' && this.timer) return; // already asking: the clock keeps running
    window.clearTimeout(this.timer);
    this.timer = 0;
    this.shown = next;
    this.draw();
    if (!ms) return;
    const wait = (delay: number) => {
      this.timer = window.setTimeout(() => {
        // the reader is reading it: give them more time
        if (this.host.matches(':hover, :focus-within')) wait(HOLD_MS);
        else then();
      }, delay);
    };
    wait(ms);
  }

  private draw() {
    const { director, openSettings } = this.deps;
    const where = html`<button type="button" class="link" data-testid="follow-settings" @click=${openSettings}>
      Ayarlar ⚙ → Harita takibi
    </button>`;
    render(
      this.shown === 'asking'
        ? html`<div class="follow-card" data-testid="follow-prompt">
            <p class="follow-q"><b>Haritayı kendiniz gezdiniz.</b> Adımlar haritayı izlemeyi bıraksın mı?</p>
            <div class="follow-row">
              <button
                type="button"
                class="follow-btn"
                data-testid="follow-release"
                @click=${() => director.setFollowing(false)}
              >
                Bıraksın
              </button>
              <button
                type="button"
                class="follow-btn is-quiet"
                data-testid="follow-keep"
                @click=${() => director.keepFollowing()}
              >
                İzlemeye devam
              </button>
              <span class="follow-hint">${where}</span>
            </div>
          </div>`
        : this.shown === 'released'
          ? html`<div class="follow-card is-said" data-testid="follow-released">
              <p class="follow-q">
                <b>Harita takibi kapatıldı.</b>
                <button
                  type="button"
                  class="link"
                  data-testid="follow-undo"
                  @click=${() => director.setFollowing(true)}
                >
                  Geri aç
                </button>
              </p>
              <p class="follow-hint is-alone">Her zaman: ${where}</p>
            </div>`
          : nothing,
      this.host,
    );
  }
}
