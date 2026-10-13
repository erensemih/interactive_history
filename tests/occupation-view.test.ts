import { describe, expect, it } from 'vitest';
import { contextFromView } from '../src/ai/context';
import { describeContext } from '../src/ai/prompt';
import { deriveView } from '../src/state/derive';
import { DEFAULT_STATE } from '../src/state/store';
import { shippedData } from './helpers/shipped';

/**
 * What the reader is told of a place the border data draws as its occupier's land (Warsaw in 1942 is "Nazi Almanyası" in
 * Cliopatria): the title, the card's note, and what the model is told. The correction layer's own behaviour is in
 * corrections.test.ts; this is the path from it to the page's view model.
 */
const data = shippedData();

const viewAt = (lon: number, lat: number, year: number) =>
  deriveView({ ...DEFAULT_STATE, range: { from: year, to: year }, places: [{ lon, lat }] }, data);

describe('the title of a place in an occupied land', () => {
  it('says it is an occupation: Warsaw in 1942 is "Polonya · Alman işgali", though the polygon is Nazi Germany’s', () => {
    const vm = viewAt(21.01, 52.23, 1942);
    const place = vm.places[0]!;
    expect(vm.year).toBe(1942);
    expect(place.title).toBe('Polonya · Alman işgali');
    expect(place.occupation).toMatchObject({
      id: 'polonya',
      name: 'Polonya',
      label: 'Alman işgali',
      occupier: 'nazi-germany',
    });
    // the data's own holder is still the occupier: the polygon, the highlight and the lineage are Nazi Germany's
    expect(place.holder?.id).toBe('nazi-germany');
    expect(place.resolution.row?.id).toBe('nazi-germany');
  });

  it('follows the year: before the occupation and after it the place is not named as occupied', () => {
    expect(viewAt(21.01, 52.23, 1938).places[0]!.title).toBe('Polonya İkinci Cumhuriyeti');
    expect(viewAt(21.01, 52.23, 1938).places[0]!.occupation).toBeNull();
    expect(viewAt(21.01, 52.23, 1945).places[0]!.occupation).toBeNull(); // the data draws it Soviet by then
  });

  it('uses the occupier’s own word: Athens is an Italian occupation in 1942 and a German one in 1944', () => {
    expect(viewAt(23.73, 37.98, 1942).places[0]!.title).toBe('Yunanistan · İtalyan işgali');
    expect(viewAt(23.73, 37.98, 1944).places[0]!.title).toBe('Yunanistan · Alman işgali');
  });

  it('is not for Germany itself, whoever the holder is: Hamburg and Berlin are Nazi Germany', () => {
    for (const [lon, lat] of [
      [10.0, 53.55],
      [13.4, 52.52],
    ] as const) {
      const place = viewAt(lon, lat, 1942).places[0]!;
      expect(place.title, `${lon},${lat}`).toBe('Nazi Almanyası');
      expect(place.occupation).toBeNull();
    }
  });

  it('names the Japanese occupations the correction layer paints: Singapore in 1943', () => {
    const place = viewAt(103.82, 1.35, 1943).places[0]!;
    expect(place.title).toBe('Singapur · Japon işgali');
    expect(place.holder?.id).toBe('empire-of-japan');
    expect(viewAt(103.82, 1.35, 1941).places[0]!.title).toBe('İngiliz Sömürge İmparatorluğu');
  });

  it('draws Berlin as Nazi Germany in 1945 too, with the year of the border data that is shown', () => {
    const vm = viewAt(13.4, 52.52, 1945);
    expect(vm.year).toBe(1945);
    expect(vm.places[0]!.title).toBe('Nazi Almanyası');
    expect(vm.places[0]!.resolution.sequence.at(-1)).toMatchObject({ id: 'nazi-germany', to: 1945 });
  });
});

describe('what the model is told of an occupied place', () => {
  const warsaw = () => contextFromView(viewAt(21.01, 52.23, 1942), data);

  it('carries the occupation: the land, the word and the polity the data holds it for', () => {
    expect(warsaw().places[0]!.occupation).toEqual({
      name: 'Polonya',
      label: 'Alman işgali',
      holder: 'Nazi Almanyası',
    });
    expect(warsaw().places[0]!.title).toBe('Polonya · Alman işgali');
    expect(contextFromView(viewAt(10.0, 53.55, 1942), data).places[0]!.occupation).toBeNull();
  });

  it('says in words that the borders draw it as the occupier’s but it was an occupied country, and to tell it so', () => {
    const text = describeContext(warsaw(), null);
    expect(text).toContain('İşgal: sınır verisi burayı Nazi Almanyası toprağı olarak çizer');
    expect(text).toContain('gerçekte Polonya toprağıdır');
    expect(text).toContain('Alman işgali');
    expect(text).toContain('işgal altındaki Polonya olarak anlat');
    // a place that is not occupied gets no such line
    expect(describeContext(contextFromView(viewAt(10.0, 53.55, 1942), data), null)).not.toContain('İşgal:');
  });
});
