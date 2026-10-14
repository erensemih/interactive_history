import { afterEach, describe, expect, it, vi } from 'vitest';
import { contextFromView, type AiContext } from '../src/ai/context';
import { Director } from '../src/ai/director';
import { createMockProvider } from '../src/ai/mockProvider';
import { createMockScripts } from '../src/ai/mockScripts';
import {
  beatMs,
  LEAD_MS,
  lingerMs,
  Presentation,
  readingPace,
  SPEEDS,
  type Pacer,
  type SpeedId,
} from '../src/ai/presentation';
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

/** One wait for a sentence, as the presentation asked for it: the test says when it is over. */
interface Wait {
  sentence: string;
  speed: SpeedId;
  lead: number;
  done(): void;
  cancelled: boolean;
}

function setup() {
  const session = new AiSession({
    provider: Promise.resolve(createMockProvider(createMockScripts(data), FAST)),
    data,
    sources: [],
    drawing: () => director.drawing,
  });
  const director: Director = new Director(session, { frame: () => undefined });
  const waits: Wait[] = [];
  const pacer: Pacer = (sentence, speed, lead, done) => {
    const wait: Wait = { sentence, speed, lead, done, cancelled: false };
    waits.push(wait);
    return () => {
      wait.cancelled = true;
    };
  };
  const presentation = new Presentation(session, director, pacer);
  /** The wait that is running now (null: none). */
  const running = (): Wait | null => {
    const w = waits.at(-1);
    return w && !w.cancelled ? w : null;
  };
  /** The sentence on screen is read: the next beat plays (or the scene ends). */
  const finishBeat = () => {
    const w = running();
    if (!w) throw new Error('no beat is playing');
    w.cancelled = true; // (a wait that has ended is over)
    w.done();
  };
  return { session, director, presentation, waits, running, finishBeat };
}
const answer = (s: AiSession) => s.items.at(-1) as AssistantItem;
const ask = async (s: ReturnType<typeof setup>, text = NARRATION_REQUEST, mode: 'narration' | 'qa' = 'narration') => {
  s.presentation.show();
  await s.session.send({ text, mode }, berlin());
};
/** Plays every beat of the scene on screen to its end. */
const playOut = (s: ReturnType<typeof setup>) => {
  while (!s.presentation.done) s.finishBeat();
};

afterEach(() => vi.useRealTimers());

describe('beatMs and lingerMs', () => {
  it('is the time to read a sentence, bounded, and shorter at a faster speed', () => {
    const short = beatMs('Kısa.', 'normal');
    const long = beatMs('kelime '.repeat(12), 'normal');
    expect(short).toBe(2400); // never less than a moment
    expect(long).toBeGreaterThan(short);
    expect(beatMs('kelime '.repeat(500), 'normal')).toBe(11_000);
    expect(beatMs('kelime '.repeat(12), 'fast')).toBeLessThan(long);
    expect(beatMs('kelime '.repeat(12), 'slow')).toBeGreaterThan(long);
    expect(SPEEDS.normal.factor).toBe(1);
  });

  it('is waited out by the reading pace, which starts the wait with a little lead for the first beat', () => {
    vi.useFakeTimers();
    let ended = 0;
    const cancel = readingPace('Bir iki üç dört.', 'normal', LEAD_MS, () => ended++);
    vi.advanceTimersByTime(beatMs('Bir iki üç dört.', 'normal') + LEAD_MS - 1);
    expect(ended).toBe(0);
    vi.advanceTimersByTime(2);
    expect(ended).toBe(1);
    const again = readingPace('Bir.', 'fast', 0, () => ended++);
    again();
    vi.advanceTimersByTime(60_000);
    expect(ended).toBe(1); // a wait that was cancelled never ends
    cancel();
    expect(lingerMs('fast')).toBeLessThan(lingerMs('normal'));
  });
});

