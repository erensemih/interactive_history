import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PlaceIndex, type PlaceRecord, type PlacesDoc } from '../src/data/places';
import { normalizeName } from '../src/domain/names';
// @ts-expect-error plain ESM script without type declarations
import { nameKey, validatePlaces } from '../scripts/validate-places.mjs';

/**
 * The gazetteer (public/data/places.json): Natural Earth's populated places, the places it lacks, and the historical
 * names a narrator of 1800–2000 writes. Built by scripts/pipeline/build_places.py; these tests read the shipped file.
 */
const root = join(__dirname, '..');
const dataDir = join(root, 'public', 'data');
const raw = readFileSync(join(dataDir, 'places.json'));
const doc = JSON.parse(raw.toString('utf8')) as PlacesDoc;
const index = new PlaceIndex(doc);

const km = (a: [number, number], b: [number, number]) => {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b[1] - a[1]) * rad) / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(((b[0] - a[0]) * rad) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};
const first = (name: string): PlaceRecord => {
  const found = index.find(name);
  if (!found.length) throw new Error(`"${name}" is not in the gazetteer`);
  return found[0];
};
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(root, path), 'utf8')) as T;

describe('the shipped gazetteer: what it is', () => {
  it('credits Natural Earth and says what was done to it', () => {
    const { source } = doc.meta;
    expect(source.name).toContain('Natural Earth');
    expect(source.url).toContain('naturalearthdata.com');
    expect(source.license).toBe('Kamu malı (public domain)');
    expect(source.citation).toBe('Made with Natural Earth.');
    expect(source.changes).toMatch(/seçildi/);
    expect(source.changes).toMatch(/elle eklendi/);
  });

  it('has a few thousand places and stays small enough to load at start', () => {
    expect(doc.meta.count).toBe(doc.places.length);
    expect(doc.places.length).toBeGreaterThan(3000);
    expect(doc.places.length).toBeLessThan(3700);
    expect(raw.length).toBeLessThan(480 * 1024);
    expect(gzipSync(raw).length).toBeLessThan(130 * 1024);
  });

  it('has one place per line, sorted by id (a diff shows what changed)', () => {
    const lines = raw.toString('utf8').split('\n');
    const placeLines = lines.filter((l) => l.startsWith('    {"id":'));
    expect(placeLines.length).toBe(doc.places.length);
    const ids = doc.places.map((p) => p.id);
    expect(ids).toEqual([...ids].sort());
  });

  it('passes the validator (scripts/validate-places.mjs)', () => {
    const { errors, stats } = validatePlaces(dataDir);
    expect(errors).toEqual([]);
    expect(stats.places).toBe(doc.places.length);
  });
});

