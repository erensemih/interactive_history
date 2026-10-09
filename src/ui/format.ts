import type { YearRange } from '../domain/types';

const nf = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

export function formatRange(r: YearRange): string {
  return r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`;
}

/** Turkish "N yıl" label for a span in years. */
export function spanLabel(r: YearRange): string {
  const n = r.to - r.from + 1;
  return n === 1 ? 'tek yıl' : `${n} yıl`;
}

export function formatArea(km2: number): string {
  if (km2 >= 1_000_000) return `${nf.format(km2 / 1_000_000)} milyon km²`;
  if (km2 >= 10_000) return `${nf0.format(Math.round(km2 / 1000))} bin km²`;
  return `${nf0.format(Math.round(km2 / 10) * 10)} km²`;
}

export function formatCount(n: number, noun: string): string {
  return `${nf0.format(n)} ${noun}`;
}

/** Shortens a long polity name for tight spaces (timeline ribbon). */
export function shortName(name: string): string {
  return name
    .replace(' İmparatorluğu', '')
    .replace(' Krallığı', '')
    .replace(' Sultanlığı', '')
    .replace(' Hanedanı', '')
    .replace(' Cumhuriyeti', '');
}

export function clsx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
