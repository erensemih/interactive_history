import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextFromView, type AiContext } from '../src/ai/context';
import { Director } from '../src/ai/director';
import { createMockProvider } from '../src/ai/mockProvider';
import { createMockScripts } from '../src/ai/mockScripts';
import { dwellMs, Presentation, SPEEDS } from '../src/ai/presentation';
import { NARRATION_REQUEST } from '../src/ai/prompt';
import { AiSession, type AssistantItem } from '../src/ai/session';
import { deriveView } from '../src/state/derive';
import { DEFAULT_STATE } from '../src/state/store';
import { shippedData } from './helpers/shipped';

const data = shippedData();
const FAST = { thinkMs: 0, roundMs: 0, chunkChars: 500, chunkMs: 0 };
/** A place in Germany (Berlin), over the war years: the scripted narration of Germany at war is for it. */
const berlin = (): AiContext =>
  contextFromView(
    deriveView({ ...DEFAULT_STATE, range: { from: 1939, to: 1945 }, places: [{ lon: 13.4, lat: 52.52 }] }, data),
    data,
  );
const AXIS_QUESTION = 'Almanya ile İtalya arasındaki ittifak neydi?';

function setup() {
  const session = new AiSession({
    provider: Promise.resolve(createMockProvider(createMockScripts(data), FAST)),
    data,
    sources: [],
    drawing: () => director.drawing,
  });
  const director: Director = new Director(session, { frame: () => undefined });
  const presentation = new Presentation(session, director);
  return { session, director, presentation };
}
const answer = (s: AiSession) => s.items.at(-1) as AssistantItem;
const ask = async (s: ReturnType<typeof setup>, text = NARRATION_REQUEST, mode: 'narration' | 'qa' = 'narration') => {
  s.presentation.show();
  await s.session.send({ text, mode }, berlin());
};

afterEach(() => vi.useRealTimers());

describe('dwellMs', () => {
  it('is the time to read a caption, bounded, and shorter at a faster speed', () => {
    const short = dwellMs('Kısa altyazı.', 'normal');
    const long = dwellMs('kelime '.repeat(30), 'normal');
    expect(short).toBe(4500); // never less than a few seconds
    expect(long).toBeGreaterThan(short);
    expect(dwellMs('kelime '.repeat(500), 'normal')).toBe(16_000);
    expect(dwellMs('kelime '.repeat(30), 'fast')).toBeLessThan(long);
    expect(dwellMs('kelime '.repeat(30), 'slow')).toBeGreaterThan(long);
    expect(SPEEDS.normal.factor).toBe(1);
  });
});

