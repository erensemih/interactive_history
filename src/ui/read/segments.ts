export interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
  /** The id of an event of the app's data this text refers to (`[text](olay:id)`): a link the reader can click. */
  event?: string;
}

/** `[Mohaç Muharebesi](olay:mohac-1526)`: the text a reader sees, and the event it stands for. */
const REFERENCE = /\[([^\][\n]+?)\]\(olay:([A-Za-z0-9_-]+)\)/;

/**
 * The little markdown a narration may carry: **bold** and *italic*, and a reference to an event of the data,
 * `[text](olay:id)`, which the page turns into a link that opens that event (the same as a click on it in the
 * timeline). A mark that has not been closed yet (the text is still arriving) or does not belong is dropped
 * instead of shown as stray asterisks or half a link.
 */
export function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  const re = new RegExp(`${REFERENCE.source}|\\*\\*([^*]+?)\\*\\*|\\*([^*\\s][^*]*?)\\*`, 'g');
  let last = 0;
  const plain = (chunk: string) => {
    const clean = chunk.replace(/\*+/g, '');
    if (clean) out.push({ text: clean, bold: false, italic: false });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    plain(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ text: m[1].replace(/\*+/g, ''), bold: false, italic: false, event: m[2]! });
    else if (m[3] !== undefined) out.push({ text: m[3], bold: true, italic: false });
    else out.push({ text: m[4]!, bold: false, italic: true });
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  return out;
}

/**
 * The text without the marks: references become their words, so a subtitle made from a text, a screen reader's
 * label and the like never show `(olay:…)`.
 */
export function plainText(text: string): string {
  return text.replace(new RegExp(REFERENCE.source, 'g'), '$1').replace(/\*+/g, '');
}

/**
 * A text that is still arriving may end in half a reference (`[Mohaç Muha`, `[Mohaç](olay:moh`): that tail is left
 * out until it is complete, so the reader never sees the syntax being typed.
 */
export function withoutOpenReference(text: string): string {
  return text.replace(/\[[^\][\n]*(?:\](?:\((?:o(?:l(?:a(?:y(?::[A-Za-z0-9_-]*)?)?)?)?)?)?)?$/, '');
}
