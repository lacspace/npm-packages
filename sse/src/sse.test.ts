import { describe, it, expect, vi } from "vitest";
import { formatSSE, createSSEStream, sseHandler, SSEHub, type NodeResponseLike } from "./index";

describe("formatSSE", () => {
  it("serializes data as JSON with a trailing blank line", () => {
    expect(formatSSE({ data: { a: 1 } })).toBe('data: {"a":1}\n\n');
  });

  it("includes event, id and retry fields when present", () => {
    expect(formatSSE({ event: "ping", id: 7, retry: 3000, data: "hi" })).toBe(
      "event: ping\nid: 7\nretry: 3000\ndata: hi\n\n",
    );
  });

  it("splits multi-line data across multiple data: lines", () => {
    expect(formatSSE({ data: "line1\nline2" })).toBe("data: line1\ndata: line2\n\n");
  });
});

describe("createSSEStream", () => {
  it("returns a Response with SSE headers and streams encoded messages", async () => {
    const { response, client } = createSSEStream();
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-cache");

    const reader = response.body!.getReader();
    client.send({ event: "hello", data: { n: 1 } });
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    expect(text).toBe('event: hello\ndata: {"n":1}\n\n');

    client.close();
    expect(client.closed).toBe(true);
  });

  it("calls onClose when the stream is cancelled", async () => {
    const onClose = vi.fn();
    const { response } = createSSEStream({ onClose });
    await response.body!.cancel();
    expect(onClose).toHaveBeenCalled();
  });
});

describe("sseHandler (Node/Express)", () => {
  it("sets headers and writes formatted messages, closing on res close", () => {
    const writes: string[] = [];
    let closeCb: (() => void) | null = null;
    const headers: Record<string, string> = {};
    const res: NodeResponseLike = {
      setHeader: (k, v) => { headers[k] = v; },
      write: (chunk) => { writes.push(chunk); return true; },
      end: () => {},
      on: (_e, cb) => { closeCb = cb; },
    };
    const client = sseHandler(res);
    expect(headers["Content-Type"]).toContain("text/event-stream");
    client.send({ data: "x" });
    expect(writes).toEqual(["data: x\n\n"]);

    closeCb!(); // simulate the client disconnecting
    expect(client.closed).toBe(true);
    client.send({ data: "y" }); // ignored after close
    expect(writes).toEqual(["data: x\n\n"]);
  });
});

describe("SSEHub", () => {
  function fakeClient() {
    const sent: unknown[] = [];
    let closed = false;
    return {
      client: {
        id: Math.random().toString(36),
        get closed() { return closed; },
        send: (m: unknown) => sent.push(m),
        close: () => { closed = true; },
      },
      sent,
      kill: () => { closed = true; },
    };
  }

  it("publishes to a channel and counts recipients", () => {
    const hub = new SSEHub();
    const a = fakeClient();
    const b = fakeClient();
    hub.add(a.client, ["room"]);
    hub.add(b.client, ["other"]);
    const n = hub.publish("room", { data: "hey" });
    expect(n).toBe(1);
    expect(a.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(0);
  });

  it("broadcasts to everyone", () => {
    const hub = new SSEHub();
    const a = fakeClient();
    const b = fakeClient();
    hub.add(a.client);
    hub.add(b.client);
    expect(hub.broadcast({ data: 1 })).toBe(2);
    expect(hub.size()).toBe(2);
  });

  it("prunes dead clients as it publishes", () => {
    const hub = new SSEHub();
    const a = fakeClient();
    hub.add(a.client, ["room"]);
    a.kill();
    expect(hub.publish("room", { data: "x" })).toBe(0);
    expect(hub.size("room")).toBe(0);
    expect(hub.size()).toBe(0);
  });

  it("join/leave adjust channel membership", () => {
    const hub = new SSEHub();
    const a = fakeClient();
    hub.add(a.client);
    hub.join(a.client, "room");
    expect(hub.size("room")).toBe(1);
    hub.leave(a.client, "room");
    expect(hub.size("room")).toBe(0);
  });
});