describe('the presentation of a narration', () => {
  it('starts on the first scene as soon as the answer has a plan, and nothing is shown before a question', async () => {
    const s = setup();
    expect(s.presentation.shown).toBe(false);
    expect(s.presentation.narrating).toBe(false);
    expect(s.presentation.steps).toEqual([]);
    expect(s.presentation.clock).toBeNull();
    await ask(s);
    const p = s.presentation;
    expect(p.shown).toBe(true);
    expect(p.narrating).toBe(true);
    expect(p.stepped).toBe(true);
    expect(p.steps).toHaveLength(8);
    expect(p.index).toBe(0);
    expect(p.step!.caption).toBe(answer(s.session).plan.captionOf(1));
    expect(p.step!.beats).toHaveLength(4);
    expect(p.clock).toEqual({ n: 1, beat: 0, done: false, replay: 0 });
    expect(p.view).toBe('watch');
    expect(p.hasPrev).toBe(false);
    expect(p.hasNext).toBe(true); // (the scene is still playing: "Sonraki" shows how it ends)
  });

  it('steps forward and back through the scenes, stops at both ends, and moves the director with it', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.prev();
    expect(p.index).toBe(0);
    p.go(3);
    expect(p.index).toBe(2);
    expect(s.director.active).toEqual({ itemId: answer(s.session).id, n: 3 });
    expect(s.director.year).toBe(1940); // the Battle of Britain: the year of the event the scene shows
    p.last();
    expect(p.index).toBe(7);
    expect(p.done).toBe(true); // ("End" is where the narration ends: the last scene as it ends)
    expect(p.hasNext).toBe(false);
    p.next();
    expect(p.index).toBe(7);
    p.first();
    expect(p.index).toBe(0);
    expect(p.done).toBe(false);
    p.go(4);
    expect(s.director.drawing?.events).toEqual(['barbarossa-1941', 'leningrad-kusatmasi-1941']);
    p.go(99); // there is no such scene
    expect(p.index).toBe(3);
  });

  it('switching between Watch and Read keeps the scene, in either direction and in every read mode', async () => {
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
    expect(s.director.drawing?.sides.map((side) => side.name)).toEqual(['Çelik Pakt ve Üçlü Pakt']); // the map is already on the new scene
    expect(p.stepped).toBe(false);
    expect(p.done).toBe(true); // (in the reader a scene is shown as it ends: nothing plays there)
  });

  it('an answer to a plain question is one scene: its sentences are its beats, and there is nothing to step through', async () => {
    const s = setup();
    await ask(s, AXIS_QUESTION, 'qa');
    const p = s.presentation;
    expect(p.narrating).toBe(true);
    expect(p.stepped).toBe(false); // several scenes is what makes the stepping controls
    expect(p.steps).toHaveLength(1);
    expect(p.step).toMatchObject({ n: 1, title: 'Almanya ve İtalya', hasText: true, hasScene: true });
    expect(p.step!.caption).toBe(answer(s.session).plan.captionOf(1)); // the model's own caption, not made from the text
    expect(p.step!.caption.length).toBeLessThan(p.step!.body.length);
    expect(p.step!.beats).toHaveLength(2);
    expect(s.running()?.sentence).toBe(p.step!.beats[0]); // it plays beat by beat like any other
    p.play();
    playOut(s);
    expect(p.done).toBe(true);
    expect(p.hasPrev).toBe(true); // (back to its start)
    expect(p.hasNext).toBe(false); // and nothing after it
    p.next();
    expect(p.index).toBe(0);
    expect(s.director.drawing?.sides.map((side) => side.name)).toEqual(['Çelik Pakt ve Üçlü Pakt']);
  });

  it('closing the answer gives the map back and stops the clock; the conversation stays, and opening it shows it again', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    const wait = s.running()!;
    p.openRead();
    expect(wait.cancelled).toBe(true); // the reader reads: no beat plays
    p.hide();
    expect([p.shown, p.narrating, p.view]).toEqual([false, false, 'watch']);
    expect(s.session.items).toHaveLength(2);
    p.openRead();
    expect([p.shown, p.view, p.index]).toEqual([true, 'read', 0]);
    s.session.newChat(); // forgetting the conversation closes it for good
    expect(p.shown).toBe(false);
  });
});

