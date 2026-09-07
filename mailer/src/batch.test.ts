import { describe, it, expect } from "vitest";
import {
  sendBatch,
  shouldRetrySend,
  createMemoryTransport,
  type Mail,
  type SendResult,
  type Transport,
} from "./index";

const mk = (n: number): Mail[] =>
  Array.from({ length: n }, (_, i) => ({ from: "s@x.com", to: `u${i}@x.com`, subject: "hi", text: "yo" }));

/** A transport that fails the first `failTimes` calls, then succeeds. Records sleeps via injected sleep. */
class FlakyTransport implements Transport {
  calls = 0;
  constructor(private failTimes: number) {}
  async send(_mail: Mail): Promise<SendResult> {
    this.calls++;
    if (this.calls <= this.failTimes) throw new Error("temporary failure");
    return { messageId: "<ok>", accepted: ["u@x.com"], response: "250 ok" };
  }
  async verify() {
    return true;
  }
  async close() {}
}

describe("sendBatch", () => {
  it("sends every message through a memory transport", async () => {
    const t = createMemoryTransport();
    const summary = await sendBatch(t, mk(5), { concurrency: 2 });
    expect(summary.total).toBe(5);
    expect(summary.sent).toBe(5);
    expect(summary.failed).toBe(0);
    expect(t.messages).toHaveLength(5);
    // results preserve order
    expect(summary.results.map((r) => r.index)).toEqual([0, 1, 2, 3, 4]);
  });

  it("retries with backoff using the injected sleep and eventually succeeds", async () => {
    const t = new FlakyTransport(2);
    const sleeps: number[] = [];
    const summary = await sendBatch(t, mk(1), {
      retries: 3,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(summary.sent).toBe(1);
    expect(summary.results[0]!.attempts).toBe(3); // 2 failures + 1 success
    expect(sleeps).toEqual([200, 400]); // exponential default backoff, injected sleep (no real timers)
  });

  it("gives up after exhausting retries and marks the message failed", async () => {
    const t = new FlakyTransport(10);
    const summary = await sendBatch(t, mk(1), { retries: 2, sleep: async () => {} });
    expect(summary.failed).toBe(1);
    expect(summary.results[0]!.ok).toBe(false);
    expect(summary.results[0]!.attempts).toBe(3); // initial + 2 retries
  });

  it("honours a shouldRetry predicate that declines a retry", async () => {
    const t = new FlakyTransport(1);
    const summary = await sendBatch(t, mk(1), { retries: 5, sleep: async () => {}, shouldRetry: () => false });
    expect(summary.failed).toBe(1);
    expect(summary.results[0]!.attempts).toBe(1);
  });
});

describe("shouldRetrySend", () => {
  it("stops once attempts exceed the retry budget", () => {
    expect(shouldRetrySend(new Error("x"), 1, 2)).toBe(true);
    expect(shouldRetrySend(new Error("x"), 2, 2)).toBe(true);
    expect(shouldRetrySend(new Error("x"), 3, 2)).toBe(false);
  });
  it("defers to a predicate when supplied", () => {
    expect(shouldRetrySend(new Error("nope"), 1, 5, () => false)).toBe(false);
  });
});
