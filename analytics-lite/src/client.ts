/**
 * @lacspace/analytics-lite — a minimal, batching, consent-aware client.
 *
 * A tiny sibling of the full `@lacspace/analytics` client: `track` / `page`,
 * size + interval + unload batching, and consent/DNT gating — nothing more.
 * Every side-effect (transport, clock, timers, unload binding) is injected, so
 * it is deterministic in tests and never touches the network by default.
 * Zero dependencies, isomorphic.
 */

import { shouldTrack, detectDNT, type ConsentContext } from "./consent";
import { randomId } from "./id";
import type { Campaign } from "./utm";
import type { Transport } from "./transport";

export type { Transport } from "./transport";

/** A minimal, injectable timer handle abstraction (isomorphic). */
export type TimerHandle = unknown;
export type SetTimer = (fn: () => void, ms: number) => TimerHandle;
export type ClearTimer = (handle: TimerHandle) => void;

/** The kind of call that produced an event. */
export type LiteEventType = "page" | "track";

/** A single, minimal analytics event produced by the lite client. */
export interface LiteEvent {
  type: LiteEventType;
  /** Event name (`track`) or page name/path (`page`). */
  name?: string;
  /** Custom properties. */
  props?: Record<string, unknown>;
  /** Anonymous / session id for this client instance. */
  aid: string;
  /** Milliseconds since epoch. */
  ts: number;
  /** Site/app the event belongs to, when configured. */
  siteId?: string;
  /** Campaign attribution, when a UTM context was provided. */
  campaign?: Campaign;
}

/** The narrow event-target surface the client uses to flush on unload. */
export interface UnloadTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

/** Options for {@link LiteClient}. */
export interface LiteClientOptions {
  /** Where batches go. Default: a no-op (collect nothing until you inject one). */
  transport?: Transport;
  /** Clock, injectable for tests. Default `Date.now`. */
  now?: () => number;
  /** Schedule a timer. Default `setTimeout`. */
  setTimer?: SetTimer;
  /** Cancel a timer. Default `clearTimeout`. */
  clearTimer?: ClearTimer;
  /** Flush automatically once this many events are queued. Default 10. */
  flushAt?: number;
  /** Flush on this interval (ms). `0`/omitted disables interval flushing. */
  flushInterval?: number;
  /** Hard cap on buffered events; oldest are dropped past it. Default 100. */
  maxQueueSize?: number;
  /** Consent flag. `undefined` = unknown (see `defaultConsent`). */
  consent?: boolean;
  /** Whether an enabled DNT signal blocks collection. Default `true`. */
  respectDNT?: boolean;
  /** Override DNT detection. Default: read from the browser when present. */
  dnt?: boolean;
  /** When consent is unknown, may we track? Default `true`. */
  defaultConsent?: boolean;
  /** Site/app id stamped onto every event. */
  siteId?: string;
  /** Campaign attribution stamped onto every event (e.g. from `parseUtm`). */
  campaign?: Campaign;
  /** Starting anonymous/session id. Default: generated (CSPRNG w/ fallback). */
  anonymousId?: string;
  /** Id generator. Default {@link randomId}. */
  genId?: () => string;
  /**
   * Event target used to flush on page unload. Default: `window` when present.
   * Pass `null` to disable, or a fake target in tests.
   */
  unloadTarget?: UnloadTarget | null;
}

const noopTransport: Transport = () => {};

function defaultUnloadTarget(): UnloadTarget | null {
  const w = (globalThis as { window?: UnloadTarget }).window;
  return w && typeof w.addEventListener === "function" ? w : null;
}

/**
 * A minimal batching, consent-aware analytics client. All I/O is injected;
 * nothing is sent until `flushAt`/`flushInterval`/unload triggers a flush or you
 * call `flush()`.
 */
export class LiteClient {
  private readonly transport: Transport;
  private readonly now: () => number;
  private readonly setTimer: SetTimer;
  private readonly clearTimer: ClearTimer;
  private readonly flushAt: number;
  private readonly flushInterval: number;
  private readonly maxQueueSize: number;
  private readonly respectDNT: boolean;
  private readonly defaultConsent: boolean;
  private readonly genId: () => string;
  private readonly siteId: string | undefined;
  private readonly campaign: Campaign | undefined;
  private readonly unloadTarget: UnloadTarget | null;

