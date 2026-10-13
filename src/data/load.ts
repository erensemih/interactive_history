import type { FeatureCollection, Geometry } from 'geojson';
import { boundsOf, type LandPart } from '../domain/geo';
import { normalizeEvent, type RawEvent } from '../domain/events';
import type { EncodedMeta } from './borderCodec';
import { BorderStore, polysOf } from './borderStore';
import { CapitalIndex, type CapitalsDoc } from './capitals';
import { applyRowCorrections, OccupationIndex, type CorrectionsDoc } from './corrections';
import { gunzipBase64 } from './gzip';
import { PlaceIndex, type PlacesDoc } from './places';
import type { BorderProps, BorderRow, CategoryDef, Entity, HistoricalEvent, YearRange } from '../domain/types';

export interface SourceInfo {
  name: string;
  url: string;
  license: string;
  citation?: string;
  changes?: string;
}

export interface AppData {
  extent: YearRange;
  /** The range the app opens on (the period names it in `events/index.json`; else a few years in the middle of the data). */
  open: YearRange;
  rows: BorderRow[];
  /** The border features (properties include the entity tint); the map asks for the years it is about to draw. */
  borders: BorderStore;
  land: FeatureCollection<Geometry>;
  landParts: LandPart[];
  entities: Map<string, Entity>;
  categories: CategoryDef[];
  events: HistoricalEvent[];
  eventsById: Map<string, HistoricalEvent>;
  tintCount: number;
  /** The gazetteer: cities the model may name as the end of a line or the stop of a route. */
  places: PlaceIndex;
  /** Where polities were governed from, year by year. */
  capitals: CapitalIndex;
  /** The lands the border data draws as their occupier's, named as occupied (the Second World War correction layer). */
  occupations: OccupationIndex;
  sources: { borders: SourceInfo; coast: SourceInfo };
  /** Things in the data files that were skipped or ignored (also logged to the console). */
  warnings: string[];
}

export interface PolitiesIndex {
  meta: { range: [number, number]; tintCount: number; source: SourceInfo };
  entities: Record<
    string,
    {
      dataName: string;
      wikipedia: string;
      wikidata: string;
      from: number;
      to: number;
      umbrella: boolean;
      tint: number | null;
      /** Dataset ids that were joined into this one by the border pipeline (a continuing state the dataset labels twice). */
      joined?: string[];
    }
  >;
}

export interface EntitiesDoc {
  entities: Record<
    string,
    {
      kind: 'polity' | 'region';
      name: { tr: string };
      summary?: { tr: string };
      bounds?: [number, number, number, number];
      /** Replaces the border dataset's Wikipedia/Wikidata link; `null` removes it (the dataset's label is wrong). */
      wikipedia?: string | null;
      wikidata?: string | null;
      /** The dataset splits one polity over two ids: rows of this id are treated as that id. */
      sameAs?: string;
      /** Why the entry differs from the dataset (for people editing the data; never shown). */
      note?: string;
    }
  >;
}

const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

/** A file the app can do without (an archived period has no gazetteer or corrections): null when it is not there. */
async function getJsonOptional<T>(path: string): Promise<T | null> {
  try {
    return await getJson<T>(path);
  } catch {
    return null;
  }
}

