import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { validateAll } from '../scripts/validate-data.mjs';

describe('shipped data', () => {
  const { errors, stats } = validateAll() as { errors: string[]; stats: Record<string, number> };
  it('passes the data validator', () => {
    expect(errors).toEqual([]);
  });
  it('has enough events to test the map and both local timelines', () => {
    expect(stats.mapEligible).toBeGreaterThanOrEqual(25);
    expect(stats.events).toBeGreaterThanOrEqual(50);
  });
});
