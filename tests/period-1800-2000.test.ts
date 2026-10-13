import { describe, expect, it } from 'vitest';
import { elsewhere, timelineEvents } from '../src/domain/events';
import { primaryAt, resolvePlace, rowsContaining } from '../src/domain/geo';
import { shippedData } from './helpers/shipped';

/**
 * The published period: 1800–2000, built from Cliopatria, with a small toy set of events and a dense cluster for the
 * Second World War. The facts below are what the border data says (they are checked because the app's narration and
 * its place timelines stand on them), not necessarily what happened: where Cliopatria simplifies, the test says so.
 */
const data = shippedData();

/** Who holds the point in each of the years, from the rows that contain it (decoded once, the first time). */
const holders = (lon: number, lat: number, years: number[]) => {
  const candidates = rowsContaining(data.rows, lon, lat);
  return years.map((y) => primaryAt(candidates, y)?.id ?? null);
};

describe('the published period', () => {
  it('is 1800–2000, and the app opens on the war years (the period names its opening range)', () => {
    expect(data.extent).toEqual({ from: 1800, to: 2000 });
    expect(data.open).toEqual({ from: 1939, to: 1945 });
  });

  it('keeps every row of the file, with its box, and only what the file carries', () => {
    expect(data.rows.length).toBeGreaterThan(2500);
    for (const row of data.rows) {
      expect(row.box[0]).toBeLessThanOrEqual(row.box[2]);
      expect(row.from).toBeLessThanOrEqual(row.to);
      expect(row.from).toBeGreaterThanOrEqual(1800);
      expect(row.to).toBeLessThanOrEqual(2000);
    }
  });

  it('names every polity in Turkish, each name once (the model refers to polities by name)', () => {
    const seen = new Map<string, string>();
    for (const e of data.entities.values()) {
      if (e.kind !== 'polity') continue;
      expect(e.name, e.id).not.toMatch(/^[a-z0-9-]+$/); // not an id
      // none of the dataset's English words of rank is left in a name
      expect(e.name, e.id).not.toMatch(
        /\b(Republic|Kingdom|Empire|Sultanate|Dynasty|Principality|Duchy|Electorate|Confederation|Free City|Grand Duchy|Emirate|Khanate|Caliphate|Colonies|Colonial)\b/,
      );
      const other = seen.get(e.name);
      expect(other, `${e.id} and ${other} are both "${e.name}"`).toBeUndefined();
      seen.set(e.name, e.id);
    }
  });

  it('joins the polities the dataset labels twice (Denmark-Norway is Denmark; the Kingdom of Greece is Greece)', () => {
    for (const id of ['denmark', 'greece', 'hungary', 'bulgaria', 'serbia', 'romania', 'monaco']) {
      expect(data.entities.get(id), id).toBeDefined();
    }
    for (const gone of ['denmark-norway', 'first-hellenic-republic', 'kingdom-of-greece', 'hungarian-republic']) {
      expect(data.entities.has(gone), gone).toBe(false);
    }
    expect(data.entities.get('greece')!.name).toBe('Yunanistan');
    // one id, so one colour: the rows of the joined polity all take the same tint
    const tints = new Set(data.rows.filter((r) => r.id === 'greece').map((r) => r.tint));
    expect(tints.size).toBe(1);
  });

  it('has the categories that fit the period, each with a Turkish label', () => {
    expect(data.categories.map((c) => c.id)).toEqual([
      'military',
      'politics',
      'economy',
      'society',
      'culture',
      'disaster',
    ]);
    for (const c of data.categories) expect(c.label.length).toBeGreaterThan(3);
  });
});

describe('the events of the period', () => {
  it('are a small toy set: a few turning points across two centuries, and a dense cluster for the war', () => {
    const years = data.events.map((e) => Math.floor(e.start));
    const war = data.events.filter((e) => e.start >= 1937 && e.end <= 1946);
    expect(data.events.length).toBeGreaterThanOrEqual(40);
    expect(data.events.length).toBeLessThan(100);
    expect(war.length).toBeGreaterThanOrEqual(30);
    expect(Math.min(...years)).toBeGreaterThanOrEqual(1800);
    expect(Math.max(...years)).toBeLessThanOrEqual(2000);
    // and the other 150 years are there too
    expect(data.events.filter((e) => e.start < 1900).length).toBeGreaterThanOrEqual(4);
    expect(data.events.filter((e) => e.start >= 1946).length).toBeGreaterThanOrEqual(6);
  });

  it('all have a source, a known category and known parties; a war names its two sides', () => {
    const categories = new Set(data.categories.map((c) => c.id));
    for (const ev of data.events) {
      expect(ev.sources.length, ev.id).toBeGreaterThan(0);
      expect(categories.has(ev.category), `${ev.id}: ${ev.category}`).toBe(true);
      for (const p of ev.parties) expect(data.entities.has(p), `${ev.id}: ${p}`).toBe(true);
      if (ev.category === 'military') expect(ev.parties.length, ev.id).toBeGreaterThanOrEqual(2);
    }
    expect(data.warnings).toEqual([]);
  });

  it('use every one of the categories at least once, so each colour of the legend is on the map somewhere', () => {
    for (const c of data.categories)
      expect(
        data.events.some((e) => e.category === c.id),
        c.id,
      ).toBe(true);
  });
});

