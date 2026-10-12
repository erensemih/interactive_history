import { isEmptyDrawing } from './drawing';
import type { AssistantItem } from './session';
import { alignWithPlan, parseAnswer, type Section } from './steps';

/** The longest a subtitle made from a step's text may be. (The model's own captions are kept to LIMITS.caption.) */
export const CAPTION_FROM_TEXT = 220;

/** One step of a stepped answer, as both views need it: the short caption for Watch, the full text for Read. */
export interface StepView {
  n: number;
  title: string;
  /** What the model wrote as the subtitle; else the first sentences of the step's text; else the title. */
  caption: string;
  /** The full text, paragraphs separated by blank lines. Empty until the model has begun writing it. */
  body: string;
  /** The plan (titles, captions, scenes) arrives before the long texts: has this step's text begun? */
  hasText: boolean;
  /** Does the step change the map (a drawing, a region or a year)? */
  hasScene: boolean;
  /** The border year the step asks for, if any: where the step sits on the timeline. */
  year: number | null;
}

/** A single-part answer: a short text over the map with at most one scene. */
export interface ShortView {
  title: string;
  body: string;
  hasScene: boolean;
}

const streaming = (item: AssistantItem) => item.status === 'waiting' || item.status === 'streaming';

/** The sections of the text as written so far; once it is finished, a text without readable headings may still be split by the plan. */
function sectionsOf(item: AssistantItem): { preamble: string; sections: Section[] } {
  const parsed = parseAnswer(item.text);
  const sections = streaming(item)
    ? parsed.sections
    : alignWithPlan(parsed.sections, item.plan.numbers(), (n) => item.plan.titleOf(n));
  return { preamble: parsed.preamble, sections };
}

/** Every step number the answer has, from the plan and from the text, ascending. */
function numbersOf(item: AssistantItem, sections: readonly Section[]): number[] {
  return [...new Set([...item.plan.numbers(), ...sections.map((s) => s.n)])].sort((a, b) => a - b);
}

/**
 * Is the answer in steps? Two or more scenes (or two numbered sections) make a narration; anything less is a
 * single-part answer, whatever the question was: the model decides which form fits.
 */
export function isStepped(item: AssistantItem): boolean {
  const { sections } = sectionsOf(item);
  return numbersOf(item, sections).length >= 2;
}

/** The steps of an answer, in order. Empty for a single-part answer. */
export function stepsOf(item: AssistantItem): StepView[] {
  const { sections } = sectionsOf(item);
  const numbers = numbersOf(item, sections);
  if (numbers.length < 2) return [];
  return numbers.map((n) => {
    const section = sections.find((s) => s.n === n);
    const scene = item.plan.drawingAt(n);
    const body = section?.body ?? '';
    const title = section?.title || item.plan.titleOf(n) || '';
    return {
      n,
      title,
      caption: item.plan.captionOf(n) || captionFromText(body) || title,
      body,
      hasText: body.trim().length > 0,
      hasScene: !isEmptyDrawing(scene) || scene.year !== undefined,
      year: scene.year ?? null,
    };
  });
}

/** The text of a single-part answer, and whether it has a scene of its own. */
export function shortOf(item: AssistantItem): ShortView {
  const { preamble, sections } = sectionsOf(item);
  const first = sections[0];
  const scene = item.plan.drawingAt(first?.n ?? 1);
  return {
    title: first?.title ?? '',
    body: [preamble, first?.body ?? ''].filter(Boolean).join('\n\n'),
    hasScene: !isEmptyDrawing(scene) || scene.year !== undefined,
  };
}

/* ------------------------------------------------------------ captions */

/** Sentences of a text. A full stop after a lone capital or a Roman numeral ("I. Süleyman", "II. Lajos") is not an end. */
export function sentencesOf(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9«“"'(])/);
  const out: string[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && /(?:^|\s)(?:[A-ZÇĞİÖŞÜ]|[IVXL]+)\.$/.test(last)) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out.filter(Boolean);
}

/**
 * A subtitle made from a step's text, for a model that did not write one: its first sentences, as many as fit,
 * plain (no emphasis marks). Empty when there is no text yet.
 */
export function captionFromText(body: string, max = CAPTION_FROM_TEXT): string {
  const plain = body.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  let out = '';
  for (const sentence of sentencesOf(plain)) {
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
    if (out.length >= max * 0.6) break; // a couple of sentences is a subtitle; more is a paragraph
  }
  if (out) return out;
  // one long sentence: cut it at a word
  const cut = plain.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).trimEnd()}…`;
}
