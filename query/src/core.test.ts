import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearQueryCache,
  computeBackoff,
  gcQueries,
  getQueryData,
  getQueryKeys,
  getQueryState,
  invalidateQueries,
  matchQueryKey,
  mutate,
  prefetchQuery,
  removeQuery,
  runWithRetry,
  serializeQueryKey,
  setQueryData,
  subscribeQuery,
  triggerFetch,
} from "./core";

const flush = () => new Promise((r) => setTimeout(r, 0));
const noSleep = () => Promise.resolve();

beforeEach(() => {
  clearQueryCache();
});

describe("serializeQueryKey", () => {
  it("returns string keys unchanged", () => {
    expect(serializeQueryKey("users")).toBe("users");
  });

  it("serializes array keys to a stable string", () => {
    expect(serializeQueryKey(["user", 42])).toBe('["user",42]');
  });

  it("sorts object props so key order never matters", () => {
    expect(serializeQueryKey(["u", { a: 1, b: 2 }])).toBe(serializeQueryKey(["u", { b: 2, a: 1 }]));
  });
});

describe("computeBackoff", () => {
  it("grows exponentially from the base delay", () => {
    expect(computeBackoff(0)).toBe(1000);
    expect(computeBackoff(1)).toBe(2000);
    expect(computeBackoff(2)).toBe(4000);
  });

  it("honours baseDelay and factor", () => {
    expect(computeBackoff(2, { baseDelay: 100, factor: 3 })).toBe(900);
  });

  it("caps at maxDelay", () => {
    expect(computeBackoff(20, { baseDelay: 1000, maxDelay: 5000 })).toBe(5000);
  });

  it("applies deterministic jitter with an injected RNG", () => {
    // full jitter => delay/2 + random * delay/2; random=0.5 => 0.75 * raw
    expect(computeBackoff(0, { baseDelay: 1000, jitter: true, random: () => 0.5 })).toBe(750);
  });
});

