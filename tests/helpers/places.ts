import { CapitalIndex, type CapitalsDoc } from '../../src/data/capitals';
import { PlaceIndex, type PlaceRecord } from '../../src/data/places';
import type { ResolveData } from '../../src/ai/resolve';

const place = (
  id: string,
  tr: string,
  en: string,
  lon: number,
  lat: number,
  pop: number,
  alt: string[] = [],
  cap?: 1,
): PlaceRecord => ({ id, tr, en, lon, lat, pop, cc: 'XX', ...(cap ? { cap } : {}), alt });

/**
 * A handful of the places of the 1400–1600 world, enough for the mechanics tests to name stops, with two towns that
 * share a name (to test which one wins). The real gazetteer (public/data/places.json) has thousands; the tests of
 * the shipped file are in places.test.ts.
 */
export const miniPlaces = (): PlaceIndex =>
  new PlaceIndex({
    meta: { source: { name: 'test', url: 'https://example.org', license: 'test' } },
    places: [
      place('istanbul', 'İstanbul', 'Istanbul', 28.98, 41.01, 15_000_000, [
        'Konstantiniyye',
        'Constantinople',
        'Konstantinopolis',
      ]),
      place('edirne', 'Edirne', 'Edirne', 26.56, 41.68, 170_000, ['Adrianople', 'Edrine']),
      place('paris', 'Paris', 'Paris', 2.35, 48.86, 10_000_000, [], 1),
      place('tabriz', 'Tebriz', 'Tabriz', 46.3, 38.08, 1_500_000, ['Tavriz']),
      place('budapest', 'Budapeşte', 'Budapest', 19.04, 47.5, 1_700_000, ['Buda', 'Pest'], 1),
      place('cairo', 'Kahire', 'Cairo', 31.25, 30.06, 9_500_000, ['Fustat', 'Al-Qahira'], 1),
      place('vienna', 'Viyana', 'Vienna', 16.37, 48.21, 1_900_000, ['Wien'], 1),
      place('rome', 'Roma', 'Rome', 12.5, 41.89, 2_800_000, [], 1),
      // two places that go by "Kayseri": the capital-or-bigger one wins
      place('kayseri', 'Kayseri', 'Kayseri', 35.48, 38.73, 1_000_000),
      place('kayseri-xx', 'Kayseri', 'Kayseri', 12.0, 45.0, 1_000, ['Little Kayseri']),
    ],
  });

export const miniCapitals = (places: PlaceIndex): CapitalIndex => {
  const doc: CapitalsDoc = {
    meta: { note: 'test' },
    capitals: {
      'ottoman-empire': [
        { from: 1400, to: 1452, place: 'edirne' },
        { from: 1453, to: 1600, place: 'istanbul' },
      ],
      'kingdom-of-france': [{ from: 1400, to: 1600, place: 'paris' }],
      'kingdom-of-hungary': [{ from: 1400, to: 1600, place: 'budapest' }],
      'mamluk-sultanate': [{ from: 1400, to: 1517, place: 'cairo' }],
    },
  };
  return new CapitalIndex(doc, places);
};

/** Resolver data with the mini gazetteer and capitals added to the data of a period. */
export const withMiniPlaces = <T extends ResolveData>(
  data: T,
): T & Required<Pick<ResolveData, 'places' | 'capitals'>> => {
  const places = miniPlaces();
  return { ...data, places, capitals: miniCapitals(places) };
};
