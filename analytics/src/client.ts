/**
 * @lacspace/analytics — a full spec-style analytics client.
 *
 * A transport-agnostic `track` / `identify` / `page` / `screen` / `group` /
 * `alias` client with a consistent event envelope, size/interval batching, an
 * offline buffer with backoff retry, consent + Do-Not-Track gating, and
 * pluggable middleware. Every side-effect (network, clock, timers) is injected,
 * so it is fully deterministic in tests and never touches the network by
 * default. Zero dependencies, isomorphic.
 */

import { shouldTrack, detectDNT, type ConsentContext } from "./consent";
import {
  applyMiddleware,
  parseUtm,
  type Campaign,
  type Middleware,
} from "./enrich";

/** The kind of call that produced an envelope. */
export type EventType = "track" | "identify" | "page" | "screen" | "group" | "alias";

/** Ambient context attached to every envelope. */
export interface AnalyticsContext {
  library?: { name: string; version: string };
  campaign?: Campaign;
  consent?: boolean;
  dnt?: boolean;
  sessionId?: string;
  [key: string]: unknown;
}

/** A single, self-describing analytics message (Segment-style envelope). */
export interface AnalyticsEnvelope {
  type: EventType;
  /** Unique id for this message. */
  messageId: string;
  /** Unix epoch (ms). */
  timestamp: number;
  anonymousId?: string;
  userId?: string;
  /** `track` event name. */
  event?: string;
  /** `page` / `screen` name. */
  name?: string;
  /** `page` / `screen` category. */
  category?: string;
  /** `group` id. */
  groupId?: string;
  /** `alias` previous id. */
  previousId?: string;
  /** `track` / `page` / `screen` properties. */
  properties?: Record<string, unknown>;
  /** `identify` / `group` traits. */
  traits?: Record<string, unknown>;
  context: AnalyticsContext;
}

/** Receives batches of envelopes. May throw/reject to signal a failed send. */
export type Transport = (events: AnalyticsEnvelope[]) => void | Promise<void>;

/** A minimal, injectable timer handle abstraction (isomorphic). */
export type TimerHandle = unknown;
export type SetTimer = (fn: () => void, ms: number) => TimerHandle;
export type ClearTimer = (handle: TimerHandle) => void;

/** What to do with events while collection is blocked (no consent / DNT). */
export type BlockedPolicy = "discard" | "hold";

/** Options for {@link AnalyticsClient}. */
export interface AnalyticsClientOptions {
  /** Where batches go. Default: a no-op that resolves (collect nothing). */
  transport?: Transport;
  /** Clock, injectable for tests. Default `Date.now`. */
  now?: () => number;
  /** Schedule a timer. Default `setTimeout`. */
  setTimer?: SetTimer;
  /** Cancel a timer. Default `clearTimeout`. */
  clearTimer?: ClearTimer;
  /** Flush automatically once this many events are queued. Default 20. */
  flushAt?: number;
  /** Flush on this interval (ms). `0`/omitted disables interval flushing. */
  flushInterval?: number;
  /** Hard cap on buffered events; oldest are dropped past it. Default 1000. */
  maxQueueSize?: number;
  /** Max retry attempts for a failed batch before giving up. Default 5. */
  maxRetries?: number;
  /** Backoff (ms) for retry `attempt` (1-based). Default capped exponential. */
  backoff?: (attempt: number) => number;
  /** Consent flag. `undefined` = unknown (see `defaultConsent`). */
  consent?: boolean;
  /** Whether an enabled DNT signal blocks collection. Default `true`. */
  respectDNT?: boolean;
  /** Override DNT detection. Default: read from the browser when present. */
  dnt?: boolean;
  /** When consent is unknown, may we track? Default `false`. */
  defaultConsent?: boolean;
  /** What to do while blocked: `discard` (default) or `hold` for later. */
  whenBlocked?: BlockedPolicy;
  /** Starting anonymous id. Default: generated on first use. */
  anonymousId?: string;
  /** Id generator for messageIds / anonymousId. Default Web Crypto random. */
  genId?: () => string;
  /** Extra context merged into every envelope. */
  context?: Partial<AnalyticsContext>;
  /** Middleware run (in order) before an event is enqueued. */
  middleware?: Middleware<AnalyticsEnvelope>[];
}

const LIBRARY = { name: "@lacspace/analytics", version: "2.1.0" };

const noopTransport: Transport = () => {};

