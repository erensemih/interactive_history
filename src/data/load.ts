import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { boundsOf, type LandPart } from '../domain/geo';
import { normalizeEvent, type RawEvent } from '../domain/events';
import type {
  BorderProps,
  BorderRow,
  CategoryDef,
  Entity,
  HistoricalEvent,
  PolygonCoords,
  YearRange,
} from '../domain/types';

export interface SourceInfo {
  name: string;
  url: string;
  license: string;
  citation?: string;
  changes?: string;
}

export interface AppData {
  extent: YearRange;
  rows: BorderRow[];
  /** Border features for the map (properties include the entity tint). */
  borders: FeatureCollection<Geometry, BorderProps>;
  land: FeatureCollection<Geometry>;
  landParts: LandPart[];
  entities: Map<string, Entity>;
  categories: CategoryDef[];
  events: HistoricalEvent[];
  eventsById: Map<string, HistoricalEvent>;
  tintCount: number;
  sources: { borders: SourceInfo; coast: SourceInfo };
}

interface PolitiesIndex {
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
    }
  >;
}

interface EntitiesDoc {
  entities: Record<
    string,
    { kind: 'polity' | 'region'; name: { tr: string }; summary?: { tr: string }; bounds?: [number, number, number, number] }
  >;
}

const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(dataUrl(path));
  if (!res.ok) throw new Error(`${path} yüklenemedi (HTTP ${res.status})`);
  return (await res.json()) as T;
}

function polysOf(geometry: Geometry): PolygonCoords[] {
  if (geometry.type === 'Polygon') return [geometry.coordinates as PolygonCoords];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates as PolygonCoords[];
  return [];
}

export async function loadData(onProgress?: (label: string) => void): Promise<AppData> {
  onProgress?.('Veri dosyaları okunuyor…');
  const [index, entitiesDoc, categoriesDoc, eventsIndex, land] = await Promise.all([
    getJson<PolitiesIndex>('borders/polities.json'),
    getJson<EntitiesDoc>('entities.json'),
    getJson<{ categories: { id: string; label: { tr: string } }[] }>('categories.json'),
    getJson<{ files: string[] }>('events/index.json'),
    getJson<FeatureCollection<Geometry> & { meta?: { source?: SourceInfo } }>('geo/land.json'),
  ]);
  const [from, to] = index.meta.range;
  onProgress?.('Sınırlar yükleniyor…');
  const bordersRaw = await getJson<FeatureCollection<Geometry, BorderProps> & { meta?: { coast?: SourceInfo; source?: SourceInfo } }>(
    `borders/cliopatria-${from}-${to}.json`,
  );

  /* entities: authored Turkish content + facts derived from the border dataset */
  const entities = new Map<string, Entity>();
  const ids = new Set([...Object.keys(entitiesDoc.entities), ...Object.keys(index.entities)]);
  for (const id of ids) {
    const authored = entitiesDoc.entities[id];
    const derived = index.entities[id];
    entities.set(id, {
      id,
      kind: authored?.kind ?? 'polity',
      name: authored?.name.tr ?? derived?.dataName ?? id,
      summary: authored?.summary?.tr,
      bounds: authored?.bounds,
      wikipedia: derived?.wikipedia || undefined,
      wikidata: derived?.wikidata || undefined,
      umbrella: derived?.umbrella,
      tint: derived?.tint ?? null,
      firstYear: derived?.from,
      lastYear: derived?.to,
      dataName: derived?.dataName,
    });
  }

  /* border rows (kept sorted: big first, as in the file, so small ones paint on top) */
  const rows: BorderRow[] = [];
  for (const f of bordersRaw.features as Feature<Geometry, BorderProps>[]) {
    const polys = polysOf(f.geometry);
    const tint = entities.get(f.properties.id)?.tint ?? null;
    f.properties.tint = tint;
    rows.push({ ...f.properties, tint, up: f.properties.up ?? [], polys, box: boundsOf(polys) });
  }

  const landParts: LandPart[] = [];
  for (const f of land.features) {
    for (const poly of polysOf(f.geometry)) landParts.push({ poly, box: boundsOf([poly]) });
  }

  /* events */
  onProgress?.('Olaylar yükleniyor…');
  const events: HistoricalEvent[] = [];
  for (const file of eventsIndex.files) {
    const doc = await getJson<{ set?: string; events: RawEvent[] }>(`events/${file}`);
    for (const raw of doc.events) events.push(normalizeEvent(raw, doc.set ?? file));
  }
  events.sort((a, b) => a.start - b.start || b.importance - a.importance);

  return {
    extent: { from, to },
    rows,
    borders: bordersRaw,
    land,
    landParts,
    entities,
    categories: categoriesDoc.categories.map((c) => ({ id: c.id, label: c.label.tr })),
    events,
    eventsById: new Map(events.map((e) => [e.id, e])),
    tintCount: index.meta.tintCount,
    sources: {
      borders: index.meta.source,
      coast: bordersRaw.meta?.coast ?? land.meta?.source ?? {
        name: 'Natural Earth',
        url: 'https://www.naturalearthdata.com/',
        license: 'Kamu malı',
      },
    },
  };
}