describe('every place is valid', () => {
  it('has a unique slug id, names, a point on the globe, a population, a country', () => {
    const problems: string[] = [];
    const seen = new Set<string>();
    for (const p of doc.places) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)) problems.push(`${p.id}: id`);
      if (seen.has(p.id)) problems.push(`${p.id}: duplicate id`);
      seen.add(p.id);
      if (!p.tr.trim() || !p.en.trim()) problems.push(`${p.id}: empty name`);
      if (!(Math.abs(p.lon) <= 180 && Math.abs(p.lat) <= 90)) problems.push(`${p.id}: point`);
      if (!(Number.isInteger(p.pop) && p.pop >= 0)) problems.push(`${p.id}: pop`);
      if (!/^[A-Z]{2}$/.test(p.cc)) problems.push(`${p.id}: cc ${p.cc}`);
      if (p.cap !== undefined && p.cap !== 1) problems.push(`${p.id}: cap`);
      if (p.key !== undefined && p.key !== 1) problems.push(`${p.id}: key`);
    }
    expect(problems).toEqual([]);
  });

  it('has an id that is the slug of its English name (the country appended where two places would share one)', () => {
    const problems = doc.places
      .map((p) => ({ id: p.id, slug: normalizeName(p.en).replace(/ /g, '-') }))
      .filter(({ id, slug }) => !(id === slug || id.startsWith(`${slug}-`)))
      .map(({ id, slug }) => `${id} vs ${slug}`);
    expect(problems).toEqual([]);
    // the biggest namesake keeps the plain slug
    expect(index.byId('london')?.cc).toBe('GB');
    expect(index.byId('london-ca')?.cc).toBe('CA');
  });

  it('has alternative names that add something: none empty, none the same as another name of the place', () => {
    const problems: string[] = [];
    for (const p of doc.places) {
      const mains = new Set([p.tr, p.en].map(normalizeName));
      const alts = p.alt.map(normalizeName);
      const where = `${p.id}: ${[p.tr, p.en, ...p.alt].join(' | ')}`;
      if (alts.some((k) => k === '')) problems.push(`${where} (empty)`);
      if (new Set(alts).size !== alts.length) problems.push(`${where} (twice)`);
      if (alts.some((k) => mains.has(k))) problems.push(`${where} (same as tr/en)`);
      if (p.alt.some((a) => /[?�]/.test(a))) problems.push(`${where} (garbled)`);
    }
    expect(problems).toEqual([]);
  });

  it('keys names the way the page does (the validator and the page agree)', () => {
    const samples = [
      'İSTANBUL',
      'ışık',
      'Straße',
      'Łódź',
      'Ærø',
      'Đà Nẵng',
      'Saint-Lô',
      "N'Djamena",
      'Ho Chi Minh City',
      'Ürümqi',
    ];
    for (const s of samples) expect(nameKey(s), s).toBe(normalizeName(s));
    const differing = doc.places.flatMap((p) => [p.tr, p.en, ...p.alt]).filter((n) => nameKey(n) !== normalizeName(n));
    expect(differing).toEqual([]);
  });

  it('marks about two hundred national capitals', () => {
    const caps = doc.places.filter((p) => p.cap);
    expect(caps.length).toBeGreaterThanOrEqual(190);
    expect(caps.length).toBeLessThanOrEqual(215);
    for (const name of [
      'Ankara',
      'Washington',
      'Moskova',
      'Kahire',
      'Pekin',
      'Brasília',
      'Canberra',
      'Ottawa',
      'Juba',
    ]) {
      expect(first(name).cap, name).toBe(1);
    }
  });

  it('puts Crimea in Ukraine, Kosovo under XK and the Hague in the Netherlands', () => {
    expect(first('Sevastopol').cc).toBe('UA');
    expect(first('Yalta').cc).toBe('UA');
    expect(first('Pristina').cc).toBe('XK');
    expect(first('The Hague').cc).toBe('NL');
  });
});

