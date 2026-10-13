import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CapitalIndex, type CapitalSpan, type CapitalsDoc } from '../src/data/capitals';
import { PlaceIndex, type PlaceRecord, type PlacesDoc } from '../src/data/places';
// @ts-expect-error plain ESM script without type declarations
import { drawnYears, validateCapitals } from '../scripts/validate-places.mjs';

/**
 * The capitals table (public/data/capitals.json): where a polity was governed from, year by year, for the polities the
 * data and the war need. Hand-compiled; these tests read the shipped file and the shipped gazetteer and entities.
 */
const root = join(__dirname, '..');
const dataDir = join(root, 'public', 'data');
const readJson = <T>(path: string): T => JSON.parse(readFileSync(join(dataDir, path), 'utf8')) as T;

type Years = Record<string, { from: number; to: number }>;
const capitalsDoc = readJson<CapitalsDoc>('capitals.json');
const placesDoc = readJson<PlacesDoc>('places.json');
const entities = readJson<{ entities: Record<string, { kind: string; sameAs?: string }> }>('entities.json').entities;
const derived = readJson<{ entities: Years }>('borders/polities.json').entities;
const drawn: Years = drawnYears(dataDir, derived);
const places = new PlaceIndex(placesDoc);
const capitals = new CapitalIndex(capitalsDoc, places);

const events = readJson<{ files: string[] }>('events/index.json').files.flatMap(
  (f) =>
    readJson<{ events: { id: string; date: string | { start: string }; parties: string[]; versus?: string[] }[] }>(
      `events/${f}`,
    ).events,
);
const yearOf = (date: string | { start: string }) => Number((typeof date === 'string' ? date : date.start).slice(0, 4));
const at = (polity: string, year: number) => capitals.at(polity, year)?.id ?? null;
const spansOf = (polity: string): CapitalSpan[] => capitalsDoc.capitals[polity] ?? [];

describe('the shipped capitals table: what it is', () => {
  it('says what it is and what it leaves out', () => {
    expect(capitalsDoc.meta.note).toMatch(/başkent/);
    expect(capitalsDoc.meta.note).toMatch(/etiket noktası/);
    expect(capitalsDoc.meta.sources?.length).toBeGreaterThan(0);
  });

  it('is small and covers a few hundred polities', () => {
    expect(Object.keys(capitalsDoc.capitals).length).toBeGreaterThan(300);
    expect(statSize()).toBeLessThan(90 * 1024);
  });

  it('passes the validator (scripts/validate-places.mjs) without a warning', () => {
    const { errors, warnings, stats } = validateCapitals(dataDir);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(stats.eventPartiesCovered).toBe(stats.eventParties);
  });
});

function statSize(): number {
  return statSync(join(dataDir, 'capitals.json')).size;
}

