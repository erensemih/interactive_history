import { describe, expect, it } from 'vitest';
import {
  elsewhere,
  mapEventsInRange,
  markerBudget,
  nearestEvent,
  normalizeEvent,
  sourceUrl,
  timelineEvents,
  type RawEvent,
} from '../src/domain/events';
import { assignLanes } from '../src/domain/lanes';

const raw = (id: string, date: RawEvent['date'], importance: number, parties: string[]): RawEvent => ({
  id,
  title: { tr: id },
  summary: { tr: 's' },
  date,
  location: { name: { tr: 'yer' }, coordinates: [10, 20] },
  importance,
  category: 'military',
  parties,
  sources: [{ wikipedia: 'Fall of Constantinople' }],
});

const events = [
  raw('istanbul', { start: '1453-04-06', end: '1453-05-29' }, 5, ['ottoman', 'byzantine']),
  raw('castillon', '1453-07-17', 3, ['france', 'england']),
  raw('local-1461', '1461-08-15', 2, ['ottoman']),
  raw('tiny-1461', '1461', 1, ['ottoman']),
  raw('columbus', '1492-10-12', 5, ['castile']),
  raw('ming-1421', '1421-02-02', 4, ['ming']),
].map((e) => normalizeEvent(e, 'test'));

describe('sources and validation', () => {
  it('keeps ordinary Wikipedia, Wikidata and http(s) sources', () => {
    expect(sourceUrl({ wikipedia: 'Battle of Çaldıran', lang: 'tr' })?.url).toBe(
      'https://tr.wikipedia.org/wiki/Battle_of_%C3%87ald%C4%B1ran',
    );
    expect(sourceUrl({ wikidata: 'Q12345' })?.url).toBe('https://www.wikidata.org/wiki/Q12345');
    expect(sourceUrl({ url: 'https://example.org/x', title: 'X' })).toMatchObject({ kind: 'url', title: 'X' });
  });

  it('drops anything that would not be an ordinary link', () => {
    expect(sourceUrl({ url: 'javascript:alert(1)' })).toBeNull();
    expect(sourceUrl({ wikipedia: 'X', lang: 'evil.example/#' })).toBeNull();
    expect(sourceUrl({ wikidata: '../../x' })).toBeNull();
    expect(sourceUrl({})).toBeNull();
  });

  it('rejects a malformed event with a message that names it', () => {
    const bad = (patch: Partial<RawEvent>) => () => normalizeEvent({ ...raw('bad-1', '1500', 3, ['x']), ...patch }, 't');
    expect(bad({ importance: 9 })).toThrow(/bad-1.*önem/);
    expect(bad({ location: { name: { tr: 'y' }, coordinates: [10, 120] } })).toThrow(/bad-1.*koordinat/);
    expect(bad({ parties: undefined as unknown as string[] })).toThrow(/bad-1/);
    expect(bad({ date: '15oo' })).toThrow(/Geçersiz tarih/);
  });
});

describe('normalizeEvent', () => {
  it('builds Turkish date labels, source links and fractional intervals', () => {
    const e = events[0]!;
    expect(e.dateLabel).toBe('6 Nisan – 29 Mayıs 1453');
    expect(e.sources[0]).toMatchObject({
      kind: 'wikipedia',
      url: 'https://en.wikipedia.org/wiki/Fall_of_Constantinople',
    });
    expect(e.end).toBeGreaterThan(e.start);
  });
});

describe('the map depends on time only', () => {
  it('shows only globally important events inside the range', () => {
    const ids = mapEventsInRange(events, { from: 1450, to: 1500 }).map((e) => e.id);
    expect(ids).toEqual(['istanbul', 'castillon', 'columbus']);
    // low importance never reaches the map
    expect(ids).not.toContain('local-1461');
  });

  it('a single year only returns events overlapping that year', () => {
    expect(mapEventsInRange(events, { from: 1492, to: 1492 }).map((e) => e.id)).toEqual(['columbus']);
    expect(mapEventsInRange(events, { from: 1454, to: 1460 })).toEqual([]);
  });

  it('marker budget grows with zoom', () => {
    expect(markerBudget(1)).toBeLessThan(markerBudget(3));
    expect(markerBudget(3)).toBeLessThan(markerBudget(5));
  });
});

describe('the timeline depends on the place', () => {
  const ottoman = new Set(['ottoman']);
  it('lists events by party membership, regardless of distance or importance', () => {
    const ids = timelineEvents(events, ottoman, { from: 1440, to: 1470 }).map((e) => e.id);
    // year-precision dates start on 1 January, so they sort before a later-dated event of the same year
    expect(ids).toEqual(['istanbul', 'tiny-1461', 'local-1461']);
  });

  it('parents in the lineage count (an event about the umbrella reaches its members)', () => {
    const member = new Set(['brandenburg', 'ottoman']);
    expect(timelineEvents(events, member, { from: 1453, to: 1453 }).map((e) => e.id)).toEqual(['istanbul']);
  });

  it('excludes events outside the window and about other places', () => {
    expect(timelineEvents(events, ottoman, { from: 1480, to: 1500 })).toEqual([]);
    expect(timelineEvents(events, new Set(['ming']), { from: 1400, to: 1500 }).map((e) => e.id)).toEqual(['ming-1421']);
  });

  it('finds the nearest event for the empty state, and the elsewhere list excludes the place', () => {
    expect(nearestEvent(events, ottoman, 1500)?.id).toBe('tiny-1461');
    const range = mapEventsInRange(events, { from: 1450, to: 1500 });
    expect(elsewhere(range, ottoman).map((e) => e.id)).toEqual(['castillon', 'columbus']);
    expect(elsewhere(range, null)).toEqual(range);
  });
});

describe('timeline lanes', () => {
  it('stacks overlapping labels and drops what does not fit', () => {
    const lanes = assignLanes(
      [
        { id: 'a', x: 0, width: 100, priority: 5 },
        { id: 'b', x: 50, width: 100, priority: 4 },
        { id: 'c', x: 60, width: 100, priority: 3 },
        { id: 'd', x: 300, width: 100, priority: 1 },
      ],
      2,
    );
    expect(lanes.get('a')).toBe(0);
    expect(lanes.get('b')).toBe(1);
    expect(lanes.get('c')).toBeNull();
    expect(lanes.get('d')).toBe(0);
  });
});
