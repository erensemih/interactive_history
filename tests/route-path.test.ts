import { describe, expect, it } from 'vitest';
import { routePath } from '../src/map/aiLayer';

const HEAD_BACK = 9; // the stroke stops this far before the tip (see aiLayer.ts)
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('routePath: the curve of a route through its stops on the screen', () => {
  it('between two stops it is a gentle arc, bulging upward, that starts at the first and arrives at the second', () => {
    const a = { x: 100, y: 300 };
    const b = { x: 500, y: 300 };
    const r = routePath([a, b]);
    expect(r.d.startsWith('M100.0 300.0C')).toBe(true);
    expect(r.samples[0]).toEqual(a);
    expect(r.tip).toEqual(b);
    // the middle of the path is above the straight line (smaller y), by a fifth of the distance, not a straight line
    const middle = r.samples[Math.floor(r.samples.length / 2)]!;
    expect(300 - middle.y).toBeGreaterThan(30);
    expect(300 - middle.y).toBeLessThan(120);
    // it arrives heading east and a little down (an arc that bulged up comes back down)
    expect(r.angle).toBeGreaterThan(0);
    expect(r.angle).toBeLessThan(60);
  });

  it('the direction of arrival follows the way the route goes, which is how the arrowhead is turned', () => {
    const arriving = (a: [number, number], b: [number, number]) =>
      routePath([
        { x: a[0], y: a[1] },
        { x: b[0], y: b[1] },
        { x: b[0] + (b[0] - a[0]), y: b[1] + (b[1] - a[1]) },
      ]).angle;
    const east = arriving([0, 0], [100, 0]);
    expect(Math.abs(east)).toBeLessThan(10);
    expect(Math.abs(Math.abs(arriving([200, 0], [100, 0])) - 180)).toBeLessThan(10); // west
    expect(Math.abs(arriving([0, 0], [0, 100]) - 90)).toBeLessThan(10); // down the screen
    expect(Math.abs(arriving([0, 100], [0, 0]) + 90)).toBeLessThan(10); // up the screen
  });

  it('through more stops it is one smooth curve that passes every stop in order', () => {
    const stops = [
      { x: 50, y: 400 },
      { x: 200, y: 250 },
      { x: 380, y: 300 },
      { x: 520, y: 120 },
    ];
    const r = routePath(stops);
    expect(r.tip).toEqual(stops[3]);
    // an inner stop is exactly where a segment ends, so it is one of the samples; the order along the path is the order given
    let from = 0;
    for (const stop of stops.slice(0, 3)) {
      const at = r.samples.findIndex((p, i) => i >= from && dist(p, stop) < 0.01);
      expect(at, JSON.stringify(stop)).toBeGreaterThanOrEqual(from);
      from = at;
    }
    // one path, one move command
    expect(r.d.match(/M/g)).toHaveLength(1);
    expect(r.d.match(/C/g)).toHaveLength(3);
  });

  it('the stroke stops short of the tip, where the arrowhead begins, and never reaches past it', () => {
    const r = routePath([
      { x: 0, y: 0 },
      { x: 300, y: 0 },
      { x: 600, y: 100 },
    ]);
    const end = r.samples[r.samples.length - 1]!;
    expect(dist(end, r.tip)).toBeCloseTo(HEAD_BACK, 0);
    // a very short last stretch gives up at most half of itself
    const short = routePath([
      { x: 0, y: 0 },
      { x: 400, y: 0 },
      { x: 410, y: 0 },
    ]);
    const shortEnd = short.samples[short.samples.length - 1]!;
    expect(dist(shortEnd, short.tip)).toBeCloseTo(5, 0);
  });

  it('keeps the path from the first stop to the last in order, so a retreat and an advance are different drawings', () => {
    const a = { x: 100, y: 100 };
    const b = { x: 400, y: 250 };
    const forward = routePath([a, b]);
    const backward = routePath([b, a]);
    expect(forward.samples[0]).toEqual(a);
    expect(backward.samples[0]).toEqual(b);
    expect(forward.tip).toEqual(b);
    expect(backward.tip).toEqual(a);
    expect(forward.d).not.toBe(backward.d);
  });

  it('survives stops that are on top of one another (a zoom so far out that two places are one pixel)', () => {
    for (const pts of [
      [
        { x: 10, y: 10 },
        { x: 10.2, y: 10.1 },
      ],
      [
        { x: 10, y: 10 },
        { x: 10, y: 10 },
        { x: 300, y: 10 },
      ],
      [
        { x: 10, y: 10 },
        { x: 300, y: 10 },
        { x: 300, y: 10 },
      ],
    ]) {
      const r = routePath(pts);
      expect(r.d).not.toMatch(/NaN|Infinity/);
      expect(Number.isFinite(r.angle)).toBe(true);
      for (const p of r.samples) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
  });
});
