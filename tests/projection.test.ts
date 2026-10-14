import { describe, expect, it } from 'vitest';
import { Projector } from '../src/map/projection';

/** A map that is only a centre, a zoom and a flat projection: 1° is 10 px, the centre is at (500, 300). */
function fakeMap(centreLon: number, zoom = 2) {
  return {
    getCenter: () => ({ lng: centreLon, lat: 0 }),
    getZoom: () => zoom,
    project: ([lon, lat]: [number, number]) => ({ x: 500 + (lon - centreLon) * 10, y: 300 - lat * 10 }),
  } as never;
}

describe('Projector', () => {
  it('puts a place where its longitude says when the map is the one plain world', () => {
    const p = new Projector(fakeMap(170), () => false);
    expect(p.near(-158, 21).x).toBeCloseTo(500 + (-158 - 170) * 10, 6);
    expect(p.exact(202, 21).x).toBeCloseTo(500 + 32 * 10, 6);
  });

  it('puts a place in the copy of the world nearest the centre of the view when the map shows the world twice over', () => {
    const p = new Projector(fakeMap(190), () => true);
    // Honolulu (−158°) is at 202° as the view across the date line sees it
    expect(p.near(-158, 21).x).toBeCloseTo(500 + (202 - 190) * 10, 6);
    // and a place east of the centre stays where it is
    expect(p.near(139.7, 35).x).toBeCloseTo(500 + (139.7 - 190) * 10, 6);
    const west = new Projector(fakeMap(-170), () => true);
    expect(west.near(175, 0).x).toBeCloseTo(500 + (-185 + 170) * 10, 6);
  });

  it('says how wide the world is at the zoom of the view (a drawing’s copy across the date line lies that far off)', () => {
    expect(new Projector(fakeMap(0, 0)).worldWidth()).toBe(512);
    expect(new Projector(fakeMap(0, 3)).worldWidth()).toBe(4096);
  });
});