describe('finding a place by the name a narrator writes', () => {
  it('finds the places the history of the war needs, whatever they were called', () => {
    const volgograd = first('Stalingrad');
    expect(volgograd.id).toBe('volgograd');
    expect(volgograd.lon).toBeCloseTo(44.5, 0);
    expect(volgograd.lat).toBeCloseTo(48.7, 0);
    expect(first('Tsaritsyn').id).toBe('volgograd');
    expect(first('Danzig').id).toBe('gdansk');
    expect(first('Gdańsk').id).toBe('gdansk');
    expect(first('Königsberg').id).toBe('kaliningrad');
    expect(first('Koenigsberg').id).toBe('kaliningrad');
    expect(first('Peking').id).toBe('beijing');
    expect(first('Peiping').id).toBe('beijing');
    expect(first('Rangoon').id).toBe('yangon');
    expect(first('Leningrad').id).toBe('saint-petersburg');
    expect(first('Petrograd').id).toBe('saint-petersburg');
    expect(first('Breslau').id).toBe('wroclaw');
    expect(first('Lemberg').id).toBe('lviv');
    expect(first('Saigon').id).toBe('ho-chi-minh-city');
    expect(first('Batavia').id).toBe('jakarta');
  });

  it('knows Warsaw by its Turkish, English and Polish names', () => {
    for (const name of ['Varşova', 'varsova', 'Warsaw', 'WARSAW', 'Warszawa']) {
      const place = first(name);
      expect(place.id, name).toBe('warsaw');
      expect(place.lon).toBeCloseTo(21, 1);
      expect(place.lat).toBeCloseTo(52.2, 1);
      expect(place.cc).toBe('PL');
      expect(place.cap).toBe(1);
    }
  });

  it('knows Istanbul as one place, whatever the spelling or the century', () => {
    const ids = new Set(
      ['İstanbul', 'Istanbul', 'ISTANBUL', 'Constantinople', 'Konstantiniyye', 'Stamboul'].map((n) => first(n).id),
    );
    expect([...ids]).toEqual(['istanbul']);
    expect(index.find('Istanbul')).toHaveLength(1);
    expect(index.find('Constantinople')).toHaveLength(1);
  });

  it('knows Paris in France only', () => {
    const found = index.find('Paris');
    expect(found).toHaveLength(1);
    expect(found[0].cc).toBe('FR');
    expect(found[0].cap).toBe(1);
  });

  it('knows the capitals the Turkish way', () => {
    const wanted: [string, string][] = [
      ['Moskova', 'moscow'],
      ['Londra', 'london'],
      ['Roma', 'rome'],
      ['Atina', 'athens'],
      ['Viyana', 'vienna'],
      ['Prag', 'prague'],
      ['Belgrad', 'belgrade'],
      ['Budapeşte', 'budapest'],
      ['Kahire', 'cairo'],
      ['Tahran', 'tehran'],
      ['Pekin', 'beijing'],
      ['Tokyo', 'tokyo'],
      ['Berlin', 'berlin'],
      ['Varşova', 'warsaw'],
      ['Bükreş', 'bucharest'],
      ['Saraybosna', 'sarajevo'],
    ];
    for (const [name, id] of wanted) expect(first(name).id, name).toBe(id);
  });

  it('finds Berlin, Washington and the places Natural Earth lacks', () => {
    expect(first('Berlin')).toMatchObject({ id: 'berlin', cc: 'DE', cap: 1 });
    const washington = first('Washington');
    expect(washington).toMatchObject({ cc: 'US', cap: 1 });
    expect(washington.lon).toBeCloseTo(-77.04, 1);
    expect(washington.lat).toBeCloseTo(38.9, 1);
    expect(first('Sedan')).toMatchObject({ id: 'sedan', cc: 'FR' });
    expect(first('Dunkerque').id).toBe('dunkirk');
    const harbor = first('Pearl Harbor');
    expect(harbor.id).toBe('pearl-harbor');
    expect(harbor.lon).toBeCloseTo(-157.97, 1);
    expect(harbor.lat).toBeCloseTo(21.36, 1);
    for (const id of [
      'compiegne',
      'bastogne',
      'anzio',
      'cassino',
      'monte-cassino',
      'gela',
      'saint-lo',
      'oswiecim',
      'treblinka',
    ]) {
      expect(index.byId(id), id).toBeDefined();
    }
    expect(first('Auschwitz').id).toBe('oswiecim');
    expect(first('Monte Cassino').id).toBe('monte-cassino');
    for (const name of [
      'Midway',
      'Guadalcanal',
      'Iwo Jima',
      'Corregidor',
      'Kokoda',
      'Westerplatte',
      'Omaha Beach',
      'Wannsee',
      'Karlshorst',
    ]) {
      expect(index.find(name).length, name).toBeGreaterThan(0);
    }
  });

  it('finds the small places of the war that Natural Earth keeps below its size limit', () => {
    for (const name of [
      'Narvik',
      'El Alamein',
      'Yalta',
      'Vyborg',
      'Tobruk',
      'Reims',
      'Potsdam',
      'Versailles',
      'Brest-Litovsk',
      'Viipuri',
    ]) {
      expect(index.find(name).length, name).toBeGreaterThan(0);
    }
    expect(first('Brest-Litovsk')).toMatchObject({ id: 'brest', cc: 'BY' });
    expect(first('Tobruk').cc).toBe('LY');
    expect(first('Tilsit').id).toBe('sovetsk');
  });

  it('puts the namesake the period cares about first, and keeps the others', () => {
    const alexandria = index.find('Alexandria');
    expect(alexandria[0]).toMatchObject({ cc: 'EG', id: 'alexandria' });
    expect(alexandria.some((p) => p.cc === 'US')).toBe(true);
    expect(first('Salamanca').cc).toBe('ES');
    expect(index.find('Salamanca').some((p) => p.cc === 'MX')).toBe(true);
    expect(first('Valencia').cc).toBe('ES');
    expect(first('Syracuse').cc).toBe('IT');
    expect(first('York').cc).toBe('GB');
    expect(first('St. Petersburg').cc).toBe('RU');
    expect(first('Canton').id).toBe('guangzhou');
    expect(first('Naples').cc).toBe('IT');
    expect(first('Athens').cc).toBe('GR');
    expect(first('London').cc).toBe('GB');
    expect(first('Kingston').cc).toBe('JM');
  });

  it('finds nothing for what is not a place', () => {
    expect(index.find('Atlantis')).toEqual([]);
    expect(index.find('')).toEqual([]);
    expect(index.find('   ')).toEqual([]);
    expect(index.find('Küba')).toEqual([]);
  });

  it('lands every curated historical name on the place it was written for', () => {
    const lists = readJson<{ aliases: { en: string; cc: string; alt: string[] }[] }>(
      'scripts/pipeline/places-aliases.json',
    );
    expect(lists.aliases.length).toBeGreaterThan(150);
    for (const entry of lists.aliases) {
      for (const name of entry.alt) {
        const place = first(name);
        const wanted = normalizeName(entry.en);
        const lands =
          place.cc === entry.cc &&
          (normalizeName(place.en) === wanted || place.alt.some((a) => normalizeName(a) === wanted));
        expect(lands, `${name} -> ${place.id} (wanted ${entry.en}, ${entry.cc})`).toBe(true);
      }
    }
  });

  it('keeps each extra place where the list put it, and no extra place is a second copy of one the source has', () => {
    const extras = readJson<{ places: { id: string; lon: number; lat: number; cc: string }[] }>(
      'scripts/pipeline/places-extra.json',
    ).places;
    expect(extras.length).toBeGreaterThan(60);
    for (const e of extras) {
      const place = index.byId(e.id);
      expect(place, e.id).toBeDefined();
      expect(place?.lon, e.id).toBeCloseTo(e.lon, 3);
      expect(place?.lat, e.id).toBeCloseTo(e.lat, 3);
      expect(place?.cc, e.id).toBe(e.cc);
      expect(place?.key, e.id).toBe(1);
    }
  });
});

