/**
 * Where points go on a line when each wants a place of its own but none may sit closer to the next than `gap`:
 * every point as near its wanted place as it can be (least squared movement, found by pooling adjacent points that
 * crowd one another), kept inside [lo, hi]. The input must be in the order the points are to keep. When the line has
 * no room for all of them at `gap`, the gap shrinks to what fits.
 */
export function spreadPoints(wanted: readonly number[], gap: number, lo: number, hi: number): number[] {
  const n = wanted.length;
  if (!n) return [];
  const g = n > 1 ? Math.min(gap, Math.max(0, (hi - lo) / (n - 1))) : gap;
  // x_i = y_i + i·g with y non-decreasing: the best y is the isotonic fit of wanted_i − i·g
  const blocks: { sum: number; count: number }[] = [];
  wanted.forEach((p, i) => {
    blocks.push({ sum: p - i * g, count: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1]!;
      const a = blocks[blocks.length - 2]!;
      if (a.sum / a.count <= b.sum / b.count) break;
      blocks.splice(blocks.length - 2, 2, { sum: a.sum + b.sum, count: a.count + b.count });
    }
  });
  const y: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.count; k++) y.push(b.sum / b.count);
  const first = lo;
  const last = Math.max(lo, hi - (n - 1) * g);
  return y.map((v, i) => Math.min(Math.max(v, first), last) + i * g);
}

/** The size of a numbered point when there is room for it (px), the least it shrinks to, and the room it asks for (centre to centre) then. */
export const STEP_MAX = 15;
export const STEP_MIN = 7;
export const STEP_PITCH = 22;

export interface StepPoints {
  /** Where each point stands (px), in the order given. */
  xs: number[];
  /** The size of a point (px). */
  size: number;
  /** The size of the point that is on screen: bigger than the others, whatever they shrank to. */
  onSize: number;
}

/**
 * Where the points of a progress bar stand when each wants a place (`wanted`, px, left to right) but all must stay between
 * `left` and `right` (the selected range on the ruler: a few years of it are a few tens of pixels). A point stands as near its
 * wanted place as can be, so the bar still reads as a timeline: the points are as small as they must be to leave room to
 * follow their dates (each has about twice its size to itself, between `STEP_MIN` and `STEP_MAX`), then kept just apart
 * (`STEP_PITCH` for the full size, a pixel more than their size for smaller ones). Where even that does not fit the points
 * crowd one another, but none leaves the span: a point keeps its whole body inside it.
 */
export function placeStepPoints(wanted: readonly number[], left: number, right: number): StepPoints {
  const n = wanted.length;
  const room = n ? (right - left) / (2 * n) : STEP_MAX;
  const size = Math.round(Math.min(STEP_MAX, Math.max(STEP_MIN, room)));
  const lo = left + size / 2;
  const hi = Math.max(lo, right - size / 2);
  const xs = spreadPoints(
    wanted.map((x) => Math.min(hi, Math.max(lo, x))),
    size >= STEP_MAX ? STEP_PITCH : size + 1,
    lo,
    hi,
  );
  return { xs, size, onSize: Math.max(STEP_MAX, Math.round(size * 1.3)) };
}
