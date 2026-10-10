import type { AppData } from '../data/load';
import { subjectKey, subjectLabel, type AiContext, type ContextEvent, type Mode } from './context';
import { TurnPlan } from './drawing';
import { buildTurns, type HistoryTurn } from './prompt';
import {
  toModelError,
  type CompletionResult,
  type ModelError,
  type ModelErrorCode,
  type ModelProvider,
  type ModelTier,
} from './provider';
import { Resolver } from './resolve';
import { gatherPassages, type SourceProvider } from './sources';
import { createTools } from './tools';
import type { Drawing } from './types';

/** What the reader asks. */
export interface AskRequest {
  text: string;
  mode: Mode;
  /** The event the question is about (the event card's button), or null. */
  event?: ContextEvent | null;
}

export interface UserItem {
  kind: 'user';
  id: string;
  text: string;
  mode: Mode;
  /** What the chat was about when this was asked. */
  subject: string;
  event: ContextEvent | null;
  request: AskRequest;
}

export type AssistantStatus = 'waiting' | 'streaming' | 'done' | 'stopped' | 'failed';

export interface AssistantItem {
  kind: 'assistant';
  id: string;
  mode: Mode;
  status: AssistantStatus;
  /** The model's text so far, exactly as written. */
  text: string;
  /** What it asked the map to do, filled while the call runs. */
  plan: TurnPlan;
  error: { code: ModelErrorCode; message: string } | null;
  /** Ran into the length limit and stops mid-thought. */
  truncated: boolean;
  /** Things the reader should know about this answer (for example: no drawing was possible). */
  notes: string[];
}

/** The subject of the chat changed since the last question: the chat says so where it happened. */
export interface ContextItem {
  kind: 'context';
  id: string;
  from: string;
  to: string;
}

export type ChatItem = UserItem | AssistantItem | ContextItem;

export interface SessionOptions {
  /** Resolves to the model to use; the chat waits for it on the first question, not at start-up. */
  provider: Promise<ModelProvider>;
  data: Pick<AppData, 'entities' | 'rows' | 'events'>;
  sources: SourceProvider[];
  tier?: ModelTier;
  /** What is drawn on the map right now, so the model knows what the reader is looking at. */
  drawing?: () => Drawing | null;
}

export const NO_TOOLS_NOTE = 'Bu ortamda haritaya çizim yapılamıyor; yanıt yalnızca metin olarak geldi.';

/**
 * The conversation. It holds what the reader and the model said, asks the model through a provider, and
 * records what the model asked the map to do. It knows nothing about the page: the chat view draws it
 * and the director turns its plans into map states.
 *
 * One call at a time. A failed call is shown where it happened and is never retried by itself; the
 * reader decides whether to try again. The model keeps no memory, so every call carries the chat so far.
 */
export class AiSession {
  items: ChatItem[] = [];
  tier: ModelTier;
  /** Set once the provider has resolved. */
  provider: ModelProvider | null = null;
  /** A failure that no new attempt in this page will fix (no consent, no access): the composer stays off. */
  blocked: ModelError | null = null;
  readonly resolver: Resolver;

  private readonly listeners = new Set<() => void>();
  private readonly ready: Promise<ModelProvider>;
  private readonly sources: SourceProvider[];
  private readonly currentDrawing: () => Drawing | null;
  private abort: AbortController | null = null;
  private seq = 0;
  private lastSubject: { key: string; label: string; ctx: AiContext } | null = null;
  private current: AiContext | null = null;
  private toolsOff = false;

