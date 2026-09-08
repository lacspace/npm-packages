/**
 * @lacspace/sse/client — the browser half.
 *
 * A thin, typed wrapper over the native `EventSource`. The browser already
 * auto-reconnects; this adds JSON parsing, named-event handlers and a clean
 * connection state, without any dependency.
 */

export interface ConnectOptions {
  /** Handler for default (unnamed) `message` events. */
  onMessage?: (data: unknown, event: MessageEvent) => void;
  /** Handlers keyed by event name (matches `SSEMessage.event` on the server). */
  onEvent?: Record<string, (data: unknown, event: MessageEvent) => void>;
  onOpen?: () => void;
  onError?: (event: Event) => void;
  /** Send cookies with the request (cross-origin). */
  withCredentials?: boolean;
  /** JSON.parse incoming data. Default true; set false to keep raw strings. */
  parseJSON?: boolean;
}

export interface SSEConnection {
  readonly url: string;
  /** The underlying EventSource, if you need it. */
  readonly source: EventSource;
  close(): void;
}

/**
 * Connect to an SSE endpoint.
 *
 * @example
 * const conn = connectSSE("/events", {
 *   onEvent: { notification: (n) => toast(n.message) },
 * });
 * // later: conn.close();
 */
export function connectSSE(url: string, options: ConnectOptions = {}): SSEConnection {
  const source = new EventSource(url, { withCredentials: options.withCredentials ?? false });

  const parse = (raw: string): unknown => {
    if (options.parseJSON === false) return raw;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  if (options.onOpen) source.onopen = () => options.onOpen!();
  if (options.onError) source.onerror = (event) => options.onError!(event);
  if (options.onMessage) {
    source.onmessage = (event) => options.onMessage!(parse(event.data), event);
  }
  if (options.onEvent) {
    for (const [name, handler] of Object.entries(options.onEvent)) {
      source.addEventListener(name, (event) => handler(parse((event as MessageEvent).data), event as MessageEvent));
    }
  }

  return {
    url,
    source,
    close: () => source.close(),
  };
}

/** True if this browser supports Server-Sent Events. */
export function isSSESupported(): boolean {
  return typeof EventSource !== "undefined";
}
