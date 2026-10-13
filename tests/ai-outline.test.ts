import { describe, expect, it } from 'vitest';
import type { AiContext } from '../src/ai/context';
import { narrationOutline, OUTLINE_MAX, OUTLINE_MIN } from '../src/ai/outline';
import { archivedData } from './helpers/shipped';

const data = archivedData('1400-1600');
const range = { from: 1500, to: 1550 };

const ottoman = (r = range): AiContext => ({
  range: r,
  year: 1525,
  places: [
    {
      id: '35.500,38.900',
      point: { lon: 35.5, lat: 38.9 },
      title: 'Osmanlı İmparatorluğu',
      occupation: null,
      holder: { id: 'ottoman-empire', name: 'Osmanlı İmparatorluğu' },
      regions: ['Anadolu'],
      lineage: ['ottoman-empire', 'anatolia'],
      range: r,
      sovereigns: [{ id: 'ottoman-empire', name: 'Osmanlı İmparatorluğu', from: r.from, to: r.to }],
    },
  ],
  event: null,
});
const world = (r = range): AiContext => ({ range: r, year: 1525, places: [], event: null });

describe('narrationOutline', () => {
  it('is the turning points of the subject: the most important events, in date order, at most six', () => {
    const outline = narrationOutline(ottoman(), data.events);
    expect(outline.length).toBeLessThanOrEqual(OUTLINE_MAX);
    expect(outline.length).toBeGreaterThanOrEqual(OUTLINE_MIN);
    const years = outline.map((s) => s.year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
    const byId = new Map(data.events.map((e) => [e.id, e]));
    for (const s of outline) {
      const ev = byId.get(s.id)!;
      expect(ev.parties.some((p) => ['ottoman-empire', 'anatolia'].includes(p))).toBe(true); // it is about the place
      expect(ev.end).toBeGreaterThan(range.from);
      expect(ev.start).toBeLessThan(range.to + 1);
    }
    // the biggest Ottoman events of the half-century are in it
    expect(outline.map((s) => s.id)).toEqual(expect.arrayContaining(['caldiran-1514', 'mohac-1526']));
  });

  it('is the same every time for the same subject, and does not care about the map year or an open event', () => {
    const a = narrationOutline(ottoman(), data.events);
    const b = narrationOutline({ ...ottoman(), year: 1540, event: { id: 'x' } as AiContext['event'] }, data.events);
    expect(b).toEqual(a);
    expect(narrationOutline(ottoman(), [...data.events].reverse())).toEqual(a); // nor the order the data comes in
    expect(narrationOutline(world(), data.events)).toEqual(narrationOutline(world(), data.events));
  });

  it('changes with the subject: another range, another place, or none', () => {
    const early = narrationOutline(ottoman({ from: 1400, to: 1450 }), data.events);
    expect(early).not.toEqual(narrationOutline(ottoman(), data.events));
    const w = narrationOutline(world(), data.events);
    expect(w).not.toEqual(narrationOutline(ottoman(), data.events));
    expect(w.length).toBeGreaterThanOrEqual(OUTLINE_MIN);
    // the world's outline can hold events of any party; the highest importance first picks
    const byId = new Map(data.events.map((e) => [e.id, e]));
    expect(w.some((s) => byId.get(s.id)!.importance >= 4)).toBe(true);
  });

  it('is empty when there is too little to outline, so the model tells it as it sees fit', () => {
    expect(narrationOutline(world({ from: 1500, to: 1500 }), [])).toEqual([]);
    expect(narrationOutline(ottoman(), data.events.slice(0, 2))).toEqual([]);
  });

  it('carries what the prompt prints: the id, the date, the title and the place', () => {
    for (const s of narrationOutline(world(), data.events)) {
      expect(s.id).toMatch(/^[a-z0-9-]+$/);
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.dateLabel).toMatch(/\d{3,4}/);
      expect(s.place.length).toBeGreaterThan(0);
    }
  });
});
