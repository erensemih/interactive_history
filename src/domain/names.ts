const FOLD: Record<string, string> = { ı: 'i', ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', đ: 'd', ł: 'l' };

/**
 * A name as a key: lower case, accents and Turkish letters folded, everything but letters and digits turned into single
 * spaces. "Köln", "KOLN" and "koln" are the same key, and so are "St. Petersburg" and "st petersburg".
 */
export function normalizeName(text: string): string {
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[ıßæœøđł]/g, (c) => FOLD[c] ?? c)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
