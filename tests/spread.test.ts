import { describe, expect, it } from 'vitest';
import { placeStepPoints, spreadPoints, STEP_MAX, STEP_MIN, STEP_PITCH } from '../src/domain/spread';

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

describe('placeStepPoints (the steps of a narration on the ruler, inside the selected range)', () => {
  const inside = (r: ReturnType<typeof placeStepPoints>, left: number, right: number) =>
    r.xs.every((x) => x - r.size / 2 >= left - 1e-9 && x + r.size / 2 <= right + 1e-9);

  it('puts points where their dates are when there is room, full size and far enough apart', () => {
    const r = placeStepPoints([30, 120, 300, 520], 0, 600);
    expect(r.xs).toEqual([30, 120, 300, 520].map((x) => Math.max(x, r.size / 2)));
    expect(r.size).toBe(STEP_MAX);
    expect(r.onSize).toBeGreaterThan(r.size);
  });

  it('a range of a few years is a few tens of pixels: eight steps stay inside it, in order, on smaller points', () => {
    // the 1939–1945 range on a ruler of 200 years over 1100 px: about 40 px, with the steps of a narration all in it
    const wanted = [8, 14, 15, 24, 29, 30, 36, 40];
    const r = placeStepPoints(wanted, 0, 40);
    expect(inside(r, 0, 40)).toBe(true);
    expect(r.xs).toEqual([...r.xs].sort((a, b) => a - b));
    expect(r.size).toBeLessThan(STEP_MAX);
    expect(r.size).toBeGreaterThanOrEqual(STEP_MIN);
    expect(r.onSize).toBeGreaterThanOrEqual(STEP_MAX); // the one on screen always has room for its number
  });

  it('never lets a point stand outside the range, whatever date it wants', () => {
    const r = placeStepPoints([-300, 0, 50, 900], 100, 180);
    expect(inside(r, 100, 180)).toBe(true);
    expect(Math.min(...r.xs)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...r.xs)).toBeLessThanOrEqual(180);
  });

  it('keeps the points just apart and spreads a crowd about its dates; smaller points when the range is short', () => {
    const wide = placeStepPoints([100, 104, 108], 0, 400);
    expect(wide.size).toBe(STEP_MAX);
    expect(Math.min(...gaps(wide.xs))).toBeGreaterThanOrEqual(STEP_PITCH - 1e-9);
    const tight = placeStepPoints([10, 20, 30, 40, 50], 0, 60);
    expect(tight.size).toBeLessThan(STEP_MAX);
    expect(tight.size).toBeGreaterThanOrEqual(STEP_MIN);
    expect(Math.min(...gaps(tight.xs))).toBeGreaterThanOrEqual(tight.size + 1 - 1e-9); // just not touching
  });

  it('a longer range with the steps all in its last years: the points stay near their dates, not spread over the whole range', () => {
    // 1931–1945 on a ruler of 200 years over 1100 px is about 90 px; the eight steps are dated 1939–1945, the right-hand part of it
    const wanted = [52, 56, 57, 63, 70, 72, 83, 88];
    const r = placeStepPoints(wanted, 0, 91);
    expect(inside(r, 0, 91)).toBe(true);
    expect(r.xs).toEqual([...r.xs].sort((a, b) => a - b));
    const shifts = r.xs.map((x, i) => Math.abs(x - wanted[i]!));
    expect(Math.max(...shifts)).toBeLessThanOrEqual(24); // (evenly over the whole range, the first would be 48 px from its date)
    expect(r.xs[0]).toBeGreaterThan(30);
  });

  it('survives a range too small for its points (one year) and nothing at all', () => {
    const one = placeStepPoints([2, 3, 4], 0, 5.5);
    expect(one.size).toBe(STEP_MIN);
    expect(new Set(one.xs).size).toBe(1); // all on top of one another, but all in the range
    expect(one.xs[0]).toBeGreaterThanOrEqual(0);
    expect(placeStepPoints([], 0, 100).xs).toEqual([]);
  });
});
