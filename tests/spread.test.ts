import { describe, expect, it } from 'vitest';
import { spreadPoints } from '../src/domain/spread';

const gaps = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i]!);

describe('spreadPoints', () => {
  it('leaves points that are far enough apart exactly where they want to be', () => {
    expect(spreadPoints([40, 120, 300], 22, 10, 400)).toEqual([40, 120, 300]);
  });

  it('spreads a crowd about its middle, keeping the order and a gap of at least the pitch', () => {
    const out = spreadPoints([100, 103, 106, 109], 22, 10, 400);
    for (const g of gaps(out)) expect(g).toBeGreaterThanOrEqual(22 - 1e-9);
    expect(out[0]).toBeLessThan(100); // the crowd opens both ways, not only to the right
    expect(out[3]).toBeGreaterThan(109);
    expect((out[0]! + out[3]!) / 2).toBeCloseTo(104.5, 5); // about where the years put it
  });

  it('keeps a spread crowd inside the track at either end', () => {
    const left = spreadPoints([10, 11, 12], 22, 10, 400);
    expect(left[0]).toBe(10);
    expect(gaps(left)).toEqual([22, 22]);
    const right = spreadPoints([398, 399, 400], 22, 10, 400);
    expect(right[2]).toBe(400);
    expect(gaps(right)).toEqual([22, 22]);
  });

  it('never moves a point past one that was after it, and shrinks the gap when the line has no room', () => {
    const out = spreadPoints([5, 6, 7, 8, 9], 22, 0, 40);
    for (const g of gaps(out)) expect(g).toBeCloseTo(10, 5); // 40 px for five points
    expect(out[0]).toBe(0);
    expect(out[4]).toBe(40);
  });

  it('handles nothing and one point', () => {
    expect(spreadPoints([], 22, 0, 100)).toEqual([]);
    expect(spreadPoints([50], 22, 0, 100)).toEqual([50]);
    expect(spreadPoints([-5], 22, 0, 100)).toEqual([0]);
  });
});
