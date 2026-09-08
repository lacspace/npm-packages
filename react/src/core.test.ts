import { describe, it, expect, vi } from "vitest";
import {
  asyncReducer,
  initialAsyncState,
  selectAsyncFlags,
  toError,
  isAuthenticated,
  deriveAuthStatus,
  computeBackoff,
  runWithRetry,
  resolveRefetchInterval,
  serializeDeps,
  type AsyncState,
} from "./core";

describe("async state machine", () => {
  it("initialAsyncState is idle by default", () => {
    expect(initialAsyncState()).toEqual({ status: "idle", data: undefined, error: null });
  });

  it("initialAsyncState seeds into success", () => {
    expect(initialAsyncState(42)).toEqual({ status: "success", data: 42, error: null });
  });

  it("start moves to loading and keeps prior data, clearing error", () => {
    const prev: AsyncState<number> = { status: "error", data: 7, error: new Error("x") };
    expect(asyncReducer(prev, { type: "start" })).toEqual({
      status: "loading",
      data: 7,
      error: null,
    });
  });

  it("success stores data and clears error", () => {
    const next = asyncReducer(initialAsyncState<number>(), { type: "success", data: 9 });
    expect(next).toEqual({ status: "success", data: 9, error: null });
  });

  it("error normalizes and keeps prior data", () => {
    const prev: AsyncState<string> = { status: "success", data: "hi", error: null };
    const next = asyncReducer(prev, { type: "error", error: "boom" });
    expect(next.status).toBe("error");
    expect(next.data).toBe("hi");
    expect(next.error).toBeInstanceOf(Error);
    expect(next.error?.message).toBe("boom");
  });

  it("reset returns to idle", () => {
    const prev: AsyncState<number> = { status: "success", data: 1, error: null };
    expect(asyncReducer(prev, { type: "reset" })).toEqual({
      status: "idle",
      data: undefined,
      error: null,
    });
  });

  it("is pure — does not mutate the input state", () => {
    const prev: AsyncState<number> = { status: "idle", data: undefined, error: null };
    const frozen = Object.freeze({ ...prev });
    expect(() => asyncReducer(frozen, { type: "start" })).not.toThrow();
    expect(frozen.status).toBe("idle");
  });

  it("selectAsyncFlags maps status to mutually-exclusive booleans", () => {
    expect(selectAsyncFlags({ status: "loading", data: undefined, error: null })).toEqual({
      isIdle: false,
      isLoading: true,
      isSuccess: false,
      isError: false,
    });
    expect(selectAsyncFlags(initialAsyncState()).isIdle).toBe(true);
  });
});

describe("toError", () => {
  it("passes through Error instances", () => {
    const e = new Error("keep");
    expect(toError(e)).toBe(e);
  });
  it("wraps non-errors", () => {
    expect(toError("str").message).toBe("str");
    expect(toError(123).message).toBe("123");
  });
});

describe("auth status", () => {
  it("isAuthenticated only for non-null users", () => {
    expect(isAuthenticated({ id: 1 })).toBe(true);
    expect(isAuthenticated(null)).toBe(false);
    expect(isAuthenticated(undefined)).toBe(false);
  });

  it("deriveAuthStatus prefers authenticated even while loading", () => {
    expect(deriveAuthStatus({ user: { id: 1 }, loading: true })).toBe("authenticated");
  });

  it("deriveAuthStatus is loading only without a user", () => {
    expect(deriveAuthStatus({ user: null, loading: true })).toBe("loading");
  });

  it("deriveAuthStatus is unauthenticated when idle and no user", () => {
    expect(deriveAuthStatus({ user: null, loading: false })).toBe("unauthenticated");
    expect(deriveAuthStatus({ user: null })).toBe("unauthenticated");
  });
});

describe("computeBackoff", () => {
  it("grows exponentially from baseDelay", () => {
    expect(computeBackoff(0)).toBe(1000);
    expect(computeBackoff(1)).toBe(2000);
    expect(computeBackoff(2)).toBe(4000);
  });

  it("respects custom base and factor", () => {
    expect(computeBackoff(2, { baseDelay: 100, factor: 3 })).toBe(900);
  });

  it("caps at maxDelay", () => {
    expect(computeBackoff(20, { maxDelay: 5000 })).toBe(5000);
  });

  it("applies full jitter within [delay/2, delay] using injected random", () => {
    expect(computeBackoff(0, { jitter: true, random: () => 0 })).toBe(500);
    expect(computeBackoff(0, { jitter: true, random: () => 0.999999 })).toBeCloseTo(1000, 1);
  });
});

describe("runWithRetry", () => {
  it("returns on first success without sleeping", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => "ok");
    await expect(runWithRetry(fn, { retries: 3, sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries then succeeds, sleeping with backoff", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const fn = vi.fn(async () => {
      if (n++ < 2) throw new Error("fail");
      return "done";
    });
    await expect(runWithRetry(fn, { retries: 3, sleep })).resolves.toBe("done");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });

  it("re-throws after exhausting retries", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new Error("nope");
    });
    await expect(runWithRetry(fn, { retries: 2, sleep })).rejects.toThrow("nope");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("stops early when shouldRetry returns false", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn(async () => {
      throw new Error("fatal");
    });
    await expect(
      runWithRetry(fn, { retries: 5, shouldRetry: () => false, sleep }),
    ).rejects.toThrow("fatal");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("honors a custom fixed retryDelay", async () => {
    const sleep = vi.fn(async () => {});
    let n = 0;
    const fn = async () => {
      if (n++ < 1) throw new Error("x");
      return 1;
    };
    await runWithRetry(fn, { retries: 2, retryDelay: 50, sleep });
    expect(sleep).toHaveBeenCalledWith(50);
  });
});

describe("resolveRefetchInterval", () => {
  it("returns a positive fixed interval", () => {
    expect(resolveRefetchInterval(5000, undefined)).toBe(5000);
  });

  it("evaluates a function interval against the data", () => {
    expect(resolveRefetchInterval((d) => (d ? 1000 : false), "x")).toBe(1000);
    expect(resolveRefetchInterval((d) => (d ? 1000 : false), undefined)).toBeNull();
  });

  it("returns null when disabled or non-positive", () => {
    expect(resolveRefetchInterval(5000, undefined, { enabled: false })).toBeNull();
    expect(resolveRefetchInterval(0, undefined)).toBeNull();
    expect(resolveRefetchInterval(undefined, undefined)).toBeNull();
  });

  it("stops polling on error unless refetchOnError", () => {
    expect(resolveRefetchInterval(1000, undefined, { hasError: true })).toBeNull();
    expect(
      resolveRefetchInterval(1000, undefined, { hasError: true, refetchOnError: true }),
    ).toBe(1000);
  });
});

describe("serializeDeps", () => {
  it("is stable regardless of object key order", () => {
    expect(serializeDeps(["user", { a: 1, b: 2 }])).toBe(
      serializeDeps(["user", { b: 2, a: 1 }]),
    );
  });

  it("distinguishes different values", () => {
    expect(serializeDeps([1])).not.toBe(serializeDeps([2]));
  });

  it("handles empty deps and primitives", () => {
    expect(serializeDeps([])).toBe("[]");
    expect(serializeDeps([null, "x", 3])).toBe('[null,"x",3]');
  });
});