describe('the beats of a scene', () => {
  it('play by themselves, one sentence at a time at reading pace, whether or not the narration plays on', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    expect(p.playing).toBe(false); // "Oynat" is off
    const beats = p.step!.beats;
    // the first beat waits a little longer: the camera is on its way
    expect(s.running()).toMatchObject({ sentence: beats[0], lead: LEAD_MS, speed: 'normal' });
    for (let k = 1; k < beats.length; k++) {
      s.finishBeat();
      expect(p.clock).toEqual({ n: 1, beat: k, done: false, replay: 0 });
      expect(s.running()).toMatchObject({ sentence: beats[k], lead: 0 });
    }
    s.finishBeat(); // the last sentence is read: the scene ends and waits for the reader
    expect(p.clock).toEqual({ n: 1, beat: beats.length - 1, done: true, replay: 0 });
    expect(s.running()).toBeNull();
    expect(p.index).toBe(0);
    expect(p.hasPrev).toBe(true);
    expect(p.hasNext).toBe(true); // the next scene
  });

  it('end with the next scene when the narration plays on, after a moment at the end state; and stop at the last scene', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.play();
    expect(p.playing).toBe(true);
    playOut(s);
    expect(p.index).toBe(0);
    vi.useFakeTimers();
    p.pause(); // (a pause now would have kept it here: see below)
    p.play(); // the timer for the moment at the end is set under the fake clock
    vi.advanceTimersByTime(lingerMs('normal') - 10);
    expect(p.index).toBe(0);
    vi.advanceTimersByTime(20);
    expect(p.index).toBe(1);
    expect(p.clock).toMatchObject({ n: 2, beat: 0, done: false });
    expect(s.running()?.sentence).toBe(p.step!.beats[0]); // and its beats play from the first
    expect(p.playing).toBe(true);
    for (let i = 1; i < 7; i++) {
      playOut(s);
      vi.advanceTimersByTime(lingerMs('normal') + 10);
    }
    expect(p.index).toBe(7);
    playOut(s);
    expect(p.playing).toBe(true);
    vi.advanceTimersByTime(lingerMs('normal') + 10);
    expect(p.playing).toBe(false); // the end: it stays on the last scene, as it ends
    expect(p.done).toBe(true);
    expect(p.index).toBe(7);
  });

  it('wait for the reader at the end of a scene when the narration does not play on', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    playOut(s);
    vi.useFakeTimers();
    p.pause();
    vi.advanceTimersByTime(120_000);
    expect(p.index).toBe(0);
    expect(p.done).toBe(true);
  });

  it('are shown as they end by "Sonraki": the first press shows how the scene ends, the second goes on to the next scene', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    s.finishBeat(); // (a beat or two have played)
    p.next();
    expect(p.index).toBe(0);
    expect(p.clock).toEqual({ n: 1, beat: 3, done: true, replay: 0 });
    expect(s.running()).toBeNull();
    expect(s.director.frame!.routes).toEqual([]); // the end state: dots, no arrows
    p.next();
    expect(p.index).toBe(1);
    expect(p.clock).toEqual({ n: 2, beat: 0, done: false, replay: 0 });
    expect(s.running()).not.toBeNull(); // the next scene plays from its start
  });

  it('are shown from their start by "Önceki": the first press goes back to the start of the scene, the second to the scene before as it ended', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.go(3);
    expect(p.hasPrev).toBe(true); // (there are scenes before it)
    p.prev(); // at its start: the scene before, as it ended
    expect(p.index).toBe(1);
    expect(p.clock).toMatchObject({ n: 2, beat: 1, done: true }); // (scene 2 has two beats)
    p.prev(); // it has ended: back to its start
    expect(p.index).toBe(1);
    expect(p.clock).toMatchObject({ n: 2, beat: 0, done: false, replay: 1 });
    expect(s.running()).not.toBeNull();
    s.finishBeat();
    expect(p.clock).toMatchObject({ n: 2, beat: 1, done: false });
    p.prev(); // mid-scene: its start again
    expect(p.clock).toMatchObject({ n: 2, beat: 0, done: false, replay: 2 });
    p.prev(); // at its start: scene 1, as it ended
    expect(p.clock).toMatchObject({ n: 1, done: true });
    p.prev();
    expect(p.clock).toMatchObject({ n: 1, beat: 0, done: false });
    p.prev(); // the first scene at its start: there is nothing before it
    expect(p.clock).toMatchObject({ n: 1, beat: 0, done: false });
    expect(p.hasPrev).toBe(false);
  });

  it('are what the reader’s own steps stop the narration at: pressing a button turns "Oynat" off', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.play();
    p.next();
    expect(p.playing).toBe(false);
    p.play();
    p.prev();
    expect(p.playing).toBe(false);
    p.play();
    p.go(5);
    expect(p.playing).toBe(false);
  });

  it('are played again by a click on their sentence, which then waits there for the reader', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    playOut(s);
    p.replayBeat(1);
    expect(p.clock).toEqual({ n: 1, beat: 1, done: false, replay: 1 });
    expect(p.held).toBe(true);
    expect(p.playing).toBe(false);
    expect(s.running()).toBeNull(); // held: nothing moves on by itself
    expect(s.director.frame!.routes).toHaveLength(2); // and its arrows are on the map, as they were
    p.replayBeat(1); // again: the arrows are drawn again
    expect(p.clock!.replay).toBe(2);
    p.replayBeat(0);
    expect(p.clock).toMatchObject({ beat: 0, replay: 3 });
    // "Oynat" lets it go on from there
    p.play();
    expect(p.held).toBe(false);
    expect(s.running()?.sentence).toBe(p.step!.beats[0]);
    // and "Sonraki" shows how the scene ends
    p.replayBeat(2);
    p.next();
    expect(p.clock).toMatchObject({ beat: 3, done: true });
    expect(p.held).toBe(false);
  });

  it('are no business of the reader: a click on a sentence while reading does nothing', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.openRead();
    p.replayBeat(1);
    expect(p.clock).toMatchObject({ done: true });
    expect(p.held).toBe(false);
  });

  it('are timed again at a new speed when the speed changes, and the pace is the reader’s own', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    expect(s.running()!.speed).toBe('normal');
    p.setSpeed('fast');
    expect(s.running()).toMatchObject({ speed: 'fast', sentence: p.step!.beats[0] });
    p.setSpeed('slow');
    expect(s.running()!.speed).toBe('slow');
    p.setSpeed('slow'); // no change: the wait is not started again
    const count = s.waits.length;
    p.setSpeed('slow');
    expect(s.waits).toHaveLength(count);
  });

  it('are not played in the reader, and a scene that is opened there is shown as it ends', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.openRead();
    expect(p.done).toBe(true);
    p.go(4);
    expect(p.clock).toMatchObject({ n: 4, done: true });
    expect(s.running()).toBeNull();
    p.closeRead(); // back to the map: the scene is as it ended, and plays only when asked again
    expect(p.done).toBe(true);
    p.prev();
    expect(p.clock).toMatchObject({ n: 4, beat: 0, done: false });
    expect(s.running()).not.toBeNull();
  });

  it('are kept when the answer is still being written: the plan that arrives later changes no beat that plays', async () => {
    const s = setup();
    await ask(s);
    const waits = s.waits.length;
    s.session.subscribe(() => undefined);
    // the text of a finished answer arrives no more; a change of the session does not restart the wait that runs
    (s.session as unknown as { notify(): void }).notify();
    expect(s.waits).toHaveLength(waits);
  });
});

