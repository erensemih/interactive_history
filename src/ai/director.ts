import { isEmptyDrawing } from './drawing';
import type { AssistantItem, AiSession } from './session';
import { parseAnswer } from './steps';
import type { Drawing, Frame, SceneClock } from './types';

export interface ActiveStep {
  itemId: string;
  n: number;
}

/**
 * Tool calls of one round arrive within a few milliseconds of each other and each one changes the step on
 * screen; the camera is moved once, after they have all been heard, instead of once per call.
 */
export const FRAME_SETTLE_MS = 90;

export interface DirectorHooks {
  /**
   * The scene's drawing should be brought into view (smoothly, by whatever pan and zoom it takes): everything the scene will
   * show, once, as it begins. Called only while the camera follows; the page decides whether the drawing is already framed well
   * enough.
   */
  frame(drawing: Drawing): void;
}

/** Where a scene's beats are: the beat that plays, whether the scene has ended, and how often a beat was played again. */
interface Playhead {
  beat: number;
  done: boolean;
  replay: number;
}

/**
 * Turns the conversation into what the map shows: the scene the reader is on owns the map, and moving to another scene (by
 * reading on, by going back, by pointing at it) swaps its drawing for that scene's. Within a scene the map follows its beats,
 * the sentences of its caption (`clock`, `frame`); the director only keeps the place, `Presentation` decides when it moves on.
 *
 * The rules that keep the map the reader's own:
 *  - Drawings never move the camera by themselves. While "Harita takibi" is on, the page brings each scene's
 *    drawing into view once, when the scene becomes the active one: the camera is steady while its beats play. Small movements
 *    of the map by the reader do not turn it off; after a substantial one (the page measures it) the reader is asked, once and
 *    quietly, whether the camera should be released. Only their answer, or the setting, turns it off.
 *  - The year the AI asks for is an overlay on the reader's own cursor: if they move the cursor or the
 *    range themselves, the AI's year steps aside until the next scene is activated.
 *  - An answer without any map action leaves the map as it is.
 */
