import { test, expect } from "vitest";
import {
  AnalyticsClient,
  createAnalyticsClient,
  createMemoryTransport,
  parseUtm,
  type AnalyticsEnvelope,
  type TimerHandle,
} from "./client";

/** A deterministic clock + captured-timer harness (no real timers). */
function harness(startTime = 1000) {
  let t = startTime;
  let seq = 0;
  const timers = new Map<number, () => void>();
  return {
    now: () => t,
    advance: (ms: number) => (t += ms),
    setTimer: (fn: () => void): TimerHandle => {
      const id = ++seq;
      timers.set(id, fn);
      return id;
    },
    clearTimer: (h: TimerHandle) => timers.delete(h as number),
    pending: () => timers.size,
    /** Run every currently-scheduled timer once (snapshot; ignores re-schedules). */
    runAll: () => {
      const fns = [...timers.entries()];
      for (const [id] of fns) timers.delete(id);
      for (const [, fn] of fns) fn();
    },
  };
}

/** Sequential ids so envelopes are deterministic. */
function ids() {
  let n = 0;
  return () => `id${++n}`;
}

const flushMicrotasks = () => Promise.resolve().then(() => Promise.resolve());

test("track builds a well-formed envelope with consistent context", async () => {
  const h = harness(1234);
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({
    transport: mem.transport,
    now: h.now,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
    genId: ids(),
    consent: true,
    anonymousId: "anon-1",
  });

  a.track("product_viewed", { id: "p_1", price: 499 });
  await a.flush();

  expect(mem.events).toHaveLength(1);
  const e = mem.events[0] as AnalyticsEnvelope;
  expect(e.type).toBe("track");
  expect(e.event).toBe("product_viewed");
  expect(e.properties).toEqual({ id: "p_1", price: 499 });
  expect(e.anonymousId).toBe("anon-1");
  expect(e.timestamp).toBe(1234);
  expect(e.messageId).toBe("id1");
  expect(e.context.library).toEqual({ name: "@lacspace/analytics", version: "2.1.0" });
  expect(e.context.consent).toBe(true);
});

test("identify sets userId and later events carry it", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({ transport: mem.transport, consent: true, genId: ids() });
  a.identify("u_9", { plan: "pro" });
  a.track("clicked");
  await a.flush();

  const [id, trk] = mem.events as AnalyticsEnvelope[];
  expect(id!.type).toBe("identify");
  expect(id!.userId).toBe("u_9");
  expect(id!.traits).toEqual({ plan: "pro" });
  expect(trk!.userId).toBe("u_9");
  expect(a.userId).toBe("u_9");
});

test("page, screen, group and alias each build the right envelope", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({ transport: mem.transport, consent: true, anonymousId: "anon" });
  a.page("Pricing", { path: "/pricing" });
  a.screen("Home");
  a.group("org_1", { name: "Acme" });
  a.alias("u_2");
  await a.flush();

  const [pg, sc, gr, al] = mem.events as AnalyticsEnvelope[];
  expect(pg!.type).toBe("page");
  expect(pg!.name).toBe("Pricing");
  expect(pg!.properties).toEqual({ path: "/pricing" });
  expect(sc!.type).toBe("screen");
  expect(sc!.name).toBe("Home");
  expect(gr!.type).toBe("group");
  expect(gr!.groupId).toBe("org_1");
  expect(al!.type).toBe("alias");
  expect(al!.userId).toBe("u_2");
  expect(al!.previousId).toBe("anon"); // fell back to the anonymousId
});

test("batching flushes automatically at flushAt (by size)", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({ transport: mem.transport, consent: true, flushAt: 3 });
  a.track("a");
  a.track("b");
  expect(mem.events).toHaveLength(0); // below threshold
  a.track("c"); // hits flushAt → auto flush
  await flushMicrotasks();

  expect(mem.batches).toHaveLength(1);
  expect(mem.events).toHaveLength(3);
  expect(a.queued).toBe(0);
});