describe('agreeing with the events of the app', () => {
  // event id -> [the gazetteer place of the same name, how far apart they may be (km)]
  const same: Record<string, [string, number]> = {
    'haiti-bagimsizligi-1804': ['gonaives', 3],
    'kole-ticareti-yasagi-1807': ['london', 5],
    'waterloo-1815': ['waterloo', 3],
    'ilk-demiryolu-1825': ['darlington', 3],
    'amerikan-ic-savasi-1861': ['fort-sumter', 3],
    'alman-imparatorlugu-ilani-1871': ['versailles', 3],
    'saraybosna-suikasti-1914': ['sarajevo', 8],
    'grip-salgini-1918': ['fort-riley', 3],
    'ay-yolculugu-1969': ['cape-canaveral', 3],
    'cernobil-1986': ['chernobyl', 3],
    'guernica-bombardimani-1937': ['guernica', 3],
    'marco-polo-koprusu-1937': ['marco-polo-bridge', 3],
    'polonya-isgali-1939': ['westerplatte', 3],
    'kis-savasi-1939': ['vyborg', 3],
    'britanya-muharebesi-1940': ['dover', 5],
    'fransa-muharebesi-1940': ['sedan', 3],
    'dunkirk-1940': ['dunkirk', 3],
    'compiegne-ateskesi-1940': ['rethondes', 3],
    'barbarossa-1941': ['brest', 3],
    'pearl-harbor-1941': ['pearl-harbor', 3],
    'wannsee-1942': ['wannsee', 3],
    'midway-1942': ['midway-atoll', 3],
    'stalingrad-1942': ['volgograd', 5],
    'el-alamein-1942': ['el-alamein', 3],
    'sicilya-cikarmasi-1943': ['gela', 3],
    'normandiya-1944': ['omaha-beach', 3],
    'bretton-woods-1944': ['bretton-woods', 3],
    'ardenler-1944': ['bastogne', 3],
    'auschwitz-kurtulus-1945': ['oswiecim', 3],
    'yalta-1945': ['yalta', 3],
    'almanya-teslimi-1945': ['karlshorst', 3],
    'potsdam-1945': ['potsdam', 3],
  };
  const events = readJson<{ files: string[] }>('public/data/events/index.json').files.flatMap(
    (f) =>
      readJson<{ events: { id: string; location: { coordinates: [number, number] } }[] }>(`public/data/events/${f}`)
        .events,
  );

  it('puts the places of the events where the events put them', () => {
    for (const [eventId, [placeId, within]] of Object.entries(same)) {
      const event = events.find((e) => e.id === eventId);
      const place = index.byId(placeId);
      expect(event, eventId).toBeDefined();
      expect(place, placeId).toBeDefined();
      const apart = km(event!.location.coordinates, [place!.lon, place!.lat]);
      expect(apart, `${eventId} / ${placeId}`).toBeLessThanOrEqual(within);
    }
  });

  it('names the place of most events: the Turkish name an event gives is a name the gazetteer knows', () => {
    const named = events.filter(
      (e) => index.find((e as unknown as { location: { name: { tr: string } } }).location.name.tr).length > 0,
    );
    expect(named.length / events.length).toBeGreaterThan(0.75);
  });
});

