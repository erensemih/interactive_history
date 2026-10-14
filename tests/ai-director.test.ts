import { describe, expect, it } from 'vitest';
import { contextFromView, type AiContext } from '../src/ai/context';
import { Director, FRAME_SETTLE_MS } from '../src/ai/director';
import { createMockProvider, type MockScript } from '../src/ai/mockProvider';
import { createMockScripts } from '../src/ai/mockScripts';
import { NARRATION_REQUEST } from '../src/ai/prompt';
import { AiSession, type AssistantItem } from '../src/ai/session';
import type { Drawing } from '../src/ai/types';
import { deriveView } from '../src/state/derive';
import { DEFAULT_STATE } from '../src/state/store';
import { shippedData } from './helpers/shipped';

const data = shippedData();
const FAST = { thinkMs: 0, roundMs: 0, chunkChars: 500, chunkMs: 0 };
/** A place in Germany (Berlin) over the war years: the scripted narration of Germany at war is for it. */
const berlin = (): AiContext =>
  contextFromView(
    deriveView({ ...DEFAULT_STATE, range: { from: 1939, to: 1945 }, places: [{ lon: 13.4, lat: 52.52 }] }, data),
    data,
  );
const AXIS_QUESTION = 'Almanya ile İtalya arasındaki ittifak neydi?';

