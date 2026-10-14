import { describe, expect, it } from 'vitest';
import { cleanLabel, normalizeName, Resolver } from '../src/ai/resolve';
import { PlaceIndex } from '../src/data/places';
import type { BorderRow } from '../src/domain/types';
import { withMiniPlaces } from './helpers/places';
import { archivedData } from './helpers/shipped';

const data = archivedData('1400-1600');
const resolver = new Resolver(data);
const range = { from: 1500, to: 1550 };

describe('normalizeName', () => {
  it('folds case, accents and Turkish letters so spellings meet', () => {
    expect(normalizeName('Osmanlı İmparatorluğu')).toBe('osmanli imparatorlugu');
    expect(normalizeName('OSMANLI')).toBe('osmanli');
    expect(normalizeName('Çaldıran')).toBe('caldiran');
    expect(normalizeName('  Safevî   Devleti ')).toBe('safevi devleti');
    expect(normalizeName("Kutsal Roma İmparatorluğu'nun küçük devletleri")).toBe(
      'kutsal roma imparatorlugu nun kucuk devletleri',
    );
  });
});

describe('cleanLabel', () => {
  it('keeps one short plain line', () => {
    expect(cleanLabel('  Mohaç,\n 1526 ', 28)).toBe('Mohaç, 1526');
    expect(cleanLabel('**kalın** `kod` <b>', 28)).toBe('kalın kod b');
    expect(cleanLabel('', 28)).toBeNull();
    expect(cleanLabel('   ', 28)).toBeNull();
    expect(cleanLabel(undefined, 28)).toBeNull();
    expect(cleanLabel({}, 28)).toBeNull();
  });

  it('cuts a long label with an ellipsis instead of overflowing the map', () => {
    const out = cleanLabel('Çok uzun bir etiket yazısı tam burada bitmiyor', 20)!;
    expect(out.length).toBeLessThanOrEqual(20);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('Resolver.polity', () => {
  it('accepts the id, the Turkish name, the short name and the English id words', () => {
    expect(resolver.polity('ottoman-empire', range)).toBe('ottoman-empire');
    expect(resolver.polity('Osmanlı İmparatorluğu', range)).toBe('ottoman-empire');
    expect(resolver.polity('osmanli', range)).toBe('ottoman-empire');
    expect(resolver.polity('Ottoman Empire', range)).toBe('ottoman-empire');
    expect(resolver.polity('Fransa', range)).toBe('kingdom-of-france');
    expect(resolver.polity('Fransa Krallığı', range)).toBe('kingdom-of-france');
    expect(resolver.polity('  safavid-dynasty ', range)).toBe('safavid-dynasty');
  });

  it('takes a name that merely starts like one polity ("Osmanlı Devleti")', () => {
    expect(resolver.polity('Osmanlı Devleti', range)).toBe('ottoman-empire');
  });

  it('declines what does not exist, is not a string, or is ambiguous', () => {
    expect(resolver.polity('atlantis', range)).toBeNull();
    expect(resolver.polity('', range)).toBeNull();
    expect(resolver.polity(42, range)).toBeNull();
    expect(resolver.polity(null, range)).toBeNull();
    expect(resolver.polity('Habsburg', range)).toBeNull(); // the monarchy and the house both fit
    expect(resolver.polity('de', range)).toBeNull(); // too short to be a prefix
  });

  it('declines a polity that has no borders in the range (it could not be drawn)', () => {
    expect(resolver.polity('ottoman-empire', { from: 1400, to: 1410 })).toBe('ottoman-empire');
    expect(resolver.polity('mamluk-sultanate', { from: 1560, to: 1580 })).toBeNull();
    expect(resolver.polity('Memlük Sultanlığı', { from: 1560, to: 1580 })).toBeNull();
  });
});

describe('Resolver geometry', () => {
  it('anchors a polity at its biggest part in the year asked, and has none outside its years', () => {
    const a = resolver.anchorAt('ottoman-empire', 1536)!;
    expect(a.lon).toBeGreaterThan(30);
    expect(a.lat).toBeGreaterThan(30);
    expect(resolver.anchorAt('mamluk-sultanate', 1550)).toBeNull();
    expect(resolver.rowAt('mamluk-sultanate', 1500)?.id).toBe('mamluk-sultanate');
  });

  it('joins a polity of several big parts from the part nearest the other end', () => {
    // 1526: the Ottoman Empire's biggest part is Egypt and Arabia, but Hungary is reached from Anatolia and the Balkans
    const hungary = resolver.anchorAt('kingdom-of-hungary', 1526)!;
    const main = resolver.anchorAt('ottoman-empire', 1526)!;
    const toward = resolver.anchorToward('ottoman-empire', 1526, hungary)!;
    expect(main.lat).toBeLessThan(30); // Egypt
    expect(toward.lat).toBeGreaterThan(36);
    expect(Math.hypot(toward.lon - hungary.lon, toward.lat - hungary.lat)).toBeLessThan(
      Math.hypot(main.lon - hungary.lon, main.lat - hungary.lat),
    );
    // and towards Egypt's side it is the other way round
    const cairo = { lon: 31.2, lat: 30 };
    expect(resolver.anchorToward('ottoman-empire', 1526, cairo)!.lat).toBeLessThan(31);
    // a polity of one part is as before, and one that has no borders in that year has no anchor
    expect(resolver.anchorToward('kingdom-of-hungary', 1536, cairo)).toEqual(
      resolver.anchorAt('kingdom-of-hungary', 1536),
    );
    expect(resolver.anchorToward('mamluk-sultanate', 1550, hungary)).toBeNull();
    // the middle of a part really lies in that part: the French end towards Hungary is on French land
    const france = resolver.anchorToward('kingdom-of-france', 1536, hungary)!;
    expect(france.lon).toBeGreaterThan(-5);
    expect(france.lon).toBeLessThan(10);
    expect(france.lat).toBeGreaterThan(41);
    expect(france.lat).toBeLessThan(51);
  });

  it('accepts a point on the map, rounded, and numbers written as text', () => {
    expect(resolver.point(28.97831, 41.01384)).toEqual({ lon: 28.978, lat: 41.014 });
    expect(resolver.point('28,97', '41.01')).toEqual({ lon: 28.97, lat: 41.01 });
  });

  it('declines points the map cannot show', () => {
    expect(resolver.point(200, 10)).toBeNull();
    expect(resolver.point(10, 89)).toBeNull();
    expect(resolver.point(10, -75)).toBeNull();
    expect(resolver.point('abc', 10)).toBeNull();
    expect(resolver.point(Number.NaN, 10)).toBeNull();
    expect(resolver.point(undefined, undefined)).toBeNull();
  });

  it('accepts only years inside the range', () => {
    expect(resolver.year(1536, range)).toBe(1536);
    expect(resolver.year('1536', range)).toBe(1536);
    expect(resolver.year(1536.4, range)).toBe(1536);
    expect(resolver.year(1560, range)).toBeNull();
    expect(resolver.year(1499, range)).toBeNull();
    expect(resolver.year('x', range)).toBeNull();
  });
});

describe('Resolver.catalog', () => {
  const catalog = resolver.catalog(range);
  const byId = new Map(catalog.map((c) => [c.id, c]));

  it('lists the polities that have borders in the range, with Turkish names', () => {
    expect(byId.get('ottoman-empire')?.name).toBe('Osmanlı İmparatorluğu');
    expect(byId.get('kingdom-of-france')).toMatchObject({ from: 1500, to: 1550 });
    expect(catalog.length).toBeGreaterThan(100);
  });

  it('gives the years inside the range for a polity that is there only part of the time', () => {
    const mamluk = byId.get('mamluk-sultanate')!;
    expect(mamluk.from).toBe(1500);
    expect(mamluk.to).toBeLessThan(1550);
  });

  it('leaves out polities that are not there at all', () => {
    expect(resolver.catalog({ from: 1590, to: 1600 }).some((c) => c.id === 'mamluk-sultanate')).toBe(false);
  });
});

describe('Resolver.boundsAt', () => {
  it('is the box around the main parts of a polity, not around an island or an exclave far away', () => {
    const [w, s, e, n] = resolver.boundsAt('ottoman-empire', 1526)!;
    expect(w).toBeLessThan(30); // the Balkans and Anatolia...
    expect(e).toBeGreaterThan(40);
    expect(s).toBeLessThan(33); // ...and Egypt
    expect(n).toBeGreaterThan(40);
    const box = resolver.boundsAt('kingdom-of-france', 1536)!;
    expect(box[2] - box[0]).toBeLessThan(25); // France, not the world
    expect(box[3] - box[1]).toBeLessThan(15);
  });

  it('is null for a polity without borders that year, and the same box on every call', () => {
    expect(resolver.boundsAt('mamluk-sultanate', 1530)).toBeNull();
    expect(resolver.boundsAt('yok', 1530)).toBeNull();
    expect(resolver.boundsAt('ottoman-empire', 1526)).toBe(resolver.boundsAt('ottoman-empire', 1526));
  });
});

describe('Resolver events', () => {
  it('knows an event by its id, however it is spelled, or by a title that names exactly one', () => {
    expect(resolver.event('caldiran-1514')?.id).toBe('caldiran-1514');
    expect(resolver.event('Caldiran 1514')?.id).toBe('caldiran-1514');
    expect(resolver.event('Çaldıran Muharebesi')?.id).toBe('caldiran-1514');
    expect(resolver.event('çaldıran')?.id).toBe('caldiran-1514'); // a title that starts like it
    expect(resolver.event("İstanbul'un Fethi")?.id).toBe('istanbul-fethi-1453');
  });

  it('does not guess: unknown, ambiguous or too short names are nothing', () => {
    expect(resolver.event('atlantis')).toBeNull();
    expect(resolver.event('')).toBeNull();
    expect(resolver.event('Mu')).toBeNull();
    expect(resolver.event(42)).toBeNull();
    expect(resolver.event(null)).toBeNull();
    expect(resolver.event('Muharebesi')).toBeNull(); // starts nothing
  });

  it('lists the events of the range with their ids, oldest first', () => {
    const list = resolver.eventCatalog(range);
    expect(list.map((e) => e.id)).toContain('caldiran-1514');
    expect(list.map((e) => e.id)).not.toContain('istanbul-fethi-1453');
    expect(list[0]).toMatchObject({ id: expect.any(String), title: expect.any(String), dateLabel: expect.any(String) });
    const years = list.map((e) => resolver.eventById(e.id)!.start);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });
});

describe('Resolver.eventFor (a mark that is really an event)', () => {
  const at = (id: string) => {
    const ev = resolver.eventById(id)!;
    return { lon: ev.location.lon, lat: ev.location.lat };
  };

  it('finds the event a label names, at its place', () => {
    expect(resolver.eventFor('Çaldıran', at('caldiran-1514'), range)?.id).toBe('caldiran-1514');
    expect(resolver.eventFor('Mohaç, 1526', at('mohac-1526'), range)?.id).toBe('mohac-1526');
    expect(resolver.eventFor('Mohaç Muharebesi', at('mohac-1526'), range)?.id).toBe('mohac-1526');
    expect(resolver.eventFor('Preveze', { lon: 20.7, lat: 38.95 }, range)?.id).toBe('preveze-1538'); // a few km off is fine
  });

  it('does not take a place for an event: the city of the same name, another year, another place, another range', () => {
    expect(resolver.eventFor('Kahire', at('ridaniye-1517'), range)).toBeNull();
    expect(resolver.eventFor('Mohaç, 1683', at('mohac-1526'), range)).toBeNull();
    expect(resolver.eventFor('Mohaç', { lon: 2.35, lat: 48.85 }, range)).toBeNull();
    expect(resolver.eventFor('Mohaç', at('mohac-1526'), { from: 1400, to: 1450 })).toBeNull();
    expect(resolver.eventFor('', { lon: 0, lat: 0 }, range)).toBeNull();
  });
});

describe('Resolver places (a few cities and capitals on the 1400–1600 data)', () => {
  const places = new Resolver(withMiniPlaces(data));
  const IST = { lon: 28.98, lat: 41.01 };

  it('reads "enlem, boylam" in the ways a model writes it, and understands a swapped pair', () => {
    expect(places.coordinates('52.23, 21.01')).toEqual({ lon: 21.01, lat: 52.23 });
    expect(places.coordinates(' 52.23 ; 21.01 ')).toEqual({ lon: 21.01, lat: 52.23 });
    expect(places.coordinates('-33.9 151.2')).toEqual({ lon: 151.2, lat: -33.9 });
    expect(places.coordinates([52.23, 21.01])).toEqual({ lon: 21.01, lat: 52.23 });
    expect(places.coordinates(['52.23', '21,01'])).toEqual({ lon: 21.01, lat: 52.23 });
    expect(places.coordinates({ lat: 52.23, lon: 21.01 })).toEqual({ lon: 21.01, lat: 52.23 });
    expect(places.coordinates({ enlem: '52.23', boylam: '21.01' })).toEqual({ lon: 21.01, lat: 52.23 });
    // a first number that cannot be a latitude is the longitude
    expect(places.coordinates('120.5, 31.2')).toEqual({ lon: 120.5, lat: 31.2 });
  });

  it('declines what is not a point, or is a point the map cannot show', () => {
    for (const bad of [
      'Berlin',
      '',
      '52.23',
      '1e3, 5',
      '52,23; 21,01',
      null,
      undefined,
      5,
      {},
      [1],
      [1, 2, 3],
      '95, 100',
      '-70, 10',
    ])
      expect(places.coordinates(bad), String(bad)).toBeNull();
  });

  it('names a place: coordinates first, then an event, a polity, a city by any name, a polity by its name, an event by its title', () => {
    expect(places.placeRef('41.01, 28.98', range)).toEqual({ kind: 'point', point: IST });
    expect(places.placeRef('caldiran-1514', range)).toEqual({
      kind: 'event',
      id: 'caldiran-1514',
      name: places.eventById('caldiran-1514')!.location.name,
    });
    expect(places.placeRef('ottoman-empire', range)).toEqual({ kind: 'polity', id: 'ottoman-empire' });
    expect(places.placeRef('Konstantinopolis', range)).toEqual({ kind: 'city', id: 'istanbul', name: 'İstanbul' });
    expect(places.placeRef('  adrianople ', range)).toEqual({ kind: 'city', id: 'edirne', name: 'Edirne' }); // case and spaces do not matter
    expect(places.placeRef('Osmanlı İmparatorluğu', range)).toEqual({ kind: 'polity', id: 'ottoman-empire' });
    expect(places.placeRef('Mohaç Muharebesi', range)).toMatchObject({ kind: 'event', id: 'mohac-1526' });
  });

  it('declines a place nobody knows, a polity with no borders in the range, and what is not text', () => {
    expect(places.placeRef('Atlantis', range)).toBeNull();
    expect(places.placeRef('albanian-principalities', range)).toBeNull(); // gone before the range
    expect(places.placeRef('', range)).toBeNull();
    expect(places.placeRef(null, range)).toBeNull();
    expect(places.placeRef(42, range)).toBeNull();
    expect(places.placeRef(['İstanbul'], range)).toBeNull();
  });

  it('puts a city before a polity of the same name: a line goes to the city, a polity is named by its id', () => {
    const both = new Resolver({
      ...withMiniPlaces(data),
      places: new PlaceIndex({
        meta: { source: { name: 't', url: 'u', license: 'l' } },
        places: [{ id: 'macaristan', tr: 'Macaristan', en: 'Hungary', lon: 19, lat: 47, pop: 1, cc: 'HU', alt: [] }],
      }),
    });
    expect(both.placeRef('Macaristan', range)).toEqual({ kind: 'city', id: 'macaristan', name: 'Macaristan' });
    expect(both.placeRef('kingdom-of-hungary', range)).toEqual({ kind: 'polity', id: 'kingdom-of-hungary' });
  });

  it('puts a place on the map: a city, an event or a point as it is, a polity at its capital of that year', () => {
    expect(places.placePoint({ kind: 'city', id: 'istanbul', name: 'x' }, 1500)).toEqual(IST);
    expect(places.placePoint({ kind: 'city', id: 'yok', name: 'x' }, 1500)).toBeNull();
    expect(places.placePoint({ kind: 'point', point: { lon: 1, lat: 2 } }, 1500)).toEqual({ lon: 1, lat: 2 });
    expect(places.placePoint({ kind: 'event', id: 'mohac-1526', name: 'x' }, 1500)).toEqual({ lon: 18.68, lat: 45.99 });
    expect(places.placePoint({ kind: 'event', id: 'yok', name: 'x' }, 1500)).toBeNull();
    expect(places.placePoint({ kind: 'polity', id: 'ottoman-empire' }, 1540)).toEqual(IST);
    expect(places.placePoint({ kind: 'polity', id: 'ottoman-empire' }, 1440)).toEqual({ lon: 26.56, lat: 41.68 });
  });

  it('puts a polity the table has no capital for at the middle of its biggest part, or of the part nearest the other end', () => {
    const safavid = { kind: 'polity', id: 'safavid-dynasty' } as const;
    expect(places.capitalPoint('safavid-dynasty', 1520)).toBeNull();
    expect(places.placePoint(safavid, 1520)).toEqual(places.anchorAt('safavid-dynasty', 1520));
    expect(places.placePoint(safavid, 1520, IST)).toEqual(places.anchorToward('safavid-dynasty', 1520, IST));
    // the table is not asked about a polity without borders that year
    expect(places.placePoint({ kind: 'polity', id: 'mamluk-sultanate' }, 1540)).toBeNull();
  });

  it('says what a place is called, and when two references are one place', () => {
    expect(places.placeName({ kind: 'city', id: 'istanbul', name: 'İstanbul' })).toBe('İstanbul');
    expect(places.placeName({ kind: 'event', id: 'mohac-1526', name: 'Mohaç' })).toBe('Mohaç');
    expect(places.placeName({ kind: 'polity', id: 'ottoman-empire' })).toBe('Osmanlı İmparatorluğu');
    expect(places.placeName({ kind: 'point', point: { lon: 21.01, lat: 52.23 } })).toBe('52.23, 21.01');
    const ist = { kind: 'city', id: 'istanbul', name: 'İstanbul' } as const;
    expect(places.samePlace(ist, { ...ist, name: 'Konstantiniyye' })).toBe(true);
    expect(places.samePlace(ist, { kind: 'city', id: 'edirne', name: 'Edirne' })).toBe(false);
    expect(places.samePlace(ist, { kind: 'polity', id: 'istanbul' })).toBe(false); // (an id of another kind is another thing)
    expect(places.samePlace({ kind: 'point', point: IST }, { kind: 'point', point: { lon: 28.99, lat: 41.02 } })).toBe(
      true,
    );
    expect(places.samePlace({ kind: 'point', point: IST }, { kind: 'point', point: { lon: 29.5, lat: 41.02 } })).toBe(
      false,
    );
    expect(places.samePlace({ kind: 'point', point: IST }, ist)).toBe(false);
  });

  it('without a gazetteer or a table of capitals it still works: polities are their middles, cities are not known', () => {
    expect(resolver.placeRef('Konstantinopolis', range)).toBeNull();
    expect(resolver.placeRef('Edirne', range)).toBeNull();
    // (a name that starts the title of exactly one event is that event's place, the gazetteer or not)
    expect(resolver.placeRef('Istanbul', range)).toMatchObject({ kind: 'event', id: 'istanbul-fethi-1453' });
    expect(resolver.placeRef('ottoman-empire', range)).toEqual({ kind: 'polity', id: 'ottoman-empire' });
    expect(resolver.capitalPoint('ottoman-empire', 1540)).toBeNull();
    expect(resolver.placePoint({ kind: 'polity', id: 'ottoman-empire' }, 1540)).toEqual(
      resolver.anchorAt('ottoman-empire', 1540),
    );
  });
});

describe('Resolver.rowAt when the data has more than one row for a polity in a year', () => {
  const row = (id: string, from: number, to: number, area: number): BorderRow => ({
    id,
    from,
    to,
    area,
    label: [10, 10, 1],
    bbox: [0, 0, 20, 20],
    box: [0, 0, 20, 20],
    polys: [
      [
        [
          [0, 0],
          [20, 0],
          [20, 20],
          [0, 20],
          [0, 0],
        ],
      ],
    ],
  });

  it('is the biggest row, so a small piece added for some years never takes the place of the polity itself', () => {
    const r = new Resolver({
      entities: new Map(),
      rows: [row('x', 1900, 1990, 1_000_000), row('x', 1942, 1945, 700), row('y', 1900, 1990, 5)],
    });
    expect(r.rowAt('x', 1930)?.area).toBe(1_000_000);
    expect(r.rowAt('x', 1943)?.area).toBe(1_000_000); // not the small piece
    expect(r.rowAt('x', 1991)).toBeNull();
    expect(r.rowAt('nobody', 1943)).toBeNull();
    // and a polity that exists in the year only through a small piece is still there
    const only = new Resolver({ entities: new Map(), rows: [row('z', 1942, 1945, 700)] });
    expect(only.rowAt('z', 1943)?.area).toBe(700);
  });
});

describe('the border of a polity as a place ("sınır: devlet → yer")', () => {
  const places = new Resolver(withMiniPlaces(data));
  const VIENNA = { lon: 16.37, lat: 48.21 };
  const vienna = { kind: 'city', id: 'vienna', name: 'Viyana' };

  it('is written with an arrow, or any of the ways a model writes one, and has a polity and a place', () => {
    for (const text of [
      'sınır: ottoman-empire → Viyana',
      'Sınır: Osmanlı İmparatorluğu -> Viyana',
      'sinir: ottoman-empire => viyana',
      'border: ottoman-empire > Wien',
      'sınır: ottoman-empire, Viyana',
      'sınır: ottoman-empire; Viyana',
      'sınır: ottoman-empire doğru Viyana',
      'border: ottoman-empire toward Vienna',
      '  Sınır :  Osmanlı   → Viyana ',
    ]) {
      expect(places.placeRef(text, range), text).toEqual({ kind: 'border', id: 'ottoman-empire', toward: vienna });
    }
  });

  it('may look toward any kind of place: an event, a point, the capital of another polity', () => {
    expect(places.placeRef('sınır: ottoman-empire → mohac-1526', range)).toMatchObject({
      kind: 'border',
      toward: { kind: 'event', id: 'mohac-1526' },
    });
    expect(places.placeRef('sınır: ottoman-empire → 48.2, 16.4', range)).toMatchObject({
      kind: 'border',
      toward: { kind: 'point', point: { lon: 16.4, lat: 48.2 } },
    });
    expect(places.placeRef('sınır: ottoman-empire → kingdom-of-france', range)).toMatchObject({
      kind: 'border',
      toward: { kind: 'polity', id: 'kingdom-of-france' },
    });
  });

  it('is nothing when it is not written that way, or when either end is not known', () => {
    for (const text of [
      'sınır: atlantis → Viyana',
      'sınır: ottoman-empire → Atlantis',
      'sınır: ottoman-empire',
      'sınır: → Viyana',
      'sınır: albanian-principalities → Viyana', // gone before the range
      'ülke: ottoman-empire → Viyana',
    ])
      expect(places.placeRef(text, range), text).toBeNull();
    // a border toward a border is no place (the end of a border is a place, not another border)
    expect(places.placeRef('sınır: ottoman-empire → sınır: kingdom-of-france → Viyana', range)).toBeNull();
  });

  it('is named, and told from the polity itself and from another border', () => {
    const a = places.placeRef('sınır: ottoman-empire → Viyana', range)!;
    expect(places.placeName(a)).toBe('Osmanlı İmparatorluğu sınırı');
    expect(places.samePlace(a, places.placeRef('sınır: ottoman-empire → viyana', range)!)).toBe(true);
    expect(places.samePlace(a, places.placeRef('sınır: ottoman-empire → Paris', range)!)).toBe(false);
    expect(places.samePlace(a, { kind: 'polity', id: 'ottoman-empire' })).toBe(false);
  });

  it('is the point of the polity’s border nearest the place it looks toward, on the polity’s side of the front', () => {
    const point = places.borderPoint('ottoman-empire', 1526, VIENNA)!;
    expect(point).not.toBeNull();
    // it lies on the border: nearer Vienna than the capital is, and Vienna is not Ottoman land in 1526
    const scale = Math.cos((VIENNA.lat * Math.PI) / 180); // (a degree of longitude is shorter here than a degree of latitude)
    const dist = (p: { lon: number; lat: number }) => Math.hypot((p.lon - VIENNA.lon) * scale, p.lat - VIENNA.lat);
    expect(dist(point)).toBeLessThan(dist({ lon: 28.98, lat: 41.01 }));
    // and it is the nearest of all the points of the ring: no vertex of the row is nearer
    const row = places.rowAt('ottoman-empire', 1526)!;
    let nearest = Infinity;
    for (const poly of row.polys)
      for (const ring of poly) for (const [x, y] of ring) nearest = Math.min(nearest, dist({ lon: x!, lat: y! }));
    expect(dist(point)).toBeLessThanOrEqual(nearest + 1e-3);
    // a point on the border is where the stop is: the route's point for the stop is the same
    expect(places.placePoint({ kind: 'border', id: 'ottoman-empire', toward: vienna as never }, 1526)).toEqual(point);
  });

  it('is nowhere for a polity with no borders in the year, for a place that is nowhere, and an army starts from where it is, not from its capital', () => {
    expect(places.borderPoint('mamluk-sultanate', 1530, VIENNA)).toBeNull();
    expect(places.borderPoint('atlantis', 1530, VIENNA)).toBeNull();
    expect(
      places.placePoint(
        { kind: 'border', id: 'ottoman-empire', toward: { kind: 'polity', id: 'mamluk-sultanate' } },
        1530,
      ),
    ).toBeNull();
    const capital = places.placePoint({ kind: 'polity', id: 'ottoman-empire' }, 1526)!;
    const border = places.placePoint({ kind: 'border', id: 'ottoman-empire', toward: vienna as never }, 1526)!;
    expect(border).not.toEqual(capital);
  });

  it('keeps the short way over the date line: the nearest point is found around the place, not across the map', () => {
    const rows: BorderRow[] = [
      {
        id: 'ada',
        from: 1900,
        to: 1950,
        area: 1,
        label: null,
        bbox: [170, -10, 179, 10],
        box: [170, -10, 179, 10],
        polys: [
          [
            [
              [170, -10],
              [179, -10],
              [179, 10],
              [170, 10],
              [170, -10],
            ],
          ],
        ],
      },
    ];
    const r = new Resolver({ entities: new Map(), rows });
    // a place just over the date line (−178°): the nearest border of the island is its east edge at 179°, 3° away
    const p = r.borderPoint('ada', 1920, { lon: -178, lat: 0 })!;
    expect(p.lon).toBeCloseTo(179, 3);
    expect(Math.abs(p.lat)).toBeLessThan(0.5);
  });
});
