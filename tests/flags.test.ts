import { describe, expect, it } from 'vitest';
import { placeFlags, type FlagRequest } from '../src/map/flags';

const size = { width: 800, height: 500 };
const flag = (id: string, x: number, y: number, patch: Partial<FlagRequest> = {}): FlagRequest => ({
  id,
  x,
  y,
  w: 90,
  h: 22,
  prefer: ['right', 'left', 'above', 'below'],
  gap: 11,
  ...patch,
});
const rect = (p: { left: number; top: number }, w = 90, h = 22) => ({
  left: p.left,
  top: p.top,
  right: p.left + w,
  bottom: p.top + h,
});
const overlaps = (a: ReturnType<typeof rect>, b: ReturnType<typeof rect>) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe('placeFlags', () => {
  it('puts a label on its preferred side', () => {
    const [p] = placeFlags([flag('a', 300, 200)], size);
    expect(p).toMatchObject({ side: 'right', left: 311, top: 189 });
  });

  it('moves to the other side near the edge of the map', () => {
    const [p] = placeFlags([flag('a', 780, 200)], size);
    expect(p!.side).toBe('left');
    expect(p!.left + 90).toBeLessThanOrEqual(796);
  });

  it('hangs below when above is out of the map, and above when below is', () => {
    const [top] = placeFlags([flag('a', 400, 10, { prefer: ['above', 'below'] })], size);
    expect(top!.side).toBe('below');
    const [bottom] = placeFlags([flag('a', 400, 495, { prefer: ['below', 'above'] })], size);
    expect(bottom!.side).toBe('above');
  });

  it('keeps labels of nearby points from sitting on one another; the earlier one keeps its place', () => {
    const placed = placeFlags([flag('a', 300, 200), flag('b', 310, 205), flag('c', 305, 210)], size);
    expect(placed[0]!.side).toBe('right');
    for (let i = 0; i < placed.length; i++)
      for (let j = i + 1; j < placed.length; j++) expect(overlaps(rect(placed[i]!), rect(placed[j]!))).toBe(false);
  });

  it('avoids obstacles', () => {
    const obstacle = { left: 305, top: 150, right: 500, bottom: 250 };
    const [p] = placeFlags([flag('a', 300, 200)], size, [obstacle]);
    expect(overlaps(rect(p!), obstacle)).toBe(false);
  });

  it('when nothing is free it still stays inside the map', () => {
    const crowd = Array.from({ length: 12 }, (_, i) => flag(`f${i}`, 400 + (i % 3), 250 + (i % 4)));
    for (const p of placeFlags(crowd, size)) {
      expect(p.left).toBeGreaterThanOrEqual(4);
      expect(p.top).toBeGreaterThanOrEqual(4);
      expect(p.left + 90).toBeLessThanOrEqual(796);
      expect(p.top + 22).toBeLessThanOrEqual(496);
    }
  });

  it('pushes a label that cannot fit on any side back into the map', () => {
    const tiny = { width: 60, height: 40 };
    const [p] = placeFlags([flag('a', 30, 20)], tiny);
    expect(p!.left).toBeGreaterThanOrEqual(4);
    expect(p!.top).toBeGreaterThanOrEqual(4);
  });

  it('hangs the label from a further point of its own when no side of the first is free', () => {
    // every side of (300, 200) is taken; the same label may also hang from a point 200 px to the right
    const walls = [{ left: 200, top: 120, right: 400, bottom: 280 }];
    const [p] = placeFlags(
      [flag('a', 300, 200, { alternates: [{ x: 500, y: 200, gap: 11, prefer: ['right'] }] })],
      size,
      walls,
    );
    expect(p!.clear).toBe(true);
    expect(p!.left).toBeGreaterThanOrEqual(500);
    expect(overlaps(rect(p!), walls[0]!)).toBe(false);
  });

  it('prefers a place clear of the soft obstacles, and sits on one only when nothing else is free', () => {
    const name = { left: 305, top: 185, right: 400, bottom: 215 };
    const [clear] = placeFlags([flag('a', 300, 200)], size, [], [name]);
    expect(clear!.side).not.toBe('right'); // the right-hand side is taken by the name: another side is free
    expect(clear!.clear).toBe(true);
    expect(clear!.yields).toEqual([]);

    // names all around: it takes the place that is free of everything but them, and says which names it sits on
    const around = [
      { left: 305, top: 185, right: 400, bottom: 215 },
      { left: 200, top: 185, right: 295, bottom: 215 },
      { left: 255, top: 130, right: 345, bottom: 188 },
      { left: 255, top: 212, right: 345, bottom: 270 },
    ];
    const [forced] = placeFlags([flag('a', 300, 200)], size, [], around);
    expect(forced!.clear).toBe(true); // nothing hard in the way
    expect(forced!.yields.length).toBeGreaterThan(0);
    expect(forced!.yields.every((y) => around.includes(y))).toBe(true);
  });

  it('never sits on a hard obstacle while any place is free of them, soft ones or not', () => {
    const hard = [
      { left: 311, top: 189, right: 401, bottom: 211 },
      { left: 199, top: 189, right: 289, bottom: 211 },
    ];
    const soft = [
      { left: 255, top: 130, right: 345, bottom: 188 },
      { left: 255, top: 212, right: 345, bottom: 270 },
    ];
    const [p] = placeFlags([flag('a', 300, 200)], size, hard, soft);
    for (const h of hard) expect(overlaps(rect(p!), h)).toBe(false);
    expect(p!.yields.length).toBeGreaterThan(0);
  });

  it('when nothing at all is free it takes the place that covers the least', () => {
    const wall = { left: 4, top: 4, right: 796, bottom: 496 };
    const [p] = placeFlags([flag('a', 400, 250)], size, [wall]);
    expect(p!.clear).toBe(false);
    expect(p!.left).toBeGreaterThanOrEqual(4);
  });

  it('is deterministic', () => {
    const reqs = [flag('a', 100, 100), flag('b', 110, 100), flag('c', 400, 300)];
    expect(placeFlags(reqs, size)).toEqual(placeFlags(reqs, size));
  });
});
