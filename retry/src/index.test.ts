import { test, expect, vi } from "vitest";
import {
  backoff,
  retry,
  withTimeout,
  retryWithTimeout,
  CircuitBreaker,
  TimeoutError,
  AbortError,
  CircuitOpenError,
} from "./index";

/* ------------------------------ backoff ------------------------------ */

test("backoff: exponential growth with jitter off", () => {
  const o = { minDelay: 100, factor: 2, jitter: false as const };
  expect(backoff(0, o)).toBe(100);
  expect(backoff(1, o)).toBe(200);
  expect(backoff(2, o)).toBe(400);
  expect(backoff(3, o)).toBe(800);
});

test("backoff: clamps at maxDelay", () => {
  expect(backoff(10, { minDelay: 100, factor: 2, maxDelay: 1000, jitter: false })).toBe(1000);
});

test("backoff: full jitter uses the injected random source", () => {
  // random() = 0.5 → half of the computed (jitter-off) delay.
  expect(backoff(2, { minDelay: 100, factor: 2, random: () => 0.5 })).toBe(200);
  expect(backoff(0, { minDelay: 100, random: () => 0 })).toBe(0);
});

/* ------------------------------ retry ------------------------------ */

const noSleep = () => Promise.resolve();

test("retry: returns immediately when fn succeeds first try", async () => {
  let calls = 0;
  const out = await retry(() => { calls++; return "ok"; }, { sleepImpl: noSleep });
  expect(out).toBe("ok");
  expect(calls).toBe(1);
});

test("retry: recovers after transient failures", async () => {
  let calls = 0;
  const out = await retry(
    () => { calls++; if (calls < 3) throw new Error("flaky"); return calls; },
    { retries: 5, sleepImpl: noSleep },
  );
  expect(out).toBe(3);
  expect(calls).toBe(3);
});

test("retry: exhausts retries then throws the last error", async () => {
  let calls = 0;
  await expect(
    retry(() => { calls++; throw new Error(`boom ${calls}`); }, { retries: 2, sleepImpl: noSleep }),
  ).rejects.toThrow("boom 3");
  expect(calls).toBe(3); // first attempt + 2 retries
});

test("retry: shouldRetry=false stops early", async () => {
  let calls = 0;
  await expect(
    retry(
      () => { calls++; throw new Error("fatal"); },
      { retries: 5, shouldRetry: () => false, sleepImpl: noSleep },
    ),
  ).rejects.toThrow("fatal");
  expect(calls).toBe(1);
});

test("retry: onRetry reports attempt number and delay", async () => {
  const events: Array<{ attempt: number; delay: number }> = [];
  let calls = 0;
  await retry(
    () => { calls++; if (calls < 3) throw new Error("x"); return 1; },
    {
      retries: 5,
      jitter: false,
      minDelay: 100,
      factor: 2,
      sleepImpl: noSleep,
      onRetry: (_e, attempt, delayMs) => events.push({ attempt, delay: delayMs }),
    },
  );
  expect(events).toEqual([
    { attempt: 1, delay: 100 },
    { attempt: 2, delay: 200 },
  ]);
});

test("retry: pre-aborted signal throws AbortError without calling fn", async () => {
  const ac = new AbortController();
  ac.abort();
  let calls = 0;
  await expect(
    retry(() => { calls++; return 1; }, { signal: ac.signal, sleepImpl: noSleep }),
  ).rejects.toBeInstanceOf(AbortError);
  expect(calls).toBe(0);
});

/* ------------------------------ withTimeout ------------------------------ */

test("withTimeout: resolves when fn settles in time", async () => {
  vi.useFakeTimers();
  try {
    const p = withTimeout(async () => "fast", 1000);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe("fast");
  } finally {
    vi.useRealTimers();
  }
});

test("withTimeout: rejects with TimeoutError and aborts the signal", async () => {
  vi.useFakeTimers();
  try {
    let aborted = false;
    const p = withTimeout(
      (signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener("abort", () => { aborted = true; });
          // never resolves on its own
          void resolve;
        }),
      50,
    );
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(aborted).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

/* ------------------------------ retryWithTimeout ------------------------------ */

test("retryWithTimeout: retries a timed-out attempt then succeeds", async () => {
  let calls = 0;
  const out = await retryWithTimeout(
    async () => {
      calls++;
      if (calls === 1) {
        // first attempt hangs past the timeout
        await new Promise((r) => setTimeout(r, 1000));
        return "late";
      }
      return "ok";
    },
    20,
    { retries: 3, sleepImpl: noSleep },
  );
  expect(out).toBe("ok");
  expect(calls).toBe(2);
});

/* ------------------------------ CircuitBreaker ------------------------------ */

test("circuit: opens after the failure threshold and fails fast", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 3, now: () => 0 });
  const boom = () => { throw new Error("down"); };
  for (let i = 0; i < 3; i++) await expect(cb.run(boom)).rejects.toThrow("down");
  expect(cb.current).toBe("open");
  // Now fails fast without invoking fn.
  let called = false;
  await expect(cb.run(() => { called = true; return 1; })).rejects.toBeInstanceOf(CircuitOpenError);
  expect(called).toBe(false);
});

test("circuit: half-opens after cool-down, a success closes it", async () => {
  let clock = 0;
  const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000, now: () => clock });
  const boom = () => { throw new Error("down"); };
  await expect(cb.run(boom)).rejects.toThrow();
  await expect(cb.run(boom)).rejects.toThrow();
  expect(cb.current).toBe("open");

  clock = 1000; // cool-down elapsed
  expect(cb.current).toBe("half-open");
  await expect(cb.run(async () => "recovered")).resolves.toBe("recovered");
  expect(cb.current).toBe("closed");
});

test("circuit: a failure while half-open re-opens immediately", async () => {
  let clock = 0;
  const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 500, now: () => clock });
  await expect(cb.run(() => { throw new Error("down"); })).rejects.toThrow();
  expect(cb.current).toBe("open");
  clock = 500;
  expect(cb.current).toBe("half-open");
  await expect(cb.run(() => { throw new Error("still down"); })).rejects.toThrow("still down");
  expect(cb.current).toBe("open");
});

test("circuit: successThreshold requires N half-open successes to close", async () => {
  let clock = 0;
  const cb = new CircuitBreaker({
    failureThreshold: 1,
    resetTimeoutMs: 100,
    successThreshold: 2,
    now: () => clock,
  });
  await expect(cb.run(() => { throw new Error("down"); })).rejects.toThrow();
  clock = 100;
  expect(cb.current).toBe("half-open");
  await cb.run(() => "ok1");
  // one success is not yet enough
  expect(cb.current).toBe("half-open");
  await cb.run(() => "ok2");
  expect(cb.current).toBe("closed");
});

test("circuit: reset() forces closed and clears counters", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, now: () => 0 });
  await expect(cb.run(() => { throw new Error("down"); })).rejects.toThrow();
  expect(cb.current).toBe("open");
  cb.reset();
  expect(cb.current).toBe("closed");
  await expect(cb.run(async () => "back")).resolves.toBe("back");
});

/* ------------------------------ error shapes ------------------------------ */

test("error classes carry stable names and codes", () => {
  expect(new TimeoutError(5).code).toBe("timeout");
  expect(new TimeoutError(5).name).toBe("TimeoutError");
  expect(new AbortError().code).toBe("aborted");
  expect(new CircuitOpenError().code).toBe("circuit-open");
});