test("batching flushes on the interval via the injected clock/timer", async () => {
  const h = harness();
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({
    transport: mem.transport,
    consent: true,
    flushAt: 100, // never hit by size
    flushInterval: 5000,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
    now: h.now,
  });
  a.track("a");
  a.track("b");
  expect(mem.events).toHaveLength(0);

  h.runAll(); // fire the interval timer
  await flushMicrotasks();

  expect(mem.events).toHaveLength(2);
  expect(h.pending()).toBeGreaterThan(0); // interval re-scheduled itself
  a.close();
});

test("offline: a failed send re-buffers events and a retry re-sends them", async () => {
  const h = harness();
  let online = false;
  const received: AnalyticsEnvelope[] = [];
  const a = new AnalyticsClient({
    transport: async (batch) => {
      if (!online) throw new Error("offline");
      for (const e of batch) received.push(e);
    },
    consent: true,
    setTimer: h.setTimer,
    clearTimer: h.clearTimer,
    now: h.now,
  });

  a.track("purchase", { id: "p_1" });
  await expect(a.flush()).rejects.toThrow("offline");
  expect(a.queued).toBe(1); // nothing lost
  expect(h.pending()).toBe(1); // a retry was scheduled

  online = true;
  h.runAll(); // fire the retry
  await flushMicrotasks();

  expect(received).toHaveLength(1);
  expect(received[0]!.event).toBe("purchase");
  expect(a.queued).toBe(0);
});

test("consent off drops events by default", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({ transport: mem.transport, consent: false });
  a.track("blocked");
  expect(a.queued).toBe(0);
  await a.flush();
  expect(mem.events).toHaveLength(0);
});

test("Do-Not-Track blocks even with consent granted", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({ transport: mem.transport, consent: true, dnt: true });
  expect(a.enabled).toBe(false);
  a.track("blocked");
  expect(a.queued).toBe(0);
});

test("whenBlocked: 'hold' buffers until consent is granted", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({
    transport: mem.transport,
    consent: false,
    whenBlocked: "hold",
  });
  a.track("later");
  expect(a.queued).toBe(1); // held, not dropped
  await a.flush();
  expect(mem.events).toHaveLength(0); // still blocked, nothing sent

  a.setConsent(true);
  await a.flush();
  expect(mem.events).toHaveLength(1);
});

test("middleware can transform and redact events before send", async () => {
  const mem = createMemoryTransport();
  const a = new AnalyticsClient({
    transport: mem.transport,
    consent: true,
    middleware: [
      (e) => {
        if (e.properties?.email) e.properties.email = "[redacted]";
        return e;
      },
      (e) => (e.event === "secret" ? null : e), // drop "secret" events entirely
    ],
  });
  a.track("signup", { email: "a@b.com" });
  a.track("secret", { x: 1 });
  await a.flush();

  expect(mem.events).toHaveLength(1);
  expect(mem.events[0]!.event).toBe("signup");
  expect(mem.events[0]!.properties).toEqual({ email: "[redacted]" });
});

test("UTM campaign context can be attached from a URL", async () => {
  const mem = createMemoryTransport();
  const campaign = parseUtm("https://lacspace.com/?utm_source=hn&utm_campaign=launch");
  const a = new AnalyticsClient({
    transport: mem.transport,
    consent: true,
    context: { campaign },
  });
  a.track("visited");
  await a.flush();
  expect(mem.events[0]!.context.campaign).toEqual({ source: "hn", name: "launch" });
});

test("the buffer is capped at maxQueueSize (oldest dropped)", () => {
  const a = new AnalyticsClient({ consent: false, whenBlocked: "hold", maxQueueSize: 2 });
  a.track("1");
  a.track("2");
  a.track("3");
  expect(a.queued).toBe(2);
});

test("createAnalyticsClient is a factory mirror and flush is a no-op when empty", async () => {
  const a = createAnalyticsClient({ consent: true });
  expect(a).toBeInstanceOf(AnalyticsClient);
  await expect(a.flush()).resolves.toBeUndefined();
});
