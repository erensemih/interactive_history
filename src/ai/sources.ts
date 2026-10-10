import type { AppData } from '../data/load';
import { overlaps } from '../domain/time';
import type { AiContext, Mode } from './context';

/** A piece of text the model may lean on, with the title it should be known by. */
export interface SourcePassage {
  title: string;
  text: string;
}

export interface SourceQuery {
  mode: Mode;
  /** What the reader asked (or the canned request of the narration button). */
  question: string;
  context: AiContext;
}

/**
 * Where the answer's facts come from. The model's own knowledge is the default and needs no provider; the
 * app's own event records are added as passages. This interface is the seam for more: a book the reader
 * uploads would implement `retrieve` by searching its text for the question and the context, and return
 * the best passages with their page or chapter in `title`. Nothing else in the app would change.
 */
export interface SourceProvider {
  readonly id: string;
  /** How the passages are introduced to the model (and, later, to the reader). */
  readonly label: string;
  retrieve(query: SourceQuery): Promise<SourcePassage[]> | SourcePassage[];
}

export interface SourceGroup {
  label: string;
  passages: SourcePassage[];
}

/** Total room for passages in one prompt. The model's input may be 256 KiB; the rest is history, polities and rules. */
export const PASSAGE_BUDGET_CHARS = 14_000;

/**
 * The app's verified event records for the range, most relevant first: events of the selected place's
 * lineage and of the open event's parties, then the rest by importance. They keep the model from
 * contradicting what the event cards already say.
 */
export function appEventsSource(data: Pick<AppData, 'events' | 'entities'>, max = 40): SourceProvider {
  return {
    id: 'app-events',
    label: 'Uygulamanın olay kayıtları',
    retrieve({ context }) {
      const { range } = context;
      const lineage = new Set(context.places.flatMap((p) => p.lineage));
      for (const party of context.event?.parties ?? []) lineage.add(party);
      const own = (ids: string[]) => ids.some((id) => lineage.has(id));
      const inRange = data.events.filter((e) => overlaps(e.start, e.end, range.from, range.to + 1));
      inRange.sort(
        (a, b) =>
          Number(own(b.parties)) - Number(own(a.parties)) ||
          b.importance - a.importance ||
          a.start - b.start ||
          (a.id < b.id ? -1 : 1),
      );
      return inRange
        .slice(0, max)
        .sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : 1))
        .map((e) => {
          const parties = e.parties.map((id) => data.entities.get(id)?.name ?? id).join(', ');
          return {
            title: `${e.dateLabel} · ${e.title} (${e.location.name})`,
            text: `${e.summary}${parties ? ` Taraflar: ${parties}.` : ''}`,
          };
        });
    },
  };
}

/**
 * Asks every provider, keeps the passages in order until the budget is spent, and drops providers that
 * fail: a source that is down must not stop the answer.
 */
export async function gatherPassages(
  providers: readonly SourceProvider[],
  query: SourceQuery,
  budgetChars = PASSAGE_BUDGET_CHARS,
): Promise<SourceGroup[]> {
  const groups: SourceGroup[] = [];
  let left = budgetChars;
  for (const provider of providers) {
    let found: SourcePassage[] = [];
    try {
      found = await provider.retrieve(query);
    } catch (err) {
      console.warn(`[kaynak] ${provider.id} okunamadı`, err);
    }
    const kept: SourcePassage[] = [];
    for (const p of found) {
      const size = p.title.length + p.text.length;
      if (size > left) break;
      left -= size;
      kept.push(p);
    }
    if (kept.length) groups.push({ label: provider.label, passages: kept });
  }
  return groups;
}
