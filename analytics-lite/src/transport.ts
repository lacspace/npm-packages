/**
 * @lacspace/analytics-lite — transports.
 *
 * A transport receives a batch of events and delivers it somewhere. Everything
 * that touches the network or the browser is injectable, so tests never hit the
 * real network. Zero dependencies, isomorphic.
 */

import type { LiteEvent } from "./client";

/** Receives a batch of events. May throw/reject to signal a failed send. */
export type Transport = (events: LiteEvent[]) => void | Promise<void>;

/** Injectable `navigator.sendBeacon`-shaped function. */
export type SendBeacon = (url: string, data: string) => boolean;

/** Options for {@link createBeaconTransport}. */
export interface BeaconTransportOptions {
  /**
   * `sendBeacon`-shaped function. Default: `navigator.sendBeacon` bound to
   * `navigator` when available. Injectable so tests never touch the browser.
   */
  sendBeacon?: SendBeacon;
  /** `fetch` fallback used when the beacon is missing or refuses the payload. */
  fetchImpl?: typeof fetch;
  /** Extra headers for the `fetch` fallback. */
  headers?: Record<string, string>;
}

function defaultSendBeacon(): SendBeacon | undefined {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav && typeof nav.sendBeacon === "function") {
    return (url, data) => {
      try {
        const blob = new Blob([data], { type: "application/json" });
        return nav.sendBeacon(url, blob);
      } catch {
        return false;
      }
    };
  }
  return undefined;
}

/**
 * A transport that POSTs a batch to `endpoint`, preferring `sendBeacon` (so
 * events survive page unload) and falling back to `fetch` with `keepalive`.
 * Both the beacon and the fetch are injectable for tests.
 */
export function createBeaconTransport(
  endpoint: string,
  options: BeaconTransportOptions = {},
): Transport {
  const beacon = options.sendBeacon ?? defaultSendBeacon();
  const fetchImpl =
    options.fetchImpl ?? (globalThis as { fetch?: typeof fetch }).fetch;

  return (events: LiteEvent[]) => {
    if (events.length === 0) return;
    const body = JSON.stringify(events);

    if (beacon) {
      let ok = false;
      try {
        ok = beacon(endpoint, body);
      } catch {
        ok = false;
      }
      if (ok) return;
    }

    if (!fetchImpl) return; // nowhere to send — drop rather than throw
    return Promise.resolve(
      fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", ...options.headers },
        body,
        keepalive: true,
        credentials: "omit",
      }),
    ).then(
      () => {},
      () => {
        /* swallow — analytics must never break the app */
      },
    );
  };
}

/** A transport that collects batches in memory — handy for tests and dev. */
export interface MemoryTransport {
  transport: Transport;
  /** Every event received, flattened across batches. */
  readonly events: LiteEvent[];
  /** Each batch as it arrived. */
  readonly batches: LiteEvent[][];
}

/** Create a {@link MemoryTransport}. */
export function createMemoryTransport(): MemoryTransport {
  const events: LiteEvent[] = [];
  const batches: LiteEvent[][] = [];
  return {
    events,
    batches,
    transport(batch) {
      batches.push(batch);
      for (const e of batch) events.push(e);
    },
  };
}
