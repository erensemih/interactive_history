import { describe, expect, it } from 'vitest';
import {
  CameraWatch,
  cameraDrift,
  frameBounds,
  framePadding,
  isFramed,
  isSubstantial,
  mercator,
  projectWith,
  SUBSTANTIAL,
  type Camera,
} from '../src/domain/camera';

const size = { width: 900, height: 600 };
const home: Camera = { lng: 35, lat: 39, zoom: 4.2 };

describe('projectWith', () => {
  it('puts the centre in the middle, and a place east of it to the right and north of it above', () => {
    const c = projectWith(home, size, home.lng, home.lat);
    expect(c.x).toBeCloseTo(450, 6);
    expect(c.y).toBeCloseTo(300, 6);
    const ne = projectWith(home, size, home.lng + 5, home.lat + 3);
    expect(ne.x).toBeGreaterThan(450);
    expect(ne.y).toBeLessThan(300);
  });

  it('doubles distances with every zoom level', () => {
    const a = projectWith(home, size, home.lng + 2, home.lat);
    const b = projectWith({ ...home, zoom: home.zoom + 1 }, size, home.lng + 2, home.lat);
    expect(b.x - 450).toBeCloseTo((a.x - 450) * 2, 6);
  });

  it('agrees with the plain Web Mercator formula', () => {
    expect(mercator(0, 0)).toEqual({ x: 0.5, y: 0.5 });
    expect(mercator(-180, 0).x).toBe(0);
    expect(mercator(0, 60).y).toBeLessThan(0.5);
  });
});

describe('a substantial move', () => {
  const moved = (dLng: number, dLat = 0, dZoom = 0): Camera => ({
    lng: home.lng + dLng,
    lat: home.lat + dLat,
    zoom: home.zoom + dZoom,
  });
  const drift = (to: Camera) => cameraDrift(home, to, size);

  it('measures the pan as a share of the smaller side of the map and the zoom in levels', () => {
    expect(drift(home)).toEqual({ pan: 0, zoom: 0 });
    // at zoom 4.2 one degree of longitude is 512 * 2^4.2 / 360 ≈ 26 px
    expect(drift(moved(4)).pan).toBeCloseTo((4 * 512 * 2 ** 4.2) / 360 / 600, 3);
    expect(drift(moved(0, 0, -1.5))).toEqual({ pan: 0, zoom: 1.5 });
  });

  it('a nudge, a short drag and one click of + or − are not substantial', () => {
    expect(isSubstantial(drift(moved(1.5)))).toBe(false);
    expect(isSubstantial(drift(moved(4)))).toBe(false); // about a sixth of the map
    expect(isSubstantial(drift(moved(0, 0, 1)))).toBe(false); // one step of the zoom buttons
    expect(isSubstantial(drift(moved(0, 0, -1)))).toBe(false);
  });

  it('a third of the map, or two clicks of the zoom buttons, is', () => {
    expect(isSubstantial(drift(moved(9)))).toBe(true);
    expect(isSubstantial(drift(moved(-9)))).toBe(true);
    expect(isSubstantial(drift(moved(0, 8)))).toBe(true);
    expect(isSubstantial(drift(moved(0, 0, 2)))).toBe(true);
    expect(isSubstantial(drift(moved(0, 0, -2)))).toBe(true);
    expect(SUBSTANTIAL.pan).toBeGreaterThan(0.25);
    expect(SUBSTANTIAL.pan).toBeLessThan(0.5);
  });

  it('is judged on a map of any size by the same share', () => {
    const small = { width: 300, height: 200 };
    const far = moved(3.2); // 3.2° ≈ 83 px: 0.41 of a 200 px side
    expect(isSubstantial(cameraDrift(home, far, small))).toBe(true);
    expect(isSubstantial(cameraDrift(home, far, size))).toBe(false);
  });
});