  constructor(options: SessionOptions) {
    this.currentDrawing = options.drawing ?? (() => null);
    this.sources = options.sources;
    this.tier = options.tier ?? 'default';
    this.resolver = new Resolver(options.data);
    this.ready = options.provider;
    this.ready.then(
      (p) => {
        this.provider = p;
        this.notify();
      },
      () => undefined,
    );
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private nextId(): string {
    return `m${++this.seq}`;
  }

  get busy(): boolean {
    return this.abort !== null;
  }

  setTier(tier: ModelTier) {
    if (tier === this.tier) return;
    this.tier = tier;
    this.notify();
  }

  find(id: string): ChatItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  /* ------------------------------------------------------------- context */

  /**
   * The app tells the session what the reader is looking at. Once a question has been asked, a change of
   * place or range puts a marker into the chat at once (one marker, updated while the reader keeps
   * changing it, gone if they return to where they were), so it is clear what the next question will be about.
   */
  syncContext(ctx: AiContext) {
    this.current = ctx;
    const last = this.lastSubject;
    if (!last) return;
    const tail = this.items[this.items.length - 1];
    if (subjectKey(ctx) === last.key) {
      if (tail?.kind === 'context') {
        this.items.pop();
        this.notify();
      }
      return;
    }
    const to = subjectLabel(ctx);
    if (tail?.kind === 'context') {
      if (tail.to === to) return;
      tail.to = to;
    } else {
      this.items.push({ kind: 'context', id: this.nextId(), from: last.label, to });
    }
    this.notify();
  }

  /* --------------------------------------------------------------- asking */

  async send(request: AskRequest, ctx: AiContext): Promise<void> {
    if (this.busy || this.blocked) return;
    const context: AiContext = request.event ? { ...ctx, event: request.event } : ctx;
    this.syncContext(context);
    const key = subjectKey(context);
    const previous = this.lastSubject && this.lastSubject.key !== key ? this.lastSubject.ctx : null;
    const subject = subjectLabel(context);
    this.lastSubject = { key, label: subject, ctx: context };

    const history = this.historyTurns();
    const reply: AssistantItem = {
      kind: 'assistant',
      id: this.nextId(),
      mode: request.mode,
      status: 'waiting',
      text: '',
      plan: new TurnPlan(),
      error: null,
      truncated: false,
      notes: [],
    };
    this.items.push(
      {
        kind: 'user',
        id: this.nextId(),
        text: request.text,
        mode: request.mode,
        subject,
        event: request.event ?? null,
        request,
      },
      reply,
    );
    await this.run(reply, request, context, previous, history);
  }

  /** Asks the last question again after a failure or a stop: the failed answer gives way to the new one. */
  async retry(): Promise<void> {
    if (this.busy || !this.current) return;
    const reply = this.items[this.items.length - 1];
    const ask = this.items[this.items.length - 2];
    if (reply?.kind !== 'assistant' || ask?.kind !== 'user') return;
    if (reply.status !== 'failed' && reply.status !== 'stopped') return;
    this.items.splice(this.items.length - 2, 2);
    await this.send(ask.request, this.current);
  }

  stop() {
    this.abort?.abort();
  }

  /** Forgets the conversation (the model never kept it anyway). */
  newChat() {
    this.abort?.abort();
    this.items = [];
    this.lastSubject = null;
    this.notify();
  }

  private historyTurns(): HistoryTurn[] {
    const out: HistoryTurn[] = [];
    for (let i = 0; i < this.items.length - 1; i++) {
      const ask = this.items[i];
      const answer = this.items[i + 1];
      if (ask?.kind !== 'user' || answer?.kind !== 'assistant') continue;
      if ((answer.status !== 'done' && answer.status !== 'stopped') || !answer.text.trim()) continue;
      out.push(
        { role: 'user', text: ask.text, mode: ask.mode, subject: ask.subject, event: ask.event?.title },
        { role: 'assistant', text: answer.text },
      );
    }
    return out;
  }

  private async run(
    reply: AssistantItem,
    request: AskRequest,
    context: AiContext,
    previous: AiContext | null,
    history: HistoryTurn[],
  ) {
    const ctl = new AbortController();
    this.abort = ctl;
    this.notify();
    try {
      const provider = await this.ready;
      let result: CompletionResult;
      try {
        result = await this.attempt(provider, reply, request, context, previous, history, !this.toolsOff, ctl);
      } catch (err) {
        const e = toModelError(err);
        if (e.code !== 'tools_unavailable' || this.toolsOff) throw e;
        // At most one fallback: a view that cannot run tools gets the same question as plain text.
        this.toolsOff = true;
        if (!reply.notes.includes(NO_TOOLS_NOTE)) reply.notes.push(NO_TOOLS_NOTE);
        result = await this.attempt(provider, reply, request, context, previous, history, false, ctl);
      }
      reply.text = result.text;
      reply.truncated = result.truncated;
      reply.status = 'done';
    } catch (err) {
      const e = toModelError(err);
      if (e.code === 'cancelled') {
        reply.status = 'stopped';
        if (e.text) reply.text = e.text;
      } else {
        reply.status = 'failed';
        reply.error = { code: e.code, message: e.message };
        // A refusal withdraws what had been written; any other failure keeps it, marked as interrupted.
        reply.text = e.code === 'refused' ? '' : (e.text ?? reply.text);
        if (e.permanent) this.blocked = e;
      }
    } finally {
      this.abort = null;
      this.notify();
    }
  }

  private async attempt(
    provider: ModelProvider,
    reply: AssistantItem,
    request: AskRequest,
    context: AiContext,
    previous: AiContext | null,
    history: HistoryTurn[],
    withTools: boolean,
    ctl: AbortController,
  ): Promise<CompletionResult> {
    const caps = await provider.capabilities();
    const usable = withTools && caps.tools;
    if (withTools && !caps.tools && !reply.notes.includes(NO_TOOLS_NOTE)) reply.notes.push(NO_TOOLS_NOTE);
    // A view may allow fewer tools than we have; the ones listed first matter most.
    const tools = usable
      ? createTools({
          resolver: this.resolver,
          range: context.range,
          plan: reply.plan,
          onChange: () => this.notify(),
        }).slice(0, Math.max(1, caps.maxTools))
      : [];

    const query = { mode: request.mode, question: request.text, context };
    const sources = await gatherPassages(this.sources, query);
    const turns = buildTurns({
      mode: request.mode,
      question: request.text,
      context,
      previous,
      catalog: tools.length ? this.resolver.catalog(context.range) : [],
      sources,
      drawing: this.currentDrawing(),
      nameOf: (id) => this.resolver.nameOf(id),
      history,
      tools: tools.length > 0,
    });
    return provider.complete({
      turns,
      tools,
      tier: this.tier,
      signal: ctl.signal,
      meta: { mode: request.mode, question: request.text, context },
      onText: (text) => {
        if (reply.status !== 'waiting' && reply.status !== 'streaming') return;
        reply.text = text;
        reply.status = 'streaming';
        this.notify();
      },
    });
  }
}
