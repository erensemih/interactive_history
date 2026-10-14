import type { Director } from './director';
import { isStepped, stepsOf, type StepView } from './narration';
import type { AiSession, AssistantItem } from './session';
import type { Frame, SceneClock } from './types';

/**
 * Two ways to follow an answer, over one shared position (the active scene of the director):
 *  - Watch: the map stays the whole screen and the answer moves scene by scene, a short caption for each, and within a scene
 *    sentence by sentence (the beats).
 *  - Read: the full text, as a side panel or full screen (with a small map in a corner), where every scene is shown as it ends.
 * Switching between them keeps the scene. A single-part answer has no scenes to step through: its text is over the map in Watch.
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

/** How long a sentence of a caption is on screen when the narration plays: time to read it, at the speed the reader chose. */
export function beatMs(sentence: string, speed: SpeedId): number {
  const words = sentence.trim().split(/\s+/).filter(Boolean).length;
  const reading = Math.min(11_000, Math.max(2_400, 1_100 + words * 330));
  return Math.round(reading / SPEEDS[speed].factor);
}

/** The first beat of a scene waits a little longer than its sentence needs: the camera is on its way there. */
export const LEAD_MS = 900;

/** How long a scene stays as it ended before the next one begins, when the narration plays by itself. */
export function lingerMs(speed: SpeedId): number {
  return Math.round(1_600 / SPEEDS[speed].factor);
}

/**
 * Decides when a beat is over. It is handed the sentence that plays and calls `done` when the next beat is due; the function it
 * returns cancels the wait. The default reads at a pace set by the length of the sentence; a voice that speaks the caption would
 * call `done` when it has finished the sentence instead.
 */
export type Pacer = (sentence: string, speed: SpeedId, lead: number, done: () => void) => () => void;

export const readingPace: Pacer = (sentence, speed, lead, done) => {
  const timer = setTimeout(done, beatMs(sentence, speed) + Math.round(lead / SPEEDS[speed].factor));
  return () => clearTimeout(timer);
};

/**
 * What is on screen of the conversation, and how. It holds no text and draws nothing: it keeps the view, the read mode and the
 * autoplay, moves the director from beat to beat and from scene to scene, and tells the page when any of it changes.
 *
 * The beats of a scene play by themselves, at reading pace, whatever the autoplay says; the autoplay ("Oynat") decides what
 * happens when a scene has ended: with it on the next scene begins, without it the end state waits for the reader. "Sonraki"
 * and "Önceki" work in two stages, like the box of a game dialogue: while a scene plays "Sonraki" shows how it ends and a
 * second press goes to the next scene; "Önceki" goes back to the start of the scene and a second press to the scene before
 * (as it ended). A sentence of the caption that is clicked plays its beat again and holds there. In the reader scenes are
 * shown as they end: nothing plays there.
 */
export class Presentation {
  /** The answer is on screen (the watch caption or the reader). False before the first question and once it is closed. */
  shown = false;
  view: View = 'watch';
  readMode: ReadMode = 'side';
  playing = false;
  speed: SpeedId = 'normal';

  private stopWait: (() => void) | null = null;
  private waitKey = '';
  /** The scene the reader has stopped at, looking at a beat of their choice: nothing moves on until they ask. */
  private heldScene: string | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly session: AiSession,
    private readonly director: Director,
    private readonly pacer: Pacer = readingPace,
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

  /** Something changed: keep the clock right, then tell the page. */
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

  /** Where the scene on screen is in its beats (null: no scene). */
  get clock(): SceneClock | null {
    return this.director.clock;
  }

  /** What the scene on screen shows at this moment of its beats (null: no scene). */
  get frame(): Frame | null {
    return this.director.frame;
  }

  /** The beat that plays (0-based; the last one once the scene has ended). */
  get beat(): number {
    return this.director.clock?.beat ?? 0;
  }

  /** The scene on screen has ended: every beat has played and the map shows what they left behind. */
  get done(): boolean {
    return this.director.clock?.done ?? false;
  }

  /** The reader stopped at a beat of their choice (a click on its sentence): the narration waits for them. */
  get held(): boolean {
    const ref = this.director.active;
    return !!ref && this.heldScene === `${ref.itemId}:${ref.n}`;
  }

  /** "Önceki" has something to go back to: the start of the scene, once it has moved on, else the scene before. */
  get hasPrev(): boolean {
    const clock = this.director.clock;
    return this.index > 0 || (!!clock && (clock.beat > 0 || clock.done));
  }

  /** "Sonraki" has something to go on to: the end of the scene while it plays, then the scene after. */
  get hasNext(): boolean {
    const i = this.index;
    if (i < 0) return false;
    return !this.done || i < this.steps.length - 1;
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
    this.heldScene = null;
    this.stopTimer();
    this.notify();
  }

