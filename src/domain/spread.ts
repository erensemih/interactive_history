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
