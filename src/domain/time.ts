import type { YearRange } from './types';

export const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
] as const;

export type DatePrecision = 'year' | 'month' | 'day';

export interface ParsedDate {
  /** Half-open interval in fractional years covered by the date at its precision. */
  start: number;
  end: number;
  precision: DatePrecision;
  year: number;
  month?: number;
  day?: number;
}

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInYear = (y: number) => (isLeap(y) ? 366 : 365);
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const daysInMonth = (y: number, m: number) => (m === 2 && isLeap(y) ? 29 : DAYS_IN_MONTH[m - 1]!);

function dayOfYear(y: number, m: number, d: number): number {
  let n = d;
  for (let i = 1; i < m; i++) n += daysInMonth(y, i);
  return n;
}

/**
 * Parses "YYYY", "YYYY-MM" or "YYYY-MM-DD" (years 1–9999). A date is kept exactly as the source writes it
 * and placed on a proleptic Gregorian year; sources before 1582 often use the Julian calendar, which
 * differs by about a week or more. That only shifts an event within its year, never into another one.
 */
export function parseDate(text: string): ParsedDate {
  const m = /^(\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(text.trim());
  if (!m) throw new Error(`Geçersiz tarih: "${text}" (YYYY, YYYY-AA veya YYYY-AA-GG bekleniyor)`);
  const year = Number(m[1]);
  if (m[2] === undefined) return { start: year, end: year + 1, precision: 'year', year };
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new Error(`Geçersiz ay: "${text}"`);
  if (m[3] === undefined) {
    return {
      start: year + (dayOfYear(year, month, 1) - 1) / daysInYear(year),
      end: month === 12 ? year + 1 : year + (dayOfYear(year, month + 1, 1) - 1) / daysInYear(year),
      precision: 'month',
      year,
      month,
    };
  }
  const day = Number(m[3]);
  if (day < 1 || day > daysInMonth(year, month)) throw new Error(`Geçersiz gün: "${text}"`);
  const doy = dayOfYear(year, month, day);
  return {
    start: year + (doy - 1) / daysInYear(year),
    end: year + doy / daysInYear(year),
    precision: 'day',
    year,
    month,
    day,
  };
}

/** "29 Mayıs 1453" / "Mayıs 1453" / "1453". */
export function formatParsed(p: ParsedDate, opts: { omitYear?: boolean } = {}): string {
  const y = opts.omitYear ? '' : ` ${p.year}`;
  if (p.precision === 'year') return `${p.year}`;
  if (p.precision === 'month') return `${MONTHS_TR[p.month! - 1]}${y}`;
  return `${p.day} ${MONTHS_TR[p.month! - 1]}${y}`;
}

/** Turkish label for an event's date (single date or range), e.g. "6 Nisan – 29 Mayıs 1453". */
export function formatDateRange(start: ParsedDate, end: ParsedDate | null, approximate: boolean): string {
  const prefix = approximate ? 'yak. ' : '';
  if (
    !end ||
    (end.year === start.year && end.month === start.month && end.day === start.day && end.precision === start.precision)
  ) {
    return prefix + formatParsed(start);
  }
  if (start.year === end.year) {
    // Same year: write the year once when both ends carry a month.
    if (start.precision !== 'year' && end.precision !== 'year') {
      return `${prefix}${formatParsed(start, { omitYear: true })} – ${formatParsed(end)}`;
    }
    return `${prefix}${formatParsed(start)} – ${formatParsed(end)}`;
  }
  return `${prefix}${formatParsed(start)} – ${formatParsed(end)}`.replace(/(\d{4}) – (\d{4})/, '$1–$2');
}

/* ------------------------------------------------------------- range helpers */

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The inclusive year range as a half-open fractional interval [from, to + 1). */
export function rangeInterval(r: YearRange): [number, number] {
  return [r.from, r.to + 1];
}

/** Half-open interval overlap. */
export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** The single year whose borders the map shows: `cursor` (0..1) walks through the range. */
export function displayYear(range: YearRange, cursor: number): number {
  if (range.to === range.from) return range.from;
  return Math.round(range.from + clamp(cursor, 0, 1) * (range.to - range.from));
}

/** Inverse of `displayYear`, to keep the cursor's relative place when the range moves. */
export function cursorFor(range: YearRange, year: number): number {
  if (range.to === range.from) return 0.5;
  return clamp((year - range.from) / (range.to - range.from), 0, 1);
}

export function normalizeRange(r: YearRange, extent: YearRange): YearRange {
  let from = Math.round(Math.min(r.from, r.to));
  let to = Math.round(Math.max(r.from, r.to));
  from = clamp(from, extent.from, extent.to);
  to = clamp(to, extent.from, extent.to);
  return { from, to };
}

/** Moves the window by `delta` years keeping its length, clamped to the extent. */
export function shiftRange(r: YearRange, delta: number, extent: YearRange): YearRange {
  const span = r.to - r.from;
  let from = r.from + delta;
  from = clamp(from, extent.from, extent.to - span);
  return { from, to: from + span };
}

/** Preset spans keep the window's centre. `span` is the number of years (1 = single year). */
export function presetRange(r: YearRange, span: number, extent: YearRange): YearRange {
  const length = Math.min(span, extent.to - extent.from + 1);
  const centre = (r.from + r.to) / 2;
  let from = Math.round(centre - (length - 1) / 2);
  from = clamp(from, extent.from, extent.to - (length - 1));
  return { from, to: from + length - 1 };
}

/**
 * The window the place timeline displays: the selected range plus context on both sides,
 * so a one-year selection still shows what happened around it. Always inside `extent`.
 */
export function detailDomain(r: YearRange, extent: YearRange, minSpan = 30): YearRange {
  const span = r.to - r.from + 1;
  const pad = Math.max(Math.ceil(span * 0.5), Math.ceil((minSpan - span) / 2), 8);
  let lo = r.from - pad;
  let hi = r.to + pad;
  const total = extent.to - extent.from + 1;
  if (hi - lo + 1 >= total) return { ...extent };
  if (lo < extent.from) {
    hi += extent.from - lo;
    lo = extent.from;
  }
  if (hi > extent.to) {
    lo -= hi - extent.to;
    hi = extent.to;
  }
  return { from: Math.max(lo, extent.from), to: Math.min(hi, extent.to) };
}

/** Round tick positions (years) for an axis that spans [lo, hi + 1) over `width` px. */
export function axisTicks(lo: number, hi: number, width: number, minGap = 64): { year: number; major: boolean }[] {
  const span = hi - lo + 1;
  const steps = [1, 2, 5, 10, 25, 50, 100];
  const perYear = width / span;
  let step = steps[steps.length - 1]!;
  for (const s of steps) {
    if (s * perYear >= minGap) {
      step = s;
      break;
    }
  }
  const out: { year: number; major: boolean }[] = [];
  const majorEvery =
    step >= 50 ? step : step * (step === 1 ? 5 : step === 2 ? 5 : step === 5 ? 2 : step === 10 ? 5 : 2);
  for (let y = Math.ceil(lo / step) * step; y <= hi + 1; y += step) {
    out.push({ year: y, major: y % majorEvery === 0 });
  }
  return out;
}
