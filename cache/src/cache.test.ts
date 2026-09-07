import { test, expect, vi } from "vitest";
import { createCache, memoize } from "./index";

/** A controllable clock for deterministic TTL tests. */
function fakeClock(start = 0) {
  let t = start;
  const clock = () => t;
  return { clock, advance: (ms: number) => (t += ms), set: (ms: number) => (t = ms) };
}

/* ---------- existing behaviour (must keep working) ---------- */

test("set / get / has / delete / clear / size / keys still work", () => {
  const c = createCache<number>();
  c.set("a", 1);
  c.set("b", 2);
  expect(c.get("a")).toBe(1);
  expect(c.has("b")).toBe(true);
  expect(c.size).toBe(2);
  expect(c.keys().sort()).toEqual(["a", "b"]);
  expect(c.delete("a")).toBe(true);
  expect(c.delete("a")).toBe(false);
  expect(c.get("a")).toBeUndefined();
  c.clear();
  expect(c.size).toBe(0);
});

test("default LRU eviction order at max (existing behaviour)", () => {
  const c = createCache<number>({ max: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // a is now most-recently-used
  c.set("c", 3); // evicts least-recently-used → b
  expect(c.has("a")).toBe(true);
  expect(c.has("b")).toBe(false);
  expect(c.has("c")).toBe(true);
});

/* ---------- TTL with injected clock ---------- */

test("TTL expires precisely against an injected clock", () => {
  const { clock, advance } = fakeClock(1000);
  const c = createCache<string>({ clock });
  c.set("k", "v", 100);
  expect(c.get("k")).toBe("v");
  advance(99);
  expect(c.get("k")).toBe("v"); // still fresh at t=1099
  advance(2); // t=1101 > 1100
  expect(c.get("k")).toBeUndefined();
  expect(c.has("k")).toBe(false);
});

test("purge() sweeps expired entries and reports the count", () => {
  const { clock, advance } = fakeClock();
  const c = createCache<number>({ clock });
  c.set("a", 1, 10);
  c.set("b", 2, 10);
  c.set("c", 3, 0); // never expires
  advance(20);
  expect(c.purge()).toBe(2);
  expect(c.size).toBe(1);
  expect(c.get("c")).toBe(3);
});

/* ---------- LFU eviction ---------- */

test("LFU evicts the least-frequently-used entry at max", () => {
  const c = createCache<number>({ max: 2, policy: "lfu" });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a");
  c.get("a"); // a: freq high, b: freq low
  c.set("c", 3); // should evict b (lowest freq)
  expect(c.has("a")).toBe(true);
  expect(c.has("b")).toBe(false);
  expect(c.has("c")).toBe(true);
});

test("LFU counts wrap() hits toward frequency", async () => {
  const c = createCache<number>({ max: 2, policy: "lfu" });
  await c.wrap("a", async () => 1);
  await c.wrap("b", async () => 2);
  await c.wrap("a", async () => 1); // hit → a freq up
  await c.wrap("a", async () => 1); // hit → a freq up
  await c.wrap("c", async () => 3); // evict b
  expect(c.has("a")).toBe(true);
  expect(c.has("b")).toBe(false);
});

/* ---------- getOrSet / single-flight ---------- */

test("wrap() caches the result", async () => {
  const c = createCache<number>();
  const fn = vi.fn(async () => 42);
  expect(await c.wrap("x", fn)).toBe(42);
  expect(await c.wrap("x", fn)).toBe(42);
  expect(fn).toHaveBeenCalledTimes(1);
});

test("getOrSet() de-dupes N concurrent callers into ONE factory call", async () => {
  const c = createCache<number>();
  let calls = 0;
  const factory = () =>
    new Promise<number>((resolve) => {
      calls++;
      setTimeout(() => resolve(7), 10);
    });
  const results = await Promise.all(Array.from({ length: 25 }, () => c.getOrSet("k", factory)));
  expect(calls).toBe(1);
  expect(results.every((r) => r === 7)).toBe(true);
});

test("getOrSet is an alias of wrap (shares the same store)", async () => {
  const c = createCache<number>();
  await c.getOrSet("k", async () => 5);
  expect(c.get("k")).toBe(5);
});

/* ---------- stale-while-revalidate ---------- */

test("stale-while-revalidate serves stale immediately then refreshes", async () => {
  const { clock, advance } = fakeClock();
  const c = createCache<number>({ clock });
  let value = 1;
  const fn = vi.fn(async () => value);

  expect(await c.wrap("k", fn, { ttl: 100, staleWhileRevalidate: 1000 })).toBe(1);
  expect(fn).toHaveBeenCalledTimes(1);

  advance(150); // stale, but within SWR window
  value = 2;
  const served = await c.wrap("k", fn, { ttl: 100, staleWhileRevalidate: 1000 });
  expect(served).toBe(1); // stale value returned instantly
  expect(fn).toHaveBeenCalledTimes(2); // background refresh kicked off

  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
  expect(await c.wrap("k", fn, { ttl: 100, staleWhileRevalidate: 1000 })).toBe(2); // refreshed
});

/* ---------- tag-based invalidation ---------- */

test("invalidateTag drops every entry carrying the tag", () => {
  const c = createCache<number>();
  c.set("a", 1, 0, { tags: ["user", "hot"] });
  c.set("b", 2, 0, { tags: ["user"] });
  c.set("c", 3, 0, { tags: ["other"] });
  expect(c.invalidateTag("user")).toBe(2);
  expect(c.has("a")).toBe(false);
  expect(c.has("b")).toBe(false);
  expect(c.has("c")).toBe(true);
  // tag "hot" is now empty and must not resurrect a deleted key
  expect(c.invalidateTag("hot")).toBe(0);
});

test("wrap() can attach tags, and overwriting an entry clears its old tags", async () => {
  const c = createCache<number>();
  await c.wrap("a", async () => 1, { tags: ["grp"] });
  c.set("a", 9); // overwrite with no tags
  expect(c.invalidateTag("grp")).toBe(0); // old tag gone
  expect(c.get("a")).toBe(9);
});

test("deleteMany supports prefix, RegExp and predicate", () => {
  const c = createCache<number>();
  c.set("user:1", 1);
  c.set("user:2", 2);
  c.set("post:1", 3);
  expect(c.deleteMany("user:")).toBe(2);
  expect(c.size).toBe(1);
  c.set("post:2", 4);
  expect(c.deleteMany(/^post:/)).toBe(2);
  expect(c.size).toBe(0);
  c.set("x", 1);
  expect(c.deleteMany((k) => k === "x")).toBe(1);
});

/* ---------- stats + events ---------- */

test("stats() tracks hits, misses, sets, evictions and hitRate", () => {
  const c = createCache<number>({ max: 2 });
  c.set("a", 1);
  c.set("b", 2);
  c.get("a"); // hit
  c.get("z"); // miss
  c.set("c", 3); // evicts one (capacity)
  const s = c.stats();
  expect(s.hits).toBe(1);
  expect(s.misses).toBe(1);
  expect(s.sets).toBe(3);
  expect(s.evictions).toBe(1);
  expect(s.size).toBe(2);
  expect(s.hitRate).toBeCloseTo(0.5);
  c.resetStats();
  expect(c.stats().hits).toBe(0);
  expect(c.stats().misses).toBe(0);
});

test("stats() counts TTL expirations", () => {
  const { clock, advance } = fakeClock();
  const c = createCache<number>({ clock });
  c.set("a", 1, 10);
  advance(20);
  c.get("a"); // lazy expiry
  expect(c.stats().expirations).toBe(1);
});

test("onEvict fires with the right reason for capacity, expiry and delete", () => {
  const { clock, advance } = fakeClock();
  const seen: Array<[string, number, string]> = [];
  const c = createCache<number>({
    max: 1,
    clock,
    onEvict: (k, v, reason) => seen.push([k, v, reason]),
  });
  c.set("a", 1);
  c.set("b", 2); // evicts a → capacity
  c.delete("b"); // delete
  c.set("t", 9, 5);
  advance(10);
  c.purge(); // expire
  const reasons = seen.map((s) => s[2]);
  expect(reasons).toContain("capacity");
  expect(reasons).toContain("delete");
  expect(reasons).toContain("expire");
});

test("a throwing onEvict never corrupts cache state", () => {
  const c = createCache<number>({
    max: 1,
    onEvict: () => {
      throw new Error("boom");
    },
  });
  c.set("a", 1);
  expect(() => c.set("b", 2)).not.toThrow();
  expect(c.has("b")).toBe(true);
});

/* ---------- memoize passthrough ---------- */

test("memoize caches by args and de-dupes concurrent calls", async () => {
  let calls = 0;
  const getUser = memoize(async (id: number) => {
    calls++;
    return { id };
  });
  const [a, b] = await Promise.all([getUser(1), getUser(1)]);
  expect(a).toEqual({ id: 1 });
  expect(b).toEqual({ id: 1 });
  expect(calls).toBe(1);
  await getUser(2);
  expect(calls).toBe(2);
  getUser.cache.clear();
  await getUser(1);
  expect(calls).toBe(3);
});

test("memoize honours an injected clock + ttl", async () => {
  const { clock, advance } = fakeClock();
  let calls = 0;
  const fn = memoize(async (n: number) => (calls++, n * 2), { ttl: 100, clock });
  expect(await fn(5)).toBe(10);
  expect(await fn(5)).toBe(10);
  expect(calls).toBe(1);
  advance(150);
  expect(await fn(5)).toBe(10);
  expect(calls).toBe(2); // re-fetched after TTL
});