function setup(scripts: MockScript[] = createMockScripts(data)) {
  const framed: Drawing[] = [];
  const session = new AiSession({
    provider: Promise.resolve(createMockProvider(scripts, FAST)),
    data,
    sources: [],
    drawing: () => director.drawing,
  });
  const director: Director = new Director(session, { frame: (d) => framed.push(d) });
  return { session, director, framed };
}
const answer = (s: AiSession) => s.items.at(-1) as AssistantItem;
/** The camera is moved once the plan has stopped changing for a moment: wait for that. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, FRAME_SETTLE_MS + 40));

describe('the director', () => {
  it('shows nothing until an answer has started, then the first step', async () => {
    const { session, director } = setup();
    expect(director.drawing).toBeNull();
    expect(director.active).toBeNull();
    const seenActive: (number | undefined)[] = [];
    director.subscribe(() => seenActive.push(director.active?.n));
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    expect(director.active).toEqual({ itemId: answer(session).id, n: 1 });
    expect(director.drawing?.highlights).toEqual(['nazi-germany']);
    expect(director.drawing?.events).toEqual(['polonya-isgali-1939']);
    expect(director.year).toBe(1939);
    expect(seenActive.length).toBeGreaterThan(0);
  });

  it('each step owns the map: moving to another step swaps the drawing, and going back restores it', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const id = answer(session).id;
    director.activate(id, 6);
    expect(director.drawing?.events).toEqual(['stalingrad-1942', 'el-alamein-1942']);
    expect(director.drawing?.highlights).toEqual([]);
    expect(director.year).toBe(1942);
    director.activate(id, 2);
    // only step 2's own: the Battle of France and the armistice (the app draws the war line); nothing of Stalingrad on the way back
    expect(director.drawing?.links).toEqual([]);
    expect(director.drawing?.events).toEqual(['fransa-muharebesi-1940', 'compiegne-ateskesi-1940']);
    expect(director.year).toBe(1939); // the borders at the start of the Battle of France (May 1940): the Third Republic is still there
    director.activate(id, 1);
    expect(director.drawing?.links).toEqual([]);
    expect(director.drawing?.events).toEqual(['polonya-isgali-1939']);
    expect(director.year).toBe(1939);
  });

  it('no step shows anything of another: every pair of steps has a map of its own', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const id = answer(session).id;
    const states = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
      director.activate(id, n);
      return JSON.stringify(director.drawing);
    });
    expect(new Set(states).size).toBe(8);
    // and going back to any of them gives what it gave the first time
    for (const n of [4, 2, 6, 1, 8, 3, 5, 7]) {
      director.activate(id, n);
      expect(JSON.stringify(director.drawing)).toBe(states[n - 1]);
    }
  });

  it('brings the drawing of each step into view as the step becomes the active one', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const id = answer(session).id;
    await settle();
    expect(framed).toHaveLength(1); // the first step, once the plan was in: one frame, not one per tool call
    expect(framed[0]!.highlights).toEqual(['nazi-germany']);
    expect(framed[0]!.events).toEqual(['polonya-isgali-1939']);
    director.activate(id, 3);
    director.activate(id, 4);
    director.activate(id, 4); // the same step again changes nothing
    expect(framed.map((d) => d.year)).toEqual([1939, 1940, 1941]);
    expect(framed.at(-1)!.events).toEqual(['barbarossa-1941', 'leningrad-kusatmasi-1941']);
  });

  it('a step that draws nothing leaves the camera alone', async () => {
    const quiet: MockScript = (req) =>
      req.meta.question === 'sessiz'
        ? {
            calls: [{ name: 'step', input: { n: 1, title: 'Yıl', caption: 'Sadece bir yıl.', year: 1942 } }],
            text: 'Sadece bir yıl.',
          }
        : null;
    const { session, framed } = setup([quiet, ...createMockScripts(data)]);
    await session.send({ text: 'sessiz', mode: 'qa' }, berlin());
    await settle();
    expect(framed).toEqual([]);
  });

  it('small moves of the map by the reader change nothing; the camera keeps following', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await settle();
    const id = answer(session).id;
    director.userMovedCamera(false);
    director.userMovedCamera(false);
    expect(director.following).toBe(true);
    expect(director.askingToRelease).toBe(false);
    director.activate(id, 2);
    expect(framed).toHaveLength(2); // and the next step is brought into view as before
  });

  it('a substantial move asks whether to let go, and does not let go by itself', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await settle();
    const id = answer(session).id;
    director.userMovedCamera(true);
    expect(director.askingToRelease).toBe(true);
    expect(director.following).toBe(true);
    director.userMovedCamera(true); // once is enough
    director.activate(id, 2); // the page brings the next step into view: the question is moot
    expect(director.askingToRelease).toBe(false);
    expect(framed).toHaveLength(2);
  });

  it('"let go" turns the following off: steps still change the drawing but the camera stays', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await settle();
    const id = answer(session).id;
    director.userMovedCamera(true);
    director.setFollowing(false);
    expect(director.following).toBe(false);
    expect(director.askingToRelease).toBe(false);
    director.activate(id, 4);
    director.activate(id, 5);
    expect(framed).toHaveLength(1);
    expect(director.drawing?.events).toEqual(['wannsee-1942']); // drawings keep following the step
    expect(director.year).toBe(1942);
    director.userMovedCamera(true); // not following: nothing to ask
    expect(director.askingToRelease).toBe(false);

    director.setFollowing(true); // switched back on: the active step is brought into view at once
    expect(framed).toHaveLength(2);
    expect(framed[1]!.events).toEqual(['wannsee-1942']);
  });

  it('"keep following" is remembered: the question is not asked again in this conversation', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const id = answer(session).id;
    director.userMovedCamera(true);
    director.keepFollowing();
    expect(director.askingToRelease).toBe(false);
    expect(director.following).toBe(true);
    director.activate(id, 3);
    director.userMovedCamera(true);
    expect(director.askingToRelease).toBe(false);
  });

  it('an unanswered question can go away without deciding anything, and comes back after another far move', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    director.userMovedCamera(true);
    director.dismissQuestion();
    expect(director.askingToRelease).toBe(false);
    expect(director.following).toBe(true);
    director.userMovedCamera(true);
    expect(director.askingToRelease).toBe(true);
  });

  it('moving the map before any narration is on screen is just using the map', async () => {
    const { session, director, framed } = setup();
    director.userMovedCamera(true);
    expect(director.askingToRelease).toBe(false);
    expect(director.following).toBe(true);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    await settle();
    director.activate(answer(session).id, 2);
    expect(framed).toHaveLength(2);
    expect(director.following).toBe(true);
  });

  it('a new conversation starts with the camera following again, and with a fresh question', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    director.userMovedCamera(true);
    director.keepFollowing();
    director.setFollowing(false);
    session.newChat();
    expect(director.following).toBe(true);
    expect(director.askingToRelease).toBe(false);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    director.userMovedCamera(true);
    expect(director.askingToRelease).toBe(true);
  });

  it('a late change in the active step is brought into view too, unless the reader has moved the map since', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const item = answer(session);
    await settle();
    const before = framed.length;
    item.plan.add({ kind: 'mark', step: 1, point: { lon: 10, lat: 10 }, label: 'Geç' });
    (session as unknown as { notify(): void }).notify();
    item.plan.add({ kind: 'mark', step: 1, point: { lon: 10.5, lat: 10.5 }, label: 'Hemen ardından' });
    (session as unknown as { notify(): void }).notify();
    await settle();
    expect(framed).toHaveLength(before + 1); // two changes in a burst, one frame
    director.userMovedCamera(false);
    item.plan.add({ kind: 'mark', step: 1, point: { lon: 11, lat: 11 }, label: 'Daha geç' });
    (session as unknown as { notify(): void }).notify();
    await settle();
    expect(framed).toHaveLength(before + 1);
    expect(director.drawing?.marks.map((m) => m.label)).toEqual(['Geç', 'Hemen ardından', 'Daha geç']);
  });

  it('the year the AI asks for steps aside when the reader moves time, and returns with the next step', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const id = answer(session).id;
    expect(director.year).toBe(1939);
    director.userChangedTime();
    expect(director.year).toBeNull();
    expect(director.drawing?.year).toBe(1939); // still part of the step, just not applied
    director.activate(id, 2);
    expect(director.year).toBe(1939);
  });

  it('an answer without map actions leaves the map as it was', async () => {
    const plain: MockScript = (req) => (req.meta.question === 'düz' ? { text: 'Sadece metin.' } : null);
    const { session, director } = setup([plain, ...createMockScripts(data)]);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const before = director.drawing;
    await session.send({ text: 'düz', mode: 'qa' }, berlin());
    expect(director.active?.itemId).toBe(answer(session).id);
    expect(director.drawing).toBe(before);
  });

  it('a new answer takes over once, and reading an older step later takes the map back', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    const first = answer(session).id;
    director.activate(first, 4);
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    const second = answer(session).id;
    expect(director.active).toEqual({ itemId: second, n: 1 });
    expect(director.drawing?.links.map((l) => l.relation)).toEqual(['alliance']);
    director.activate(first, 1);
    expect(director.drawing?.highlights).toEqual(['nazi-germany']);
    expect(director.drawing?.events).toEqual(['polonya-isgali-1939']);
  });

  it('a cleared chat clears the map', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, berlin());
    session.newChat();
    expect(director.drawing).toBeNull();
    expect(director.active).toBeNull();
    expect(director.year).toBeNull();
  });

  it('tells the model what is on the map when the reader asks the next thing', async () => {
    const provider = createMockProvider(createMockScripts(data), FAST);
    const session = new AiSession({
      provider: Promise.resolve(provider),
      data,
      sources: [],
      drawing: () => director.drawing,
    });
    const director: Director = new Director(session, { frame: () => undefined });
    await session.send({ text: AXIS_QUESTION, mode: 'qa' }, berlin());
    await session.send({ text: 'Peki Japonya?', mode: 'qa' }, berlin());
    expect(provider.requests[1]!.turns.at(-1)!.content).toContain(
      'Haritada şu an senin çizdiklerin var (öne çıkan: Nazi Almanyası, İtalya Krallığı',
    );
    expect(provider.requests[0]!.turns.at(-1)!.content).not.toContain('çizdiklerin');
  });

  it('ignores a step of an item that does not exist', async () => {
    const { director } = setup();
    director.activate('yok', 1);
    expect(director.active).toBeNull();
  });
});
