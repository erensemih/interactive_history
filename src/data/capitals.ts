import type { PlaceIndex, PlaceRecord } from './places';

/** One stretch of years in which a polity had one capital. */
export interface CapitalSpan {
  from: number;
  to: number;
  /** A gazetteer id (public/data/places.json). */
  place: string;
  /** Why this one (a wartime or temporary capital, a seat of government that is not the capital in law). */
  note?: string;
}

export interface CapitalsDoc {
  meta: { note: string; sources?: string[] };
  /** By polity id (the ids of public/data/entities.json). */
  capitals: Record<string, CapitalSpan[]>;
}

/**
 * Where a polity was governed from, year by year, for the polities the data matters for. A line that leaves "Rusya"
 * starts in St Petersburg before 1918 and in Moscow after; a polity the table does not know has no capital here, and
 * the caller falls back to the middle of its biggest part.
 */
export class CapitalIndex {
  private readonly spans = new Map<string, CapitalSpan[]>();

  constructor(
    doc: CapitalsDoc | null,
    private readonly places: PlaceIndex,
  ) {
    for (const [id, list] of Object.entries(doc?.capitals ?? {})) {
      this.spans.set(
        id,
        [...list].sort((a, b) => a.from - b.from),
      );
    }
  }

  has(id: string): boolean {
    return this.spans.has(id);
  }

  /** The capital of polity `id` in `year`, or null when the table has none for that year. */
  at(id: string, year: number): PlaceRecord | null {
    for (const span of this.spans.get(id) ?? []) {
      if (span.from <= year && year <= span.to) return this.places.byId(span.place) ?? null;
    }
    return null;
  }
}