describe('PlaceIndex', () => {
  const place = (id: string, over: Partial<PlaceRecord>): PlaceRecord => ({
    id,
    tr: id,
    en: id,
    lon: 0,
    lat: 0,
    pop: 0,
    cc: 'XX',
    alt: [],
    ...over,
  });
  const small = new PlaceIndex({
    meta: { source: { name: 'x', url: 'x', license: 'x' } as PlacesDoc['meta']['source'] },
    places: [
      place('salamanca', { tr: 'Salamanca', en: 'Salamanca', pop: 197000, cc: 'MX' }),
      place('salamanca-es', { tr: 'Salamanca', en: 'Salamanca', pop: 162000, cc: 'ES', key: 1 }),
      place('st-petersburg', { tr: 'St. Petersburg', en: 'St. Petersburg', pop: 260000, cc: 'US' }),
      place('saint-petersburg', {
        tr: 'Sankt Petersburg',
        en: 'Saint Petersburg',
        pop: 4500000,
        cc: 'RU',
        key: 1,
        alt: ['Leningrad', 'St Petersburg'],
      }),
      place('koln', { tr: 'Köln', en: 'Cologne', cc: 'DE', alt: ['KOLN'] }),
      place('victoria', { tr: 'Victoria', en: 'Victoria', pop: 289000, cc: 'CA' }),
      place('victoria-sc', { tr: 'Victoria', en: 'Victoria', pop: 33000, cc: 'SC', cap: 1 }),
      place('victoria-hk', { tr: 'Victoria', en: 'Victoria', pop: 900000, cc: 'HK' }),
      place('lisbon', { tr: 'Lizbon', en: 'Lisbon', cc: 'PT', alt: ['Lisboa'] }),
      place('lisbonne', { tr: 'Lisboa', en: 'Lisboa', cc: 'BR', pop: 5 }),
    ],
  });

  it('counts, finds by id and tolerates a missing document', () => {
    expect(small.size).toBe(10);
    expect(small.byId('lisbon')?.cc).toBe('PT');
    expect(small.byId('nowhere')).toBeUndefined();
    expect(new PlaceIndex(null).size).toBe(0);
    expect(new PlaceIndex(null).find('Lisbon')).toEqual([]);
  });

  it('matches whatever the case, accents or punctuation', () => {
    expect(small.find('KÖLN')[0].id).toBe('koln');
    expect(small.find('koln')[0].id).toBe('koln');
    expect(small.find('cologne')[0].id).toBe('koln');
    expect(small.find('  St.  Petersburg ').length).toBeGreaterThan(0);
    expect(small.find('LİZBON')[0].id).toBe('lisbon');
    expect(small.find('lizbon')[0].id).toBe('lisbon');
  });

  it('puts a place of the data first, then a name before an alternative name, a capital, the bigger', () => {
    expect(small.find('Salamanca').map((p) => p.id)).toEqual(['salamanca-es', 'salamanca']);
    expect(small.find('St Petersburg').map((p) => p.id)).toEqual(['saint-petersburg', 'st-petersburg']);
    expect(small.find('Lisboa').map((p) => p.id)).toEqual(['lisbonne', 'lisbon']); // its own name before an alternative one
    expect(small.find('Victoria').map((p) => p.id)).toEqual(['victoria-sc', 'victoria-hk', 'victoria']); // capital, then size
  });

  it('breaks the last tie by id, so the order never changes', () => {
    const twins = new PlaceIndex({
      meta: small.byId('lisbon') ? ({} as PlacesDoc['meta']) : ({} as PlacesDoc['meta']),
      places: [place('b-town', { tr: 'Town', en: 'Town' }), place('a-town', { tr: 'Town', en: 'Town' })],
    });
    expect(twins.find('town').map((p) => p.id)).toEqual(['a-town', 'b-town']);
  });
});
