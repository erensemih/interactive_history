import { normalizeName } from '../domain/names';
import type { SourceInfo } from './load';

/** A city or town of the gazetteer (public/data/places.json). The map's places for lines and routes. */
export interface PlaceRecord {
  /** Stable id: the English name as a slug, with the country appended where two places would share one ("london-ca"). */
  id: string;
  /** The Turkish name, as the page shows it. */
  tr: string;
  /** The English name (the one most atlases use). */
  en: string;
  lon: number;
  lat: number;
  /** The biggest population the source gives for the place (people), 0 when unknown. */
  pop: number;
  /** ISO 3166-1 alpha-2 code of today's country. */
  cc: string;
  /** 1 for the capital of a country today. */
  cap?: 1;
  /** Other names that mean the same place: local spellings and historical names ("Danzig", "Stalingrad", "Peking"). */
  alt: string[];
}

export interface PlacesDoc {
  meta: { source: SourceInfo; count?: number };
  places: PlaceRecord[];
}

/**
 * The gazetteer: a few thousand places the model may name as the end of a line or a stop of a route. A name is found
 * by its Turkish or English name or by any alternative name, whatever the case, accents or punctuation; where two
 * places share a name the better-known one (a capital, then the bigger one) comes first.
 */
export class PlaceIndex {
  private readonly ids = new Map<string, PlaceRecord>();
  private readonly names = new Map<string, { record: PlaceRecord; main: boolean }[]>();

  constructor(doc: PlacesDoc | null) {
    for (const record of doc?.places ?? []) {
      this.ids.set(record.id, record);
      const mains = new Set([normalizeName(record.tr), normalizeName(record.en)]);
      const keys = new Set([...mains, ...record.alt.map(normalizeName)]);
      for (const key of keys) {
        if (!key) continue;
        const list = this.names.get(key);
        const entry = { record, main: mains.has(key) };
        if (list) list.push(entry);
        else this.names.set(key, [entry]);
      }
    }
  }

  get size(): number {
    return this.ids.size;
  }

  byId(id: string): PlaceRecord | undefined {
    return this.ids.get(id);
  }

  /** Every place that goes by `text`, the best known first: names before alternative names, capitals, then the bigger. */
  find(text: string): PlaceRecord[] {
    const key = normalizeName(text);
    if (!key) return [];
    return [...(this.names.get(key) ?? [])]
      .sort(
        (a, b) =>
          Number(b.main) - Number(a.main) ||
          (b.record.cap ?? 0) - (a.record.cap ?? 0) ||
          b.record.pop - a.record.pop ||
          (a.record.id < b.record.id ? -1 : 1),
      )
      .map((e) => e.record);
  }
}
