import { describe, it, expect, vi } from "vitest";
import { summarizeTimings, runBenchmark } from "./bench.js";

describe("summarizeTimings", () => {
  it("returns zeros for an empty sample set", () => {
    expect(summarizeTimings([])).toEqual({
      count: 0, min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stdev: 0, total: 0,
    });
  });

  it("computes min/max/mean/total", () => {
    const s = summarizeTimings([10, 20, 30, 40]);
    expect(s.count).toBe(4);
    expect(s.min).toBe(10);
    expect(s.max).toBe(40);
    expect(s.mean).toBe(25);
    expect(s.total).toBe(100);
  });

  it("computes the median for odd and even counts", () => {
    expect(summarizeTimings([5, 1, 3]).median).toBe(3);
    expect(summarizeTimings([1, 2, 3, 4]).median).toBe(2.5);
  });

  it("is order-independent (sorts internally)", () => {
    expect(summarizeTimings([40, 10, 30, 20]).min).toBe(10);
  });

  it("computes nearest-rank percentiles", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const s = summarizeTimings(samples);
    expect(s.p95).toBe(95);
    expect(s.p99).toBe(99);
    expect(s.max).toBe(100);
  });

  it("computes a population standard deviation", () => {
    // values 2,4,4,4,5,5,7,9 → mean 5, stdev 2
    expect(summarizeTimings([2, 4, 4, 4, 5, 5, 7, 9]).stdev).toBeCloseTo(2, 10);
  });
});

describe("runBenchmark", () => {
  const spec = { method: "GET", url: "https://a.test/x", headers: [] as Array<[string, string]> };

  it("sends the request `repeat` times and aggregates", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const outcome = await runBenchmark(spec, { repeat: 5, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(outcome.samples).toHaveLength(5);
    expect(outcome.ok).toBe(5);
    expect(outcome.statuses[200]).toBe(5);
    expect(outcome.stats.count).toBe(5);
  });

  it("counts errors and non-2xx statuses without throwing", async () => {
    let i = 0;
    const fetchImpl = vi.fn(async () => {
      i++;
      if (i === 1) throw new Error("boom");
      return new Response("no", { status: 500 });
    });
    const outcome = await runBenchmark(spec, { repeat: 3, fetchImpl });
    expect(outcome.errors).toBe(1);
    expect(outcome.ok).toBe(0);
    expect(outcome.statuses[500]).toBe(2);
    expect(outcome.samples).toHaveLength(2);
  });

  it("keeps response records when asked", async () => {
    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    const outcome = await runBenchmark(spec, { repeat: 2, fetchImpl, keepRecords: true });
    expect(outcome.records).toHaveLength(2);
    expect(outcome.records![0]!.status).toBe(200);
  });
});