function defaultGenId(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c && typeof (c as { randomUUID?: () => string }).randomUUID === "function") {
    return (c as { randomUUID: () => string }).randomUUID();
  }
  if (c && typeof c.getRandomValues === "function") {
    const b = new Uint8Array(16);
    c.getRandomValues(b);
    let s = "";
    for (let i = 0; i < b.length; i++) s += (b[i]! + 0x100).toString(16).slice(1);
    return s;
  }
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

const defaultBackoff = (attempt: number): number =>
  Math.min(30_000, 1000 * Math.pow(2, Math.max(0, attempt - 1)));

/**
 * A batching, consent-aware analytics client. All I/O is injected; nothing is
 * sent until `flushAt`/`flushInterval` triggers a flush or you call `flush()`.
 */
export class AnalyticsClient {
  private readonly transport: Transport;
  private readonly now: () => number;
  private readonly setTimer: SetTimer;
  private readonly clearTimer: ClearTimer;
  private readonly flushAt: number;
  private readonly flushInterval: number;
  private readonly maxQueueSize: number;
  private readonly maxRetries: number;
  private readonly backoff: (attempt: number) => number;
  private readonly respectDNT: boolean;
  private readonly defaultConsent: boolean;
  private readonly whenBlocked: BlockedPolicy;
  private readonly genId: () => string;
  private readonly baseContext: Partial<AnalyticsContext>;
  private readonly middleware: Middleware<AnalyticsEnvelope>[];

  private queue: AnalyticsEnvelope[] = [];
  private _consent: boolean | undefined;
  private _dnt: boolean | undefined;
  private _userId: string | undefined;
  private _anonymousId: string;
  private intervalTimer: TimerHandle | undefined;
  private retryTimer: TimerHandle | undefined;
  private retryAttempt = 0;
  private inFlight = false;

