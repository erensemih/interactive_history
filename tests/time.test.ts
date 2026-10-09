import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  cursorFor,
  detailDomain,
  displayYear,
  formatDateRange,
  overlaps,
  parseDate,
  presetRange,
  rangeInterval,
  shiftRange,
} from '../src/domain/time';

const extent = { from: 1400, to: 1600 };

describe('parseDate', () => {
  it('covers the whole year / month / day at its precision', () => {
    expect(parseDate('1453')).toMatchObject({ start: 1453, end: 1454, precision: 'year' });
    const may = parseDate('1453-05');
    expect(may.start).toBeGreaterThan(1453.3);
    expect(may.end).toBeCloseTo(1453 + 151 / 365, 5);
    const day = parseDate('1453-05-29');
    expect(day.end - day.start).toBeCloseTo(1 / 365, 5);
  });

  it('rejects malformed and impossible dates', () => {
    expect(() => parseDate('29 Mayıs 1453')).toThrow();
    expect(() => parseDate('1453-13')).toThrow();
    expect(() => parseDate('1453-02-30')).toThrow();
  });
});

describe('formatDateRange (Turkish)', () => {
  const fmt = (a: string, b?: string, approx = false) => formatDateRange(parseDate(a), b ? parseDate(b) : null, approx);
  it('formats single dates', () => {
    expect(fmt('1453-05-29')).toBe('29 Mayıs 1453');
    expect(fmt('1488-02')).toBe('Şubat 1488');
    expect(fmt('1501')).toBe('1501');
  });
  it('formats ranges', () => {
    expect(fmt('1453-04-06', '1453-05-29')).toBe('6 Nisan – 29 Mayıs 1453');
    expect(fmt('1405', '1433')).toBe('1405–1433');
    expect(fmt('1424', '1429', true)).toBe('yak. 1424–1429');
    expect(fmt('1519-09-20', '1522-09-06')).toBe('20 Eylül 1519 – 6 Eylül 1522');
  });
});

describe('range helpers', () => {
  it('treats the inclusive range as a half-open interval', () => {
    expect(rangeInterval({ from: 1500, to: 1500 })).toEqual([1500, 1501]);
    // An event on 31 Dec 1500 belongs to the single year 1500, one on 1 Jan 1501 does not.
    const [a, b] = rangeInterval({ from: 1500, to: 1500 });
    expect(overlaps(parseDate('1500-12-31').start, parseDate('1500-12-31').end, a, b)).toBe(true);
    expect(overlaps(parseDate('1501-01-01').start, parseDate('1501-01-01').end, a, b)).toBe(false);
  });

  it('maps the cursor to a displayed year and back', () => {
    const r = { from: 1450, to: 1500 };
    expect(displayYear(r, 0.5)).toBe(1475);
    expect(displayYear(r, 0)).toBe(1450);
    expect(displayYear(r, 1)).toBe(1500);
    expect(displayYear({ from: 1500, to: 1500 }, 0.9)).toBe(1500);
    expect(cursorFor(r, 1475)).toBe(0.5);
  });

  it('preset spans keep the centre and stay inside the extent', () => {
    expect(presetRange({ from: 1490, to: 1520 }, 5, extent)).toEqual({ from: 1503, to: 1507 });
    expect(presetRange({ from: 1490, to: 1520 }, 1, extent)).toEqual({ from: 1505, to: 1505 });
    expect(presetRange({ from: 1400, to: 1402 }, 100, extent)).toEqual({ from: 1400, to: 1499 });
    expect(presetRange({ from: 1590, to: 1600 }, 100, extent)).toEqual({ from: 1501, to: 1600 });
  });

  it('shifting keeps the window length', () => {
    expect(shiftRange({ from: 1450, to: 1500 }, 200, extent)).toEqual({ from: 1550, to: 1600 });
    expect(shiftRange({ from: 1450, to: 1500 }, -200, extent)).toEqual({ from: 1400, to: 1450 });
  });

  it('detail domain adds context around short ranges and never leaves the extent', () => {
    const one = detailDomain({ from: 1500, to: 1500 }, extent);
    expect(one.to - one.from + 1).toBeGreaterThanOrEqual(30);
    expect(one.from).toBeLessThanOrEqual(1500);
    expect(one.to).toBeGreaterThanOrEqual(1500);
    expect(detailDomain({ from: 1400, to: 1400 }, extent).from).toBe(1400);
    expect(detailDomain({ from: 1600, to: 1600 }, extent).to).toBe(1600);
    expect(detailDomain({ from: 1450, to: 1550 }, extent)).toEqual(extent);
  });

  it('axis ticks adapt to the available width', () => {
    const wide = axisTicks(1400, 1600, 1200).map((t) => t.year);
    const narrow = axisTicks(1400, 1600, 300).map((t) => t.year);
    expect(wide.length).toBeGreaterThan(narrow.length);
    expect(axisTicks(1495, 1505, 1000)[0]!.year).toBe(1495);
  });
});
