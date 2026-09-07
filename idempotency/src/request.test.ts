import { test, expect } from "vitest";
import {
  Idempotency,
  MemoryIdempotencyStore,
  IdempotencyKeyReuseError,
  fingerprintRequest,
  withIdempotency,
  sweep,
  type IdempotentResponse,
  type IdempotencyStore,
} from "./index";

/* ------------------------------ fingerprintRequest ------------------------------ */

test("fingerprintRequest is stable and order-independent over the body", () => {
  const a = fingerprintRequest({ method: "POST", path: "/orders", body: { x: 1, y: 2 } });
  const b = fingerprintRequest({ method: "POST", path: "/orders", body: { y: 2, x: 1 } });
  expect(a).toBe(b);
});

test("fingerprintRequest changes when the method changes", () => {
  const a = fingerprintRequest({ method: "POST", path: "/orders", body: { x: 1 } });
  const b = fingerprintRequest({ method: "PUT", path: "/orders", body: { x: 1 } });
  expect(a).not.toBe(b);
});

test("fingerprintRequest changes when the path or body changes", () => {
  const base = fingerprintRequest({ method: "POST", path: "/orders", body: { x: 1 } });
  expect(fingerprintRequest({ method: "POST", path: "/carts", body: { x: 1 } })).not.toBe(base);
  expect(fingerprintRequest({ method: "POST", path: "/orders", body: { x: 2 } })).not.toBe(base);
});

test("fingerprintRequest normalises method case and falls back to url", () => {
  const lower = fingerprintRequest({ method: "post", url: "/orders", body: null });
  const upper = fingerprintRequest({ method: "POST", path: "/orders", body: null });
  expect(lower).toBe(upper);
});

test("fingerprintRequest defaults method to GET and body to null", () => {
  expect(fingerprintRequest({ path: "/health" })).toBe(
    fingerprintRequest({ method: "GET", path: "/health", body: null }),
  );
});

/* ------------------------------ withIdempotency: replay ------------------------------ */

test("withIdempotency runs the handler once and replays the stored response", async () => {
  const store = new MemoryIdempotencyStore();
  let calls = 0;
  const req = { method: "POST", path: "/pay", body: { amount: 100 } };
  const handler = async (): Promise<IdempotentResponse<{ id: string }>> => {
    calls++;
    return { status: 201, body: { id: "charge_1" }, headers: { "x-run": String(calls) } };
  };

  const first = await withIdempotency("k-pay", req, handler, { store });
  expect(first.replayed).toBe(false);
  expect(first.response.status).toBe(201);
  expect(first.response.body).toEqual({ id: "charge_1" });

  const second = await withIdempotency("k-pay", req, handler, { store });
  expect(second.replayed).toBe(true);
  expect(second.response.body).toEqual({ id: "charge_1" });
  expect(second.response.headers).toEqual({ "x-run": "1" });
  expect(calls).toBe(1);
});

test("withIdempotency rejects the same key reused with a different request", async () => {
  const store = new MemoryIdempotencyStore();
  const handler = async (): Promise<IdempotentResponse<string>> => ({ status: 200, body: "ok" });

  await withIdempotency("k-1", { method: "POST", path: "/orders", body: { a: 1 } }, handler, { store });

  await expect(
    withIdempotency("k-1", { method: "POST", path: "/orders", body: { a: 2 } }, handler, { store }),
  ).rejects.toBeInstanceOf(IdempotencyKeyReuseError);
});

test("withIdempotency de-dupes concurrent same-key requests (single execution)", async () => {
  const store = new MemoryIdempotencyStore();
  let calls = 0;
  const req = { method: "POST", path: "/send", body: { to: "a@b.c" } };
  const handler = async (): Promise<IdempotentResponse<number>> => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return { status: 202, body: calls };
  };

  const [a, b] = await Promise.all([
    withIdempotency("k-cc", req, handler, { store }),
    withIdempotency("k-cc", req, handler, { store }),
  ]);
  expect(calls).toBe(1);
  expect(a.response.body).toBe(1);
  expect(b.response.body).toBe(1);
  expect([a.replayed, b.replayed].filter((x) => x === false).length).toBe(1);
});

test("withIdempotency accepts an explicit fingerprint override", async () => {
  const store = new MemoryIdempotencyStore();
  const handler = async (): Promise<IdempotentResponse<string>> => ({ status: 200, body: "v" });
  // Different bodies but a pinned identical fingerprint → treated as the same request.
  await withIdempotency("k-fp", { method: "POST", path: "/x", body: { a: 1 } }, handler, {
    store,
    fingerprint: "pinned",
  });
  const r = await withIdempotency("k-fp", { method: "POST", path: "/x", body: { a: 999 } }, handler, {
    store,
    fingerprint: "pinned",
  });
  expect(r.replayed).toBe(true);
});

