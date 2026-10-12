import type { Director } from './director';
import { isStepped, stepsOf, type StepView } from './narration';
import type { AiSession, AssistantItem } from './session';

/**
 * Two ways to follow an answer, over one shared position (the active step of the director):
 *  - Watch: the map stays the whole screen and the answer moves step by step, a short caption for each.
 *  - Read: the full text, as a side panel or full screen (with a small map in a corner).
 * Switching between them keeps the step. A single-part answer has no steps: its text is over the map in Watch.
 */
export type View = 'watch' | 'read';
export type ReadMode = 'side' | 'full';

export type SpeedId = 'slow' | 'normal' | 'fast';
export const SPEEDS: Record<SpeedId, { label: string; factor: number }> = {
  slow: { label: 'Yavaş', factor: 0.65 },
  normal: { label: 'Normal', factor: 1 },
  fast: { label: 'Hızlı', factor: 1.8 },
};
export const SPEED_IDS = Object.keys(SPEEDS) as SpeedId[];

/** How long a step stays when the narration plays by itself: time to read its caption (and for the map to arrive). */
export function dwellMs(caption: string, speed: SpeedId): number {
  const words = caption.trim().split(/\s+/).filter(Boolean).length;
  const reading = Math.min(16_000, Math.max(4_500, 2_200 + words * 360));
  return Math.round(reading / SPEEDS[speed].factor);
}

/**
 * What is on screen of the conversation, and how. It holds no text and draws nothing: it keeps the view, the
 * read mode and the autoplay, moves the director from step to step, and tells the page when any of it changes.
 */
export class Presentation {
  /** The answer is on screen (the watch caption or the reader). False before the first question and once it is closed. */
  shown = false;
  view: View = 'watch';
  readMode: ReadMode = 'side';
  playing = false;
  speed: SpeedId = 'normal';

  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerKey = '';
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly session: AiSession,
    private readonly director: Director,
  ) {
    director.subscribe(() => this.onChange());
    session.subscribe(() => {
      if (!session.items.some((i) => i.kind === 'assistant') && this.shown) this.hide();
      else this.onChange();
    });
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Something changed: keep the autoplay clock right, then tell the page. */
  private notify() {
    this.onChange();
    for (const fn of this.listeners) fn();
  }

  /* ----------------------------------------------------------- what is shown */

  /** The answer on screen: the one the director's active step belongs to. */
  get item(): AssistantItem | null {
    const ref = this.director.active;
    const found = ref ? this.session.find(ref.itemId) : undefined;
    return found?.kind === 'assistant' ? found : null;
  }

  get stepped(): boolean {
    const item = this.item;
    return !!item && isStepped(item);
  }

  get steps(): StepView[] {
    const item = this.item;
    return item ? stepsOf(item) : [];
  }

  /** Position of the active step among the steps (-1: no steps, or none active). */
  get index(): number {
    const n = this.director.active?.n;
    return n === undefined ? -1 : this.steps.findIndex((s) => s.n === n);
  }

  get step(): StepView | null {
    return this.steps[this.index] ?? null;
  }

  get hasPrev(): boolean {
    return this.index > 0;
  }

  get hasNext(): boolean {
    const i = this.index;
    return i >= 0 && i < this.steps.length - 1;
  }

  /** The AI is the map's narrator: an answer is on screen and has put something there. */
  get narrating(): boolean {
    return this.shown && this.director.active !== null;
  }

  /* ----------------------------------------------------------------- views */

  /** The reader asked something (or asked for a narration): the answer is on screen from now on, in the view they use. */
  show() {
    this.playing = false;
    this.shown = true;
    this.notify();
  }

  /** Closes the answer: the map is the reader's again. The conversation is still there to be opened. */
  hide() {
    this.shown = false;
    this.view = 'watch';
    this.playing = false;
    this.stopTimer();
    this.notify();
  }

  setView(view: View) {
    if (view === this.view && this.shown) return;
    this.view = view;
    this.shown = true;
    this.playing = false; // switching is the reader's doing: a narration that plays by itself waits for them
    this.notify();
  }

  /** Opens the full text (in the mode the reader used last, unless one is given). */
  openRead(mode: ReadMode = this.readMode) {
    this.readMode = mode;
    this.setView('read');
  }

  /** The reader is done reading: back to the map and its captions. */
  closeRead() {
    this.setView('watch');
  }

  setReadMode(mode: ReadMode) {
    if (mode === this.readMode) return;
    this.readMode = mode;
    this.notify();
  }

  /* ------------------------------------------------------------ navigation */

  /** Goes to a step by the reader's choice (a button, a key, a point on the timeline): the narration stops playing. */
  go(n: number) {
    const item = this.item;
    if (!item || !this.steps.some((s) => s.n === n)) return;
    this.playing = false;
    this.director.activate(item.id, n);
    this.notify();
  }

  next() {
    const to = this.steps[this.index + 1];
    if (to) this.go(to.n);
  }

  prev() {
    const to = this.steps[this.index - 1];
    if (to) this.go(to.n);
  }

  first() {
    const to = this.steps[0];
    if (to) this.go(to.n);
  }

  last() {
    const to = this.steps[this.steps.length - 1];
    if (to) this.go(to.n);
  }

  /* -------------------------------------------------------------- autoplay */

  play() {
    if (!this.stepped || this.view !== 'watch') return;
    // at the end, playing again means from the beginning
    if (!this.hasNext && this.steps.length) {
      const item = this.item!;
      this.director.activate(item.id, this.steps[0]!.n);
    }
    this.playing = true;
    this.notify();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.stopTimer();
    this.notify();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  setSpeed(speed: SpeedId) {
    if (speed === this.speed) return;
    this.speed = speed;
    this.timerKey = ''; // the wait is measured again at the new speed
    this.notify();
  }

  private stopTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.timerKey = '';
  }

  /** Keeps the autoplay clock right: one wait per (answer, step, speed), restarted when any of them changes. */
  private onChange() {
    if (!this.playing || !this.shown || this.view !== 'watch' || !this.stepped || this.index < 0) {
      this.stopTimer();
      return;
    }
    const step = this.step!;
    const key = `${this.item!.id}:${step.n}:${this.speed}`;
    if (key === this.timerKey && this.timer !== null) return;
    this.stopTimer();
    this.timerKey = key;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.advance();
      },
      dwellMs(step.caption, this.speed),
    );
  }

  private advance() {
    if (!this.playing) return;
    const to = this.steps[this.index + 1];
    if (!to) {
      this.playing = false; // the end: it stays on the last step
      this.stopTimer();
      this.notify();
      return;
    }
    this.director.activate(this.item!.id, to.n); // the director's change restarts the clock for the next step
    this.notify();
  }
}
