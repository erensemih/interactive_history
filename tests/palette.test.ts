import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_STYLES, FALLBACK_STYLE, MARKER_DIAMETER, styleFor } from '../src/domain/categories';

/**
 * Guards the colour rules of the map, in numbers:
 *  - blue belongs to the sea and the lakes alone, so no polity tint may be blue-ish;
 *  - event markers differ by colour alone, so every pair must stay apart, also for colour-blind readers,
 *    and none may look like the vermilion that means "your selection".
 * The maths (OKLab ΔE ×100, Machado et al. 2009 colour-vision simulation at severity 1.0) is the same
 * the dataviz palette validator uses, so the numbers quoted in src/domain/categories.ts can be re-derived.
 */

const tokens = readFileSync(join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');
const token = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens);
  if (!m) throw new Error(`token --${name} not found in tokens.css`);
  return m[1]!;
};

const toLinear = (hex: string): number[] =>
  [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });

function oklabOf([r, g, b]: number[]): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r! + 0.5363325363 * g! + 0.0514459929 * b!);
  const m = Math.cbrt(0.2119034982 * r! + 0.6806995451 * g! + 0.1073969566 * b!);
  const s = Math.cbrt(0.0883024619 * r! + 0.2817188376 * g! + 0.6299787005 * b!);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** Hue (degrees, OKLCH) and chroma. Blue is roughly 195°–290°, violet up to ~310°, teal from ~180°. */
function hueChroma(hex: string): { hue: number; chroma: number } {
  const [, a, b] = oklabOf(toLinear(hex));
  return { hue: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, chroma: Math.hypot(a, b) };
}

const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
} as const;

function deltaE(h1: string, h2: string, kind?: keyof typeof MACHADO): number {
  const view = (hex: string) => {
    const [r, g, b] = toLinear(hex) as [number, number, number];
    if (!kind) return oklabOf([r, g, b]);
    const M = MACHADO[kind];
    const clamp = (c: number) => Math.max(0, Math.min(1, c));
    return oklabOf(M.map((row) => clamp(row[0]! * r + row[1]! * g + row[2]! * b)));
  };
  const a = view(h1);
  const b = view(h2);
  return 100 * Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const isBlueish = (hex: string) => {
  const { hue, chroma } = hueChroma(hex);
  return chroma >= 0.02 && hue >= 180 && hue <= 310;
};

describe('polity tints', () => {
  const tints = Array.from({ length: 9 }, (_, i) => ({ name: `tint-${i}`, hex: token(`tint-${i}`) }));

  it('are never blue, teal or violet (blue is for the sea)', () => {
    for (const t of tints) expect(isBlueish(t.hex), `${t.name} ${t.hex}`).toBe(false);
  });

  it('the guard itself recognises the sea as blue', () => {
    expect(isBlueish(token('sea'))).toBe(true);
    expect(isBlueish(token('sea-deep'))).toBe(true);
  });

  it('stay apart from the sea (the closest, sand, is 6.2; the coastline and the shallow-water glow do the rest)', () => {
    for (const t of tints) expect(deltaE(t.hex, token('sea')), `${t.name} against the sea`).toBeGreaterThan(5);
  });
});

describe('event marker colours', () => {
  const entries = Object.entries(CATEGORY_STYLES);
  const pairs = entries.flatMap(([a, sa], i) =>
    entries.slice(i + 1).map(([b, sb]) => [a, sa.color, b, sb.color] as const),
  );

  it('cover the six categories of the data, each with its own colour', () => {
    expect(entries.map(([id]) => id).sort()).toEqual([
      'culture',
      'disaster',
      'exploration',
      'military',
      'politics',
      'religion',
    ]);
    expect(new Set(entries.map(([, s]) => s.color)).size).toBe(entries.length);
  });

  it('are not blue, so a marker is never mistaken for water', () => {
    for (const [id, s] of entries) expect(isBlueish(s.color), id).toBe(false);
  });

  it('are told apart by anyone with full colour vision', () => {
    for (const [a, ca, b, cb] of pairs) expect(deltaE(ca, cb), `${a} / ${b}`).toBeGreaterThanOrEqual(15);
  });

  it('stay apart under protanopia and deuteranopia (the margin the legend and tooltips back up with words)', () => {
    for (const [a, ca, b, cb] of pairs) {
      expect(deltaE(ca, cb, 'protan'), `${a} / ${b} protan`).toBeGreaterThanOrEqual(7);
      expect(deltaE(ca, cb, 'deutan'), `${a} / ${b} deutan`).toBeGreaterThanOrEqual(7);
    }
  });

  it('never look like the vermilion that marks the user’s own selection', () => {
    const accent = token('accent');
    for (const [id, s] of entries) expect(deltaE(s.color, accent), id).toBeGreaterThanOrEqual(10);
  });

  it('fall back to a neutral colour for a category the UI does not know, without touching Object.prototype', () => {
    expect(styleFor('something-new')).toBe(FALLBACK_STYLE);
    expect(styleFor('constructor')).toBe(FALLBACK_STYLE);
    expect(styleFor('__proto__')).toBe(FALLBACK_STYLE);
  });

  it('share one size: there is a single diameter for every marker', () => {
    expect(MARKER_DIAMETER).toBeGreaterThanOrEqual(12);
    expect(Object.keys(CATEGORY_STYLES[entries[0]![0]]!)).toEqual(['color']); // a style is a colour and nothing else
  });
});
