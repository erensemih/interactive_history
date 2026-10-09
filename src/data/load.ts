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
  /** Things in the data files that were skipped or ignored (also logged to the console). */
  warnings: string[];
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

async function getJson<T>(path: string): Promise<T> {
  // The single-file build (scripts/build-standalone.mjs) carries its data inside the page.
  const inline = document.getElementById(`data:${path}`);
  if (inline) return JSON.parse(inline.textContent ?? 'null') as T;
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
  const bordersRaw = await getJson<
    FeatureCollection<Geometry, BorderProps> & { meta?: { coast?: SourceInfo; source?: SourceInfo } }
  >(`borders/cliopatria-${from}-${to}.json`);

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

  /* border rows (the file order is kept: big first, so small polities paint on top) */
  const rows: BorderRow[] = [];
  for (const f of bordersRaw.features as Feature<Geometry, BorderProps>[]) {
    const polys = polysOf(f.geometry);
    f.properties.id = canonical(f.properties.id);
    f.properties.up = [...new Set((f.properties.up ?? []).map(canonical))];
    const tint = entities.get(f.properties.id)?.tint ?? null;
    f.properties.tint = tint;
    rows.push({ ...f.properties, tint, up: f.properties.up, polys, box: boundsOf(polys) });
  }

  const landParts: LandPart[] = [];
  for (const f of land.features) {
    for (const poly of polysOf(f.geometry)) landParts.push({ poly, box: boundsOf([poly]) });
  }

  /* events: one bad record is skipped with a warning instead of taking the whole app down */
  onProgress?.('Olaylar yükleniyor…');
  const events: HistoricalEvent[] = [];
  const seen = new Set<string>();
  for (const file of eventsIndex.files) {
    const doc = await getJson<{ set?: string; events: RawEvent[] }>(`events/${file}`);
    for (const raw of doc.events) {
      try {
        const ev = normalizeEvent(raw, doc.set ?? file);
        if (seen.has(ev.id)) throw new Error(`${ev.id}: kimlik yinelenmiş`);
        seen.add(ev.id);
        ev.parties = [...new Set(ev.parties.map(canonical))];
        for (const party of ev.parties) if (!entities.has(party)) warn(`${ev.id}: bilinmeyen taraf "${party}"`);
        events.push(ev);
      } catch (err) {
        warn(`${file}: olay atlandı (${(err as Error).message})`);
      }
    }
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
