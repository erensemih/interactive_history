/** Row assignment for the dots of the place timeline. Pure, so it can be unit tested. */

export interface DotItem {
  id: string;
  /** Horizontal centre of the dot in px. */
  x: number;
}

/**
 * Stacks dots that would touch into rows (0 = the row nearest the axis). Dots are placed from left to
 * right, each into the first row whose previous dot is at least `spacing` px away. When every row is
 * crowded the dot goes to the row whose last dot is farthest away, so it overlaps as little as it can:
 * every event stays drawn at its true date and stays reachable, whatever the density.
 */
export function stackDots(items: DotItem[], rows: number, spacing: number): Map<string, number> {
  const lastX: number[] = new Array(Math.max(1, rows)).fill(-Infinity);
  const out = new Map<string, number>();
  const order = [...items].sort((a, b) => a.x - b.x || (a.id < b.id ? -1 : 1));
  for (const item of order) {
    let row = lastX.findIndex((x) => item.x - x >= spacing);
    if (row === -1) {
      row = 0;
      for (let r = 1; r < lastX.length; r++) if (lastX[r]! < lastX[row]!) row = r;
    }
    lastX[row] = item.x;
    out.set(item.id, row);
  }
  return out;
}