test("withIdempotency waits for an in-progress key on another engine (cross-instance)", async () => {
  const store = new MemoryIdempotencyStore();
  const engineA = new Idempotency({ store });
  const engineB = new Idempotency({ store });
  const req = { method: "POST", path: "/pay", body: { amount: 5 } };
  const slow = async (): Promise<IdempotentResponse<string>> => {
    await new Promise((r) => setTimeout(r, 40));
    return { status: 200, body: "done" };
  };

  const first = withIdempotency("k-wait", req, slow, { idempotency: engineA });
  await new Promise((r) => setTimeout(r, 5)); // let A claim the key in the store
  const waiter = withIdempotency("k-wait", req, slow, {
    idempotency: engineB,
    onConflict: "wait",
    pollIntervalMs: 5,
  });

  const [a, b] = await Promise.all([first, waiter]);
  expect(a.response.body).toBe("done");
  expect(b.response.body).toBe("done");
  expect(b.replayed).toBe(true);
});

test("withIdempotency uses the engine/store passed via opts.idempotency", async () => {
  const store = new MemoryIdempotencyStore();
  const engine = new Idempotency({ store });
  const handler = async (): Promise<IdempotentResponse<string>> => ({ status: 200, body: "z" });
  await withIdempotency("k-eng", { method: "GET", path: "/z" }, handler, { idempotency: engine });
  expect(await store.get("k-eng")).toBeTruthy();
});

test("withIdempotency does not cache a failed handler by default (retryable)", async () => {
  const store = new MemoryIdempotencyStore();
  let calls = 0;
  const req = { method: "POST", path: "/flaky", body: {} };
  const handler = async (): Promise<IdempotentResponse<string>> => {
    calls++;
    if (calls === 1) throw new Error("boom");
    return { status: 200, body: "recovered" };
  };
  await expect(withIdempotency("k-flaky", req, handler, { store })).rejects.toThrow("boom");
  const r = await withIdempotency("k-flaky", req, handler, { store });
  expect(r.response.body).toBe("recovered");
  expect(calls).toBe(2);
});

/* ------------------------------ TTL + sweep ------------------------------ */

test("MemoryIdempotencyStore.sweep prunes expired records and keeps live ones", () => {
  const store = new MemoryIdempotencyStore(1000);
  const rec = { status: "completed" as const, value: 1, createdAt: Date.now() };
  store.set("old", rec);
  store.set("new", rec);
  expect(store.size).toBe(2);
  // Prune as if far in the future — both expired at now+2000.
  expect(store.sweep(Date.now() + 2000)).toBe(2);
  expect(store.size).toBe(0);
});

test("MemoryIdempotencyStore.sweep leaves unexpired records untouched", () => {
  const store = new MemoryIdempotencyStore(10_000);
  store.set("a", { status: "completed", value: 1, createdAt: Date.now() });
  expect(store.sweep(Date.now())).toBe(0);
  expect(store.size).toBe(1);
});

test("sweep() helper delegates to the store and returns the pruned count", async () => {
  const store = new MemoryIdempotencyStore(500);
  store.set("k", { status: "completed", value: 1, createdAt: Date.now() });
  expect(await sweep(store, Date.now() + 1000)).toBe(1);
});

test("sweep() helper is a no-op (returns 0) for stores without sweep", async () => {
  const noSweep: IdempotencyStore = {
    get: () => undefined,
    create: () => true,
    set: () => {},
    delete: () => {},
  };
  expect(await sweep(noSweep)).toBe(0);
});

test("TTL expiry lets a completed key be reused (fresh run after prune)", async () => {
  const store = new MemoryIdempotencyStore(1000);
  let calls = 0;
  const req = { method: "POST", path: "/ttl", body: { n: 1 } };
  const handler = async (): Promise<IdempotentResponse<number>> => {
    calls++;
    return { status: 200, body: calls };
  };
  const first = await withIdempotency("k-ttl", req, handler, { store });
  expect(first.replayed).toBe(false);
  // Force the record past its TTL, then prune it.
  store.sweep(Date.now() + 5000);
  const second = await withIdempotency("k-ttl", req, handler, { store });
  expect(second.replayed).toBe(false); // ran fresh — key was reusable after expiry
  expect(calls).toBe(2);
});