  private queue: LiteEvent[] = [];
  private _consent: boolean | undefined;
  private _dnt: boolean | undefined;
  private _anonymousId: string;
  private intervalTimer: TimerHandle | undefined;
  private readonly onUnload = () => {
    void Promise.resolve(this.flush()).catch(() => {});
  };

  constructor(options: LiteClientOptions = {}) {
    this.transport = options.transport ?? noopTransport;
    this.now = options.now ?? Date.now;
    this.setTimer =
      options.setTimer ??
      ((fn, ms) => (setTimeout as (fn: () => void, ms: number) => TimerHandle)(fn, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.flushAt = Math.max(1, options.flushAt ?? 10);
    this.flushInterval = options.flushInterval ?? 0;
    this.maxQueueSize = Math.max(1, options.maxQueueSize ?? 100);
    this.respectDNT = options.respectDNT ?? true;
    this.defaultConsent = options.defaultConsent ?? true;
    this.genId = options.genId ?? randomId;
    this.siteId = options.siteId;
    this.campaign = options.campaign;
    this._consent = options.consent;
    this._dnt = options.dnt ?? detectDNT();
    this._anonymousId = options.anonymousId ?? this.genId();
    this.unloadTarget =
      options.unloadTarget === undefined ? defaultUnloadTarget() : options.unloadTarget;

    if (this.flushInterval > 0) this.scheduleInterval();
    if (this.unloadTarget) {
      this.unloadTarget.addEventListener("pagehide", this.onUnload);
      this.unloadTarget.addEventListener("beforeunload", this.onUnload);
    }
  }

  /** Number of events currently buffered. */
  get queued(): number {
    return this.queue.length;
  }

  /** The current anonymous/session id. */
  get anonymousId(): string {
    return this._anonymousId;
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

  /** Record that something happened. */
  track(name: string, props: Record<string, unknown> = {}): this {
    return this.enqueue("track", name, props);
  }

  /** Record a page view. `name` is optional; extra props go in `props`. */
  page(name?: string, props: Record<string, unknown> = {}): this {
    return this.enqueue("page", name, props);
  }

  /** Send everything buffered as one batch, then clear the buffer. */
  flush(): void | Promise<void> {
    if (!this.enabled) return; // gated events were never buffered
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0, this.queue.length);
    return this.transport(batch);
  }

  /** Stop the interval timer and detach unload listeners. */
  close(): void {
    if (this.intervalTimer !== undefined) this.clearTimer(this.intervalTimer);
    this.intervalTimer = undefined;
    if (this.unloadTarget) {
      this.unloadTarget.removeEventListener("pagehide", this.onUnload);
      this.unloadTarget.removeEventListener("beforeunload", this.onUnload);
    }
  }

  private enqueue(type: LiteEventType, name: string | undefined, props: Record<string, unknown>): this {
    // Gate at ingest so blocked events are dropped before any buffering.
    if (!this.enabled) return this;

    const event: LiteEvent = {
      type,
      aid: this._anonymousId,
      ts: this.now(),
    };
    if (name !== undefined) event.name = name;
    if (props && Object.keys(props).length > 0) event.props = props;
    if (this.siteId !== undefined) event.siteId = this.siteId;
    if (this.campaign !== undefined) event.campaign = this.campaign;

    this.queue.push(event);
    if (this.queue.length > this.maxQueueSize) {
      this.queue.splice(0, this.queue.length - this.maxQueueSize);
    }

    if (this.queue.length >= this.flushAt) {
      void Promise.resolve(this.flush()).catch(() => {});
    }
    return this;
  }

  private scheduleInterval(): void {
    this.intervalTimer = this.setTimer(() => {
      void Promise.resolve(this.flush()).catch(() => {});
      if (this.flushInterval > 0) this.scheduleInterval();
    }, this.flushInterval);
  }
}

/** Factory mirror of {@link LiteClient}. */
export function createLiteClient(options?: LiteClientOptions): LiteClient {
  return new LiteClient(options);
}
