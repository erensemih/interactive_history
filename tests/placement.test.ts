import { describe, expect, it } from 'vitest';
import { normalizeEvent, type RawEvent } from '../src/domain/events';
import { placeMarkers } from '../src/domain/placement';

const ev = (id: string, lon: number, importance = 4, year = 1500) =>
  normalizeEvent(
    {
      id,
      title: { tr: id },
      summary: { tr: 's' },
      date: String(year),
      location: { name: { tr: 'yer' }, coordinates: [lon, 0] },
      importance,
      category: 'military',
      parties: ['x'],
      sources: [{ wikipedia: 'X' }],
    } satisfies RawEvent,
    't',
  );

/** A flat "map": longitude × 10 px, so a 1000 px viewport shows lon 0–100. */
const project = (e: { location: { lon: number } }) => ({ x: e.location.lon * 10, y: 100 });
const base = { zoom: 1.8, focusYear: 1500, selectedId: null, viewport: { width: 1000, height: 400 }, project };

describe('placeMarkers', () => {
  it('spends the budget on what is in view, so zooming into a region does not starve it', () => {
    // 30 important events far away (off the right edge) and 4 lesser ones in view
    const away = Array.from({ length: 30 }, (_, i) => ev(`far-${i}`, 120 + i * 1.5, 5));
    const near = [ev('a', 5, 3), ev('b', 30, 3), ev('c', 55, 3), ev('d', 80, 3)];
    const { placed, offscreen } = placeMarkers({ ...base, events: [...away, ...near] });
    expect(placed.map((p) => p.ev.id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(offscreen).toBe(30);
  });

  it('keeps the most important markers when the budget is smaller than the view', () => {
    const events = Array.from({ length: 12 }, (_, i) => ev(`e${i}`, 2 + i * 8, i < 3 ? 5 : 3));
    const { placed, thinned } = placeMarkers({ ...base, zoom: 1, events });
    expect(placed).toHaveLength(6); // the smallest budget
    expect(placed.slice(0, 3).map((p) => p.ev.importance)).toEqual([5, 5, 5]);
    expect(thinned).toBe(6);
  });

  it('drops the less important of two markers that would overlap', () => {
    const { placed, thinned } = placeMarkers({ ...base, events: [ev('big', 50, 5), ev('small', 50.5, 3)] });
    expect(placed.map((p) => p.ev.id)).toEqual(['big']);
    expect(thinned).toBe(1);
  });

  it('draws the selected event first when it is in view: it takes a slot and displaces what it overlaps', () => {
    const events = [
      ev('big', 50, 5),
      ev('picked', 50.5, 3),
      ...Array.from({ length: 10 }, (_, i) => ev(`x${i}`, 4 + i * 9, 4)).filter((e) => e.location.lon !== 49),
    ];
    const { placed } = placeMarkers({ ...base, zoom: 1, selectedId: 'picked', events });
    expect(placed[0]!.ev.id).toBe('picked');
    expect(placed.map((p) => p.ev.id)).not.toContain('big'); // overlaps the selected one
    expect(placed).toHaveLength(6); // 'picked' + 5 others: the budget at zoom 1
  });

  it('does not draw a selected event that is out of view', () => {
    const { placed, offscreen } = placeMarkers({
      ...base,
      selectedId: 'gone',
      events: [ev('gone', 150, 3), ev('a', 5, 3)],
    });
    expect(placed.map((p) => p.ev.id)).toEqual(['a']);
    expect(offscreen).toBe(1);
  });

  it('treats a non-finite projection as out of view instead of throwing', () => {
    const { placed, offscreen } = placeMarkers({
      ...base,
      project: (e) => (e.location.lon === 5 ? { x: NaN, y: NaN } : project(e)),
      events: [ev('nan', 5, 5), ev('ok', 20, 3)],
    });
    expect(placed.map((p) => p.ev.id)).toEqual(['ok']);
    expect(offscreen).toBe(1);
  });

  it('is deterministic: same input, same markers', () => {
    const events = Array.from({ length: 15 }, (_, i) => ev(`e${i}`, 2 + i * 6, 3 + (i % 3)));
    const a = placeMarkers({ ...base, events });
    const b = placeMarkers({ ...base, events: [...events].reverse() });
    expect(b.placed.map((p) => p.ev.id)).toEqual(a.placed.map((p) => p.ev.id));
  });
});

describe('placeMarkers: events that must be drawn', () => {
  it('draws the kept events whatever the budget and the collisions say, and the ones that are not kept give way', () => {
    // twenty events crowded on top of each other, three of them kept
    const crowd = Array.from({ length: 20 }, (_, i) => ev(`e${i}`, 50 + (i % 4) * 0.2, 5));
    const kept = new Set(['e17', 'e18', 'e19']);
    const { placed } = placeMarkers({ ...base, zoom: 1, events: crowd, keepIds: kept });
    const ids = placed.map((p) => p.ev.id);
    for (const id of kept) expect(ids).toContain(id);
    expect(ids.slice(0, 3).sort()).toEqual(['e17', 'e18', 'e19']); // first, so nothing else takes their place
  });

  it('counts a kept event that is out of view as out of view', () => {
    const { placed, offscreen } = placeMarkers({
      ...base,
      events: [ev('gone', 150, 3), ev('here', 20, 3)],
      keepIds: new Set(['gone']),
    });
    expect(placed.map((p) => p.ev.id)).toEqual(['here']);
    expect(offscreen).toBe(1);
  });
});
