export interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
}

/**
 * The little markdown a narration may carry: **bold** and *italic*, nothing else. A mark that has not
 * been closed yet (the text is still arriving) or does not belong is dropped instead of shown as stray
 * asterisks.
 */
export function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  const re = /\*\*([^*]+?)\*\*|\*([^*\s][^*]*?)\*/g;
  let last = 0;
  const plain = (chunk: string) => {
    const clean = chunk.replace(/\*+/g, '');
    if (clean) out.push({ text: clean, bold: false, italic: false });
  };
  for (let m = re.exec(text); m; m = re.exec(text)) {
    plain(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ text: m[1], bold: true, italic: false });
    else out.push({ text: m[2]!, bold: false, italic: true });
    last = m.index + m[0].length;
  }
  plain(text.slice(last));
  return out;
}
