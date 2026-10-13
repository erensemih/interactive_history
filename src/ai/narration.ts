import { isEmptyDrawing } from './drawing';
import type { AssistantItem } from './session';
import { withoutOpenReference } from '../ui/read/segments';
import { alignWithPlan, parseAnswer, type Section } from './steps';

/** The longest a subtitle made from a step's text may be. (The model's own captions are kept to LIMITS.caption.) */
export const CAPTION_FROM_TEXT = 220;

/**
 * One step of an answer, as both views need it: the short caption for Watch, the full text for Read. Every answer
 * is made of steps: a narration has several, an answer to a plain question is one step (one scene).
 */
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
 * Does the answer have several steps (two or more scenes, or two numbered sections)? A narration does; an answer to a
 * plain question is a single step. The reader gets the controls for stepping only for the former.
 */
export function isStepped(item: AssistantItem): boolean {
  const { sections } = sectionsOf(item);
  return numbersOf(item, sections).length >= 2;
}

/**
 * The steps of an answer, in order: every answer has at least one once there is anything of it (a plan or some text).
 * The caption of a step is the model's own; for a model that wrote none (a plain-text answer) it is the first
 * sentence or two of the text, never the whole of it: the rest is for the reader to open ("Devamını oku").
 */
export function stepsOf(item: AssistantItem): StepView[] {
  const { sections } = sectionsOf(item);
  const numbers = numbersOf(item, sections);
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

/** What the text of a step has beyond its caption, if anything: the reason for a "Devamını oku" under the caption. */
export function hasMore(step: Pick<StepView, 'caption' | 'body' | 'hasText'>): boolean {
  if (!step.hasText) return false;
  const text = plainOf(step.body);
  const caption = plainOf(step.caption).replace(/…$/, '');
  return text.length > caption.length + 12;
}

const plainOf = (text: string) =>
  text
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]*)\]\(olay:[^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/* ------------------------------------------------------------ captions */

/**
 * Sentences of a text. A full stop after a lone capital, a Roman numeral or a number of one or two digits ("I. Süleyman",
 * "II. Lajos", "6. Ordu", "2. Dünya Savaşı") is not an end.
 */
export function sentencesOf(text: string): string[] {
  const parts = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÇĞİÖŞÜ0-9«“"'(])/);
  const out: string[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && /(?:^|[\s[])(?:[A-ZÇĞİÖŞÜ]|[IVXL]+|\d{1,2})\.$/.test(last)) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out.filter(Boolean);
}

/**
 * A subtitle made from a step's text, for a model that did not write one: its first sentence or two (as many as fit,
 * never more than `maxSentences`), without emphasis marks (a reference to an event stays: it is a link in the subtitle
 * too). A subtitle is a headline over the map, so a long text is never put into it whole: the rest is for Read. Empty
 * when there is no text yet.
 */
export function captionFromText(body: string, max = CAPTION_FROM_TEXT, maxSentences = 2): string {
  const plain = body.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!plain) return '';
  const sentences = sentencesOf(plain);
  // A text that is still arriving ends in a sentence that is not whole yet. The first one is the caption as it is written;
  // a second one is added only when it is whole, or the caption would grow with every word and then shrink back.
  const endsClean = /[.!?…]["”’')»\]]*$/.test(plain);
  let out = '';
  let taken = 0;
  for (const [i, sentence] of sentences.entries()) {
    if (i > 0 && i === sentences.length - 1 && !endsClean) break;
    const next = out ? `${out} ${sentence}` : sentence;
    if (next.length > max) break;
    out = next;
    if (++taken >= maxSentences || out.length >= max * 0.6) break; // a sentence or two is a subtitle; more is a paragraph
  }
  if (out) return out;
  // one long sentence: cut it at a word (never in the middle of the name of an event)
  const cut = plain.slice(0, max - 1);
  return `${withoutOpenReference(cut.slice(0, Math.max(cut.lastIndexOf(' '), 20))).trimEnd()}…`;
}