export class Director {
  private ref: ActiveStep | null = null;
  private current: Drawing | null = null;
  private playhead: Playhead = { beat: 0, done: false, replay: 0 };
  private framed: { key: string; frame: Frame } | null = null;
  private follow = true;
  /** The small question "release the camera?" is on screen. */
  private asking = false;
  /** The reader answered "keep following": the question is not asked again in this conversation. */
  private keepAnswered = false;
  /** The reader has moved the map since the active step was framed: a late drawing change must not take it back. */
  private touched = false;
  private yearReleased = false;
  private seenVersion = -1;
  /** The answer whose first words have already moved the director to its first step. */
  private autoFor: string | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly session: AiSession,
    private readonly hooks: DirectorHooks,
  ) {
    session.subscribe(() => this.onSession());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  get active(): ActiveStep | null {
    return this.ref;
  }

  /** What the scene on screen shows on the map, all its beats together (null: nothing, or nothing since the chat was cleared). */
  get drawing(): Drawing | null {
    return this.current;
  }

  private get item(): AssistantItem | null {
    const found = this.ref ? this.session.find(this.ref.itemId) : undefined;
    return found?.kind === 'assistant' ? found : null;
  }

  /** The beats of the scene on screen (at least one). */
  get beatCount(): number {
    const item = this.item;
    return item && this.ref ? item.plan.beatsOf(this.ref.n).length : 1;
  }

  /** Where the scene on screen is: the beat that plays (0-based), whether it has ended, how often a beat was replayed. */
  get clock(): SceneClock | null {
    if (!this.ref) return null;
    const last = this.beatCount - 1;
    const { done, replay } = this.playhead;
    // a scene that has ended is on its last beat
    return { n: this.ref.n, beat: done ? last : Math.min(this.playhead.beat, last), done, replay };
  }

  /** What the scene shows at this moment of its beats (null: no scene). */
  get frame(): Frame | null {
    const item = this.item;
    const clock = this.clock;
    if (!item || !clock) return null;
    const key = `${item.id}|${item.plan.version}|${clock.n}|${clock.beat}|${clock.done}|${clock.replay}`;
    if (this.framed?.key !== key) this.framed = { key, frame: item.plan.frameAt(clock) };
    return this.framed.frame;
  }

  /**
   * The border years the scene on screen shows over all its beats (the one it starts at and the one its changes of borders take it
   * to); none when it asks for none or the reader has taken the cursor. The camera frames the scene in all of them.
   */
  get sceneYears(): number[] {
    const item = this.item;
    if (this.yearReleased || !item || !this.ref) return [];
    const years = [this.current?.year, item.plan.endYearOf(this.ref.n)].filter((y): y is number => y !== undefined);
    return [...new Set(years)];
  }

  /** The border year the AI asks for now, or null when it asks for none or the reader has taken the cursor. */
  get year(): number | null {
    if (this.yearReleased) return null;
    return this.frame?.year ?? null;
  }

  /** "Harita takibi": does the camera bring each step's drawing into view? */
  get following(): boolean {
    return this.follow;
  }

  /** Is the question "release the camera?" waiting for an answer? */
  get askingToRelease(): boolean {
    return this.asking;
  }

  setFollowing(on: boolean) {
    if (on === this.follow && !this.asking) return;
    this.follow = on;
    this.asking = false;
    this.cancelFrame();
    if (on) this.frameActive();
    this.notify();
  }

  /**
   * The reader moved the map (a drag, the wheel, +/−, the keys) and it has come to rest. `far` says whether it
   * was a substantial move; only then is the reader asked. Moving the map before there is any step to
   * follow is just using the map.
   */
  userMovedCamera(far: boolean) {
    if (!this.ref || !this.follow) return;
    this.touched = true;
    if (!far || this.keepAnswered || this.asking) return;
    this.asking = true;
    this.notify();
  }

  /** The reader answered the question with "keep following": no more questions in this conversation. */
  keepFollowing() {
    if (!this.asking && this.keepAnswered) return;
    this.asking = false;
    this.keepAnswered = true;
    this.notify();
  }

  /** The question went unanswered for a while: it goes away without deciding anything. */
  dismissQuestion() {
    if (!this.asking) return;
    this.asking = false;
    this.notify();
  }

  /** The reader moved the year cursor or the range: their year wins until the AI shows another scene. */
  userChangedTime() {
    if (this.yearReleased || this.frame?.year === undefined) return;
    this.yearReleased = true;
    this.notify();
  }

  /**
   * Makes a scene the active one: by reading on, by going back, or by pointing at it. Its beats begin (or, with `done`, it is shown
   * as it ends: where the reader reads instead of watches). Asking for the scene that is already active starts it again.
   */
  activate(itemId: string, n: number, opts: { done?: boolean } = {}) {
    const changed = this.begin(itemId, n, opts.done ?? false);
    if (!changed) return;
    this.cancelFrame();
    this.frameActive();
    this.notify();
  }

  /** Switches to the scene without moving the camera; false when nothing changed (it is no answer, or the same scene in the same place). */
  private begin(itemId: string, n: number, done: boolean): boolean {
    const item = this.session.find(itemId);
    if (item?.kind !== 'assistant') return false;
    const same = this.ref?.itemId === itemId && this.ref.n === n;
    if (same && done && this.playhead.done) return false; // already shown as it ends
    if (same && !done && !this.playhead.done && this.playhead.beat === 0 && this.playhead.replay === 0) return false; // already at its start
    this.ref = { itemId, n };
    this.playhead = { beat: 0, done, replay: same ? this.playhead.replay + 1 : 0 };
    this.yearReleased = false;
    this.touched = false;
    this.asking = false;
    this.seenVersion = item.plan.version;
    if (!item.plan.empty) this.current = item.plan.drawingAt(n);
    return true;
  }

  /** The scene plays from its first beat again (or is shown as it ends); the camera frames it again. */
  restart(done = false) {
    if (!this.ref) return;
    this.begin(this.ref.itemId, this.ref.n, done);
    this.cancelFrame();
    this.frameActive();
    this.notify();
  }

  /** Beat `beat` plays (0-based). With `replay` the beat starts again even if it is the one that plays: its arrows draw themselves anew. */
  setBeat(beat: number, replay = false) {
    if (!this.ref) return;
    const next: Playhead = {
      beat: Math.min(Math.max(0, beat), this.beatCount - 1),
      done: false,
      replay: this.playhead.replay + (replay ? 1 : 0),
    };
    if (next.beat === this.playhead.beat && !this.playhead.done && next.replay === this.playhead.replay) return;
    this.playhead = next;
    this.notify();
  }

  /** The scene ends here: every beat has played, and the map shows what they left behind. */
  complete() {
    if (!this.ref || this.playhead.done) return;
    this.playhead = { ...this.playhead, done: true };
    this.notify();
  }

  /** The conversation was cleared: nothing is drawn any more. */
  reset() {
    this.cancelFrame();
    this.ref = null;
    this.current = null;
    this.playhead = { beat: 0, done: false, replay: 0 };
    this.framed = null;
    this.follow = true; // a new conversation starts with the camera following again
    this.asking = false;
    this.keepAnswered = false;
    this.touched = false;
    this.autoFor = null;
    this.yearReleased = false;
    this.seenVersion = -1;
    this.notify();
  }

  /** Brings the active scene's drawing into view, if the camera follows and the scene drew anything. */
  private frameActive() {
    if (!this.follow || !this.ref || !this.current || isEmptyDrawing(this.current)) return;
    this.hooks.frame(this.current);
  }

  /** The same, once the plan has stopped changing for a moment (a round of tool calls has all arrived). */
  private frameSoon() {
    this.cancelFrame();
    this.frameTimer = setTimeout(() => {
      this.frameTimer = null;
      if (!this.touched) this.frameActive();
    }, FRAME_SETTLE_MS);
  }

  private cancelFrame() {
    if (this.frameTimer !== null) clearTimeout(this.frameTimer);
    this.frameTimer = null;
  }

  private onSession() {
    if (this.ref && !this.session.find(this.ref.itemId)) return this.reset();

    // An answer that has something to show moves the director to its first step, once: as soon as the plan is in
    // (the tool round, with the captions and the scenes, comes before the long texts) or the text has begun. After
    // that the reader's choices (stepping, scrolling) decide.
    const latest = [...this.session.items].reverse().find((i): i is AssistantItem => i.kind === 'assistant');
    if (latest && latest.id !== this.autoFor && (latest.text.trim() || !latest.plan.empty)) {
      this.autoFor = latest.id;
      const first = parseAnswer(latest.text).sections[0]?.n ?? latest.plan.numbers()[0] ?? 1;
      if (this.begin(latest.id, first, false)) {
        this.frameSoon();
        this.notify();
      }
      return;
    }

    // Tool calls that arrive while the active step is on screen change what it shows.
    if (this.ref) {
      const item = this.session.find(this.ref.itemId);
      if (item?.kind === 'assistant' && item.plan.version !== this.seenVersion) {
        this.seenVersion = item.plan.version;
        this.current = item.plan.drawingAt(this.ref.n);
        if (!this.touched) this.frameSoon();
        this.notify();
      }
    }
  }
}
