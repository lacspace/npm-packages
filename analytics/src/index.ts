/**
 * @lacspace/analytics — event tracking for Lacspace platforms, built on
 * `@lacspace/api`. Send events immediately, or queue them and flush in a
 * single batch (useful for offline-first and reducing request volume).
 */

import { LacspaceApi, type LacspaceApiOptions } from "@lacspace/api";

export interface AnalyticsEvent {
  name: string;
  data?: Record<string, unknown>;
  /** Unix epoch (ms). Set automatically when omitted. */
  ts?: number;
}

export interface LacspaceAnalyticsOptions extends LacspaceApiOptions {
  /** Reuse an existing api client instead of creating a new one. */
  api?: LacspaceApi;
  /** Override endpoint paths to match your backend. */
  endpoints?: { track?: string; batch?: string };
}

export class LacspaceAnalytics {
  readonly api: LacspaceApi;
  private readonly trackPath: string;
  private readonly batchPath: string;
  private queue: AnalyticsEvent[] = [];

  constructor(options: LacspaceAnalyticsOptions = {}) {
    this.api = options.api ?? new LacspaceApi(options);
    this.trackPath = options.endpoints?.track ?? "analytics/events";
    this.batchPath = options.endpoints?.batch ?? "analytics/batch";
  }

  /** Send a single event immediately. */
  track(name: string, data: Record<string, unknown> = {}): Promise<void> {
    return this.api.post<void>(this.trackPath, { name, data, ts: Date.now() });
  }

  /** Send many events in one request. */
  batch(events: AnalyticsEvent[]): Promise<void> {
    const stamped = events.map((e) => (e.ts === undefined ? { ...e, ts: Date.now() } : e));
    return this.api.post<void>(this.batchPath, { events: stamped });
  }

  /** Add an event to the in-memory queue without sending it yet. */
  queueEvent(name: string, data: Record<string, unknown> = {}): this {
    this.queue.push({ name, data, ts: Date.now() });
    return this;
  }

  /** Send everything currently queued in a single batch, then clear the queue. */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;
    const events = this.queue.splice(0, this.queue.length);
    await this.batch(events);
  }

  /** Number of events waiting in the queue. */
  get pending(): number {
    return this.queue.length;
  }
}

export function createAnalytics(options?: LacspaceAnalyticsOptions): LacspaceAnalytics {
  return new LacspaceAnalytics(options);
}

export default LacspaceAnalytics;