describe("runWithRetry", () => {
  it("resolves on first success without retrying", async () => {
    const fn = vi.fn(async () => "ok");
    await expect(runWithRetry(fn, { retries: 3, sleep: noSleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a failing fn until it succeeds", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (n++ < 2) throw new Error("fail");
      return "recovered";
    });
    await expect(runWithRetry(fn, { retries: 3, sleep: noSleep })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error once retries are exhausted", async () => {
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(runWithRetry(fn, { retries: 2, sleep: noSleep })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("stops early when shouldRetry returns false", async () => {
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      runWithRetry(fn, { retries: 5, sleep: noSleep, shouldRetry: () => false }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses a functional retryDelay to compute the sleep", async () => {
    const delays: number[] = [];
    const sleep = (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    };
    let n = 0;
    await runWithRetry(
      async () => {
        if (n++ < 2) throw new Error("x");
        return 1;
      },
      { retries: 3, sleep, retryDelay: (attempt) => attempt * 10 },
    );
    expect(delays).toEqual([0, 10]);
  });
});

describe("triggerFetch de-duplication", () => {
  it("coalesces concurrent calls into one in-flight promise", async () => {
    const fetcher = vi.fn(async () => "value");
    const a = triggerFetch("k", fetcher, "k");
    const b = triggerFetch("k", fetcher, "k");
    expect(a).toBe(b);
    await Promise.all([a, b]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stores data and marks not-stale on success", async () => {
    await triggerFetch("k", async () => 7, "k");
    expect(getQueryData<number>("k")).toBe(7);
    const state = getQueryState<number>("k", 10_000);
    expect(state?.isStale).toBe(false);
    expect(state?.isValidating).toBe(false);
  });

  it("records the error and rejects on failure", async () => {
    const err = new Error("boom");
    await expect(triggerFetch("k", async () => Promise.reject(err), "k")).rejects.toBe(err);
    expect(getQueryState("k")?.error).toBe(err);
  });

  it("retries through the injected RetryOptions before erroring", async () => {
    let n = 0;
    const data = await triggerFetch(
      "k",
      async () => {
        if (n++ < 1) throw new Error("first");
        return "second";
      },
      "k",
      { retries: 2, sleep: noSleep },
    );
    expect(data).toBe("second");
    expect(getQueryData("k")).toBe("second");
  });
});

describe("imperative cache API", () => {
  it("setQueryData writes values and updater functions", () => {
    setQueryData("count", 1);
    setQueryData<number>("count", (prev) => (prev ?? 0) + 4);
    expect(getQueryData<number>("count")).toBe(5);
  });

  it("setQueryData clears a stored error", async () => {
    await expect(triggerFetch("k", async () => Promise.reject(new Error("e")), "k")).rejects.toThrow();
    setQueryData("k", "fresh");
    expect(getQueryState("k")?.error).toBeUndefined();
  });

  it("prefetchQuery populates the cache and remembers the fetcher", async () => {
    await prefetchQuery(["user", 1], async () => ({ id: 1 }));
    expect(getQueryData(["user", 1])).toEqual({ id: 1 });
  });

  it("mutate revalidates using the stored fetcher", async () => {
    let value = "a";
    await prefetchQuery("k", async () => value);
    value = "b";
    await mutate("k");
    expect(getQueryData("k")).toBe("b");
  });

  it("mutate with revalidate:false only sets optimistically", async () => {
    const fetcher = vi.fn(async () => "server");
    await prefetchQuery("k", fetcher);
    fetcher.mockClear();
    await mutate("k", "optimistic", { revalidate: false });
    expect(getQueryData("k")).toBe("optimistic");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("getQueryState", () => {
  it("returns undefined for an unknown key", () => {
    expect(getQueryState("missing")).toBeUndefined();
  });

  it("reports stale when older than staleTime", async () => {
    await triggerFetch("k", async () => 1, "k");
    expect(getQueryState("k", 0)?.isStale).toBe(true);
    expect(getQueryState("k", 10_000)?.isStale).toBe(false);
  });
});

describe("matchQueryKey", () => {
  it("matches an exact string key", () => {
    expect(matchQueryKey("todos", "todos")).toBe(true);
    expect(matchQueryKey("todos", "users")).toBe(false);
  });

  it("does a structural array prefix match by default", () => {
    expect(matchQueryKey(["user", 1], ["user"])).toBe(true);
    expect(matchQueryKey(["user", 1], ["user", 1])).toBe(true);
    expect(matchQueryKey(["user", 1], ["user", 2])).toBe(false);
    expect(matchQueryKey(["user"], ["user", 1])).toBe(false); // filter longer than entry
  });

  it("supports exact via the object filter form", () => {
    expect(matchQueryKey(["user", 1], { key: ["user"], exact: true })).toBe(false);
    expect(matchQueryKey(["user", 1], { key: ["user", 1], exact: true })).toBe(true);
  });

  it("supports predicate filters over the serialized key", () => {
    expect(matchQueryKey(["user", 1], (k) => k.startsWith('["user"'))).toBe(true);
    expect(matchQueryKey("todos", { predicate: (k) => k.includes("od") })).toBe(true);
  });
});

describe("invalidateQueries", () => {
  it("marks matching entries stale and refetches by default", async () => {
    let v = 1;
    await prefetchQuery(["user", 1], async () => v);
    v = 2;
    await invalidateQueries(["user"]);
    expect(getQueryData(["user", 1])).toBe(2);
  });

  it("only marks stale when refetch is false", async () => {
    const fetcher = vi.fn(async () => "x");
    await prefetchQuery("k", fetcher);
    fetcher.mockClear();
    await invalidateQueries("k", { refetch: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(getQueryState("k", 60_000)?.isStale).toBe(true);
  });

  it("leaves non-matching entries alone", async () => {
    await prefetchQuery(["a", 1], async () => "keep");
    await prefetchQuery(["b", 1], async () => "also");
    await invalidateQueries(["a"], { refetch: false });
    expect(getQueryState(["a", 1], 60_000)?.isStale).toBe(true);
    expect(getQueryState(["b", 1], 60_000)?.isStale).toBe(false);
  });
});

describe("subscribeQuery", () => {
  it("notifies subscribers on commit and stops after unsubscribe", async () => {
    const seen: unknown[] = [];
    const off = subscribeQuery<string>("k", (s) => seen.push(s.data));
    setQueryData("k", "one");
    setQueryData("k", "two");
    off();
    setQueryData("k", "three");
    expect(seen).toEqual(["one", "two"]);
  });
});

describe("removeQuery / getQueryKeys", () => {
  it("removes a cached entry and reports keys", async () => {
    await prefetchQuery("a", async () => 1);
    await prefetchQuery("b", async () => 2);
    expect(getQueryKeys().sort()).toEqual(["a", "b"]);
    expect(removeQuery("a")).toBe(true);
    expect(removeQuery("a")).toBe(false);
    expect(getQueryKeys()).toEqual(["b"]);
  });
});

describe("gcQueries", () => {
  it("removes idle entries older than maxAge and returns the count", async () => {
    await triggerFetch("old", async () => 1, "old");
    await flush();
    // now is far in the future => "old" exceeds maxAge
    const removed = gcQueries({ maxAge: 1000, now: Date.now() + 10_000 });
    expect(removed).toBe(1);
    expect(getQueryKeys()).toEqual([]);
  });

  it("keeps entries still within maxAge", async () => {
    await triggerFetch("fresh", async () => 1, "fresh");
    const removed = gcQueries({ maxAge: 60_000, now: Date.now() });
    expect(removed).toBe(0);
    expect(getQueryKeys()).toEqual(["fresh"]);
  });

  it("keeps subscribed entries even when stale", () => {
    const off = subscribeQuery("live", () => {});
    setQueryData("live", 1);
    expect(gcQueries({ maxAge: 0, now: Date.now() + 10_000 })).toBe(0);
    off();
  });
});

describe("clearQueryCache", () => {
  it("removes all unsubscribed entries", async () => {
    await prefetchQuery("a", async () => 1);
    await prefetchQuery("b", async () => 2);
    clearQueryCache();
    expect(getQueryKeys()).toEqual([]);
  });
});
