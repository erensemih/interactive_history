import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATEGORY_STYLES, FALLBACK_STYLE, MARKER_DIAMETER, styleFor } from '../src/domain/categories';

/**
 * Guards the colour rules of the map, in numbers:
 *  - blue belongs to the sea and the lakes alone, so no polity tint may be blue-ish; nor grey, which reads as the
 *    dotted "no data" ground; and the nine tints stay far enough apart that two neighbours never blur;
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
  const inUse = tints.slice(0, 8); // the data uses indices 0-7; the ninth is a spare
  const chromaOf = (hex: string) => hueChroma(hex).chroma;

  it('are never blue, teal or violet (blue is for the sea)', () => {
    for (const t of tints) expect(isBlueish(t.hex), `${t.name} ${t.hex}`).toBe(false);
  });

  it('the guard itself recognises the sea as blue', () => {
    expect(isBlueish(token('sea'))).toBe(true);
    expect(isBlueish(token('sea-deep'))).toBe(true);
  });

  it('are never grey or sand-like: each is clearly coloured (a grey polity reads as "no data")', () => {
    for (const t of tints) expect(chromaOf(t.hex), `${t.name} ${t.hex}`).toBeGreaterThanOrEqual(0.075);
  });

  it('stay well away from the dotted no-data ground, the paper and the sea', () => {
    for (const t of tints) {
      expect(deltaE(t.hex, token('land-nodata')), `${t.name} against the no-data ground`).toBeGreaterThanOrEqual(11);
      expect(deltaE(t.hex, token('paper')), `${t.name} against the paper`).toBeGreaterThanOrEqual(9);
      expect(deltaE(t.hex, token('sea')), `${t.name} against the sea`).toBeGreaterThanOrEqual(11);
      expect(deltaE(t.hex, token('sea-deep')), `${t.name} against the deep sea`).toBeGreaterThanOrEqual(11);
    }
  });

  it('are clearly different from each other, so two neighbours never blur into one (every pair of the eight in use ΔE ≥ 8.5)', () => {
    for (const [i, a] of inUse.entries())
      for (const b of inUse.slice(i + 1))
        expect(deltaE(a.hex, b.hex), `${a.name} / ${b.name}`).toBeGreaterThanOrEqual(8.5);
    for (const t of inUse) expect(deltaE(t.hex, tints[8]!.hex), `${t.name} / the spare`).toBeGreaterThanOrEqual(6.5);
  });

  it('keep clear of the vermilion that means "your selection"', () => {
    for (const t of tints) expect(deltaE(t.hex, token('accent')), t.name).toBeGreaterThanOrEqual(15);
  });

  it('carry the year labels of the place timeline legibly: ink on every tint, WCAG contrast ≥ 4.5:1', () => {
    const luminance = (hex: string) => {
      const [r, g, b] = toLinear(hex);
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    for (const t of tints) expect(contrast(token('ink'), t.hex), `${t.name} ${t.hex}`).toBeGreaterThanOrEqual(4.5);
    // (the softer ink-2 falls just short on the apricot tint, 4.4:1: that is why the labels use the darkest ink)
  });
});

describe('spotlight colours (the vivid twin of each tint)', () => {
  const vivid = Array.from({ length: 9 }, (_, i) => ({
    name: `vivid-${i}`,
    hex: token(`vivid-${i}`),
    tint: token(`tint-${i}`),
  }));

  it('are never blue, teal or violet', () => {
    for (const v of vivid) expect(isBlueish(v.hex), `${v.name} ${v.hex}`).toBe(false);
  });

  it('are vivid: saturated and a shade darker than the wash they stand out from', () => {
    for (const v of vivid) {
      const { chroma } = hueChroma(v.hex);
      expect(chroma, `${v.name} chroma`).toBeGreaterThanOrEqual(0.12);
      expect(oklabOf(toLinear(v.hex))[0], `${v.name} is darker than its tint`).toBeLessThan(
        oklabOf(toLinear(v.tint))[0],
      );
      expect(deltaE(v.hex, v.tint), `${v.name} against its own tint`).toBeGreaterThanOrEqual(12);
    }
  });

  it('keep their own hue (a polity stays recognisable when it is lit)', () => {
    for (const v of vivid) {
      let d = Math.abs(hueChroma(v.hex).hue - hueChroma(v.tint).hue);
      if (d > 180) d = 360 - d;
      expect(d, `${v.name} hue drift`).toBeLessThanOrEqual(24);
    }
  });

  it('stay off the vermilion and off the sea', () => {
    for (const v of vivid) {
      expect(deltaE(v.hex, token('accent')), `${v.name} against the accent`).toBeGreaterThanOrEqual(11);
      expect(deltaE(v.hex, token('sea')), `${v.name} against the sea`).toBeGreaterThanOrEqual(15);
    }
  });

  it('are told apart from each other (ΔE ≥ 6; two lit neighbours also have the link and their names)', () => {
    for (const [i, a] of vivid.entries())
      for (const b of vivid.slice(i + 1))
        expect(deltaE(a.hex, b.hex), `${a.name} / ${b.name}`).toBeGreaterThanOrEqual(6);
  });
});

describe('the colours of the sides of a conflict (one bloc colour each, up to three sides)', () => {
  const sides = [0, 1, 2].map((i) => ({ name: `side-${i}`, hex: token(`side-${i}`) }));

  it('are never blue, teal or violet, and clearly coloured', () => {
    for (const s of sides) {
      expect(isBlueish(s.hex), `${s.name} ${s.hex}`).toBe(false);
      expect(hueChroma(s.hex).chroma, `${s.name} chroma`).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('are told apart by everyone: normal sight, protanopia and deuteranopia', () => {
    for (const [i, a] of sides.entries())
      for (const b of sides.slice(i + 1)) {
        expect(deltaE(a.hex, b.hex), `${a.name} / ${b.name}`).toBeGreaterThanOrEqual(20);
        expect(deltaE(a.hex, b.hex, 'protan'), `${a.name} / ${b.name} (protan)`).toBeGreaterThanOrEqual(12);
        expect(deltaE(a.hex, b.hex, 'deutan'), `${a.name} / ${b.name} (deutan)`).toBeGreaterThanOrEqual(12);
      }
  });

  it('stand out from the sea, the paper, the no-data ground and the vermilion of the selection', () => {
    for (const s of sides) {
      expect(deltaE(s.hex, token('sea')), `${s.name} against the sea`).toBeGreaterThanOrEqual(15);
      expect(deltaE(s.hex, token('paper')), `${s.name} against the paper`).toBeGreaterThanOrEqual(15);
      expect(deltaE(s.hex, token('land-nodata')), `${s.name} against the no-data ground`).toBeGreaterThanOrEqual(15);
      expect(deltaE(s.hex, token('accent')), `${s.name} against the accent`).toBeGreaterThanOrEqual(15);
    }
  });

  it('the app has exactly as many as it allows sides (a fourth side would have no colour)', async () => {
    const { LIMITS } = await import('../src/ai/types');
    expect(sides).toHaveLength(LIMITS.sides);
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
      'economy',
      'military',
      'politics',
      'society',
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

  it('keep the colour of the category that replaced an id of the earlier data', () => {
    expect(styleFor('exploration')).toBe(CATEGORY_STYLES.economy);
    expect(styleFor('religion')).toBe(CATEGORY_STYLES.society);
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
