import { describe, expect, it } from 'vitest';
import { NEUTRAL_NAME, NO_ACTORS, paintSides, type Actors } from '../src/ai/actors';
import type { ColorKey } from '../src/ai/types';

const colorsOf = (actors: Actors): Record<string, ColorKey> => Object.fromEntries(actors.colors);
const call = (sides: [string, string[]][], neutral: string[] = []) => ({
  sides: sides.map(([name, polities]) => ({ name, polities })),
  neutral,
});

describe('paintSides', () => {
  it('gives the side the focus stands on the focus colour, and each side against it a colour of its own', () => {
    const { actors, blocs } = paintSides(
      NO_ACTORS,
      call([
        ['Batı', ['a', 'b']],
        ['Doğu', ['c']],
        ['Kuzey', ['d']],
      ]),
      ['c'],
    );
    expect(colorsOf(actors)).toEqual({ a: 'foe-1', b: 'foe-1', c: 'focus', d: 'foe-2' });
    expect(blocs.map((b) => [b.name, b.color])).toEqual([
      ['Batı', 'foe-1'],
      ['Doğu', 'focus'],
      ['Kuzey', 'foe-2'],
    ]);
    expect(blocs[0]!.polities).toEqual(['a', 'b']);
  });

  it('takes the first side for the focus when the focus stands on none of them, and when there is no focus', () => {
    expect(
      colorsOf(
        paintSides(
          NO_ACTORS,
          call([
            ['A', ['a']],
            ['B', ['b']],
          ]),
          ['z'],
        ).actors,
      ),
    ).toEqual({
      a: 'focus',
      b: 'foe-1',
    });
    expect(
      colorsOf(
        paintSides(
          NO_ACTORS,
          call([
            ['A', ['a']],
            ['B', ['b']],
          ]),
          [],
        ).actors,
      ),
    ).toEqual({
      a: 'focus',
      b: 'foe-1',
    });
  });

  it('puts those who stand aside in the neutral colour, under a name of their own, unless they are on a side', () => {
    const { actors, blocs } = paintSides(NO_ACTORS, call([['A', ['a']]], ['n', 'm', 'a']), []);
    expect(colorsOf(actors)).toEqual({ a: 'focus', n: 'neutral', m: 'neutral' });
    expect(blocs.at(-1)).toEqual({ name: NEUTRAL_NAME, color: 'neutral', polities: ['n', 'm'] });
  });

  it('never gives two opposing sides one colour, whatever they are called and in whatever order they are listed', () => {
    const first = paintSides(
      NO_ACTORS,
      call([
        ['Mihver', ['a']],
        ['Müttefikler', ['b']],
        ['Sovyet', ['c']],
      ]),
      ['a'],
    );
    expect(colorsOf(first.actors)).toEqual({ a: 'focus', b: 'foe-1', c: 'foe-2' });
    // the same sides again in another order, with a new one in front: the ones that were there keep their colours
    const second = paintSides(
      first.actors,
      call([
        ['Mihver', ['a']],
        ['Yepyeni', ['z']],
        ['Sovyet', ['c']],
      ]),
      ['a'],
    );
    expect(colorsOf(second.actors)).toMatchObject({ a: 'focus', c: 'foe-2', z: 'foe-1' });
    const third = paintSides(
      first.actors,
      call([
        ['Yepyeni', ['z']],
        ['Mihver', ['a']],
        ['Müttefikler', ['b']],
      ]),
      ['a'],
    );
    expect(colorsOf(third.actors)).toMatchObject({ a: 'focus', b: 'foe-1', z: 'foe-2' });
  });

  it('keeps the colour of a side that comes again by its name, however it is spelled, and of one named differently whose polities were there', () => {
    const first = paintSides(
      NO_ACTORS,
      call([
        ['Mihver', ['a']],
        ['Müttefikler', ['b', 'c']],
      ]),
      ['a'],
    );
    const again = paintSides(
      first.actors,
      call([
        ['  müttefikler ', ['b']],
        ['Mihver', ['a']],
      ]),
      ['a'],
    );
    expect(colorsOf(again.actors)).toEqual({ b: 'foe-1', a: 'focus' }); // (c is not named: it fades)
    // named differently the second time: it is the side that most of its polities were on
    const renamed = paintSides(
      first.actors,
      call([
        ['Mihver', ['a']],
        ['Karşı taraf', ['b', 'c', 'd']],
      ]),
      ['a'],
    );
    expect(colorsOf(renamed.actors)).toMatchObject({ b: 'foe-1', c: 'foe-1', d: 'foe-1' });
  });

  it('paints what a call names and nothing else, and moves a polity that is named on another side', () => {
    const first = paintSides(
      NO_ACTORS,
      call(
        [
          ['A', ['a', 'b']],
          ['B', ['c']],
        ],
        ['n'],
      ),
      ['a'],
    );
    const next = paintSides(
      first.actors,
      call([
        ['A', ['a']],
        ['B', ['c', 'b']],
      ]),
      ['a'],
    );
    expect(colorsOf(next.actors)).toEqual({ a: 'focus', c: 'foe-1', b: 'foe-1' }); // (n was not named: it fades)
    expect(next.actors.colors).not.toBe(first.actors.colors); // (a new set: what was is not changed)
    expect(colorsOf(first.actors)).toEqual({ a: 'focus', b: 'focus', c: 'foe-1', n: 'neutral' });
  });

  it('gives a polity the colour it had the last time it was painted, whatever was said in between', () => {
    const first = paintSides(
      NO_ACTORS,
      call([
        ['Mihver', ['a']],
        ['Müttefikler', ['b']],
        ['Sovyet', ['c']],
      ]),
      ['a'],
    );
    const between = paintSides(
      first.actors,
      call([
        ['Mihver', ['a']],
        ['Sovyet', ['c']],
      ]),
      ['a'],
    );
    expect(colorsOf(between.actors)).toEqual({ a: 'focus', c: 'foe-2' }); // (b fades, and no new side can take its colour)
    const later = paintSides(
      between.actors,
      call([
        ['Mihver', ['a']],
        ['Başka', ['b', 'x']],
      ]),
      ['a'],
    );
    expect(colorsOf(later.actors)).toEqual({ a: 'focus', b: 'foe-1', x: 'foe-1' }); // (b is back in the colour it had)
  });

  it('keeps every side of a call apart from the focus when the focus has been painted before and is not named now', () => {
    const first = paintSides(
      NO_ACTORS,
      call([
        ['Mihver', ['a']],
        ['Müttefikler', ['b']],
      ]),
      ['a'],
    );
    const apart = paintSides(
      first.actors,
      call([
        ['Batı', ['b']],
        ['Doğu', ['c']],
      ]),
      ['a'],
    );
    expect(colorsOf(apart.actors)).toEqual({ b: 'foe-1', c: 'foe-2' }); // (nobody takes the focus's colour)
    // with no memory of the focus, the first side is the focus (as the tool says)
    expect(
      colorsOf(
        paintSides(
          NO_ACTORS,
          call([
            ['Batı', ['b']],
            ['Doğu', ['c']],
          ]),
          ['a'],
        ).actors,
      ),
    ).toEqual({ b: 'focus', c: 'foe-1' });
  });

  it('paints a polity again in another colour when the narration says it has changed sides', () => {
    const first = paintSides(
      NO_ACTORS,
      call(
        [
          ['A', ['a']],
          ['B', ['b']],
        ],
        ['c'],
      ),
      ['a'],
    );
    expect(colorsOf(first.actors).c).toBe('neutral');
    const next = paintSides(
      first.actors,
      call([
        ['A', ['a']],
        ['B', ['b', 'c']],
      ]),
      ['a'],
    );
    expect(colorsOf(next.actors).c).toBe('foe-1');
  });

  it('is at most three sides: a fourth is not painted', () => {
    const { actors } = paintSides(
      NO_ACTORS,
      call([
        ['A', ['a']],
        ['B', ['b']],
        ['C', ['c']],
        ['D', ['d']],
      ]),
      [],
    );
    expect(Object.keys(colorsOf(actors))).toEqual(['a', 'b', 'c']);
  });
});
