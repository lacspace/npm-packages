import { describe, it, expect } from "vitest";
import { resolveDelay, rollChaos } from "./chaos.js";

describe("resolveDelay", () => {
  it("returns 0 for undefined", () => {
    expect(resolveDelay(undefined, () => 0.5)).toBe(0);
  });

  it("returns a fixed delay as-is (clamped to >= 0)", () => {
    expect(resolveDelay(250, () => 0.5)).toBe(250);
    expect(resolveDelay(-10, () => 0.5)).toBe(0);
  });

  it("picks within an inclusive [min,max] range using rng", () => {
    expect(resolveDelay([100, 200], () => 0)).toBe(100);
    expect(resolveDelay([100, 200], () => 0.999999)).toBe(200);
    expect(resolveDelay([100, 200], () => 0.5)).toBeGreaterThanOrEqual(100);
    expect(resolveDelay([100, 200], () => 0.5)).toBeLessThanOrEqual(200);
  });

  it("collapses a degenerate range (max <= min) to min", () => {
    expect(resolveDelay([300, 100], () => 0.5)).toBe(300);
  });
});

describe("rollChaos", () => {
  it("never triggers when the rate is 0 or negative", () => {
    expect(rollChaos(0, undefined, () => 0).triggered).toBe(false);
    expect(rollChaos(-1, undefined, () => 0).triggered).toBe(false);
  });

  it("triggers a 500 by default when rng is below the rate", () => {
    const d = rollChaos(1, undefined, () => 0);
    expect(d).toEqual({ triggered: true, status: 500 });
  });

  it("does not trigger when rng is at or above the rate", () => {
    expect(rollChaos(0.5, undefined, () => 0.9).triggered).toBe(false);
    expect(rollChaos(0.5, undefined, () => 0.5).triggered).toBe(false);
  });

  it("picks a status from the configured pool deterministically", () => {
    // First rng() is the probability roll, second selects the status index.
    const seq = [0, 0]; // roll passes, index 0
    let i = 0;
    const rng = (): number => seq[i++]!;
    expect(rollChaos(1, [429, 503], rng).status).toBe(429);
  });

  it("selects the second status when the index roll lands high", () => {
    const seq = [0, 0.99]; // roll passes, index → last
    let i = 0;
    const rng = (): number => seq[i++]!;
    expect(rollChaos(1, [429, 503], rng).status).toBe(503);
  });

  it("is deterministic for a deterministic rng", () => {
    const a = rollChaos(1, [500, 502, 504], () => 0.4);
    const b = rollChaos(1, [500, 502, 504], () => 0.4);
    expect(a).toEqual(b);
  });
});