describe('the presentation of a narration', () => {
  it('starts on the first step as soon as the answer has a plan, and nothing is shown before a question', async () => {
    const s = setup();
    expect(s.presentation.shown).toBe(false);
    expect(s.presentation.narrating).toBe(false);
    expect(s.presentation.steps).toEqual([]);
    await ask(s);
    const p = s.presentation;
    expect(p.shown).toBe(true);
    expect(p.narrating).toBe(true);
    expect(p.stepped).toBe(true);
    expect(p.steps).toHaveLength(8);
    expect(p.index).toBe(0);
    expect(p.step!.caption).toBe(answer(s.session).plan.captionOf(1));
    expect(p.view).toBe('watch');
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(true);
  });

  it('steps forward and back, stops at both ends, and moves the director with it', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.prev();
    expect(p.index).toBe(0);
    p.next();
    p.next();
    expect(p.index).toBe(2);
    expect(s.director.active).toEqual({ itemId: answer(s.session).id, n: 3 });
    expect(s.director.year).toBe(1940); // the Battle of Britain: the year of the event the step shows
    p.last();
    expect(p.index).toBe(7);
    expect(p.hasNext).toBe(false);
    p.next();
    expect(p.index).toBe(7);
    p.first();
    expect(p.index).toBe(0);
    p.go(4);
    expect(s.director.drawing?.events).toEqual(['barbarossa-1941', 'leningrad-kusatmasi-1941']);
    p.go(99); // there is no such step
    expect(p.index).toBe(3);
  });

  it('switching between Watch and Read keeps the step, in either direction and in every read mode', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.go(3);
    p.openRead();
    expect([p.view, p.readMode, s.director.active?.n]).toEqual(['read', 'side', 3]);
    p.setReadMode('full');
    expect([p.view, p.readMode, s.director.active?.n]).toEqual(['read', 'full', 3]);
    p.closeRead();
    expect([p.view, p.index, s.director.active?.n]).toEqual(['watch', 2, 3]);
    p.openRead(); // comes back in the mode the reader used last
    expect([p.view, p.readMode, p.index]).toEqual(['read', 'full', 2]);
    p.setView('watch');
    expect(p.step!.n).toBe(3);
  });

  it('a question asked while reading keeps the reader in Read, and the map follows the new answer', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.go(4);
    p.openRead('full');
    const first = answer(s.session).id;
    await ask(s, AXIS_QUESTION, 'qa');
    expect(p.view).toBe('read');
    expect(p.readMode).toBe('full');
    expect(p.item!.id).not.toBe(first);
    expect(s.director.drawing?.links.map((l) => l.relation)).toEqual(['alliance']); // the map is already on the new scene
    expect(p.stepped).toBe(false);
  });

  it('an answer to a plain question is one step: a caption and a text, one scene, nothing to step through', async () => {
    const s = setup();
    await ask(s, AXIS_QUESTION, 'qa');
    const p = s.presentation;
    expect(p.narrating).toBe(true);
    expect(p.stepped).toBe(false); // several steps is what makes the stepping controls
    expect(p.steps).toHaveLength(1);
    expect(p.step).toMatchObject({ n: 1, title: 'Almanya ve İtalya', hasText: true, hasScene: true });
    expect(p.step!.caption).toBe(answer(s.session).plan.captionOf(1)); // the model's own caption, not made from the text
    expect(p.step!.caption.length).toBeLessThan(p.step!.body.length);
    expect(p.hasPrev || p.hasNext).toBe(false);
    p.next();
    p.play();
    expect(p.playing).toBe(false);
    expect(p.index).toBe(0);
    expect(s.director.drawing?.highlights).toEqual(['nazi-germany', 'kingdom-of-italy']);
  });

  it('closing the answer gives the map back; the conversation stays, and opening it shows it again', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.openRead();
    p.hide();
    expect([p.shown, p.narrating, p.view]).toEqual([false, false, 'watch']);
    expect(s.session.items).toHaveLength(2);
    p.openRead();
    expect([p.shown, p.view, p.index]).toEqual([true, 'read', 0]);
    s.session.newChat(); // forgetting the conversation closes it for good
    expect(p.shown).toBe(false);
  });
});

describe('autoplay', () => {
  it('plays the steps by itself, each for the time its caption takes to read, and stops at the end', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    vi.useFakeTimers();
    expect(p.playing).toBe(false); // optional: nothing plays until asked
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.index).toBe(0);

    p.play();
    expect(p.playing).toBe(true);
    const wait = dwellMs(p.step!.caption, 'normal');
    await vi.advanceTimersByTimeAsync(wait - 50);
    expect(p.index).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(p.index).toBe(1);
    expect(s.director.active?.n).toBe(2);
    await vi.advanceTimersByTimeAsync(7 * 17_000);
    expect(p.index).toBe(7);
    expect(p.playing).toBe(false); // the end: it stays on the last step
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.index).toBe(7);
  });

  it('the reader stepping, switching to Read or closing stops it; pressing play again goes on', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    vi.useFakeTimers();
    p.play();
    p.next();
    expect(p.playing).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.index).toBe(1);

    p.play();
    p.openRead();
    expect(p.playing).toBe(false);
    p.closeRead();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.index).toBe(1);

    p.play();
    p.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.index).toBe(1);

    p.toggle();
    expect(p.playing).toBe(true);
    await vi.advanceTimersByTimeAsync(dwellMs(p.step!.caption, 'normal') + 50);
    expect(p.index).toBe(2);
    p.hide();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(p.index).toBe(2);
  });

  it('the speed sets how long a step stays, and can be changed while playing', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    vi.useFakeTimers();
    p.setSpeed('fast');
    p.play();
    const fast = dwellMs(p.step!.caption, 'fast');
    expect(fast).toBeLessThan(dwellMs(p.step!.caption, 'normal'));
    await vi.advanceTimersByTimeAsync(fast + 20);
    expect(p.index).toBe(1);
    p.setSpeed('slow');
    await vi.advanceTimersByTimeAsync(dwellMs(p.step!.caption, 'fast') + 20);
    expect(p.index).toBe(1); // the wait was started again at the slow speed
    await vi.advanceTimersByTimeAsync(dwellMs(p.step!.caption, 'slow'));
    expect(p.index).toBe(2);
  });

  it('playing again at the end starts over from the first step', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    vi.useFakeTimers();
    p.last();
    p.play();
    expect(p.index).toBe(0);
    expect(p.playing).toBe(true);
  });

  it('plays only in Watch', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.openRead();
    p.play();
    expect(p.playing).toBe(false);
  });
});