  setView(view: View) {
    if (view === this.view && this.shown) return;
    this.view = view;
    this.shown = true;
    this.playing = false; // switching is the reader's doing: a narration that plays by itself waits for them
    this.heldScene = null;
    if (view === 'read') this.director.complete(); // the reader reads: scenes are shown as they end
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

  /**
   * Goes to a scene by the reader's choice (a button, a key, a point on the timeline, a heading in the text): its beats begin
   * (in the reader it is shown as it ends, or when `done` is asked for) and the narration stops playing by itself.
   */
  go(n: number, opts: { done?: boolean } = {}) {
    const item = this.item;
    if (!item || !this.steps.some((s) => s.n === n)) return;
    this.playing = false;
    this.heldScene = null;
    this.director.activate(item.id, n, { done: opts.done ?? (this.shown && this.view === 'read') });
    this.notify();
  }

  /** The reader's "Sonraki": while the scene plays, how it ends; once it has ended, the next scene. */
  next() {
    if (!this.hasNext) return;
    if (!this.done) {
      this.complete();
      return;
    }
    const to = this.steps[this.index + 1];
    if (to) this.go(to.n);
  }

  /** The reader's "Önceki": once the scene has moved on, its start; at its start, the scene before as it ended. */
  prev() {
    const clock = this.director.clock;
    if (!clock) return;
    if (clock.beat > 0 || clock.done) {
      this.playing = false;
      this.heldScene = null;
      this.director.restart();
      this.notify();
      return;
    }
    const to = this.steps[this.index - 1];
    if (to) this.go(to.n, { done: true });
  }

  /** The scene on screen ends here, whatever beat it was on: the map shows what the beats left behind. */
  complete() {
    this.playing = false;
    this.heldScene = null;
    this.director.complete();
    this.notify();
  }

  /** A sentence of the caption was clicked: its beat plays again and the narration waits there. */
  replayBeat(beat: number) {
    const ref = this.director.active;
    if (!ref || !this.shown || this.view !== 'watch') return;
    this.playing = false;
    this.heldScene = `${ref.itemId}:${ref.n}`;
    this.director.setBeat(beat, true);
    this.notify();
  }

  first() {
    const to = this.steps[0];
    if (to) this.go(to.n);
  }

  /** The last scene, as it ends. */
  last() {
    const to = this.steps[this.steps.length - 1];
    if (to) this.go(to.n, { done: true });
  }

  /* -------------------------------------------------------------- autoplay */

  /** Autoplay on: when a scene has ended the next one begins by itself. Where the narration is held or has ended for good, it goes on from there. */
  play() {
    if (!this.item || this.view !== 'watch') return;
    this.heldScene = null;
    // at the end, playing again means from the beginning
    if (this.done && !this.hasNext && this.steps.length) {
      this.director.activate(this.item.id, this.steps[0]!.n);
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
    this.waitKey = ''; // the wait is measured again at the new speed
    this.notify();
  }

  private stopTimer() {
    this.stopWait?.();
    this.stopWait = null;
    this.waitKey = '';
  }

  /** Keeps the clock right: one wait per (answer, scene, beat, replay, speed), restarted when any of them changes. */
  private onChange() {
    const clock = this.director.clock;
    const item = this.item;
    if (!this.shown || !clock || !item) return this.stopTimer();
    if (this.view === 'read') {
      this.stopTimer();
      if (!clock.done) this.director.complete(); // (the reader never plays a scene: the map shows how it ends)
      return;
    }
    const step = this.step;
    if (!step) return this.stopTimer();
    if (!clock.done) {
      if (this.held) return this.stopTimer();
      const sentence = step.beats[clock.beat] ?? '';
      const key = `${item.id}:${clock.n}:${clock.beat}:${clock.replay}:${this.speed}:${sentence.length}`;
      if (key === this.waitKey && this.stopWait) return;
      this.stopTimer();
      this.waitKey = key;
      this.stopWait = this.pacer(sentence, this.speed, clock.beat === 0 ? LEAD_MS : 0, () => {
        this.stopWait = null;
        this.advanceBeat();
      });
      return;
    }
    // the scene has ended: it waits for the reader, or, when the narration plays by itself, for a moment
    if (!this.playing) return this.stopTimer();
    const key = `${item.id}:${clock.n}:ended:${clock.replay}:${this.speed}`;
    if (key === this.waitKey && this.stopWait) return;
    this.stopTimer();
    this.waitKey = key;
    const timer = setTimeout(() => {
      this.stopWait = null;
      this.advanceScene();
    }, lingerMs(this.speed));
    this.stopWait = () => clearTimeout(timer);
  }

  private advanceBeat() {
    const clock = this.director.clock;
    if (!clock || clock.done) return;
    if (clock.beat + 1 < this.director.beatCount) this.director.setBeat(clock.beat + 1);
    else this.director.complete();
    this.notify();
  }

  private advanceScene() {
    if (!this.playing) return;
    const to = this.steps[this.index + 1];
    if (!to) {
      this.playing = false; // the end: it stays on the last scene
      this.stopTimer();
      this.notify();
      return;
    }
    this.director.activate(this.item!.id, to.n); // the director's change restarts the clock for the next scene
    this.notify();
  }
}