describe('every entry is consistent with the rest of the data', () => {
  it('names a place of the gazetteer', () => {
    const missing = Object.entries(capitalsDoc.capitals).flatMap(([polity, spans]) =>
      spans.filter((s) => !places.byId(s.place)).map((s) => `${polity}: ${s.place}`),
    );
    expect(missing).toEqual([]);
  });

  it('names a polity of entities.json, by its canonical id (an alias is no polity)', () => {
    const bad = Object.keys(capitalsDoc.capitals).filter((id) => {
      const e = entities[id];
      return !e || e.kind !== 'polity' || e.sameAs !== undefined || !derived[id];
    });
    expect(bad).toEqual([]);
  });

  it('has whole-year spans that never overlap, in order', () => {
    const problems: string[] = [];
    for (const [polity, spans] of Object.entries(capitalsDoc.capitals)) {
      let last = -Infinity;
      for (const s of spans) {
        if (!Number.isInteger(s.from) || !Number.isInteger(s.to) || s.from > s.to)
          problems.push(`${polity}: ${s.from}–${s.to}`);
        if (s.from <= last) problems.push(`${polity}: ${s.from} overlaps or is out of order`);
        last = Math.max(last, s.to);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps every span inside the years the polity is drawn (its rows in polities.json, and those the correction layer adds)', () => {
    const outside = Object.entries(capitalsDoc.capitals).flatMap(([polity, spans]) =>
      spans
        .filter((s) => s.from < drawn[polity].from || s.to > drawn[polity].to)
        .map((s) => `${polity}: ${s.from}–${s.to} not in ${drawn[polity].from}–${drawn[polity].to}`),
    );
    expect(outside).toEqual([]);
    // the correction layer draws Nazi Germany in 1945, and the table follows
    expect(drawn['nazi-germany'].to).toBe(1945);
    expect(derived['nazi-germany'].to).toBe(1944);
  });

  it('makes the capital places key places of the gazetteer, so a shared name means the capital', () => {
    const notKey = new Set<string>();
    for (const spans of Object.values(capitalsDoc.capitals))
      for (const s of spans) if (places.byId(s.place)?.key !== 1) notKey.add(s.place);
    expect([...notKey]).toEqual([]);
  });

  it('gives a note to every capital that is not the plain answer: a wartime, temporary or divided seat', () => {
    const noted: [string, number][] = [
      ['republic-of-china', 1938],
      ['republic-of-china', 1950],
      ['vichy-france', 1941],
      ['free-french', 1941],
      ['free-french', 1944],
      ['second-spanish-republic', 1937],
      ['second-spanish-republic', 1938],
      ['spanish-nationalists', 1937],
      ['netherlands', 1950],
      ['bolivia', 1950],
      ['kingdom-of-lithuania', 1930],
      ['romania', 1917],
      ['serbia', 1915],
      ['kingdom-of-prussia', 1807],
      ['state-of-israel', 1960],
      ['republic-of-cote-d-ivoire', 1990],
      ['republic-of-benin', 1990],
      ['federal-republic-of-germany', 1960],
      ['german-democratic-republic', 1960],
      ['federated-republic-of-germany', 1995],
      ['qing-dynasty', 1901],
      ['republic-of-indonesia', 1947],
      ['republic-of-the-philippines', 1960],
      ['islamic-republic-of-pakistan', 1962],
      ['british-raj', 1920],
      ['commonwealth-of-australia', 1910],
      ['south-africa', 1950],
    ];
    const without = noted.filter(([polity, year]) => {
      const span = spansOf(polity).find((s) => s.from <= year && year <= s.to);
      return !span?.note;
    });
    expect(without).toEqual([]);
  });
});

describe('covering the polities that matter', () => {
  it('has a capital for every polity the events name (parties and versus)', () => {
    const named = new Set(events.flatMap((e) => [...e.parties, ...(e.versus ?? [])]));
    expect(named.size).toBeGreaterThan(40);
    expect([...named].filter((p) => !capitalsDoc.capitals[p])).toEqual([]);
  });

  it('answers for each party of each event, in the year of the event, wherever the polity is drawn that year', () => {
    const unanswered: string[] = [];
    for (const e of events) {
      const year = yearOf(e.date);
      for (const p of e.parties) {
        const y = drawn[p];
        if (y && y.from <= year && year <= y.to && !capitals.at(p, year)) unanswered.push(`${e.id}: ${p} in ${year}`);
      }
    }
    expect(unanswered).toEqual([]);
  });

  it('covers the powers and the states of the Second World War', () => {
    const war = [
      'nazi-germany',
      'weimar-republic',
      'german-empire',
      'kingdom-of-prussia',
      'federal-republic-of-germany',
      'german-democratic-republic',
      'union-of-soviet-socialist-republics',
      'russian-empire',
      'russian-federation',
      'kingdom-of-great-britain',
      'british-raj',
      'british-colonial-empire',
      'french-third-republic',
      'vichy-france',
      'free-french',
      'french-fourth-republic',
      'french-fifth-republic',
      'kingdom-of-italy',
      'republic-of-italy',
      'empire-of-japan',
      'japan',
      'qing-dynasty',
      'republic-of-china',
      'people-s-republic-of-china',
      'ottoman-empire',
      'republic-of-turkey',
      'austria-hungary',
      'republic-of-austria',
      'hungary',
      'second-polish-republic',
      'czechoslovakia',
      'yugoslavia',
      'greece',
      'romania',
      'bulgaria',
      'republic-of-finland',
      'denmark',
      'kingdom-of-norway',
      'kingdom-of-sweden',
      'netherlands',
      'kingdom-of-belgium',
      'luxembourg',
      'swiss-confederation',
      'second-spanish-republic',
      'spanish-nationalists',
      'francoist-spain',
      'portugal',
      'estado-novo',
      'united-states-of-america',
      'canada',
      'mexico',
      'brazilian-republic',
      'argentine-republic',
      'kingdom-of-egypt',
      'pahlavi-dynasty',
      'kingdom-of-iraq',
      'islamic-republic-of-pakistan',
      'republic-of-india',
      'kingdom-of-thailand',
      'republic-of-indonesia',
      'dutch-east-indies',
      'republic-of-the-philippines',
      'commonwealth-of-australia',
      'new-zealand',
      'south-africa',
      'estonia',
      'republic-of-latvia',
      'kingdom-of-lithuania',
      'independent-state-of-croatia',
    ];
    expect(war.filter((p) => !capitalsDoc.capitals[p])).toEqual([]);
  });
});

describe('the capital of a polity in a year', () => {
  it('knows the capitals of the war', () => {
    expect(at('nazi-germany', 1942)).toBe('berlin');
    expect(at('nazi-germany', 1945)).toBe('berlin'); // the correction layer draws it in 1945
    expect(at('union-of-soviet-socialist-republics', 1941)).toBe('moscow');
    expect(at('russian-empire', 1900)).toBe('saint-petersburg');
    expect(at('vichy-france', 1941)).toBe('vichy');
    expect(at('french-third-republic', 1939)).toBe('paris');
    expect(at('second-polish-republic', 1939)).toBe('warsaw');
    expect(at('kingdom-of-italy', 1943)).toBe('rome');
    expect(at('empire-of-japan', 1942)).toBe('tokyo');
    expect(at('kingdom-of-great-britain', 1940)).toBe('london');
    expect(at('united-states-of-america', 1944)).toBe('washington');
    expect(at('yugoslavia', 1941)).toBe('belgrade');
    expect(at('netherlands', 1942)).toBe('amsterdam');
    expect(at('kingdom-of-norway', 1940)).toBe('oslo');
    expect(at('republic-of-finland', 1939)).toBe('helsinki');
  });

  it('moves the Chinese republic with the war: Beijing, Nanjing, Chongqing, Nanjing, then Taipei', () => {
    expect(at('republic-of-china', 1920)).toBe('beijing');
    expect(at('republic-of-china', 1935)).toBe('nanjing');
    expect(at('republic-of-china', 1937)).toBe('nanjing');
    expect(at('republic-of-china', 1938)).toBe('chongqing');
    expect(at('republic-of-china', 1944)).toBe('chongqing');
    expect(at('republic-of-china', 1947)).toBe('nanjing');
    expect(at('republic-of-china', 1960)).toBe('taipei');
    expect(spansOf('republic-of-china').find((s) => s.from <= 1938 && 1938 <= s.to)?.note).toMatch(/Savaş dönemi/);
  });

  it('follows the Spanish Civil War: Madrid, Valencia, Barcelona; Burgos for the Nationalists', () => {
    expect(at('second-spanish-republic', 1934)).toBe('madrid');
    expect(at('second-spanish-republic', 1936)).toBe('madrid');
    expect(at('second-spanish-republic', 1937)).toBe('valencia-es');
    expect(at('second-spanish-republic', 1938)).toBe('barcelona');
    expect(at('spanish-nationalists', 1937)).toBe('burgos');
    expect(places.byId('valencia-es')?.cc).toBe('ES');
    expect(at('francoist-spain', 1950)).toBe('madrid');
  });

  it('knows the capitals that moved', () => {
    expect(at('ottoman-empire', 1900)).toBe('istanbul');
    expect(at('republic-of-turkey', 1930)).toBe('ankara');
    expect(at('british-raj', 1900)).toBe('kolkata');
    expect(at('british-raj', 1911)).toBe('kolkata');
    expect(at('british-raj', 1920)).toBe('delhi');
    expect(at('british-raj', 1935)).toBe('new-delhi');
    expect(at('federal-republic-of-germany', 1960)).toBe('bonn');
    expect(at('german-democratic-republic', 1960)).toBe('berlin');
    expect(at('federated-republic-of-germany', 1995)).toBe('berlin');
    expect(at('german-empire', 1900)).toBe('berlin');
    expect(at('kingdom-of-italy', 1866)).toBe('florence');
    expect(at('kingdom-of-italy', 1862)).toBe('turin');
    expect(at('commonwealth-of-australia', 1920)).toBe('melbourne');
    expect(at('commonwealth-of-australia', 1930)).toBe('canberra');
    expect(at('brazilian-republic', 1950)).toBe('rio-de-janeiro');
    expect(at('brazilian-republic', 1962)).toBe('brasilia');
    expect(at('federal-republic-of-nigeria', 1980)).toBe('lagos');
    expect(at('federal-republic-of-nigeria', 1995)).toBe('abuja');
    expect(at('islamic-republic-of-pakistan', 1950)).toBe('karachi');
    expect(at('islamic-republic-of-pakistan', 1990)).toBe('islamabad');
    expect(at('republic-of-the-philippines', 1960)).toBe('quezon-city');
    expect(at('republic-of-indonesia', 1947)).toBe('yogyakarta');
    expect(at('republic-of-indonesia', 1955)).toBe('jakarta');
    expect(at('russian-republic', 1917)).toBe('saint-petersburg');
    expect(at('russian-republic', 1918)).toBe('moscow');
    expect(at('romania', 1917)).toBe('iasi');
    expect(at('romania', 1930)).toBe('bucharest');
    expect(at('kazakhstan', 1995)).toBe('almaty');
    expect(at('kazakhstan', 1999)).toBe('astana');
    expect(at('kingdom-of-portugal', 1815)).toBe('rio-de-janeiro');
    expect(at('kingdom-of-portugal', 1850)).toBe('lisbon');
  });

  it('gives the capital of the constitution where the government sits elsewhere', () => {
    expect(at('netherlands', 1950)).toBe('amsterdam'); // the government is at The Hague
    expect(at('bolivia', 1950)).toBe('sucre'); // the government is at La Paz
    expect(at('republic-of-benin', 1990)).toBe('porto-novo');
    expect(at('republic-of-cote-d-ivoire', 1990)).toBe('yamoussoukro');
    expect(at('south-africa', 1950)).toBe('pretoria');
    expect(at('kingdom-of-lithuania', 1930)).toBe('kaunas'); // Vilnius was Polish
    expect(at('state-of-israel', 1960)).toBe('jerusalem');
  });

  it('has no capital for a polity the table does not know, and none outside its spans', () => {
    expect(at('no-such-polity', 1942)).toBeNull();
    expect(capitals.has('no-such-polity')).toBe(false);
    expect(capitals.has('nazi-germany')).toBe(true);
    expect(at('nazi-germany', 1935)).toBeNull(); // before it
    expect(at('nazi-germany', 1946)).toBeNull(); // after it
    expect(at('kingdom-of-prussia', 1871)).toBeNull(); // Cliopatria's Prussia ends in 1863
    expect(at('serbia', 1916)).toBeNull(); // a gap the table leaves open
    expect(at('chiangmai', 1850)).toBe('chiang-mai');
  });
});

describe('CapitalIndex', () => {
  const place = (id: string): PlaceRecord => ({ id, tr: id, en: id, lon: 1, lat: 2, pop: 0, cc: 'XX', alt: [] });
  const gazetteer = new PlaceIndex({
    meta: { source: { name: 'x', url: 'x', license: 'x' } as PlacesDoc['meta']['source'] },
    places: [place('a'), place('b'), place('c')],
  });
  const doc: CapitalsDoc = {
    meta: { note: 'x' },
    capitals: {
      p: [
        { from: 1950, to: 1960, place: 'b' },
        { from: 1900, to: 1949, place: 'a' },
        { from: 1961, to: 1970, place: 'gone' },
      ],
    },
  };
  const index = new CapitalIndex(doc, gazetteer);

  it('answers inclusively, whatever the order of the spans', () => {
    expect(index.at('p', 1900)?.id).toBe('a');
    expect(index.at('p', 1949)?.id).toBe('a');
    expect(index.at('p', 1950)?.id).toBe('b');
    expect(index.at('p', 1960)?.id).toBe('b');
  });

  it('answers null outside the spans, for an unknown polity and for a place the gazetteer lacks', () => {
    expect(index.at('p', 1899)).toBeNull();
    expect(index.at('p', 1971)).toBeNull();
    expect(index.at('p', 1965)).toBeNull();
    expect(index.at('q', 1950)).toBeNull();
    expect(index.has('p')).toBe(true);
    expect(index.has('q')).toBe(false);
    expect(new CapitalIndex(null, gazetteer).at('p', 1950)).toBeNull();
  });
});
