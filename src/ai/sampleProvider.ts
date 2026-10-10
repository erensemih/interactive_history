import {
  toModelError,
  type CompletionRequest,
  type CompletionResult,
  type ModelProvider,
  type ProviderCapabilities,
} from './provider';

/**
 * The parts of the artifact runtime's `sample` capability this page uses. `sample` asks Claude on the
 * viewer's own account: no key, no server of ours. Its input is a list of turns (there is no system
 * prompt, and every call is memoryless), its tools are plain page functions, and every failure is a
 * rejected `{code, message, text?}`.
 */
export interface SampleFn {
  (
    input: { role: 'user' | 'assistant'; content: string }[],
    options?: {
      onText?: (update: { text: string; delta: string }) => void;
      signal?: AbortSignal;
      tools?: {
        name: string;
        description: string;
        inputSchema?: object;
        execute(input: Record<string, unknown>, context: { signal: AbortSignal }): unknown;
      }[];
      modelTier?: 'quick' | 'default' | 'complex';
      cache?: false;
    },
  ): Promise<{ text: string; truncated?: boolean }>;
  limits?(): Promise<{ maxPromptBytes?: number; tools?: { maxCount: number } }>;
}

/** `window.claude` inside a Claude viewer; absent (or answering null) everywhere else. */
export interface ClaudeHost {
  use(name: string): Promise<unknown>;
}

export const currentHost = (): ClaudeHost | undefined => {
  const host = (globalThis as { claude?: Partial<ClaudeHost> }).claude;
  return host && typeof host.use === 'function' ? (host as ClaudeHost) : undefined;
};

/** The runtime itself answers null after about ten seconds when no viewer replies; this is a little longer. */
const WAIT_MS = 12_000;

/**
 * Asks the runtime for `sample`. Null where there is none (a plain browser, a saved file, a viewer that
 * does not offer it): the caller then falls back to the scripted provider and says so. Asking costs
 * nothing and shows no dialog; the viewer is asked for consent at the first real call.
 */
export async function createSampleProvider(
  host: ClaudeHost | undefined = currentHost(),
  waitMs = WAIT_MS,
): Promise<ModelProvider | null> {
  if (!host) return null;
  let sample: unknown;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    sample = await Promise.race([
      host.use('sample'),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), waitMs);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  return typeof sample === 'function' ? new SampleProvider(sample as SampleFn) : null;
}

export class SampleProvider implements ModelProvider {
  readonly kind = 'sample' as const;
  readonly label = 'Claude (hesabınız üzerinden)';
  private caps: Promise<ProviderCapabilities> | null = null;

  constructor(private readonly sample: SampleFn) {}

  capabilities(): Promise<ProviderCapabilities> {
    this.caps ??= this.readLimits();
    return this.caps;
  }

  /** `limits()` costs nothing and asks nothing. Without it (an older runtime) tools are tried and may be refused. */
  private async readLimits(): Promise<ProviderCapabilities> {
    if (typeof this.sample.limits !== 'function') return { tools: true, maxTools: 7 };
    try {
      const limits = await this.sample.limits();
      return { tools: !!limits?.tools, maxTools: limits?.tools?.maxCount ?? 0 };
    } catch {
      return { tools: false, maxTools: 0 };
    }
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    const options: NonNullable<Parameters<SampleFn>[1]> = {
      modelTier: req.tier,
      signal: req.signal,
      onText: ({ text }) => req.onText(text),
    };
    if (req.tools.length) {
      // A call with tools is never cached, and says so by leaving `cache` out.
      options.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        execute: (input, context) => t.execute(input, context),
      }));
    } else {
      options.cache = false; // a chat turn must always be asked afresh
    }
    try {
      const result = await this.sample(req.turns, options);
      return { text: result.text, truncated: !!result.truncated };
    } catch (err) {
      throw toModelError(err);
    }
  }
}
