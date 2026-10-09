/** Greedy label lane assignment for the place timeline. Pure, so it can be unit tested. */

export interface LaneItem {
  id: string;
  /** Left edge of the label box in px. */
  x: number;
  /** Width of the label box in px. */
  width: number;
  /** Higher priority items claim lanes first (importance). */
  priority: number;
}

/**
 * Returns lane index (0 = closest to the axis) per id, or null when the label does not fit in any
 * of `maxLanes` lanes (the node is still drawn, just without a text label).
 */
export function assignLanes(items: LaneItem[], maxLanes: number, gap = 10): Map<string, number | null> {
  const lanes: Array<Array<[number, number]>> = Array.from({ length: maxLanes }, () => []);
  const out = new Map<string, number | null>();
  const order = [...items].sort((a, b) => b.priority - a.priority || a.x - b.x || (a.id < b.id ? -1 : 1));
  for (const item of order) {
    let placed: number | null = null;
    for (let l = 0; l < maxLanes && placed === null; l++) {
      const clash = lanes[l]!.some(([s, e]) => item.x < e + gap && s < item.x + item.width + gap);
      if (!clash) {
        lanes[l]!.push([item.x, item.x + item.width]);
        placed = l;
      }
    }
    out.set(item.id, placed);
  }
  return out;
}
