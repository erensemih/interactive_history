import { describe, expect, it } from 'vitest';
import { placeId, selectionsOf, type SelectionRef, type ViewModel } from '../src/state/derive';
import { panelLayout } from '../src/state/panelLayout';

const place = (id: string): SelectionRef => ({ type: 'place', id });
const event = (id: string): SelectionRef => ({ type: 'event', id });

describe('panelLayout', () => {
  it('with nothing selected there is nothing to read: the panel shows its introduction', () => {
    expect(panelLayout([], null)).toEqual({ context: [], focus: [] });
  });

  it('with only a place selected, the place is what the panel describes', () => {
    expect(panelLayout([place('a')], null)).toEqual({ context: [], focus: [place('a')] });
  });

  it('with an event open, the event is the focus and the place folds into the context', () => {
    expect(panelLayout([place('a')], event('e'))).toEqual({ context: [place('a')], focus: [event('e')] });
  });

  it('an event without a place stands alone', () => {
    expect(panelLayout([], event('e'))).toEqual({ context: [], focus: [event('e')] });
  });

  it('is a list, not a place-plus-event pair: two places become two focus cards', () => {
    const layout = panelLayout([place('a'), place('b')], null);
    expect(layout.focus).toEqual([place('a'), place('b')]);
    expect(panelLayout([place('a'), place('b')], event('e')).context).toHaveLength(2);
  });

  it('closing the event returns to the place view, and nothing else changes', () => {
    const open = panelLayout([place('a')], event('e'));
    const closed = panelLayout([place('a')], null);
    expect(open.context).toEqual(closed.focus);
    expect(closed.context).toEqual([]);
  });
});

describe('selectionsOf', () => {
  const vm = (places: string[], eventId: string | null) =>
    ({
      places: places.map((id) => ({ id })),
      selectedEvent: eventId ? { id: eventId } : null,
    }) as unknown as ViewModel;

  it('describes the current state as references: a type and an id', () => {
    expect(selectionsOf(vm(['35.500,38.900'], 'mohac-1526'))).toEqual({
      places: [{ type: 'place', id: '35.500,38.900' }],
      event: { type: 'event', id: 'mohac-1526' },
    });
    expect(selectionsOf(vm([], null))).toEqual({ places: [], event: null });
  });

  it('names a place by its point, rounded to about 100 m', () => {
    expect(placeId({ lon: 35.5, lat: 38.9 })).toBe('35.500,38.900');
    expect(placeId({ lon: 35.50004, lat: 38.89996 })).toBe(placeId({ lon: 35.5, lat: 38.9 }));
    expect(placeId({ lon: -74.5, lat: 24.1 })).toBe('-74.500,24.100');
  });
});
