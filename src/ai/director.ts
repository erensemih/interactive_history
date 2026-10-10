import { isEmptyDrawing } from './drawing';
import type { AssistantItem, AiSession } from './session';
import { parseAnswer } from './steps';
import type { Drawing } from './types';

export interface ActiveStep {
  itemId: string;
  n: number;
}

export interface DirectorHooks {
  /**
   * The step's drawing should be brought into view (smoothly, by whatever pan and zoom it takes). Called only
   * while the camera follows; the page decides whether the drawing is already framed well enough.
   */
  frame(drawing: Drawing): void;
}

/**
 * Turns the conversation into what the map shows: the step the reader is on owns the map, and moving to
 * another step (by reading on, by going back, by pointing at it) swaps its drawing for that step's.
 *
 * The rules that keep the map the reader's own:
 *  - Drawings never move the camera by themselves. While "Harita takibi" is on, the page brings each step's
 *    drawing into view when the step becomes the active one. Small movements of the map by the reader do
 *    not turn it off; after a substantial one (the page measures it) the reader is asked, once and
 *    quietly, whether the camera should be released. Only their answer, or the setting, turns it off.
 *  - The year the AI asks for is an overlay on the reader's own cursor: if they move the cursor or the
 *    range themselves, the AI's year steps aside until the next step is activated.
 *  - An answer without any map action leaves the map as it is.
 */
export class Director {
  private ref: ActiveStep | null = null;
  private current: Drawing | null = null;
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

  /** What the AI shows on the map now (null: nothing, or nothing since the chat was cleared). */
  get drawing(): Drawing | null {
    return this.current;
  }

  /** The border year the AI asks for, or null when it asks for none or the reader has taken the cursor. */
  get year(): number | null {
    return !this.yearReleased && this.current?.year !== undefined ? this.current.year : null;
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

  /** The reader moved the year cursor or the range: their year wins until the AI shows another step. */
  userChangedTime() {
    if (this.yearReleased || this.current?.year === undefined) return;
    this.yearReleased = true;
    this.notify();
  }

  /** Makes a step the active one: by reading on, by going back, or by pointing at it. */
  activate(itemId: string, n: number) {
    if (this.ref?.itemId === itemId && this.ref.n === n) return;
    const item = this.session.find(itemId);
    if (item?.kind !== 'assistant') return;
    this.ref = { itemId, n };
    this.yearReleased = false;
    this.touched = false;
    this.asking = false;
    this.seenVersion = item.plan.version;
    if (!item.plan.empty) this.current = item.plan.drawingAt(n);
    this.frameActive();
    this.notify();
  }

  /** The conversation was cleared: nothing is drawn any more. */
  reset() {
    this.ref = null;
    this.current = null;
    this.follow = true; // a new conversation starts with the camera following again
    this.asking = false;
    this.keepAnswered = false;
    this.touched = false;
    this.autoFor = null;
    this.yearReleased = false;
    this.seenVersion = -1;
    this.notify();
  }

  /** Brings the active step's drawing into view, if the camera follows and the step drew anything. */
  private frameActive() {
    if (!this.follow || !this.ref || !this.current || isEmptyDrawing(this.current)) return;
    this.hooks.frame(this.current);
  }

  private onSession() {
    if (this.ref && !this.session.find(this.ref.itemId)) return this.reset();

    // An answer that has started to write moves the director to its first step, once. After that the
    // reader's scrolling decides.
    const latest = [...this.session.items].reverse().find((i): i is AssistantItem => i.kind === 'assistant');
    if (latest && latest.id !== this.autoFor && latest.text.trim()) {
      this.autoFor = latest.id;
      const first = parseAnswer(latest.text).sections[0]?.n ?? 1;
      this.activate(latest.id, first);
      return;
    }

    // Tool calls that arrive while the active step is on screen change what it shows.
    if (this.ref) {
      const item = this.session.find(this.ref.itemId);
      if (item?.kind === 'assistant' && item.plan.version !== this.seenVersion) {
        this.seenVersion = item.plan.version;
        this.current = item.plan.drawingAt(this.ref.n);
        if (!this.touched) this.frameActive();
        this.notify();
      }
    }
  }
}
