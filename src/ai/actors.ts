import { normalizeName } from '../domain/names';
import type { Bloc, ColorKey, Side } from './types';

/**
 * The colours of the actors of a narration. The map is painted relative to the narration's focus: the side the focus stands
 * on is `focus`, the sides against it `foe-1` and `foe-2`, polities that stand aside or whose side is unclear `neutral`.
 * What the latest `sides` call names is what is painted (the others fade); an actor has the same colour every time it is
 * painted, a side that comes again (by its name, or by the polities it holds) comes in the colour it had, and a polity that
 * changes sides takes the colour of its new side. No two sides of one call share a colour.
 */
export interface Actors {
  /** The colour of each polity the latest call painted, in the order the call named them. */
  readonly colors: ReadonlyMap<string, ColorKey>;
  /** The colour each polity had the last time it was painted, whatever the calls since. */
  readonly memory: ReadonlyMap<string, ColorKey>;
  /** The colour each side was given, by its name (normalised). */
  readonly named: ReadonlyMap<string, ColorKey>;
}

export const NO_ACTORS: Actors = { colors: new Map(), memory: new Map(), named: new Map() };

/** What the model said at one moment of a scene: who is on which side (up to three), and who stands aside. */
export interface SidesCall {
  sides: readonly Side[];
  neutral: readonly string[];
}

/** The name the neutral polities carry under the caption. */
export const NEUTRAL_NAME = 'Tarafsız ya da belirsiz';

const FOES: readonly ColorKey[] = ['foe-1', 'foe-2'];

/**
 * Paints a `sides` call: the polities it names are painted, the others are not. The side the focus stands on is the focus's
 * colour (the first side when the focus stands on none of them, unless the focus has been painted before and the sides can all be
 * against it). Each other side keeps the colour its name was given, else the one most of its polities had; those are settled
 * first, so a side that is new cannot take the colour of one that was there before whatever order they are listed in; then the
 * new sides take the first foe colour that is free.
 */
export function paintSides(
  before: Actors,
  call: SidesCall,
  focus: readonly string[],
): { actors: Actors; blocs: Bloc[] } {
  const sides = call.sides.slice(0, 3);
  const asked = sides.findIndex((s) => s.polities.some((id) => focus.includes(id)));
  // the focus is not among the sides: when it has had a colour before it is not any of them, so none of them is the focus's
  const apart = asked < 0 && sides.length <= FOES.length && [...before.memory.values()].includes('focus');
  const mine = asked >= 0 ? asked : apart ? -1 : 0;
  const colors = new Map<string, ColorKey>();
  const memory = new Map(before.memory);
  const named = new Map(before.named);
  const taken = new Set<ColorKey>(['focus']);
  const given: (ColorKey | undefined)[] = [];
  if (sides.length && mine >= 0) given[mine] = 'focus';
  const had = (side: Side): ColorKey | undefined => {
    const remembered = named.get(normalizeName(side.name));
    if (remembered && FOES.includes(remembered) && !taken.has(remembered)) return remembered;
    // the colour most of its polities had (a side that was named differently the last time)
    const votes = new Map<ColorKey, number>();
    for (const id of side.polities) {
      const color = before.memory.get(id);
      if (color && FOES.includes(color) && !taken.has(color)) votes.set(color, (votes.get(color) ?? 0) + 1);
    }
    return [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
  };
  sides.forEach((side, i) => {
    if (i === mine) return;
    const color = had(side);
    if (!color) return;
    taken.add(color);
    given[i] = color;
  });
  sides.forEach((_, i) => {
    if (given[i]) return;
    const color = FOES.find((c) => !taken.has(c)) ?? FOES[FOES.length - 1]!;
    taken.add(color);
    given[i] = color;
  });
  const blocs: Bloc[] = [];
  sides.forEach((side, i) => {
    const color = given[i]!;
    for (const id of side.polities) {
      colors.set(id, color);
      memory.set(id, color);
    }
    named.set(normalizeName(side.name), color);
    blocs.push({ name: side.name, color, polities: [...side.polities] });
  });
  const neutral = call.neutral.filter((id) => !sides.some((s) => s.polities.includes(id)));
  for (const id of neutral) {
    colors.set(id, 'neutral');
    memory.set(id, 'neutral');
  }
  if (neutral.length) blocs.push({ name: NEUTRAL_NAME, color: 'neutral', polities: [...neutral] });
  return { actors: { colors, memory, named }, blocs };
}
