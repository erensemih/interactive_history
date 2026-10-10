import { describe, expect, it } from 'vitest';
import { contextFromView, type AiContext } from '../src/ai/context';
import { Director } from '../src/ai/director';
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
const anatolia = (): AiContext =>
  contextFromView(
    deriveView({ ...DEFAULT_STATE, range: { from: 1500, to: 1550 }, places: [{ lon: 35.5, lat: 38.9 }] }, data),
    data,
  );

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

describe('the director', () => {
  it('shows nothing until an answer has started, then the first step', async () => {
    const { session, director } = setup();
    expect(director.drawing).toBeNull();
    expect(director.active).toBeNull();
    const seenActive: (number | undefined)[] = [];
    director.subscribe(() => seenActive.push(director.active?.n));
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    expect(director.active).toEqual({ itemId: answer(session).id, n: 1 });
    expect(director.drawing?.highlights).toEqual(['ottoman-empire', 'safavid-dynasty']);
    expect(director.year).toBe(1505);
    expect(seenActive.length).toBeGreaterThan(0);
  });

  it('each step owns the map: moving to another step swaps the drawing, and going back restores it', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    director.activate(id, 5);
    expect(director.drawing?.links.map((l) => l.relation)).toEqual(['alliance']);
    expect(director.drawing?.events).toEqual([]);
    expect(director.year).toBe(1536);
    director.activate(id, 2);
    // only step 2's own: the war and the battle of Çaldıran; nothing of the alliance on the way back
    expect(director.drawing?.links.map((l) => [l.relation, l.to])).toEqual([['war', 'safavid-dynasty']]);
    expect(director.drawing?.events).toEqual(['caldiran-1514']);
    expect(director.year).toBe(1514);
    director.activate(id, 1);
    expect(director.drawing?.links).toEqual([]);
    expect(director.drawing?.events).toEqual(['safevi-1501']);
    expect(director.year).toBe(1505);
  });

  it('no step shows anything of another: every pair of steps has a map of its own', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    const states = [1, 2, 3, 4, 5, 6].map((n) => {
      director.activate(id, n);
      return JSON.stringify(director.drawing);
    });
    expect(new Set(states).size).toBe(6);
    // and going back to any of them gives what it gave the first time
    for (const n of [4, 2, 6, 1, 3, 5]) {
      director.activate(id, n);
      expect(JSON.stringify(director.drawing)).toBe(states[n - 1]);
    }
  });

  it('brings the drawing of each step into view as the step becomes the active one', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    expect(framed).toHaveLength(1); // the first step, as soon as the answer began
    expect(framed[0]!.highlights).toEqual(['ottoman-empire', 'safavid-dynasty']);
    director.activate(id, 3);
    director.activate(id, 4);
    director.activate(id, 4); // the same step again changes nothing
    expect(framed.map((d) => d.year)).toEqual([1505, 1517, 1526]);
    expect(framed.at(-1)!.events).toEqual(['mohac-1526', 'viyana-1529']);
  });

  it('a step that draws nothing leaves the camera alone', async () => {
    const quiet: MockScript = (req) =>
      req.meta.question === 'sessiz'
        ? { calls: [{ name: 'set_year', input: { year: 1520 } }], text: 'Sadece bir yıl.' }
        : null;
    const { session, framed } = setup([quiet, ...createMockScripts(data)]);
    await session.send({ text: 'sessiz', mode: 'qa' }, anatolia());
    expect(framed).toEqual([]);
  });

  it('small moves of the map by the reader change nothing; the camera keeps following', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    director.userMovedCamera(true);
    director.setFollowing(false);
    expect(director.following).toBe(false);
    expect(director.askingToRelease).toBe(false);
    director.activate(id, 4);
    director.activate(id, 5);
    expect(framed).toHaveLength(1);
    expect(director.drawing?.links[0]!.relation).toBe('alliance'); // drawings keep following the step
    expect(director.year).toBe(1536);
    director.userMovedCamera(true); // not following: nothing to ask
    expect(director.askingToRelease).toBe(false);

    director.setFollowing(true); // switched back on: the active step is brought into view at once
    expect(framed).toHaveLength(2);
    expect(framed[1]!.links[0]!.relation).toBe('alliance');
  });

  it('"keep following" is remembered: the question is not asked again in this conversation', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
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
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    director.activate(answer(session).id, 2);
    expect(framed).toHaveLength(2);
    expect(director.following).toBe(true);
  });

  it('a new conversation starts with the camera following again, and with a fresh question', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    director.userMovedCamera(true);
    director.keepFollowing();
    director.setFollowing(false);
    session.newChat();
    expect(director.following).toBe(true);
    expect(director.askingToRelease).toBe(false);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    director.userMovedCamera(true);
    expect(director.askingToRelease).toBe(true);
  });

  it('a late change in the active step is brought into view too, unless the reader has moved the map since', async () => {
    const { session, director, framed } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const item = answer(session);
    const before = framed.length;
    item.plan.add({ kind: 'mark', step: 1, point: { lon: 10, lat: 10 }, label: 'Geç' });
    (session as unknown as { notify(): void }).notify();
    expect(framed).toHaveLength(before + 1);
    director.userMovedCamera(false);
    item.plan.add({ kind: 'mark', step: 1, point: { lon: 11, lat: 11 }, label: 'Daha geç' });
    (session as unknown as { notify(): void }).notify();
    expect(framed).toHaveLength(before + 1);
    expect(director.drawing?.marks.map((m) => m.label)).toEqual(['Geç', 'Daha geç']);
  });

  it('the year the AI asks for steps aside when the reader moves time, and returns with the next step', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    expect(director.year).toBe(1505);
    director.userChangedTime();
    expect(director.year).toBeNull();
    expect(director.drawing?.year).toBe(1505); // still part of the step, just not applied
    director.activate(id, 2);
    expect(director.year).toBe(1514);
  });

  it('an answer without map actions leaves the map as it was', async () => {
    const plain: MockScript = (req) => (req.meta.question === 'düz' ? { text: 'Sadece metin.' } : null);
    const { session, director } = setup([plain, ...createMockScripts(data)]);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const before = director.drawing;
    await session.send({ text: 'düz', mode: 'qa' }, anatolia());
    expect(director.active?.itemId).toBe(answer(session).id);
    expect(director.drawing).toBe(before);
  });

  it('a new answer takes over once, and reading an older step later takes the map back', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const first = answer(session).id;
    director.activate(first, 4);
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    const second = answer(session).id;
    expect(director.active).toEqual({ itemId: second, n: 1 });
    expect(director.drawing?.links.map((l) => l.relation)).toEqual(['alliance']);
    director.activate(first, 1);
    expect(director.drawing?.highlights).toEqual(['ottoman-empire', 'safavid-dynasty']);
  });

  it('a cleared chat clears the map', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
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
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, anatolia());
    await session.send({ text: 'Peki Venedik?', mode: 'qa' }, anatolia());
    expect(provider.requests[1]!.turns.at(-1)!.content).toContain(
      'Haritada şu an senin çizdiklerin var (vurgulanan: Osmanlı İmparatorluğu, Fransa Krallığı',
    );
    expect(provider.requests[0]!.turns.at(-1)!.content).not.toContain('çizdiklerin');
  });

  it('ignores a step of an item that does not exist', async () => {
    const { director } = setup();
    director.activate('yok', 1);
    expect(director.active).toBeNull();
  });
});
