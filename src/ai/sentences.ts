/** `[Mohaç Muharebesi](olay:mohac-1526)`: a reference to an event; its words are never the end of a sentence. */
const REFERENCE = /\[[^\][\n]*\]\(olay:[A-Za-z0-9_-]*\)/g;

/** The stops inside a reference are hidden while the text is split, so `[St. Petersburg](olay:x)` stays in one piece. */
const HIDDEN: Record<string, string> = { '.': '\u0001', '!': '\u0002', '?': '\u0003', '…': '\u0004' };
const SHOWN = Object.fromEntries(Object.entries(HIDDEN).map(([stop, hidden]) => [hidden, stop]));

/**
 * Sentences of a text. A full stop after a lone capital, a Roman numeral or a number of one or two digits ("I. Süleyman",
 * "II. Lajos", "6. Ordu", "2. Dünya Savaşı") is not an end. The caption of a scene is split by this into its beats, on
 * the page and in the tools alike, so the sentence a tool call names is the sentence the reader sees.
 */
export function sentencesOf(text: string): string[] {
  const masked = text
    .replace(REFERENCE, (ref) => ref.replace(/[.!?…]/g, (stop) => HIDDEN[stop]!))
    .replace(/\s+/g, ' ')
    .trim();
  const parts = masked.split(/(?<=[.!?…]["”’')»\]]*)\s+(?=[A-ZÇĞİÖŞÜ0-9«“"'([])/);
  const out: string[] = [];
  for (const part of parts) {
    const last = out[out.length - 1];
    if (last && /(?:^|[\s[])(?:[A-ZÇĞİÖŞÜ]|[IVXL]+|\d{1,2})\.$/.test(last)) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out.filter(Boolean).map((s) => s.replace(/[\u0001-\u0004]/g, (h) => SHOWN[h]!));
}
