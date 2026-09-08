import { test, expect, vi } from "vitest";
import { createLiteClient, LiteClient, type UnloadTarget } from "./client";
import { createMemoryTransport } from "./transport";

/** A deterministic, hand-driven timer so interval flushing is testable. */
function fakeClock() {
  let seq = 1;
  const timers = new Map<number, { fn: () => void; ms: number }>();
  return {
    setTimer: (fn: () => void, ms: number) => {
      const id = seq++;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimer: (h: unknown) => {
      timers.delete(h as number);
    },
    /** Fire the most recently scheduled (still-pending) timer. */
    tick: () => {
      const ids = [...timers.keys()];
      const id = ids[ids.length - 1];
      if (id === undefined) return;
      const t = timers.get(id)!;
      timers.delete(id);
      t.fn();
    },
    pending: () => timers.size,
  };
}

/** A fake unload target that lets a test fire the unload handlers. */
function fakeUnloadTarget() {
  const listeners = new Map<string, Set<() => void>>();
  const target: UnloadTarget = {
    addEventListener: (type, fn) => {
      (listeners.get(type) ?? listeners.set(type, new Set()).get(type)!).add(fn);
    },
    removeEventListener: (type, fn) => {
      listeners.get(type)?.delete(fn);
    },
  };
  return {
    target,
    fire: (type: string) => listeners.get(type)?.forEach((fn) => fn()),
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

test("track and page build a minimal, consistent payload", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({
    transport: m.transport,
    now: () => 42,
    siteId: "acme",
    unloadTarget: null,
  });

  c.page("/pricing", { plan: "pro" });
  c.track("signup");
  c.flush();

  expect(m.events).toHaveLength(2);
  expect(m.events[0]).toMatchObject({
    type: "page",
    name: "/pricing",
    props: { plan: "pro" },
    siteId: "acme",
    ts: 42,
  });
  expect(m.events[1]).toMatchObject({ type: "track", name: "signup", ts: 42 });
  expect(m.events[1]!.props).toBeUndefined();
  // every event carries the same anonymous id
  expect(m.events[0]!.aid).toBe(c.anonymousId);
  expect(m.events[1]!.aid).toBe(c.anonymousId);
});

test("flushes automatically at flushAt size", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({ transport: m.transport, flushAt: 3, unloadTarget: null });
  c.track("a");
  c.track("b");
  expect(m.batches).toHaveLength(0);
  c.track("c");
  expect(m.batches).toHaveLength(1);
  expect(m.events).toHaveLength(3);
  expect(c.queued).toBe(0);
});

test("flushes on the injected interval timer", () => {
  const m = createMemoryTransport();
  const clock = fakeClock();
  const c = createLiteClient({
    transport: m.transport,
    flushInterval: 1000,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    unloadTarget: null,
  });
  c.track("a");
  expect(m.batches).toHaveLength(0);
  clock.tick();
  expect(m.events.map((e) => e.name)).toEqual(["a"]);
  // interval reschedules itself
  c.track("b");
  clock.tick();
  expect(m.events.map((e) => e.name)).toEqual(["a", "b"]);
  c.close();
});

test("flushes on page unload (pagehide)", () => {
  const m = createMemoryTransport();
  const u = fakeUnloadTarget();
  const c = createLiteClient({ transport: m.transport, unloadTarget: u.target });
  c.track("a");
  expect(m.batches).toHaveLength(0);
  u.fire("pagehide");
  expect(m.events.map((e) => e.name)).toEqual(["a"]);
});

test("close() detaches the unload listeners", () => {
  const m = createMemoryTransport();
  const u = fakeUnloadTarget();
  const c = createLiteClient({ transport: m.transport, unloadTarget: u.target });
  expect(u.count("pagehide")).toBe(1);
  c.close();
  expect(u.count("pagehide")).toBe(0);
  u.fire("pagehide");
  expect(m.batches).toHaveLength(0);
});

test("drops events when consent is explicitly false", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({ transport: m.transport, consent: false, unloadTarget: null });
  c.track("a");
  c.page("/x");
  c.flush();
  expect(m.events).toHaveLength(0);
  expect(c.queued).toBe(0);
  expect(c.enabled).toBe(false);
});

test("drops events when DNT is on and respected", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({ transport: m.transport, dnt: true, unloadTarget: null });
  c.track("a");
  c.flush();
  expect(m.events).toHaveLength(0);
});

test("respects DNT override so tracking resumes", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({
    transport: m.transport,
    dnt: true,
    respectDNT: false,
    unloadTarget: null,
  });
  c.track("a");
  c.flush();
  expect(m.events).toHaveLength(1);
});

test("setConsent re-enables collection at runtime", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({ transport: m.transport, consent: false, unloadTarget: null });
  c.track("dropped");
  c.setConsent(true).track("kept");
  c.flush();
  expect(m.events.map((e) => e.name)).toEqual(["kept"]);
});

test("honours maxQueueSize by dropping the oldest events", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({
    transport: m.transport,
    flushAt: 999,
    maxQueueSize: 2,
    unloadTarget: null,
  });
  c.track("a");
  c.track("b");
  c.track("c");
  expect(c.queued).toBe(2);
  c.flush();
  expect(m.events.map((e) => e.name)).toEqual(["b", "c"]);
});

test("accepts a preset anonymousId and a custom genId", () => {
  const c1 = createLiteClient({ anonymousId: "fixed-id", unloadTarget: null });
  expect(c1.anonymousId).toBe("fixed-id");
  const c2 = createLiteClient({ genId: () => "gen-id", unloadTarget: null });
  expect(c2.anonymousId).toBe("gen-id");
});

test("stamps campaign context onto events", () => {
  const m = createMemoryTransport();
  const c = createLiteClient({
    transport: m.transport,
    campaign: { source: "google", medium: "cpc" },
    unloadTarget: null,
  });
  c.page("/");
  c.flush();
  expect(m.events[0]!.campaign).toEqual({ source: "google", medium: "cpc" });
});

test("createLiteClient returns a LiteClient instance", () => {
  expect(createLiteClient({ unloadTarget: null })).toBeInstanceOf(LiteClient);
});
