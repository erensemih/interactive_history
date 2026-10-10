import type { AiContext, Mode } from './context';
import type { PromptTurn } from './prompt';

/** The three speeds the reader can pick; no model names anywhere. */
export type ModelTier = 'quick' | 'default' | 'complex';
export const TIER_LABEL: Record<ModelTier, string> = { quick: 'Hızlı', default: 'Dengeli', complex: 'Derin' };

/** The failures a call can end in (the codes of the artifact runtime's `sample`, plus our own). */
export type ModelErrorCode =
  | 'cancelled'
  | 'not_granted'
  | 'rate_limited'
  | 'tools_unavailable'
  | 'session_expired'
  | 'sampling_disabled'
  | 'refused'
  | 'empty_completion'
  | 'prompt_too_large'
  | 'invalid_request'
  | 'upstream_error';

const KNOWN: ReadonlySet<string> = new Set<ModelErrorCode>([
  'cancelled',
  'not_granted',
  'rate_limited',
  'tools_unavailable',
  'session_expired',
  'sampling_disabled',
  'refused',
  'empty_completion',
  'prompt_too_large',
  'invalid_request',
  'upstream_error',
]);

/** The runtime's other "cannot be used in this view" codes. For the page they all mean the same as `sampling_disabled`. */
const UNUSABLE_HERE: ReadonlySet<string> = new Set(['not_declared', 'capability_disabled', 'capability_removed']);

export class ModelError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    message: string = code,
    /** The part of the answer that had been written before the failure. */
    readonly text?: string,
  ) {
    super(message);
    this.name = 'ModelError';
  }

  /** Nothing the reader does in this page will make the next call work: no point in offering another try. */
  get permanent(): boolean {
    return this.code === 'not_granted' || this.code === 'sampling_disabled';
  }
}

/**
 * Anything a provider throws becomes a `ModelError`. The runtime rejects with plain `{code, message, text}`
 * objects (not Errors), and an unknown code is treated as `upstream_error`, as its documentation asks.
 */
export function toModelError(err: unknown): ModelError {
  if (err instanceof ModelError) return err;
  if (err && typeof err === 'object') {
    const e = err as { code?: unknown; message?: unknown; text?: unknown; name?: unknown };
    const raw = typeof e.code === 'string' ? e.code : e.name === 'AbortError' ? 'cancelled' : '';
    const code: ModelErrorCode = KNOWN.has(raw)
      ? (raw as ModelErrorCode)
      : UNUSABLE_HERE.has(raw)
        ? 'sampling_disabled'
        : 'upstream_error';
    const message = typeof e.message === 'string' ? e.message : code;
    return new ModelError(code, message, typeof e.text === 'string' ? e.text : undefined);
  }
  return new ModelError('upstream_error', typeof err === 'string' ? err : 'upstream_error');
}

/** One page function offered to the model. */
export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>, context?: { signal: AbortSignal }): unknown;
}

export interface CompletionRequest {
  /** The rules, the chat so far and the new request, ready to send. */
  turns: PromptTurn[];
  tools: ToolSpec[];
  tier: ModelTier;
  signal: AbortSignal;
  /** Called with the WHOLE answer so far each time more of it is written. */
  onText(text: string): void;
  /** What the turns were made from. Real providers ignore it; the scripted one answers from it. */
  meta: { mode: Mode; question: string; context: AiContext };
}

export interface CompletionResult {
  text: string;
  /** The answer hit a length limit and stops mid-thought. */
  truncated: boolean;
}

export interface ProviderCapabilities {
  /** Can the model call page functions here? */
  tools: boolean;
  /** How many tools one call may offer. */
  maxTools: number;
}

/**
 * The model behind the chat. The app talks only to this: the real one is the artifact runtime's `sample`
 * (the reader's own Claude account), the other is a scripted stand-in for local work and tests.
 */
export interface ModelProvider {
  readonly kind: 'sample' | 'mock';
  /** For the interface: where the answers come from. */
  readonly label: string;
  capabilities(): Promise<ProviderCapabilities>;
  /** Resolves with the whole answer; rejects with a `ModelError`. Never retries by itself. */
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
