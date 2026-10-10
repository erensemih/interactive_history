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

  it('is deterministic', () => {
    const reqs = [flag('a', 100, 100), flag('b', 110, 100), flag('c', 400, 300)];
    expect(placeFlags(reqs, size)).toEqual(placeFlags(reqs, size));
  });
});