describe('World War II in the border data (Cliopatria)', () => {
  const years = [1938, 1939, 1940, 1942, 1944, 1945, 1946];

  it('Germany in 1942: Berlin, Munich, Vienna, Prague and Paris are all Nazi Germany', () => {
    for (const [lon, lat] of [
      [13.4, 52.52], // Berlin
      [11.58, 48.14], // Munich
      [16.37, 48.21], // Vienna
      [14.42, 50.08], // Prague
      [2.35, 48.86], // Paris
    ] as const) {
      expect(holders(lon, lat, [1942])[0], `${lon},${lat}`).toBe('nazi-germany');
    }
  });

  it('the annexations and occupations arrive year by year', () => {
    // Prague: Czechoslovakia in 1938, German from 1939 (the Protectorate)
    expect(holders(14.42, 50.08, years).slice(0, 4)).toEqual([
      'czechoslovakia',
      'nazi-germany',
      'nazi-germany',
      'nazi-germany',
    ]);
    // Warsaw: Polish in 1938–39, German from 1940 (as the dataset has it: no separate Government-General)
    expect(holders(21.01, 52.23, years).slice(0, 4)).toEqual([
      'second-polish-republic',
      'second-polish-republic',
      'nazi-germany',
      'nazi-germany',
    ]);
    // Danzig: a free city until 1939
    expect(holders(18.65, 54.35, [1938, 1940])).toEqual(['free-city-of-danzig', 'nazi-germany']);
    // Athens: Greek in 1940, Italian in 1942, German in 1944
    expect(holders(23.73, 37.98, [1940, 1942, 1944])).toEqual(['greece', 'kingdom-of-italy', 'nazi-germany']);
    // Riga: Latvian in 1938–39, Soviet in 1940, German in 1942 and 1944
    expect(holders(24.1, 56.95, [1939, 1940, 1942, 1944])).toEqual([
      'republic-of-latvia',
      'union-of-soviet-socialist-republics',
      'nazi-germany',
      'nazi-germany',
    ]);
  });

  it('France is split: the north is German, the south is Vichy until 1942, and then German too', () => {
    expect(holders(2.35, 48.86, [1939, 1942])).toEqual(['french-third-republic', 'nazi-germany']);
    expect(holders(5.37, 43.3, [1939, 1942, 1944])).toEqual(['french-third-republic', 'vichy-france', 'nazi-germany']);
  });

  it('the Pacific: the Philippines and the Indies pass to Japan', () => {
    expect(holders(120.98, 14.6, [1940, 1942])).toEqual(['united-states-of-america', 'empire-of-japan']);
    expect(holders(106.8, -6.2, [1940, 1944])).toEqual(['dutch-east-indies', 'empire-of-japan']);
  });

  it('the powers that were not occupied hold their capitals throughout', () => {
    expect(new Set(holders(37.62, 55.75, years))).toEqual(new Set(['union-of-soviet-socialist-republics']));
    expect(new Set(holders(-0.13, 51.5, years))).toEqual(new Set(['kingdom-of-great-britain']));
    expect(new Set(holders(-77.04, 38.9, years))).toEqual(new Set(['united-states-of-america']));
    expect(holders(139.7, 35.7, [1938, 1944, 1945])).toEqual(['empire-of-japan', 'empire-of-japan', 'empire-of-japan']);
  });

  it('what it still does not show: from 1946 the polygons are the occupiers’ zones, and in 1945 the liberated lands are the liberators’ (a known simplification)', () => {
    // Munich is American in 1946, Vienna Soviet, Hamburg British, Berlin French: the dataset draws the occupation zones as
    // the occupiers' land (1945 itself is Nazi Germany in the places the correction layer covers, see below)
    expect(holders(11.58, 48.14, [1946])).toEqual(['united-states-of-america']);
    expect(holders(16.37, 48.21, [1946])).toEqual(['union-of-soviet-socialist-republics']);
    expect(holders(10.0, 53.55, [1946])).toEqual(['kingdom-of-great-britain']);
    // and Warsaw and Prague are Soviet in 1945 (they were liberated by then)
    expect(holders(21.01, 52.23, [1945])).toEqual(['union-of-soviet-socialist-republics']);
  });
});

