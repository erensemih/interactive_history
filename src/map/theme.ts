/** Map colours come from the same CSS tokens as the rest of the UI (single source of truth). */
export interface MapTheme {
  sea: string;
  seaDeep: string;
  nodata: string;
  coast: string;
  borderInk: string;
  accent: string;
  ink3: string;
  tints: string[];
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
    sea: token(s, '--sea', '#bdd0d5'),
    seaDeep: token(s, '--sea-deep', '#acc2c8'),
    nodata: token(s, '--land-nodata', '#ebe6d9'),
    coast: token(s, '--coast', '#3a3128'),
    borderInk: token(s, '--border-ink', '#5d4d3b'),
    accent: token(s, '--accent', '#cf3f27'),
    ink3: token(s, '--ink-3', '#6d6455'),
    tints,
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
