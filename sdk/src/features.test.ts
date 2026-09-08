import { test, expect } from "vitest";
import {
  // environments
  LACSPACE_ENVIRONMENTS,
  resolveEnvironment,
  mergeConfig,
  configFromEnvironment,
  createClientForEnvironment,
  // context
  createCorrelationId,
  createIdempotencyKey,
  correlationHeaders,
  createRequestContext,
  contextElapsedMs,
  // runtime
  SDK_VERSION,
  normalizeError,
  isRetryableError,
  checkHealth,
  paginate,
  collectPages,
  type PageResult,
  // existing surface (must still export)
  LacspaceApiError,
} from "./index";

/** Deterministic RNG returning a fixed sequence (loops). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length]!;
}

/* ----------------------------- environments ----------------------------- */

test("resolveEnvironment maps a named environment to its base URL", () => {
  expect(resolveEnvironment("production").baseURL).toBe(LACSPACE_ENVIRONMENTS.production.baseURL);
  expect(resolveEnvironment("staging").baseURL).toContain("staging");
  expect(resolveEnvironment("local").baseURL).toContain("localhost");
});

test("resolveEnvironment applies overrides and accepts a literal preset", () => {
  const over = resolveEnvironment("production", { baseURL: "http://x.test", headers: { A: "1" } });
  expect(over.baseURL).toBe("http://x.test");
  expect(over.headers).toEqual({ A: "1" });
  const literal = resolveEnvironment({ baseURL: "http://lit.test" });
  expect(literal.baseURL).toBe("http://lit.test");
});

test("resolveEnvironment throws on an unknown environment", () => {
  // @ts-expect-error intentionally invalid name
  expect(() => resolveEnvironment("nope")).toThrow(/unknown/i);
});

test("mergeConfig: later scalars win, headers deep-merge, undefined is ignored", () => {
  const merged = mergeConfig<{ baseURL?: string; headers?: Record<string, string>; timeoutMs?: number }>(
    { baseURL: "a", headers: { A: "1", B: "1" }, timeoutMs: 100 },
    { baseURL: "b", headers: { B: "2", C: "3" }, timeoutMs: undefined },
  );
  expect(merged.baseURL).toBe("b");
  expect(merged.timeoutMs).toBe(100); // undefined did not clobber
  expect(merged.headers).toEqual({ A: "1", B: "2", C: "3" });
});

test("mergeConfig ignores null/undefined sources", () => {
  const merged = mergeConfig<{ baseURL?: string }>(undefined, { baseURL: "x" }, null);
  expect(merged.baseURL).toBe("x");
});

test("configFromEnvironment: options override the environment preset", () => {
  const cfg = configFromEnvironment("staging", { baseURL: "http://o.test", apiKey: "k" });
  expect(cfg.baseURL).toBe("http://o.test");
  expect(cfg.apiKey).toBe("k");
});

test("createClientForEnvironment builds a real SDK bound to the env base URL", async () => {
  const urls: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    urls.push(typeof input === "string" ? input : input.toString());
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const sdk = createClientForEnvironment("local", { fetch: fakeFetch });
  await sdk.ecommerce.getProducts();
  expect(urls[0]!).toContain("localhost");
  expect(urls[0]!).toContain("/products");
});

/* ------------------------------- context -------------------------------- */

test("createCorrelationId is deterministic under an injected RNG", () => {
  const id1 = createCorrelationId(seqRng([0, 0]));
  expect(id1).toBe("lac-0000000000000000");
  const id2 = createCorrelationId(seqRng([0.5]));
  expect(id2).toMatch(/^lac-[0-9a-f]{16}$/);
});

test("createIdempotencyKey yields a stable, prefixed key", () => {
  expect(createIdempotencyKey(seqRng([0]))).toBe("idem-00000000000000000000000000000000");
});

test("correlationHeaders uses a fixed id and custom header name", () => {
  expect(correlationHeaders({ id: "abc" })).toEqual({ "X-Correlation-Id": "abc" });
  expect(correlationHeaders({ id: "abc", header: "X-Trace" })).toEqual({ "X-Trace": "abc" });
});

test("correlationHeaders generates an id when none is provided", () => {
  const h = correlationHeaders({ rng: seqRng([0.25]) });
  expect(Object.values(h)[0]!).toMatch(/^lac-/);
});

test("request context + elapsed use injectable clocks", () => {
  let t = 1000;
  const now = () => t;
  const ctx = createRequestContext({ id: "cid", now });
  expect(ctx).toEqual({ correlationId: "cid", startedAt: 1000 });
  t = 1350;
  expect(contextElapsedMs(ctx, now)).toBe(350);
});

/* ------------------------------- runtime -------------------------------- */

test("SDK_VERSION is a 2.2.x minor bump", () => {
  expect(SDK_VERSION.startsWith("2.2.")).toBe(true);
});

test("normalizeError classifies an API error and marks 503 retryable", () => {
  const n = normalizeError(new LacspaceApiError("boom", 503, "Service Unavailable", { m: 1 }));
  expect(n.kind).toBe("http");
  expect(n.status).toBe(503);
  expect(n.retryable).toBe(true);
  expect(n.body).toEqual({ m: 1 });
});

test("normalizeError: 404 is not retryable; timeout/network are", () => {
  expect(normalizeError(new LacspaceApiError("nf", 404, "Not Found", null)).retryable).toBe(false);
  const timeout = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  expect(normalizeError(timeout).kind).toBe("timeout");
  expect(isRetryableError(timeout)).toBe(true);
  const net = Object.assign(new TypeError("fetch failed"), {});
  expect(normalizeError(net).kind).toBe("network");
  expect(isRetryableError("weird string")).toBe(false);
});

test("checkHealth reports ok/status/latency with injected fetch + clock", async () => {
  let t = 0;
  const now = () => (t += 5); // started=5, end=10 → latency 5
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ status: "up" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
  const res = await checkHealth("http://api.test/health", { fetch: fakeFetch, now });
  expect(res.ok).toBe(true);
  expect(res.status).toBe(200);
  expect(res.latencyMs).toBe(5);
  expect(res.body).toEqual({ status: "up" });
});

test("checkHealth never rejects on a network failure", async () => {
  const fakeFetch = (async () => {
    throw new TypeError("network down");
  }) as unknown as typeof fetch;
  const res = await checkHealth("http://api.test/health", { fetch: fakeFetch, now: () => 0 });
  expect(res.ok).toBe(false);
  expect(res.status).toBe(0);
  expect(res.error?.kind).toBe("network");
});

test("paginate follows next cursors and stops at the end", async () => {
  const pages: Record<string, PageResult<number>> = {
    "": { items: [1, 2], next: "p2" },
    p2: { items: [3, 4], next: "p3" },
    p3: { items: [5], next: null },
  };
  const all = await collectPages<number>((cursor) => pages[String(cursor ?? "")]!);
  expect(all).toEqual([1, 2, 3, 4, 5]);
});

test("paginate stops on an empty page and honours maxPages", async () => {
  const empty = await collectPages<number>(() => ({ items: [], next: "always" }));
  expect(empty).toEqual([]);

  let calls = 0;
  const items: number[] = [];
  for await (const n of paginate<number>(() => ({ items: [++calls], next: "more" }), { maxPages: 3 })) {
    items.push(n);
  }
  expect(items).toEqual([1, 2, 3]); // capped at 3 pages despite endless `next`
});
