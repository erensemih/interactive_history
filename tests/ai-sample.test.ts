import { describe, expect, it } from 'vitest';
import { contextFromView } from '../src/ai/context';
import { ModelError, toModelError, type ModelProvider } from '../src/ai/provider';
import { createSampleProvider, SampleProvider, type ClaudeHost, type SampleFn } from '../src/ai/sampleProvider';
import { AiSession, NO_TOOLS_NOTE, type AssistantItem } from '../src/ai/session';
import { appEventsSource } from '../src/ai/sources';
import { deriveView } from '../src/state/derive';
import { DEFAULT_STATE } from '../src/state/store';
import { shippedData } from './helpers/shipped';

const data = shippedData();
const ctx = contextFromView(
  deriveView({ ...DEFAULT_STATE, range: { from: 1500, to: 1550 }, places: [{ lon: 35.5, lat: 38.9 }] }, data),
  data,
);

describe('finding the model', () => {
  it('there is none outside a Claude viewer, or where the runtime does not offer sample', async () => {
    expect(await createSampleProvider(undefined)).toBeNull();
    expect(await createSampleProvider({ use: async () => null })).toBeNull();
    expect(await createSampleProvider({ use: async () => 'not a function' })).toBeNull();
    expect(await createSampleProvider({ use: () => Promise.reject(new Error('x')) })).toBeNull();
  });

  it('does not wait for a host that never answers', async () => {
    const silent: ClaudeHost = { use: () => new Promise(() => undefined) };
    const started = Date.now();
    expect(await createSampleProvider(silent, 30)).toBeNull();
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('asks for the sample capability by name and wraps what comes back', async () => {
    const asked: string[] = [];
    const fn = (async () => ({ text: 'x' })) as unknown as SampleFn;
    const host: ClaudeHost = { use: async (name) => (asked.push(name), fn) };
    const provider = await createSampleProvider(host);
    expect(asked).toEqual(['sample']);
    expect(provider).toBeInstanceOf(SampleProvider);
    expect(provider!.kind).toBe('sample');
  });
});

describe('what the runtime can do here', () => {
  const withLimits = (limits: SampleFn['limits']) =>
    new SampleProvider(Object.assign(async () => ({ text: 'x' }), { limits }) as unknown as SampleFn);

  it('reads the tool allowance from limits()', async () => {
    expect(await withLimits(async () => ({ maxPromptBytes: 1, tools: { maxCount: 5 } })).capabilities()).toEqual({
      tools: true,
      maxTools: 5,
    });
    expect(await withLimits(async () => ({ maxPromptBytes: 1 })).capabilities()).toEqual({ tools: false, maxTools: 0 });
    expect(await withLimits(() => Promise.reject(new Error('x'))).capabilities()).toEqual({
      tools: false,
      maxTools: 0,
    });
  });

  it('tries tools when an older runtime has no limits()', async () => {
    expect(await new SampleProvider((async () => ({ text: 'x' })) as unknown as SampleFn).capabilities()).toEqual({
      tools: true,
      maxTools: 7,
    });
  });
});

describe('a call', () => {
  function recorder() {
    const calls: { input: unknown; options: Parameters<SampleFn>[1] }[] = [];
    const fn: SampleFn = Object.assign(
      async (input: Parameters<SampleFn>[0], options?: Parameters<SampleFn>[1]) => {
        calls.push({ input, options });
        options?.onText?.({ text: 'Yarım', delta: 'Yarım' });
        options?.onText?.({ text: 'Yarım yanıt', delta: ' yanıt' });
        return { text: 'Yarım yanıt', truncated: true };
      },
      { limits: async () => ({ tools: { maxCount: 7 } }) },
    );
    return { calls, provider: new SampleProvider(fn) };
  }
  const request = (patch = {}) => ({
    turns: [
      { role: 'user' as const, content: 'kurallar' },
      { role: 'user' as const, content: 'soru' },
    ],
    tools: [] as ModelProvider extends never ? never : import('../src/ai/provider').ToolSpec[],
    tier: 'default' as const,
    signal: new AbortController().signal,
    onText: () => undefined,
    meta: { mode: 'qa' as const, question: 'soru', context: ctx },
    ...patch,
  });

  it('sends the turns, the tier and the signal, streams the whole text so far, and reports truncation', async () => {
    const { calls, provider } = recorder();
    const texts: string[] = [];
    const ctl = new AbortController();
    const out = await provider.complete(
      request({ tier: 'complex', signal: ctl.signal, onText: (t: string) => texts.push(t) }),
    );
    expect(out).toEqual({ text: 'Yarım yanıt', truncated: true });
    expect(texts).toEqual(['Yarım', 'Yarım yanıt']);
    expect(calls[0]!.input).toEqual(request().turns);
    expect(calls[0]!.options).toMatchObject({ modelTier: 'complex', signal: ctl.signal });
  });

  it('a plain call is never cached; a call with tools leaves cache out, as the runtime requires', async () => {
    const { calls, provider } = recorder();
    await provider.complete(request());
    expect(calls[0]!.options!.cache).toBe(false);
    expect(calls[0]!.options!.tools).toBeUndefined();

    const tool = {
      name: 'highlight',
      description: 'd',
      inputSchema: { type: 'object' as const, properties: {} },
      execute: () => 'tamam',
    };
    await provider.complete(request({ tools: [tool] }));
    expect('cache' in calls[1]!.options!).toBe(false);
    expect(calls[1]!.options!.tools).toHaveLength(1);
    expect(calls[1]!.options!.tools![0]).toMatchObject({
      name: 'highlight',
      description: 'd',
      inputSchema: { type: 'object', properties: {} },
    });
    expect(calls[1]!.options!.tools![0]!.execute({}, { signal: new AbortController().signal })).toBe('tamam');
  });

  it('turns the runtime rejections into our errors', async () => {
    const reject = (reason: unknown) =>
      new SampleProvider((async () => Promise.reject(reason)) as unknown as SampleFn).complete(request());
    await expect(reject({ code: 'not_granted', message: 'no' })).rejects.toMatchObject({
      code: 'not_granted',
      permanent: true,
    });
    await expect(reject({ code: 'rate_limited', message: 'slow', text: 'yarım' })).rejects.toMatchObject({
      code: 'rate_limited',
      text: 'yarım',
      permanent: false,
    });
    await expect(reject({ code: 'cancelled', message: 'x' })).rejects.toMatchObject({ code: 'cancelled' });
    await expect(reject({ code: 'capability_removed', message: 'x' })).rejects.toMatchObject({
      code: 'sampling_disabled',
      permanent: true,
    });
    await expect(reject({ code: 'queue_overflow', message: 'x' })).rejects.toMatchObject({ code: 'upstream_error' });
    await expect(reject({ name: 'AbortError' })).rejects.toMatchObject({ code: 'cancelled' });
    await expect(reject(new Error('plain'))).rejects.toMatchObject({ code: 'upstream_error' });
    expect(toModelError(new ModelError('refused')).code).toBe('refused');
  });
});

describe('a conversation through the runtime (a fake one that runs the page functions like the real one)', () => {
  /** Round 1: the model calls tools together; round 2: it writes. Like the runtime, it hands tool results back and streams. */
  function fakeRuntime(opts: { refuseTools?: boolean } = {}) {
    const results: unknown[] = [];
    const fn: SampleFn = Object.assign(
      async (_input: Parameters<SampleFn>[0], options?: Parameters<SampleFn>[1]) => {
        if (opts.refuseTools && options?.tools)
          return Promise.reject({ code: 'tools_unavailable', message: 'no tools here' });
        if (options?.tools) {
          const by = new Map(options.tools.map((t) => [t.name, t]));
          const context = { signal: options.signal ?? new AbortController().signal };
          results.push(
            ...(await Promise.all([
              by.get('step')!.execute({ n: 1, title: 'İttifak' }, context),
              by
                .get('highlight')!
                .execute({ step: 1, polities: ['ottoman-empire', 'kingdom-of-france', 'atlantis'] }, context),
              by
                .get('connect')!
                .execute({ step: 1, from: 'ottoman-empire', to: 'kingdom-of-france', relation: 'alliance' }, context),
            ])),
          );
        }
        const text = '## 1. İttifak\nMetin.';
        options?.onText?.({ text, delta: text });
        return { text };
      },
      { limits: async () => ({ tools: { maxCount: 7 } }) },
    );
    return { fn, results };
  }

  it('fills the plan from tools the runtime ran, and keeps the answer', async () => {
    const { fn, results } = fakeRuntime();
    const session = new AiSession({
      provider: Promise.resolve(new SampleProvider(fn)),
      data,
      sources: [appEventsSource(data)],
    });
    await session.send({ text: 'Fransa ile ittifak neydi?', mode: 'qa' }, ctx);
    const answer = session.items.at(-1) as AssistantItem;
    expect(answer).toMatchObject({ status: 'done', text: '## 1. İttifak\nMetin.' });
    expect(results[0]).toBe('tamam');
    expect(String(results[1])).toContain('atlantis'); // the model is told what was skipped
    expect(answer.plan.drawingAt(1).highlights).toEqual(['ottoman-empire', 'kingdom-of-france']);
    expect(answer.plan.titleOf(1)).toBe('İttifak');
  });

  it('degrades to text when the runtime says tools_unavailable', async () => {
    const { fn } = fakeRuntime({ refuseTools: true });
    const session = new AiSession({ provider: Promise.resolve(new SampleProvider(fn)), data, sources: [] });
    await session.send({ text: 'Soru', mode: 'qa' }, ctx);
    const answer = session.items.at(-1) as AssistantItem;
    expect(answer.status).toBe('done');
    expect(answer.notes).toEqual([NO_TOOLS_NOTE]);
    expect(answer.plan.empty).toBe(true);
  });
});
