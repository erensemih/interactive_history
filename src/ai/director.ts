import type { AssistantItem, AiSession } from './session';
import { parseAnswer } from './steps';
import type { Drawing, FocusTarget } from './types';

export interface ActiveStep {
  itemId: string;
  n: number;
}

export interface DirectorHooks {
  /** The camera should bring these into view (smoothly, as little as it takes). Only called while following. */
  focus(target: FocusTarget): void;
}

/**
 * Turns the conversation into what the map shows: the step the reader is on has a drawing, and moving
 * to another step (by reading on, by going back, by pointing at it) swaps the drawing for that step's.
 *
 * The rules that keep the map the reader's own:
 *  - Drawings never move the camera. Only a step's `focus` may, and only while `following` is on; the
 *    first time the reader drags, zooms or pans the map themselves, it goes off and stays off until
 *    they switch it back on.
 *  - The year the AI asks for is an overlay on the reader's own cursor: if they move the cursor or the
 *    range themselves, the AI's year steps aside until the next step is activated.
 *  - An answer without any map action leaves the map as it is.
 */
export class Director {
  private ref: ActiveStep | null = null;
  private current: Drawing | null = null;
  private follow = true;
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

  /** What the AI has drawn on the map now (null: nothing, or nothing since the chat was cleared). */
  get drawing(): Drawing | null {
    return this.current;
  }

  /** The border year the AI asks for, or null when it asks for none or the reader has taken the cursor. */
  get year(): number | null {
    return !this.yearReleased && this.current?.year !== undefined ? this.current.year : null;
  }

  get following(): boolean {
    return this.follow;
  }

  setFollowing(on: boolean) {
    if (on === this.follow) return;
    this.follow = on;
    if (on) this.refocus();
    this.notify();
  }

  /**
   * The reader dragged, zoomed or panned the map while a narration is on screen: from now on the AI keeps its
   * hands off the camera. Moving the map before there is any step to follow is just using the map.
   */
  userMovedCamera() {
    if (!this.follow || !this.ref) return;
    this.follow = false;
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
    this.seenVersion = item.plan.version;
    if (!item.plan.empty) this.current = item.plan.drawingAt(n);
    const focus = item.plan.focusAt(n);
    if (focus && this.follow) this.hooks.focus(focus);
    this.notify();
  }

  /** The conversation was cleared: nothing is drawn any more. */
  reset() {
    this.ref = null;
    this.current = null;
    this.follow = true; // a new conversation starts with the camera following again
    this.autoFor = null;
    this.yearReleased = false;
    this.seenVersion = -1;
    this.notify();
  }

  private refocus() {
    if (!this.ref) return;
    const item = this.session.find(this.ref.itemId);
    const focus = item?.kind === 'assistant' ? item.plan.focusAt(this.ref.n) : null;
    if (focus) this.hooks.focus(focus);
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
        this.notify();
      }
    }
  }
}