  constructor(options: AnalyticsClientOptions = {}) {
    this.transport = options.transport ?? noopTransport;
    this.now = options.now ?? Date.now;
    this.setTimer =
      options.setTimer ?? ((fn, ms) => (setTimeout as (fn: () => void, ms: number) => TimerHandle)(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.flushAt = Math.max(1, options.flushAt ?? 20);
    this.flushInterval = options.flushInterval ?? 0;
    this.maxQueueSize = Math.max(1, options.maxQueueSize ?? 1000);
    this.maxRetries = Math.max(0, options.maxRetries ?? 5);
    this.backoff = options.backoff ?? defaultBackoff;
    this.respectDNT = options.respectDNT ?? true;
    this.defaultConsent = options.defaultConsent ?? false;
    this.whenBlocked = options.whenBlocked ?? "discard";
    this.genId = options.genId ?? defaultGenId;
    this.baseContext = options.context ?? {};
    this.middleware = options.middleware ? [...options.middleware] : [];
    this._consent = options.consent;
    this._dnt = options.dnt ?? detectDNT();
    this._anonymousId = options.anonymousId ?? this.genId();

    if (this.flushInterval > 0) this.scheduleInterval();
  }

  /** Number of events currently buffered. */
  get queued(): number {
    return this.queue.length;
  }

  /** The current anonymous id. */
  get anonymousId(): string {
    return this._anonymousId;
  }

  /** The current identified user id, if any. */
  get userId(): string | undefined {
    return this._userId;
  }

  /** The consent signals as this client currently sees them. */
  get consentContext(): ConsentContext {
    return {
      consent: this._consent,
      dnt: this._dnt,
      respectDNT: this.respectDNT,
      defaultConsent: this.defaultConsent,
    };
  }

  /** May events be collected right now? Pure over the current signals. */
  get enabled(): boolean {
    return shouldTrack(this.consentContext);
  }

  /** Update the consent flag at runtime. */
  setConsent(consent: boolean | undefined): this {
    this._consent = consent;
    return this;
  }

  /** Associate the user with a stable id (and optional traits). */
  identify(userId: string, traits: Record<string, unknown> = {}): this {
    this._userId = userId;
    return this.enqueue({ type: "identify", userId, traits });
  }

  /** Record that something happened. */
  track(event: string, properties: Record<string, unknown> = {}): this {
    return this.enqueue({ type: "track", event, properties });
  }

  /** Record a page view. `name` is optional; extra props go in `properties`. */
  page(name?: string, properties: Record<string, unknown> = {}): this {
    return this.enqueue({ type: "page", name, properties });
  }

  /** Record a screen view (mobile analogue of `page`). */
  screen(name?: string, properties: Record<string, unknown> = {}): this {
    return this.enqueue({ type: "screen", name, properties });
  }

  /** Associate the user with a group / account / organisation. */
  group(groupId: string, traits: Record<string, unknown> = {}): this {
    return this.enqueue({ type: "group", groupId, traits });
  }

  /** Merge a previous (anonymous) id into a new user id. */
  alias(userId: string, previousId?: string): this {
    const prev = previousId ?? this._userId ?? this._anonymousId;
    this._userId = userId;
    return this.enqueue({ type: "alias", userId, previousId: prev });
  }

  /** Send everything buffered as one batch, then clear the buffer. */
  async flush(): Promise<void> {
    if (this.inFlight) return;
    if (!this.enabled) return; // held events stay buffered until consent changes
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0, this.queue.length);
    this.inFlight = true;
    try {
      await this.transport(batch);
      this.retryAttempt = 0;
      this.clearRetry();
    } catch (err) {
      // Offline / failed send: put the events back at the front and retry.
      this.queue = batch.concat(this.queue);
      this.trimQueue();
      this.scheduleRetry();
      throw err;
    } finally {
      this.inFlight = false;
    }
  }

  /** Stop interval/retry timers. Call before discarding the client. */
  close(): void {
    if (this.intervalTimer !== undefined) this.clearTimer(this.intervalTimer);
    this.intervalTimer = undefined;
    this.clearRetry();
  }

  private buildEnvelope(
    partial: Omit<AnalyticsEnvelope, "messageId" | "timestamp" | "context" | "anonymousId">,
  ): AnalyticsEnvelope {
    const context: AnalyticsContext = {
      library: LIBRARY,
      ...this.baseContext,
      consent: this._consent,
      dnt: this._dnt,
    };
    const env: AnalyticsEnvelope = {
      ...partial,
      messageId: this.genId(),
      timestamp: this.now(),
      anonymousId: this._anonymousId,
      context,
    };
    if (env.userId === undefined && this._userId !== undefined) env.userId = this._userId;
    return env;
  }

  private enqueue(
    partial: Omit<AnalyticsEnvelope, "messageId" | "timestamp" | "context" | "anonymousId">,
  ): this {
    // Gate at ingest so `discard` truly drops the event before any buffering.
    if (!this.enabled && this.whenBlocked === "discard") return this;

    let env: AnalyticsEnvelope | null = this.buildEnvelope(partial);
    env = applyMiddleware(env, this.middleware);
    if (env === null) return this; // redacted / dropped by middleware

    this.queue.push(env);
    this.trimQueue();

    if (this.enabled && this.queue.length >= this.flushAt) {
      void this.flush().catch(() => {});
    }
    return this;
  }

  private trimQueue(): void {
    if (this.queue.length > this.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.maxQueueSize);
    }
  }

  private scheduleInterval(): void {
    this.intervalTimer = this.setTimer(() => {
      void this.flush().catch(() => {});
      if (this.flushInterval > 0) this.scheduleInterval();
    }, this.flushInterval);
  }

  private scheduleRetry(): void {
    if (this.retryAttempt >= this.maxRetries) return;
    this.retryAttempt += 1;
    this.clearRetry();
    this.retryTimer = this.setTimer(() => {
      this.retryTimer = undefined;
      void this.flush().catch(() => {});
    }, this.backoff(this.retryAttempt));
  }

  private clearRetry(): void {
    if (this.retryTimer !== undefined) this.clearTimer(this.retryTimer);
    this.retryTimer = undefined;
  }
}

/** Factory mirror of {@link AnalyticsClient}. */
export function createAnalyticsClient(options?: AnalyticsClientOptions): AnalyticsClient {
  return new AnalyticsClient(options);
}

/** A transport that collects batches in memory — handy for tests and dev. */
export interface MemoryTransport {
  transport: Transport;
  /** Every envelope received, flattened across batches. */
  readonly events: AnalyticsEnvelope[];
  /** Each batch as it arrived. */
  readonly batches: AnalyticsEnvelope[][];
}

/** Create a {@link MemoryTransport}. */
export function createMemoryTransport(): MemoryTransport {
  const events: AnalyticsEnvelope[] = [];
  const batches: AnalyticsEnvelope[][] = [];
  return {
    events,
    batches,
    transport(batch) {
      batches.push(batch);
      for (const e of batch) events.push(e);
    },
  };
}

/** Re-exported so campaign context can be built from a URL at the call site. */
export { parseUtm };
