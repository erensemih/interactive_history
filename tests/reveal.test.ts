import { describe, expect, it } from 'vitest';
import {
  panToRevealAll,
  revealMove,
  zoomOutToReveal,
  zoomOutToRevealAll,
  type Rect,
  type RevealMove,
  type RevealMoveInput,
} from '../src/domain/reveal';
import { mercator, projectWith } from '../src/domain/camera';

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

/* ------------------------------------------------------------------ when zooming out is not enough */

type Offsets = { dx: number; dy: number }[];
type Free = Omit<RevealMoveInput, 'offsets' | 'zoom' | 'minZoom' | 'limits'>;

/** The small window of the full-screen reader (338 × 234 on a 1440 × 900 page) with the margins the app keeps clear. */
const corner: Free = { width: 338, height: 234, margin: { top: 44, right: 60, bottom: 36, left: 36 }, avoid: [] };
/** El Alamein in that window at the map's lowest zoom (map pixels 20.3, 232.3), as an offset from the middle. */
const elAlamein: Offsets = [{ dx: 20.3 - 169, dy: 232.3 - 117 }];
/** The map's limits (±179.9° and −60°…82°) in pixels of that window at that zoom, as the real map projects them. */
const cornerLimits: Rect = { left: -616.4, top: -133.5, right: 480.5, bottom: 561.2 };

/** Where points stand after a move: the centre has moved by the pan, and the map is at the new zoom. */
function after(offsets: Offsets, zoom: number, move: RevealMove): Offsets {
  const k = 2 ** (move.zoom - zoom);
  return offsets.map(({ dx, dy }) => ({ dx: (dx - move.pan.x) * k, dy: (dy - move.pan.y) * k }));
}
const isClear = (input: Free, offsets: Offsets) => zoomOutToRevealAll({ ...input, offsets }, 0) === 0;

