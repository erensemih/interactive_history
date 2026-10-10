import { describe, expect, it } from 'vitest';
import { cleanLabel, normalizeName, Resolver } from '../src/ai/resolve';
import { shippedData } from './helpers/shipped';

const data = shippedData();
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
