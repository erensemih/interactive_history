import type { ColorKey } from '../ai/types';

/** Map colours come from the same CSS tokens as the rest of the UI (single source of truth). */
export interface MapTheme {
  sea: string;
  nodata: string;
  coast: string;
  borderInk: string;
  accent: string;
  ink: string;
  ink3: string;
  paper: string;
  tints: string[];
  /** The colours of the actors of a narration: the side it is about, the sides against it, whoever stands aside. */
  actors: Record<ColorKey, string>;
}

function token(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const v = style.getPropertyValue(name).trim();
  return v || fallback;
}

export function readTheme(count: number): MapTheme {
  const s = getComputedStyle(document.documentElement);
  const tints: string[] = [];
  for (let i = 0; i < count; i++) tints.push(token(s, `--tint-${i}`, '#e7dbc4'));
  return {
    sea: token(s, '--sea', '#bfdbef'),
    nodata: token(s, '--land-nodata', '#ebe6d9'),
    coast: token(s, '--coast', '#3a3128'),
    borderInk: token(s, '--border-ink', '#5d4d3b'),
    accent: token(s, '--accent', '#cf3f27'),
    ink: token(s, '--ink', '#1f1b16'),
    ink3: token(s, '--ink-3', '#6d6455'),
    paper: token(s, '--paper', '#f5f0e4'),
    tints,
    actors: {
      focus: token(s, '--side-focus', '#2f6fb8'),
      'foe-1': token(s, '--side-foe-1', '#e0a526'),
      'foe-2': token(s, '--side-foe-2', '#7d2250'),
      neutral: token(s, '--side-neutral', '#a8a08f'),
    },
  };
}

/** Diagonal hatch used on the selected polity (ink on paper, like a print). */
export function hatchImage(color: string): ImageData {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.5;
  ctx.lineCap = 'butt';
  // Three segments make the 45° line seamless across tile edges.
  for (const off of [-size, 0, size]) {
    ctx.beginPath();
    ctx.moveTo(off, size);
    ctx.lineTo(off + size, 0);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Diagonal hatch for the polities that stand aside or whose side is unclear (doubt is hatched): ink, finer than the selection's. */
export function doubtImage(color: string): ImageData {
  const size = 12;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.3;
  ctx.globalAlpha = 0.42;
  ctx.lineCap = 'butt';
  for (const off of [-size, 0, size]) {
    ctx.beginPath();
    ctx.moveTo(off, size);
    ctx.lineTo(off + size, 0);
    ctx.stroke();
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Fine stipple for land that has no recorded polity in the border dataset. */
export function stippleImage(color: string): ImageData {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.34;
  for (const [x, y] of [
    [4, 4],
    [12, 12],
  ] as const) {
    ctx.beginPath();
    ctx.arc(x, y, 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.getImageData(0, 0, size, size);
}

/** A colour as red, green and blue (0–255) from `#rrggbb` or `#rgb`; a colour it cannot read is mid grey. */
export function rgbOf(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isFinite(n) && full.length >= 6 ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
}

/** `a` mixed with `b`: `t` = 0 is `a`, 1 is `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const x = rgbOf(a);
  const y = rgbOf(b);
  const to = (i: number) =>
    Math.round(x[i]! + (y[i]! - x[i]!) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${to(0)}${to(1)}${to(2)}`;
}
