import {
  ModelError,
  type CompletionRequest,
  type CompletionResult,
  type ModelErrorCode,
  type ModelProvider,
  type ProviderCapabilities,
} from './provider';

export interface MockCall {
  name: string;
  input: Record<string, unknown>;
}

/** What a scripted answer does: first the tool calls of one round (together), then the text. */
export interface MockReply {
  calls?: MockCall[];
  text: string;
  /** Fail instead of finishing: after `afterChars` characters of the text have been shown. */
  fail?: { code: ModelErrorCode; afterChars?: number };
}

/** A script looks at the request and either answers it or passes. */
export type MockScript = (req: CompletionRequest) => MockReply | null;

export interface MockOptions {
  /** Silence before the first word, like a model thinking. */
  thinkMs?: number;
  /** Pause after the tool round, like the second request of a real call. */
  roundMs?: number;
  chunkChars?: number;
  chunkMs?: number;
  /** Pretend tools are unavailable (the text-only path). */
  tools?: boolean;
  maxTools?: number;
}

const PASS: MockReply = {
  text: 'Bu deneme kipinde bu isteğe verilecek bir yanıt hazırlanmadı.',
};

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ModelError('cancelled'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new ModelError('cancelled'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A stand-in for the model with scripted answers. It does what a real call does, in the same order:
 * think, run the tool calls of the first round together (the page functions really run, so the plan is
 * filled exactly as for a real answer), then write the text a few characters at a time, ending with a
 * call that carries the whole text. Used when there is no Claude to ask (local work, a saved file) and in
 * the tests, which need answers that never change.
 */
export class MockProvider implements ModelProvider {
  readonly kind = 'mock' as const;
  readonly label = 'Deneme kipi (komut dosyalı yanıtlar)';
  /** Every request it has been given, oldest first (for tests). */
  readonly requests: CompletionRequest[] = [];

  constructor(
    private readonly scripts: readonly MockScript[],
    private readonly options: MockOptions = {},
  ) {}

  async capabilities(): Promise<ProviderCapabilities> {
    const tools = this.options.tools ?? true;
    return { tools, maxTools: tools ? (this.options.maxTools ?? 16) : 0 };
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.requests.push(req);
    const { thinkMs = 700, roundMs = 250, chunkChars = 36, chunkMs = 24 } = this.options;
    let reply: MockReply | null = null;
    for (const script of this.scripts) {
      reply = script(req);
      if (reply) break;
    }
    reply ??= PASS;

    await sleep(thinkMs, req.signal);
    if (reply.calls?.length && req.tools.length) {
      await Promise.all(
        reply.calls.map(async (call) => {
          const tool = req.tools.find((t) => t.name === call.name);
          try {
            await tool?.execute(call.input, { signal: req.signal });
          } catch {
            /* the real runtime hands the error back to the model and carries on */
          }
        }),
      );
      await sleep(roundMs, req.signal);
    }

    const text = reply.text;
    const stopAt = reply.fail ? Math.min(text.length, reply.fail.afterChars ?? 0) : text.length;
    let shown = 0;
    while (shown < stopAt) {
      shown = Math.min(stopAt, shown + chunkChars);
      try {
        await sleep(chunkMs, req.signal);
      } catch {
        throw new ModelError('cancelled', 'cancelled', text.slice(0, shown).trim() || undefined);
      }
      req.onText(text.slice(0, shown));
    }
    if (reply.fail) throw new ModelError(reply.fail.code, 'mock', text.slice(0, stopAt).trim() || undefined);
    return { text, truncated: false };
  }
}

export const createMockProvider = (scripts: readonly MockScript[], options?: MockOptions): MockProvider =>
  new MockProvider(scripts, options);
