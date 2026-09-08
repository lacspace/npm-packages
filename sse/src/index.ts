/**
 * @lacspace/sse — real-time updates over Server-Sent Events, zero dependencies.
 *
 * SSE is the simplest way to push live data from your server to the browser: one
 * long-lived HTTP response, plain text, auto-reconnect built into the browser. No
 * WebSocket upgrade, no socket server, no dependencies.
 *
 * This module is the SERVER half. It works two ways:
 *   - Web standard (`createSSEStream`) → returns a `Response` for Next.js route
 *     handlers, Deno, Bun, Cloudflare Workers, Vercel Edge.
 *   - Node/Express (`sseHandler`) → binds to a `res` object.
 * A small `SSEHub` fans messages out to many clients across named channels.
 *
 * The browser half lives in `@lacspace/sse/client` (and `/react`).
 */

/** One SSE message. `data` is JSON-stringified unless it's already a string. */
export interface SSEMessage {
  data: unknown;
  /** Named event type — the browser listens for it with `addEventListener(name)`. */
  event?: string;
  /** Message id — the browser echoes it as `Last-Event-ID` on reconnect. */
  id?: string | number;
  /** Tell the browser how long to wait before reconnecting (ms). */
  retry?: number;
}

/** A connected client you can `send` to. Both transports return one of these. */
export interface SSEClient {
  readonly id: string;
  send(message: SSEMessage): void;
  close(): void;
  readonly closed: boolean;
}

const encoder = new TextEncoder();
let counter = 0;
function genId(): string {
  counter += 1;
  return `c${Date.now().toString(36)}-${counter}`;
}

/**
 * Format one message as the SSE wire protocol. Multi-line data is split across
 * multiple `data:` lines per the spec. Exported for testing / custom transports.
 */
export function formatSSE(message: SSEMessage): string {
  let out = "";
  if (message.event) out += `event: ${message.event}\n`;
  if (message.id !== undefined) out += `id: ${message.id}\n`;
  if (typeof message.retry === "number") out += `retry: ${message.retry}\n`;
  const data = typeof message.data === "string" ? message.data : JSON.stringify(message.data);
  for (const line of data.split("\n")) out += `data: ${line}\n`;
  return `${out}\n`;
}

const SSE_HEADERS: Record<string, string> = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // Disable proxy buffering (nginx) so events flush immediately.
  "X-Accel-Buffering": "no",
};

export interface SSEStreamOptions {
  /** Called when the client disconnects (tab closed, navigated away). */
  onClose?: () => void;
  /** Extra response headers (e.g. CORS). */
  headers?: Record<string, string>;
}

/**
 * Web-standard SSE stream. Return `response` from a Next.js route handler (or any
 * Fetch-API server), and use `client.send(...)` to push messages.
 *
 * @example
 * export async function GET() {
 *   const { response, client } = createSSEStream();
 *   hub.add(client, ["room:general"]);
 *   return response;
 * }
 */
export function createSSEStream(options: SSEStreamOptions = {}): { response: Response; client: SSEClient } {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    options.onClose?.();
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      finish();
    },
  });

  const client: SSEClient = {
    id: genId(),
    get closed() {
      return closed;
    },
    send(message) {
      if (closed || !controller) return;
      try {
        controller.enqueue(encoder.encode(formatSSE(message)));
      } catch {
        finish();
      }
    },
    close() {
      if (closed) return;
      try {
        controller?.close();
      } catch {
        /* already closed */
      }
      finish();
    },
  };

  const response = new Response(stream, { headers: { ...SSE_HEADERS, ...options.headers } });
  return { response, client };
}

/** The bits of a Node `http.ServerResponse` we need — so we don't depend on @types/node. */
export interface NodeResponseLike {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  on(event: "close", listener: () => void): void;
  flushHeaders?(): void;
}

/**
 * Node / Express SSE. Call it with `res`, get back a client to `send` to.
 *
 * @example
 * app.get("/events", (req, res) => {
 *   const client = sseHandler(res);
 *   hub.add(client, ["room:general"]);
 * });
 */
export function sseHandler(res: NodeResponseLike, options: { onClose?: () => void } = {}): SSEClient {
  for (const [k, v] of Object.entries(SSE_HEADERS)) res.setHeader(k, v);
  res.flushHeaders?.();

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    options.onClose?.();
  };

  res.on("close", finish);

  return {
    id: genId(),
    get closed() {
      return closed;
    },
    send(message) {
      if (closed) return;
      try {
        res.write(formatSSE(message));
      } catch {
        finish();
      }
    },
    close() {
      if (closed) return;
      try {
        res.end();
      } catch {
        /* already ended */
      }
      finish();
    },
  };
}

/**
 * Fan messages out to many clients across named channels (rooms). Add each new
 * client, then `publish` to a channel or `broadcast` to everyone. Dead clients are
 * pruned automatically as you publish.
 */
export class SSEHub {
  private readonly everyone = new Set<SSEClient>();
  private readonly channels = new Map<string, Set<SSEClient>>();

  /** Register a client, optionally joining it to some channels. */
  add(client: SSEClient, channels: string[] = []): void {
    this.everyone.add(client);
    for (const channel of channels) this.join(client, channel);
  }

  /** Remove a client from everything. */
  remove(client: SSEClient): void {
    this.everyone.delete(client);
    for (const set of this.channels.values()) set.delete(client);
  }

  join(client: SSEClient, channel: string): void {
    let set = this.channels.get(channel);
    if (!set) {
      set = new Set();
      this.channels.set(channel, set);
    }
    set.add(client);
  }

  leave(client: SSEClient, channel: string): void {
    this.channels.get(channel)?.delete(client);
  }

  /** Send to every client in a channel. Returns how many actually received it. */
  publish(channel: string, message: SSEMessage): number {
    const set = this.channels.get(channel);
    if (!set) return 0;
    let sent = 0;
    for (const client of [...set]) {
      if (client.closed) this.remove(client);
      else {
        client.send(message);
        sent += 1;
      }
    }
    return sent;
  }

  /** Send to every connected client. Returns how many received it. */
  broadcast(message: SSEMessage): number {
    let sent = 0;
    for (const client of [...this.everyone]) {
      if (client.closed) this.remove(client);
      else {
        client.send(message);
        sent += 1;
      }
    }
    return sent;
  }

  /** Connected client count — total, or for one channel. */
  size(channel?: string): number {
    return channel ? (this.channels.get(channel)?.size ?? 0) : this.everyone.size;
  }

  /**
   * Send a periodic comment/ping so proxies and load balancers don't drop idle
   * connections. Returns a stop function.
   */
  startHeartbeat(intervalMs = 15000): () => void {
    const timer = setInterval(() => this.broadcast({ event: "ping", data: Date.now() }), intervalMs);
    // Don't keep the Node process alive just for the heartbeat.
    (timer as unknown as { unref?: () => void }).unref?.();
    return () => clearInterval(timer);
  }
}