describe('CameraWatch', () => {
  it('has nothing to judge against before the page has settled on a camera, and then takes the first one as it is', () => {
    const watch = new CameraWatch();
    expect(watch.judge({ lng: 80, lat: 10, zoom: 6 }, size)).toBe(false);
    expect(watch.judge({ lng: 20, lat: 10, zoom: 6 }, size)).toBe(true); // 60° away from the first
  });

  it('judges the reader against where the page left the camera, and adds their moves up', () => {
    const watch = new CameraWatch();
    watch.settle(home);
    expect(watch.judge({ ...home, lng: home.lng + 3 }, size)).toBe(false);
    expect(watch.judge({ ...home, lng: home.lng + 6 }, size)).toBe(false);
    expect(watch.judge({ ...home, lng: home.lng + 9.5 }, size)).toBe(true); // three drags in one direction
  });

  it('a drag back and forth is no move at all', () => {
    const watch = new CameraWatch();
    watch.settle(home);
    expect(watch.judge({ ...home, lng: home.lng + 5 }, size)).toBe(false);
    expect(watch.judge({ ...home, lng: home.lng - 5 }, size)).toBe(false);
    expect(watch.judge(home, size)).toBe(false);
  });

  it('a new reference (the page moved the camera) starts the measure again', () => {
    const watch = new CameraWatch();
    watch.settle(home);
    expect(watch.judge({ ...home, lng: home.lng + 20 }, size)).toBe(true);
    watch.settle({ ...home, lng: home.lng + 20 });
    expect(watch.judge({ ...home, lng: home.lng + 21 }, size)).toBe(false);
  });
});

describe('framePadding', () => {
  it('clears a corner control the short way: the zoom buttons by the right edge, the legend by the bottom one', () => {
    const zoom = { left: 840, top: 4, right: 896, bottom: 95 };
    const legend = { left: 4, top: 510, right: 250, bottom: 596 };
    const p = framePadding([zoom, legend], size);
    expect(p.right).toBe(60 + 12);
    expect(p.top).toBe(48);
    expect(p.bottom).toBe(90 + 12);
    expect(p.left).toBe(48);
  });

  it('keeps a margin without controls, and never takes more than two fifths of the map', () => {
    expect(framePadding([], size)).toEqual({ top: 48, right: 48, bottom: 48, left: 48 });
    const huge = framePadding([{ left: 0, top: 0, right: 900, bottom: 560 }], size);
    expect(huge.top + huge.bottom).toBeLessThanOrEqual(size.height * 0.8 + 1);
    expect(huge.left + huge.right).toBeLessThanOrEqual(size.width * 0.8 + 1);
  });
});

describe('frameBounds', () => {
  it('is the box around the boxes and points, never thinner than a few degrees', () => {
    expect(frameBounds([[10, 20, 30, 40]], [{ lon: 35, lat: 25 }])).toEqual([10, 20, 35, 40]);
    const lone = frameBounds([], [{ lon: 37.1, lat: 36.68 }])!;
    expect(lone[2] - lone[0]).toBeCloseTo(7, 6);
    expect(lone[3] - lone[1]).toBeCloseTo(4.5, 6);
    expect((lone[0] + lone[2]) / 2).toBeCloseTo(37.1, 6);
  });

  it('is nothing for nothing, and stays inside the map', () => {
    expect(frameBounds([], [])).toBeNull();
    expect(frameBounds([], [{ lon: 179.5, lat: 81 }])![2]).toBeLessThanOrEqual(179.9);
    expect(frameBounds([], [{ lon: 0, lat: -59 }])![1]).toBeGreaterThanOrEqual(-60);
  });
});

describe('isFramed', () => {
  const pad = { top: 48, right: 68, bottom: 100, left: 48 };
  const box: [number, number, number, number] = [30, 34, 46, 44];

  /** The zoom at which this box just fits the padded view of this map. */
  const FIT = 4.3;
  /** A camera that looks at the middle of the box from `zoom`. */
  const looking = (zoom: number): Camera => ({ lng: 38, lat: 39.2, zoom });

  it('is framed when the box lies inside the padded view, centred, at about the zoom of a fit', () => {
    expect(isFramed(box, looking(FIT), FIT, size, pad)).toBe(true);
    expect(isFramed(box, looking(FIT + 0.1), FIT, size, pad)).toBe(true); // a little closer is fine
    expect(isFramed(box, { lng: 38.6, lat: 39.2, zoom: FIT }, FIT, size, pad)).toBe(true); // and a little off centre
  });

  it('is not when the zoom is far from a fit: too far out or too close in', () => {
    expect(isFramed(box, looking(FIT - 0.8), FIT, size, pad)).toBe(false);
    expect(isFramed(box, looking(FIT + 2), FIT, size, pad)).toBe(false);
  });

  it('is not when part of the box is out of the padded view, or the box sits off to one side', () => {
    expect(isFramed(box, { lng: 52, lat: 39.2, zoom: FIT }, FIT, size, pad)).toBe(false);
    expect(isFramed(box, { lng: 38, lat: 50, zoom: FIT }, FIT, size, pad)).toBe(false);
    // all of it in view, but nowhere near the middle of it
    expect(isFramed([30, 34, 34, 38], { lng: 42, lat: 39, zoom: FIT }, FIT, size, pad)).toBe(false);
  });
});
