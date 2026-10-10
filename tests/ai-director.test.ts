import { describe, expect, it } from 'vitest';
import { contextFromView, type AiContext } from '../src/ai/context';
import { Director } from '../src/ai/director';
import { createMockProvider, type MockScript } from '../src/ai/mockProvider';
import { createMockScripts } from '../src/ai/mockScripts';
import { NARRATION_REQUEST } from '../src/ai/prompt';
import { AiSession, type AssistantItem } from '../src/ai/session';
import type { FocusTarget } from '../src/ai/types';
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
  const focuses: FocusTarget[] = [];
  const session = new AiSession({
    provider: Promise.resolve(createMockProvider(scripts, FAST)),
    data,
    sources: [],
    drawing: () => director.drawing,
  });
  const director: Director = new Director(session, { focus: (t) => focuses.push(t) });
  return { session, director, focuses };
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

  it('moving between steps swaps the drawing for that step, and going back restores it', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    director.activate(id, 5);
    expect(director.drawing?.links.map((l) => l.relation)).toEqual(['alliance']);
    expect(director.year).toBe(1536);
    director.activate(id, 2);
    expect(director.drawing?.links.map((l) => l.relation)).toEqual(['war']);
    expect(director.drawing?.links[0]!.to).toBe('safavid-dynasty');
    expect(director.year).toBe(1514);
    director.activate(id, 1);
    expect(director.drawing?.links).toEqual([]);
    expect(director.year).toBe(1505);
  });

  it('the camera follows the step only while it is allowed to, and the first move of the reader ends that', async () => {
    const { session, director, focuses } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    const id = answer(session).id;
    expect(focuses).toEqual([]); // step 1 asks for no focus
    director.activate(id, 2);
    expect(focuses).toEqual([{ polities: ['ottoman-empire', 'safavid-dynasty'], points: [] }]);
    director.activate(id, 3);
    expect(focuses).toHaveLength(1); // step 3 asks for none

    director.userMovedCamera();
    expect(director.following).toBe(false);
    director.activate(id, 4); // asks for a focus, but the reader took the map
    director.activate(id, 5);
    expect(focuses).toHaveLength(1);
    expect(director.drawing?.links[0]!.relation).toBe('alliance'); // drawings keep following

    director.setFollowing(true); // switched back on: the active step's focus is applied at once
    expect(focuses).toHaveLength(2);
    expect(focuses[1]!.polities).toEqual(['ottoman-empire', 'kingdom-of-france']);
  });

  it('moving the map before any narration is on screen does not take the camera away from the first one', async () => {
    const { session, director, focuses } = setup();
    director.userMovedCamera(); // exploring the map, no step yet
    expect(director.following).toBe(true);
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    director.activate(answer(session).id, 2);
    expect(focuses).toHaveLength(1);
    expect(director.following).toBe(true);
  });

  it('a new conversation starts with the camera following again', async () => {
    const { session, director } = setup();
    await session.send({ text: NARRATION_REQUEST, mode: 'narration' }, anatolia());
    director.userMovedCamera();
    expect(director.following).toBe(false);
    session.newChat();
    expect(director.following).toBe(true);
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
    const director: Director = new Director(session, { focus: () => undefined });
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
