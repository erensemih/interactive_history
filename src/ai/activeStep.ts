/** One step of the chat as it sits in the scroll area (positions in the same coordinate system as the view). */
export interface StepBox {
  key: string;
  top: number;
  bottom: number;
}

export interface ViewBox {
  top: number;
  bottom: number;
  /** Where the reader's eye is, as a fraction of the view's height from its top. */
  line?: number;
  /** The scroll area is at its very end: a short last step may never reach the reading line. */
  atEnd?: boolean;
}

/**
 * Which step the reader is on. The reading line sits a little above the middle of the view: the step that
 * contains it is active; between two steps it is the one just above; before the first step starts it is the
 * first one that is on screen. At the very end of the scroll the last step on screen wins, because a short
 * final step could otherwise never become active. Null when no step is on screen.
 */
export function pickActive(steps: readonly StepBox[], view: ViewBox): string | null {
  const visible = steps.filter((s) => s.bottom > view.top && s.top < view.bottom);
  if (!visible.length) return null;
  if (view.atEnd) return visible[visible.length - 1]!.key;
  const y = view.top + (view.bottom - view.top) * (view.line ?? 0.38);
  let active: StepBox | null = null;
  for (const s of steps) {
    if (s.top <= y) active = s;
    else break;
  }
  // Above the first step, or the step just above the line scrolled out of view: the first one in sight.
  if (!active || active.bottom <= view.top) return visible[0]!.key;
  return active.key;
}