async function getJson<T>(path: string): Promise<T> {
  // The single-file build (scripts/build-standalone.mjs) carries its data inside the page; big files gzipped.
  const inline = document.getElementById(`data:${path}`);
  if (inline) {
    const text =
      inline.dataset.encoding === 'gzip-base64' ? await gunzipBase64(inline.textContent ?? '') : inline.textContent;
    return JSON.parse(text ?? 'null') as T;
  }
  const res = await fetch(dataUrl(path));
  if (!res.ok) throw new Error(`${path} yüklenemedi (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** The data files, parsed. `assembleData` turns them into `AppData` (pure, so tests can run it in Node). */
export interface RawFiles {
  index: PolitiesIndex;
  entitiesDoc: EntitiesDoc;
  categoriesDoc: { categories: { id: string; label: { tr: string } }[] };
  eventSets: { file: string; doc: { set?: string; events: RawEvent[] } }[];
  /** The range the period opens on, as `events/index.json` gives it (absent: the middle of the data). */
  open?: { from: number; to: number };
  land: FeatureCollection<Geometry> & { meta?: { source?: SourceInfo } };
  /** The gazetteer, the capitals table and the correction layer; each optional (a period may have none). */
  places?: PlacesDoc | null;
  capitals?: CapitalsDoc | null;
  corrections?: CorrectionsDoc | null;
  bordersRaw: FeatureCollection<Geometry, BorderProps> & {
    meta?: EncodedMeta & { coast?: SourceInfo; source?: SourceInfo };
  };
}

export async function loadData(onProgress?: (label: string) => void): Promise<AppData> {
  onProgress?.('Veri dosyaları okunuyor…');
  const [index, entitiesDoc, categoriesDoc, eventsIndex, land, places, capitals, corrections] = await Promise.all([
    getJson<PolitiesIndex>('borders/polities.json'),
    getJson<EntitiesDoc>('entities.json'),
    getJson<RawFiles['categoriesDoc']>('categories.json'),
    getJson<{ files: string[]; open?: YearRange }>('events/index.json'),
    getJson<RawFiles['land']>('geo/land.json'),
    getJsonOptional<PlacesDoc>('places.json'),
    getJsonOptional<CapitalsDoc>('capitals.json'),
    getJsonOptional<CorrectionsDoc>('corrections/ww2.json'),
  ]);
  const [from, to] = index.meta.range;
  onProgress?.('Sınırlar yükleniyor…');
  const bordersRaw = await getJson<RawFiles['bordersRaw']>(`borders/cliopatria-${from}-${to}.json`);
  onProgress?.('Olaylar yükleniyor…');
  const eventSets: RawFiles['eventSets'] = [];
  for (const file of eventsIndex.files) {
    eventSets.push({ file, doc: await getJson<{ set?: string; events: RawEvent[] }>(`events/${file}`) });
  }
  return assembleData({
    index,
    entitiesDoc,
    categoriesDoc,
    eventSets,
    open: eventsIndex.open,
    land,
    places,
    capitals,
    corrections,
    bordersRaw,
  });
}

/** The range the app opens on: the one the period names when it lies inside the data, else seven years in the middle of it. */
export function openingRange(open: RawFiles['open'], extent: YearRange): YearRange {
  const ok =
    !!open &&
    Number.isInteger(open.from) &&
    Number.isInteger(open.to) &&
    open.from <= open.to &&
    open.from >= extent.from &&
    open.to <= extent.to;
  if (ok) return { from: open.from, to: open.to };
  const mid = Math.round((extent.from + extent.to) / 2);
  return { from: Math.max(extent.from, mid - 3), to: Math.min(extent.to, mid + 3) };
}

export function assembleData({
  index,
  entitiesDoc,
  categoriesDoc,
  eventSets,
  open,
  land,
  places: placesDoc,
  capitals: capitalsDoc,
  corrections,
  bordersRaw,
}: RawFiles): AppData {
  const [from, to] = index.meta.range;

  /* entities: authored Turkish content + facts derived from the border dataset */
  const warnings: string[] = [];
  const warn = (message: string) => {
    warnings.push(message);
    console.warn(`[veri] ${message}`);
  };
  // `sameAs`: ids that are one polity in reality (the dataset names the two stretches differently).
  const canonical = (id: string) => entitiesDoc.entities[id]?.sameAs ?? id;
  const link = (own: string | null | undefined, fromDataset: string | undefined) =>
    own === undefined ? fromDataset || undefined : own || undefined;

  const entities = new Map<string, Entity>();
  const ids = new Set([...Object.keys(entitiesDoc.entities), ...Object.keys(index.entities)]);
  for (const id of ids) {
    if (canonical(id) !== id) continue;
    const authored = entitiesDoc.entities[id];
    const derived = index.entities[id];
    const aliases = [...ids].filter((other) => other !== id && canonical(other) === id);
    const spans = [derived, ...aliases.map((a) => index.entities[a])].filter((d): d is NonNullable<typeof d> => !!d);
    entities.set(id, {
      id,
      kind: authored?.kind ?? 'polity',
      name: authored?.name.tr ?? derived?.dataName ?? id,
      summary: authored?.summary?.tr,
      bounds: authored?.bounds,
      wikipedia: link(authored?.wikipedia, derived?.wikipedia),
      wikidata: link(authored?.wikidata, derived?.wikidata),
      umbrella: derived?.umbrella,
      tint: derived?.tint ?? null,
      firstYear: spans.length ? Math.min(...spans.map((d) => d.from)) : undefined,
      lastYear: spans.length ? Math.max(...spans.map((d) => d.to)) : undefined,
      dataName: derived?.dataName,
    });
  }

  /* border rows (the file order is kept: big first, so small polities paint on top). Their shapes stay in the
     file's compact form until needed: a row's `polys` decodes it on first read. */
  for (const line of applyRowCorrections(bordersRaw, corrections ?? null)) console.info(`[veri] düzeltme: ${line}`);
  const borders = new BorderStore(bordersRaw);
  const rows: BorderRow[] = [];
  borders.features.forEach((f, i) => {
    f.properties.id = canonical(f.properties.id);
    f.properties.up = [...new Set((f.properties.up ?? []).map(canonical))];
    const tint = entities.get(f.properties.id)?.tint ?? null;
    f.properties.tint = tint;
    const row = { ...f.properties, tint, up: f.properties.up, box: borders.box(i) } as BorderRow;
    Object.defineProperty(row, 'polys', { enumerable: true, get: () => borders.polys(i) });
    rows.push(row);
  });

  const landParts: LandPart[] = [];
  for (const f of land.features) {
    for (const poly of polysOf(f.geometry)) landParts.push({ poly, box: boundsOf([poly]) });
  }

  /* events: one bad record is skipped with a warning instead of taking the whole app down */
  const events: HistoricalEvent[] = [];
  const seen = new Set<string>();
  for (const { file, doc } of eventSets) {
    for (const raw of doc.events) {
      try {
        const ev = normalizeEvent(raw, doc.set ?? file);
        if (seen.has(ev.id)) throw new Error(`${ev.id}: kimlik yinelenmiş`);
        seen.add(ev.id);
        ev.parties = [...new Set(ev.parties.map(canonical))];
        if (ev.versus) ev.versus = [...new Set(ev.versus.map(canonical))].filter((id) => ev.parties.includes(id));
        for (const party of ev.parties) if (!entities.has(party)) warn(`${ev.id}: bilinmeyen taraf "${party}"`);
        events.push(ev);
      } catch (err) {
        warn(`${file}: olay atlandı (${(err as Error).message})`);
      }
    }
  }
  events.sort((a, b) => a.start - b.start || b.importance - a.importance);

  const places = new PlaceIndex(placesDoc ?? null);

  return {
    extent: { from, to },
    open: openingRange(open, { from, to }),
    rows,
    borders,
    land,
    landParts,
    entities,
    categories: categoriesDoc.categories.map((c) => ({ id: c.id, label: c.label.tr })),
    events,
    eventsById: new Map(events.map((e) => [e.id, e])),
    tintCount: index.meta.tintCount,
    places,
    capitals: new CapitalIndex(capitalsDoc ?? null, places),
    occupations: new OccupationIndex(corrections ?? null, rows),
    warnings,
    sources: {
      borders: safeSource(index.meta.source),
      coast: safeSource(
        bordersRaw.meta?.coast ??
          land.meta?.source ?? {
            name: 'Natural Earth',
            url: 'https://www.naturalearthdata.com/',
            license: 'Kamu malı',
          },
      ),
    },
  };
}

/** Source credits are rendered as links: only ordinary http(s) addresses are kept. */
function safeSource(src: SourceInfo): SourceInfo {
  return /^https?:\/\//i.test(src.url) ? src : { ...src, url: '#' };
}