describe('autoplay', () => {
  it('is off until asked, and playing again at the end starts over from the first scene', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    expect(p.playing).toBe(false);
    p.last();
    p.play();
    expect(p.index).toBe(0);
    expect(p.playing).toBe(true);
    expect(p.clock).toMatchObject({ n: 1, done: false });
  });

  it('the reader switching to Read or closing stops it; pressing play again goes on', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.play();
    p.openRead();
    expect(p.playing).toBe(false);
    p.closeRead();
    expect(p.playing).toBe(false);
    p.toggle();
    expect(p.playing).toBe(true);
    p.pause();
    expect(p.playing).toBe(false);
    p.play();
    p.hide();
    expect(p.playing).toBe(false);
    expect(s.running()).toBeNull();
  });

  it('plays only in Watch', async () => {
    const s = setup();
    await ask(s);
    const p = s.presentation;
    p.openRead();
    p.play();
    expect(p.playing).toBe(false);
  });

  it('does not wait for a beat that is not there: a scene without a caption is one beat of the whole text', async () => {
    const s = setup();
    await ask(s, 'Hava gücü hakkında düz metin ver.', 'qa');
    const p = s.presentation;
    expect(p.step!.beats).toHaveLength(1);
    expect(p.clock).toMatchObject({ beat: 0, done: false });
    s.finishBeat();
    expect(p.done).toBe(true);
  });
});
