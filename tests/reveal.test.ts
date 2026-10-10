import { describe, expect, it } from 'vitest';
import { unionBounds, unionBoundsAll, zoomOutToReveal, zoomOutToRevealAll } from '../src/domain/reveal';

const view = { width: 1000, height: 600, margin: { top: 40, right: 60, bottom: 30, left: 30 }, avoid: [] };

describe('zoomOutToReveal', () => {
  it('does nothing for an event that is already in view', () => {
    expect(zoomOutToReveal({ ...view, dx: 120, dy: -80 })).toBe(0);
    expect(zoomOutToReveal({ ...view, dx: 0, dy: 0 })).toBe(0);
  });

  it('zooms out just far enough: every level halves the distance from the centre', () => {
    // 1500 px to the right of the centre; the usable half-width is 500 − 60 = 440 px.
    const levels = zoomOutToReveal({ ...view, dx: 1500, dy: 0 });
    expect(levels).toBeGreaterThan(Math.log2(1500 / 440) - 0.02);
    expect(levels).toBeLessThan(Math.log2(1500 / 440) + 0.05);
    // and one step less would not have been enough
    const k = 2 ** -(levels - 0.02);
    expect(500 + 1500 * k).toBeGreaterThan(view.width - view.margin.right);
  });

  it('considers the vertical margin too', () => {
    const levels = zoomOutToReveal({ ...view, dx: 0, dy: 900 });
    expect(levels).toBeGreaterThan(Math.log2(900 / (300 - 30)) - 0.02);
    expect(levels).toBeLessThan(Math.log2(900 / (300 - 30)) + 0.05);
  });

  it('keeps the event out from behind a control', () => {
    const control = { left: 880, top: 0, right: 1000, bottom: 200 }; // top-right corner
    const dx = 380; // lands at x = 880 when nothing changes, y = 60 → inside the control
    const dy = -240;
    expect(zoomOutToReveal({ ...view, dx, dy, avoid: [] })).toBe(0);
    const levels = zoomOutToReveal({ ...view, dx, dy, avoid: [control] });
    expect(levels).toBeGreaterThan(0);
    const k = 2 ** -levels;
    const x = 500 + dx * k;
    const y = 300 + dy * k;
    expect(x >= control.left && x <= control.right && y >= control.top && y <= control.bottom).toBe(false);
  });

  it('gives up (Infinity) when no zoom-out helps, so the caller can fall back to fitting both', () => {
    expect(zoomOutToReveal({ ...view, dx: 1e9, dy: 0 }, 3)).toBe(Infinity);
    expect(zoomOutToReveal({ ...view, dx: Number.NaN, dy: 0 })).toBe(Infinity);
    // a control covering the whole map can never be avoided
    expect(
      zoomOutToReveal({ ...view, dx: 1, dy: 1, avoid: [{ left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 }] }),
    ).toBe(Infinity);
  });
});

describe('unionBounds', () => {
  it('grows a view to take in a point and leaves it alone when the point is inside', () => {
    expect(unionBounds([10, 20, 30, 40], { lon: 50, lat: 45 })).toEqual([10, 20, 50, 45]);
    expect(unionBounds([10, 20, 30, 40], { lon: -5, lat: 0 })).toEqual([-5, 0, 30, 40]);
    expect(unionBounds([10, 20, 30, 40], { lon: 20, lat: 30 })).toEqual([10, 20, 30, 40]);
  });
});

describe('zoomOutToRevealAll', () => {
  it('is the farthest of the points: all of them must end up in view', () => {
    const near = { dx: 120, dy: -80 };
    const far = { dx: 1500, dy: 0 };
    const farOnly = zoomOutToReveal({ ...view, ...far });
    expect(zoomOutToRevealAll({ ...view, offsets: [near] })).toBe(0);
    expect(zoomOutToRevealAll({ ...view, offsets: [near, far] })).toBeCloseTo(farOnly, 5);
    expect(zoomOutToRevealAll({ ...view, offsets: [far, near] })).toBeCloseTo(farOnly, 5);
  });

  it('points on opposite sides need no more than the farther one', () => {
    const levels = zoomOutToRevealAll({
      ...view,
      offsets: [
        { dx: 1500, dy: 0 },
        { dx: -1500, dy: 0 },
      ],
    });
    expect(levels).toBeGreaterThan(Math.log2(1500 / 440) - 0.02);
    expect(levels).toBeLessThan(Math.log2(1500 / 440) + 0.1);
  });

  it('gives up when any one point cannot be brought in, and with nothing to show asks for nothing', () => {
    expect(
      zoomOutToRevealAll({
        ...view,
        offsets: [
          { dx: 10, dy: 10 },
          { dx: Number.NaN, dy: 0 },
        ],
      }),
    ).toBe(Infinity);
    expect(zoomOutToRevealAll({ ...view, offsets: [] })).toBe(0);
  });
});

describe('unionBoundsAll', () => {
  it('grows a view to hold every point', () => {
    expect(
      unionBoundsAll(
        [10, 20, 30, 40],
        [
          { lon: 50, lat: 45 },
          { lon: -5, lat: 0 },
        ],
      ),
    ).toEqual([-5, 0, 50, 45]);
    expect(unionBoundsAll([10, 20, 30, 40], [])).toEqual([10, 20, 30, 40]);
  });
});