describe('World War II with the correction layer (public/data/corrections/ww2.json)', () => {
  it('Nazi Germany is drawn in 1945 too: Berlin, Munich, Hamburg and Dresden are Nazi Germany then, as in 1944', () => {
    for (const [lon, lat] of [
      [13.4, 52.52], // Berlin
      [11.58, 48.14], // Munich
      [10.0, 53.55], // Hamburg
      [13.74, 51.05], // Dresden
    ] as const) {
      expect(holders(lon, lat, [1944, 1945]), `${lon},${lat}`).toEqual(['nazi-germany', 'nazi-germany']);
    }
    // the correction adds one row and takes none away: Cliopatria's own rows of 1944 are still there
    expect(data.rows.filter((r) => r.id === 'nazi-germany' && r.from <= 1944 && r.to >= 1944).length).toBeGreaterThan(
      0,
    );
    expect(data.rows.filter((r) => r.id === 'nazi-germany' && r.from <= 1945 && r.to >= 1945).length).toBe(1);
  });

  it('Singapore is Japanese from 1942 to 1945 (the data has it British through the occupation)', () => {
    expect(holders(103.82, 1.35, [1941, 1942, 1943, 1945, 1946])[0]).toBe('british-colonial-empire');
    expect(holders(103.82, 1.35, [1942, 1943, 1944, 1945])).toEqual(Array(4).fill('empire-of-japan'));
    expect(holders(103.82, 1.35, [1946])[0]).not.toBe('empire-of-japan');
  });

  it('the added pieces are small and unlabeled, so a polity keeps its own biggest row (and its own name on the map)', () => {
    const japan1943 = data.rows.filter((r) => r.id === 'empire-of-japan' && r.from <= 1943 && r.to >= 1943);
    expect(japan1943.length).toBeGreaterThanOrEqual(2);
    const biggest = Math.max(...japan1943.map((r) => r.area));
    for (const r of japan1943) if (r.area < biggest) expect(r.label, `${r.id} ${r.from}–${r.to}`).toBeNull();
  });
});

describe('a place in Germany in 1942', () => {
  const window = { from: 1939, to: 1945 };
  const res = resolvePlace(data.rows, data.entities.values(), { lon: 13.4, lat: 52.52 }, 1942, window);

  it('is Nazi Germany, and over all the war years Germany (1945 is the correction layer’s carry-over of the 1938 borders)', () => {
    expect(res.row?.id).toBe('nazi-germany');
    expect(res.sequence[0]).toEqual({ id: 'nazi-germany', from: 1939, to: 1945 });
    expect(res.lineage.has('nazi-germany')).toBe(true);
  });

  it('has the war on its timeline: Poland, France, Barbarossa, Stalingrad, Normandy, Berlin, the surrender', () => {
    const ids = timelineEvents(data.events, res.lineage, window).map((e) => e.id);
    for (const id of [
      'polonya-isgali-1939',
      'fransa-muharebesi-1940',
      'barbarossa-1941',
      'wannsee-1942',
      'stalingrad-1942',
      'normandiya-1944',
      'berlin-muharebesi-1945',
      'almanya-teslimi-1945',
    ]) {
      expect(ids, id).toContain(id);
    }
    expect(ids.length).toBeGreaterThanOrEqual(25);
    // in date order
    const starts = timelineEvents(data.events, res.lineage, window).map((e) => e.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('keeps the Pacific off its timeline (those events are elsewhere) and shows it in the list of what else happened', () => {
    const own = new Set(timelineEvents(data.events, res.lineage, window).map((e) => e.id));
    expect(own.has('pearl-harbor-1941')).toBe(false);
    expect(own.has('hirosima-1945')).toBe(false);
    const other = elsewhere(data.events, res.lineage).map((e) => e.id);
    expect(other).toContain('pearl-harbor-1941');
    expect(other).toContain('hirosima-1945');
  });

  it('a war event draws its two sides from the data (Barbarossa: Germany against the Soviet Union)', () => {
    const ev = data.eventsById.get('barbarossa-1941')!;
    expect(ev.parties).toEqual(['nazi-germany', 'union-of-soviet-socialist-republics']);
    expect(ev.category).toBe('military');
    expect(ev.dateLabel).toContain('1941');
    expect(ev.location.name).toBeTruthy();
  });
});