describe('panToRevealAll', () => {
  it('moves nothing when the points are clear already, or there is nothing to show', () => {
    expect(panToRevealAll({ ...corner, offsets: [{ dx: 0, dy: 0 }] })).toEqual({ x: 0, y: 0 });
    expect(panToRevealAll({ ...corner, offsets: [{ dx: 100, dy: -50 }] })).toEqual({ x: 0, y: 0 });
    // on the very line of a margin is clear too
    expect(panToRevealAll({ ...corner, offsets: [{ dx: 36 - 169, dy: 198 - 117 }] })).toEqual({ x: 0, y: 0 });
    expect(panToRevealAll({ ...corner, offsets: [] })).toEqual({ x: 0, y: 0 });
    expect(panToRevealAll({ ...corner, offsets: [{ dx: Number.NaN, dy: 0 }] })).toEqual({ x: 0, y: 0 });
  });

  it('moves along the axis that falls short, to just inside the margin, and not at all along the other', () => {
    // 30 px beyond the left margin (x = 6, the margin is at 36): the centre goes west by that and the 2 px kept inside
    const left = panToRevealAll({ ...corner, offsets: [{ dx: 6 - 169, dy: 0 }] });
    expect(left.x).toBeCloseTo(6 - 38, 9);
    expect(left.y).toBe(0);
    // 40 px below the bottom margin (y = 238 against 198)
    const below = panToRevealAll({ ...corner, offsets: [{ dx: 0, dy: 238 - 117 }] });
    expect(below.x).toBe(0);
    expect(below.y).toBeCloseTo(238 - 196, 9);
  });

  it('brings El Alamein into the corner map the short way: west and south, a few tens of pixels', () => {
    const pan = panToRevealAll({ ...corner, offsets: elAlamein });
    expect(pan.x).toBeCloseTo(20.3 - 38, 9);
    expect(pan.y).toBeCloseTo(232.3 - 196, 9);
    expect(Math.hypot(pan.x, pan.y)).toBeLessThan(45);
    expect(isClear(corner, after(elAlamein, 1, { zoom: 1, pan }))).toBe(true);
  });

  it('puts a point inside the margins wherever it was, moving no more than the margin box is away (plus the 2 px kept in)', () => {
    const { width, height, margin } = corner;
    for (let x = -900; x <= 1300; x += 97) {
      for (let y = -700; y <= 900; y += 83) {
        const offsets = [{ dx: x - width / 2, dy: y - height / 2 }];
        const pan = panToRevealAll({ ...corner, offsets });
        expect(isClear(corner, after(offsets, 1, { zoom: 1, pan }))).toBe(true);
        const gx = Math.max(margin.left - x, 0, x - (width - margin.right));
        const gy = Math.max(margin.top - y, 0, y - (height - margin.bottom));
        expect(Math.hypot(pan.x, pan.y)).toBeLessThanOrEqual(Math.hypot(gx, gy) + 2 * Math.SQRT2 + 1e-9);
        // and it asks nothing again
        const there = after(offsets, 1, { zoom: 1, pan });
        expect(panToRevealAll({ ...corner, offsets: there })).toEqual({ x: 0, y: 0 });
      }
    }
  });

  it('goes round a control by the shorter way out', () => {
    const control: Rect = { left: 880, top: 0, right: 1000, bottom: 200 }; // top-right corner of a 1000 × 600 map
    const offsets = [{ dx: 940 - 500, dy: 100 - 300 }]; // under the control, nearer its left edge than its foot
    const pan = panToRevealAll({ ...view, avoid: [control], offsets });
    expect(pan.x).toBeCloseTo(940 - 878, 9); // out of its left side, 2 px clear of it
    expect(pan.y).toBeCloseTo(0, 9);
    expect(isClear({ ...view, avoid: [control] }, after(offsets, 1, { zoom: 1, pan }))).toBe(true);
    // the same point in the same place of a map where the control is taller: the foot is farther, still the left
    const tall = { ...control, bottom: 580 };
    expect(panToRevealAll({ ...view, avoid: [tall], offsets }).x).toBeCloseTo(940 - 878, 9);
  });

  it('with controls covering all of the free area only the margins count', () => {
    const all: Rect = { left: -1e6, top: -1e6, right: 1e6, bottom: 1e6 };
    const offsets = [{ dx: 2000, dy: 0 }];
    const pan = panToRevealAll({ ...view, avoid: [all], offsets });
    expect(pan).toEqual(panToRevealAll({ ...view, offsets }));
    expect(pan.x).toBeGreaterThan(0);
  });

  it('is the shortest move that works, even with several controls (checked against a search of every whole-pixel move)', () => {
    const map = { width: 400, height: 300, margin: { top: 20, right: 20, bottom: 20, left: 20 } };
    const cases: { avoid: Rect[]; at: [number, number][] }[] = [
      {
        avoid: [{ left: 150, top: -10, right: 250, bottom: 310 }],
        at: [
          [230, 150],
          [160, 60],
          [-60, 100],
          [420, 300],
        ],
      },
      {
        avoid: [
          { left: 0, top: 0, right: 140, bottom: 110 },
          { left: 260, top: 190, right: 400, bottom: 300 },
        ],
        at: [
          [60, 50],
          [330, 240],
          [10, 280],
          [390, 20],
          [-80, -80],
        ],
      },
      {
        avoid: [
          { left: 100, top: 80, right: 300, bottom: 220 },
          { left: 0, top: 130, right: 400, bottom: 170 },
        ],
        at: [
          [200, 150],
          [120, 100],
          [290, 210],
          [200, 40],
        ],
      },
    ];
    for (const { avoid, at } of cases) {
      for (const [x, y] of at) {
        const input = { ...map, avoid };
        const offsets = [{ dx: x - 200, dy: y - 150 }];
        const pan = panToRevealAll({ ...input, offsets });
        expect(isClear(input, after(offsets, 1, { zoom: 1, pan }))).toBe(true);
        let best = Infinity;
        for (let tx = -330; tx <= 330; tx++) {
          for (let ty = -330; ty <= 330; ty++) {
            const len = Math.hypot(tx, ty);
            if (len >= best) continue;
            if (isClear(input, [{ dx: offsets[0].dx - tx, dy: offsets[0].dy - ty }])) best = len;
          }
        }
        // the search finds the true shortest to within a pixel; ours keeps 2 px in from the edges
        expect(Math.hypot(pan.x, pan.y)).toBeLessThanOrEqual(best + 2 * Math.SQRT2 + 1e-9);
        expect(Math.hypot(pan.x, pan.y)).toBeGreaterThanOrEqual(best - 1.5);
      }
    }
  });

  it('keeps within the range the centre may move in, and takes the exit that range allows', () => {
    const offsets = [{ dx: -100 - 169, dy: 0 }]; // 100 px beyond the left edge of the corner map
    const free = panToRevealAll({ ...corner, offsets });
    expect(free.x).toBeCloseTo(-100 - 38 + 0, 9);
    const reach: Rect = { left: -30, right: 500, top: -500, bottom: 500 };
    expect(panToRevealAll({ ...corner, offsets }, reach)).toEqual({ x: -30, y: 0 }); // as near as the range goes
    // a strip across the middle splits the free area in two; the nearer side is out of reach, so the other is taken
    const map = { width: 400, height: 300, margin: { top: 20, right: 20, bottom: 20, left: 20 } };
    const strip: Rect = { left: 190, top: -10, right: 210, bottom: 310 };
    const at = [{ dx: 205 - 200, dy: 0 }];
    expect(panToRevealAll({ ...map, avoid: [strip], offsets: at }).x).toBeCloseTo(205 - 212, 9); // east exit, 7 px
    const west = panToRevealAll(
      { ...map, avoid: [strip], offsets: at },
      { left: -5, right: 100, top: -50, bottom: 50 },
    );
    expect(west.x).toBeCloseTo(205 - 188, 9); // west exit, 17 px, since the east one needs more than the range gives
    // an inverted range (the view is larger than the limits) closes up to its middle
    expect(panToRevealAll({ ...corner, offsets }, { left: 10, right: -10, top: 0, bottom: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('brings in all the points when one move does it, else the first ones', () => {
    const a = { dx: 8 - 169, dy: 0 }; // 28 px short of the left margin
    const b = { dx: 60 - 169, dy: 0 };
    const both = panToRevealAll({ ...corner, offsets: [a, b] });
    expect(both.x).toBeCloseTo(8 - 38, 9); // enough for the first, which also leaves the second inside
    expect(isClear(corner, after([a, b], 1, { zoom: 1, pan: both }))).toBe(true);
    // 300 px apart: the margin box is 242 wide, so both cannot be in; the one named first is
    const far = { dx: 300 - 169, dy: 0 };
    const pan = panToRevealAll({ ...corner, offsets: [a, far] });
    expect(isClear(corner, after([a], 1, { zoom: 1, pan: pan }))).toBe(true);
    expect(isClear(corner, after([far], 1, { zoom: 1, pan: pan }))).toBe(false);
    const flipped = panToRevealAll({ ...corner, offsets: [far, a] });
    expect(isClear(corner, after([far], 1, { zoom: 1, pan: flipped }))).toBe(true);
  });
});

describe('revealMove', () => {
  const big = { ...view, zoom: 5, minZoom: 1.1 };

  it('does nothing for an event that is in view already: opening it again never moves the map', () => {
    expect(revealMove({ ...big, offsets: [{ dx: 120, dy: -80 }] })).toBeNull();
    expect(revealMove({ ...big, offsets: [{ dx: 0, dy: 0 }] })).toBeNull();
    expect(
      revealMove({ ...corner, zoom: 1.1, minZoom: 1.1, limits: cornerLimits, offsets: [{ dx: 10, dy: 10 }] }),
    ).toBeNull();
    // nothing to show, or something that cannot be placed
    expect(revealMove({ ...big, offsets: [] })).toBeNull();
    expect(revealMove({ ...big, offsets: [{ dx: Number.NaN, dy: 0 }] })).toBeNull();
  });

  it('on a map that can zoom out far enough it is the plain zoom-out, with a little to spare, and nothing pans', () => {
    for (const offsets of [
      [{ dx: 1500, dy: 0 }],
      [{ dx: 0, dy: 900 }],
      [{ dx: -1200, dy: -700 }],
      [{ dx: 3, dy: 1100 }],
    ]) {
      const levels = zoomOutToRevealAll({ ...view, offsets });
      const move = revealMove({ ...big, offsets });
      expect(move).not.toBeNull();
      expect(move!.zoom).toBeCloseTo(5 - levels - 0.05, 12);
      expect(move!.pan).toEqual({ x: 0, y: 0 });
    }
    // with a control in the way, and with limits that leave room to zoom out
    const control: Rect = { left: 880, top: 0, right: 1000, bottom: 200 };
    const offsets = [{ dx: 380, dy: -240 }];
    const limits: Rect = { left: -4000, top: -3000, right: 4000, bottom: 3000 };
    const move = revealMove({ ...big, avoid: [control], offsets, limits });
    expect(move!.zoom).toBeCloseTo(5 - zoomOutToRevealAll({ ...view, avoid: [control], offsets }) - 0.05, 12);
    expect(move!.pan).toEqual({ x: 0, y: 0 });
  });

  it('a small map at its lowest zoom (El Alamein in the full-screen reader): the centre moves west and south, the zoom stays', () => {
    const move = revealMove({ ...corner, zoom: 1.1, minZoom: 1.1, limits: cornerLimits, offsets: elAlamein });
    expect(move).not.toBeNull();
    expect(move!.zoom).toBe(1.1);
    expect(move!.pan.x).toBeCloseTo(20.3 - 38, 9);
    expect(move!.pan.y).toBeCloseTo(232.3 - 196, 9);
    // the event ends up inside the margins (36…278, 44…198 on this map)
    const [there] = after(elAlamein, 1.1, move!);
    expect(169 + there.dx).toBeGreaterThanOrEqual(36);
    expect(169 + there.dx).toBeLessThanOrEqual(338 - 60);
    expect(117 + there.dy).toBeGreaterThanOrEqual(44);
    expect(117 + there.dy).toBeLessThanOrEqual(234 - 36);
  });

  it('asking again once it has moved changes nothing (the old fallback drifted east on every click)', () => {
    const first = revealMove({ ...corner, zoom: 1.1, minZoom: 1.1, limits: cornerLimits, offsets: elAlamein })!;
    const there = after(elAlamein, 1.1, first);
    // the map's limits are as many pixels from the centre as before, less the move
    const limits: Rect = {
      left: cornerLimits.left - first.pan.x,
      right: cornerLimits.right - first.pan.x,
      top: cornerLimits.top - first.pan.y,
      bottom: cornerLimits.bottom - first.pan.y,
    };
    expect(revealMove({ ...corner, zoom: 1.1, minZoom: 1.1, limits, offsets: there })).toBeNull();
  });

  it('a small map above its lowest zoom goes as wide as it can, then moves the centre for the rest', () => {
    // at 1.3 the lowest is 1.1: 0.2 levels, not the ~0.5 this point needs
    const offsets = [{ dx: (20.3 - 169) * 1.15, dy: (232.3 - 117) * 1.15 }];
    const needed = zoomOutToRevealAll({ ...corner, offsets });
    expect(needed).toBeGreaterThan(0.25);
    const move = revealMove({ ...corner, zoom: 1.3, minZoom: 1.1, offsets })!;
    expect(move.zoom).toBeCloseTo(1.1, 12);
    expect(Math.hypot(move.pan.x, move.pan.y)).toBeGreaterThan(0);
    expect(isClear(corner, after(offsets, 1.3, move))).toBe(true);
    // and from there nothing more is asked
    const limits = undefined;
    expect(
      revealMove({ ...corner, zoom: move.zoom, minZoom: 1.1, limits, offsets: after(offsets, 1.3, move) }),
    ).toBeNull();
  });

  it("never goes wider than the map's limits allow: they fill the view at a higher zoom than the lowest one given", () => {
    // a tall window (900 px) at zoom 1.6, the limits 982.5 px tall at that zoom: they fill the view at 1.6 + log2(900 / 982.5)
    const tall: Free = { width: 1440, height: 900, margin: { top: 44, right: 60, bottom: 36, left: 36 }, avoid: [] };
    const limits: Rect = { left: -2000, right: 2000, top: -41.25, bottom: 941.25 }; // 982.5 tall, centred on the view
    const fills = 1.6 + Math.log2(900 / 982.5);
    expect(fills).toBeGreaterThan(1.1);
    const offsets = [{ dx: 1500, dy: 400 }]; // far beyond the right edge: more than a zoom-out to the lowest zoom would show
    const move = revealMove({ ...tall, zoom: 1.6, minZoom: 1.1, limits, offsets })!;
    expect(move.zoom).toBeCloseTo(fills, 9);
    // the limits are as tall as the view there: the centre cannot move up or down at all
    expect(move.pan.y).toBeCloseTo(0, 6);
  });

  it('stays within the limits when it moves the centre', () => {
    // the same corner map, but the limits end 10 px west of its edge: the centre cannot go further west than that
    const limits: Rect = { ...cornerLimits, left: -10 };
    const move = revealMove({ ...corner, zoom: 1.1, minZoom: 1.1, limits, offsets: elAlamein })!;
    expect(move.pan.x).toBeCloseTo(-10, 9);
    expect(move.pan.y).toBeCloseTo(232.3 - 196, 9); // the other axis is free to do all it needs
  });

  it('with a control over the middle, where zooming out cannot help, the zoom stays and the centre moves', () => {
    const middle: Rect = { left: 400, top: 200, right: 600, bottom: 400 };
    const input = { ...view, avoid: [middle], zoom: 4, minZoom: 1.1 };
    const offsets = [{ dx: 0, dy: 0 }];
    expect(zoomOutToRevealAll({ ...input, offsets })).toBe(Infinity);
    const move = revealMove({ ...input, offsets })!;
    expect(move.zoom).toBe(4);
    expect(Math.hypot(move.pan.x, move.pan.y)).toBeCloseTo(102, 9); // 100 to the edge of the control and 2 clear of it
    expect(isClear({ ...view, avoid: [middle] }, after(offsets, 4, move))).toBe(true);
  });

  it('copes with a map so small that the margins would not fit in it', () => {
    const tiny = { width: 90, height: 60, margin: { top: 44, right: 60, bottom: 36, left: 36 }, avoid: [] };
    const offsets = [{ dx: 400, dy: -300 }];
    const move = revealMove({ ...tiny, zoom: 1.1, minZoom: 1.1, offsets })!;
    expect(move).not.toBeNull();
    const [there] = after(offsets, 1.1, move);
    expect(45 + there.dx).toBeGreaterThan(0);
    expect(45 + there.dx).toBeLessThan(90);
    expect(30 + there.dy).toBeGreaterThan(0);
    expect(30 + there.dy).toBeLessThan(60);
  });
});

describe('revealMove on the real camera', () => {
  const size = { width: 338, height: 234 };
  const unmercator = (x: number, y: number) => ({
    lng: x * 360 - 180,
    lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  });
  const limitsOf = (c: { lng: number; lat: number; zoom: number }): Rect => {
    const nw = projectWith(c, size, -179.9, 82);
    const se = projectWith(c, size, 179.9, -60);
    return { left: nw.x, top: nw.y, right: se.x, bottom: se.y };
  };

  it('El Alamein from the camera of the report: it comes into the corner map once, then the camera stays put', () => {
    let cam = { lng: 77.73, lat: 57.3, zoom: 1.1 };
    const start = cam;
    const moves: (RevealMove | null)[] = [];
    for (let i = 0; i < 5; i++) {
      const p = projectWith(cam, size, 28.95, 30.83);
      const move = revealMove({
        ...corner,
        zoom: cam.zoom,
        minZoom: 1.1,
        limits: limitsOf(cam),
        offsets: [{ dx: p.x - size.width / 2, dy: p.y - size.height / 2 }],
      });
      moves.push(move);
      if (move) {
        const world = 512 * 2 ** cam.zoom;
        const c = mercator(cam.lng, cam.lat);
        cam = { ...unmercator(c.x + move.pan.x / world, c.y + move.pan.y / world), zoom: move.zoom };
      }
    }
    expect(moves[0]).not.toBeNull();
    expect(moves.slice(1)).toEqual([null, null, null, null]);
    expect(cam.zoom).toBe(1.1);
    // the centre went west and south (the old fallback sent it ~7° east and north on every click)
    expect(cam.lng).toBeLessThan(start.lng);
    expect(cam.lat).toBeLessThan(start.lat);
    expect(start.lng - cam.lng).toBeLessThan(8);
    const there = projectWith(cam, size, 28.95, 30.83);
    expect(there.x).toBeGreaterThanOrEqual(36);
    expect(there.x).toBeLessThanOrEqual(338 - 60);
    expect(there.y).toBeGreaterThanOrEqual(44);
    expect(there.y).toBeLessThanOrEqual(234 - 36);
  });
});
