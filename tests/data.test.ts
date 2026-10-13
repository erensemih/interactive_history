import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { openingRange } from '../src/data/load';
// @ts-expect-error plain ESM script without type declarations
import { validateAll } from '../scripts/validate-data.mjs';
import { archivedData, shippedData } from './helpers/shipped';

type Report = { errors: string[]; warnings: string[]; stats: Record<string, number> };

describe('shipped data (public/data: 1800–2000)', () => {
  const { errors, stats } = validateAll() as Report;
  it('passes the data validator', () => {
    expect(errors).toEqual([]);
  });
  it('has enough events to test the map and both local timelines', () => {
    expect(stats.mapEligible).toBeGreaterThanOrEqual(25);
    expect(stats.events).toBeGreaterThanOrEqual(50);
  });
});

describe('the archived 1400–1600 data (data/1400-1600)', () => {
  const { errors, stats } = validateAll(join(__dirname, '..', 'data', '1400-1600')) as Report;
  it('is kept whole, outside the published build, and still passes the validator', () => {
    expect(errors).toEqual([]);
    expect(stats.events).toBeGreaterThanOrEqual(50);
  });
});

describe('the range the app opens on', () => {
  const extent = { from: 1800, to: 2000 };

  it('is the one the period names, when it lies inside the data', () => {
    expect(openingRange({ from: 1939, to: 1945 }, extent)).toEqual({ from: 1939, to: 1945 });
    expect(openingRange({ from: 1800, to: 2000 }, extent)).toEqual({ from: 1800, to: 2000 });
    expect(openingRange({ from: 1942, to: 1942 }, extent)).toEqual({ from: 1942, to: 1942 });
  });

  it('is seven years in the middle of the data when the period names none, or a range that cannot be used', () => {
    const middle = { from: 1897, to: 1903 };
    expect(openingRange(undefined, extent)).toEqual(middle);
    expect(openingRange({ from: 1945, to: 1939 }, extent)).toEqual(middle); // backwards
    expect(openingRange({ from: 1700, to: 1750 }, extent)).toEqual(middle); // outside the data
    expect(openingRange({ from: 1990, to: 2010 }, extent)).toEqual(middle); // sticks out of it
    expect(openingRange({ from: 1939.5, to: 1945 }, extent)).toEqual(middle); // not whole years
    expect(openingRange(undefined, { from: 1400, to: 1403 })).toEqual({ from: 1400, to: 1403 }); // a short period
  });

  it('belongs to each period: the shipped data and the archive open on their own', () => {
    expect(shippedData().open).toEqual({ from: 1939, to: 1945 });
    expect(archivedData('1400-1600').open).toEqual({ from: 1490, to: 1520 });
  });
});
