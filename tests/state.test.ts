import { describe, expect, it } from 'vitest';
import { DEFAULT_STATE, Store } from '../src/state/store';
import { hashToPartialState, parseCamera, stateToHash } from '../src/state/url';

const extent = { from: 1400, to: 1600 };
const make = (patch = {}) => new Store({ ...DEFAULT_STATE, ...patch }, extent);

describe('store', () => {
  it('keeps the range inside the dataset and ordered', () => {
    const s = make();
    s.setRange({ from: 1700, to: 1300 });
    expect(s.state.range).toEqual({ from: 1400, to: 1600 });
    s.setRange({ from: 1500, to: 1450 });
    expect(s.state.range).toEqual({ from: 1450, to: 1500 });
  });

  it('the shown borders year follows the cursor inside the range', () => {
    const s = make({ range: { from: 1450, to: 1500 }, cursor: 0.5 });
    expect(s.shownYear).toBe(1475);
    s.setDisplayYear(1460);
    expect(s.shownYear).toBe(1460);
    s.setDisplayYear(1999);
    expect(s.shownYear).toBe(1500);
    // moving the window keeps the cursor's relative place
    s.shiftBy(20);
    expect(s.state.range).toEqual({ from: 1470, to: 1520 });
    expect(s.shownYear).toBe(1520);
  });

  it('presets, focusing a year, and selection are independent of the map', () => {
    const s = make();
    s.setPreset(1);
    expect(s.state.range.from).toBe(s.state.range.to);
    s.focusYear(1453, 5);
    expect(s.state.range).toEqual({ from: 1451, to: 1455 });
    s.selectPlace({ lon: 33, lat: 39 });
    s.selectEvent('istanbul-fethi-1453');
    expect(s.state.places).toHaveLength(1);
    expect(s.state.selectedEventId).toBe('istanbul-fethi-1453');
    s.selectPlace(null);
    expect(s.state.places).toEqual([]);
  });

  it('does not wake listeners when nothing changed', () => {
    const s = make();
    let calls = 0;
    s.subscribe(() => calls++);
    s.setRange(s.state.range);
    s.selectEvent(null);
    s.hoverEvent(null);
    expect(calls).toBe(0);
    s.selectEvent('x');
    expect(calls).toBe(1);
  });
});

describe('url state', () => {
  it('round-trips range, cursor, place and event', () => {
    const state = {
      ...DEFAULT_STATE,
      range: { from: 1450, to: 1500 },
      cursor: 0.25,
      places: [{ lon: 32.85, lat: 39.93 }],
      selectedEventId: 'istanbul-fethi-1453',
    };
    const hash = stateToHash(state);
    expect(hash).toBe('#t=1450-1500&c=0.250&p=32.850,39.930&e=istanbul-fethi-1453');
    expect(hashToPartialState(hash, extent)).toEqual({
      range: { from: 1450, to: 1500 },
      cursor: 0.25,
      places: [{ lon: 32.85, lat: 39.93 }],
      selectedEventId: 'istanbul-fethi-1453',
    });
  });

  it('a single year is written as one number and bad input is ignored', () => {
    expect(stateToHash({ ...DEFAULT_STATE, range: { from: 1500, to: 1500 } })).toBe('#t=1500');
    expect(hashToPartialState('#t=abc&p=x,y&c=zzz', extent)).toEqual({});
    expect(hashToPartialState('#t=1200-2000', extent).range).toEqual({ from: 1400, to: 1600 });
  });

  it('carries the map camera in `v` and rejects nonsense', () => {
    const hash = stateToHash(
      { ...DEFAULT_STATE, range: { from: 1500, to: 1500 } },
      { zoom: 1.4234, lat: 32.2243, lng: 19 },
    );
    expect(hash).toBe('#t=1500&v=1.42/32.224/19.000');
    expect(parseCamera(hash)).toEqual({ zoom: 1.42, lat: 32.224, lng: 19 });
    expect(parseCamera('#v=abc')).toBeNull();
    expect(parseCamera('#v=40/99/0')).toBeNull();
    expect(parseCamera('#t=1500')).toBeNull();
  });
});
