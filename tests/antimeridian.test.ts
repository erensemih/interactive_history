import { describe, expect, it } from 'vitest';
import { crossesDateLine, lonInArc, narrowestArc, unwrapNear, unwrapPath, wrapLon } from '../src/domain/antimeridian';

const TOKYO = { lon: 139.7, lat: 35.7 };
const HONOLULU = { lon: -157.9, lat: 21.3 };

describe('wrapLon', () => {
  it('is a longitude inside [-180, 180)', () => {
    expect(wrapLon(0)).toBe(0);
    expect(wrapLon(190)).toBe(-170);
    expect(wrapLon(-190)).toBe(170);
    expect(wrapLon(180)).toBe(-180);
    expect(wrapLon(540)).toBe(-180);
    expect(wrapLon(-540.5)).toBeCloseTo(179.5, 9);
  });
});

describe('unwrapNear', () => {
  it('is the copy of a longitude (± a whole turn) nearest another', () => {
    expect(unwrapNear(-158, 190)).toBe(202);
    expect(unwrapNear(202, 10)).toBe(-158);
    expect(unwrapNear(20, 10)).toBe(20);
    expect(unwrapNear(-170, 170)).toBe(190);
    expect(unwrapNear(10, -350)).toBe(-350);
  });
});

describe('unwrapPath and crossesDateLine', () => {
  it('runs the longitudes of a path on, so a hop over the date line is the short way', () => {
    const path = unwrapPath([TOKYO, HONOLULU]);
    expect(path.map((p) => p.lon)).toEqual([139.7, 202.1]);
    expect(path.map((p) => p.lat)).toEqual([35.7, 21.3]);
    // and the other way round: from Honolulu west to Tokyo
    expect(unwrapPath([HONOLULU, TOKYO]).map((p) => p.lon)).toEqual([-157.9, -220.3]);
    expect(unwrapPath([])).toEqual([]);
    expect(unwrapPath([TOKYO])).toEqual([TOKYO]);
  });

  it('leaves a path that does not cross alone', () => {
    const path = [
      { lon: 2.35, lat: 48.86 },
      { lon: 13.4, lat: 52.52 },
      { lon: 37.6, lat: 55.75 },
    ];
    expect(unwrapPath(path)).toEqual(path);
    expect(crossesDateLine(path)).toBe(false);
    expect(crossesDateLine([TOKYO, HONOLULU])).toBe(true);
    expect(crossesDateLine([HONOLULU, TOKYO])).toBe(true);
    // a long way round the other way is not a crossing: Paris to Tokyo goes over Asia, not over the Pacific
    expect(crossesDateLine([{ lon: 2.35, lat: 48.86 }, TOKYO])).toBe(false);
  });

  it('follows a path that crosses twice', () => {
    const lons = unwrapPath([
      { lon: 170, lat: 0 },
      { lon: -170, lat: 0 },
      { lon: 170, lat: 5 },
    ]).map((p) => p.lon);
    expect(lons).toEqual([170, 190, 170]);
  });
});

describe('narrowestArc and lonInArc', () => {
  it('is the narrowest stretch of longitudes that holds all of them, over the date line where that is shorter', () => {
    expect(narrowestArc([])).toEqual({ west: 0, width: 0 });
    expect(narrowestArc([40])).toEqual({ west: 40, width: 0 });
    const europe = narrowestArc([2.35, 13.4, 37.6]);
    expect(europe.west).toBeCloseTo(2.35, 9);
    expect(europe.width).toBeCloseTo(35.25, 9);
    const pacific = narrowestArc([139.7, -157.9]);
    expect(pacific.west).toBeCloseTo(139.7, 9);
    expect(pacific.width).toBeCloseTo(62.4, 9); // the Pacific, not the whole world the other way
    expect(pacific.west + pacific.width).toBeGreaterThan(180);
  });

  it('puts a longitude in the copy that falls inside an arc', () => {
    expect(lonInArc(-157.9, 139.7)).toBeCloseTo(202.1, 9);
    expect(lonInArc(143, 139.7)).toBeCloseTo(143, 9);
    expect(lonInArc(139.7, 139.7)).toBe(139.7);
  });

  it('does not take a whole turn for a hair of difference at the west end of the arc', () => {
    // wrapLon(139.7) is 139.70000000000002: the west end the arc finds for 139.7 itself
    const west = wrapLon(139.7);
    expect(lonInArc(139.7, west)).toBeCloseTo(139.7, 6);
    expect(lonInArc(139.7, west)).toBeLessThan(140);
  });
});
