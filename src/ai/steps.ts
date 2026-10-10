/**
 * Reading the model's text. A narration is written as numbered sections,
 *
 *   ## 2. Çaldıran
 *   Paragraph…
 *
 * and an answer to a question is plain paragraphs (one implicit step). The parser is tolerant on purpose:
 * models vary the heading mark, the numbering and the spacing, and the text arrives piece by piece, so a
 * half-written heading must not flash as body text.
 */
export interface Section {
  /** 1-based and strictly increasing, whatever the text numbered its headings. */
  n: number;
  title: string;
  /** Paragraphs separated by blank lines. */
  body: string;
}

export interface ParsedAnswer {
  /** Text before the first heading (a narration that starts with a line of its own). */
  preamble: string;
  sections: Section[];
}

/** `## 2. Title`, `### Adım 2: Title`, `## Title` (unnumbered). */
const HEADING = /^\s{0,3}#{1,6}[ \t]+(?:adım[ \t]*(?=\d))?(?:(\d{1,2})[ \t]*[.):\-–—]*[ \t]*)?(.*?)[ \t]*#*[ \t]*$/i;
/** `**2. Title**` alone on its line. */
const BOLD_HEADING = /^\s{0,3}\*\*[ \t]*(\d{1,2})[ \t]*[.):\-–—][ \t]*(.+?)[ \t]*\*\*[ \t]*$/;

function headingOf(line: string): { n: number | null; title: string } | null {
  const bold = BOLD_HEADING.exec(line);
  if (bold) return { n: Number(bold[1]), title: bold[2]!.trim() };
  const h = HEADING.exec(line);
  if (!h) return null;
  return { n: h[1] ? Number(h[1]) : null, title: h[2]!.replace(/\*+/g, '').trim() };
}

export function parseAnswer(text: string): ParsedAnswer {
  // A heading that has only just begun ("##" at the very end) is not text yet.
  const source = text.replace(/\r\n?/g, '\n').replace(/(?:^|\n)[ \t]*#{1,6}[ \t]*$/, '');
  const preamble: string[] = [];
  const found: { n: number; title: string; body: string[] }[] = [];
  let last = 0;
  for (const line of source.split('\n')) {
    const h = headingOf(line);
    if (h) {
      const n = h.n !== null && h.n > last ? h.n : last + 1;
      found.push({ n, title: h.title, body: [] });
      last = n;
    } else {
      (found.length ? found[found.length - 1]!.body : preamble).push(line);
    }
  }
  if (!found.length) {
    const body = source.trim();
    return { preamble: '', sections: body ? [{ n: 1, title: '', body }] : [] };
  }
  return {
    preamble: preamble.join('\n').trim(),
    sections: found.map((s) => ({ n: s.n, title: s.title, body: s.body.join('\n').trim() })),
  };
}

/** The blank-line separated paragraphs of a section body. */
export function paragraphsOf(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/**
 * A model that planned several steps but wrote its text without headings we can read (plain "1." lines, say)
 * still gets its steps, if the paragraphs can be told apart and there are exactly as many as planned: the n-th
 * paragraph is then the n-th step. Anything else is left as it was read.
 */
export function alignWithPlan(
  sections: Section[],
  planned: readonly number[],
  titleOf: (n: number) => string | null,
): Section[] {
  if (sections.length !== 1 || planned.length < 2) return sections;
  const paragraphs = paragraphsOf(sections[0]!.body);
  if (paragraphs.length !== planned.length) return sections;
  return paragraphs.map((body, i) => ({ n: planned[i]!, title: titleOf(planned[i]!) ?? '', body }));
}
