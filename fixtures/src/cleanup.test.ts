import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanupCount,
  clearCleanup,
  registerCleanup,
  runCleanup,
} from "./index";

describe("cleanup lifecycle", () => {
  beforeEach(() => {
    clearCleanup();
  });

  it("runs teardown functions in reverse (LIFO) order", async () => {
    const order: number[] = [];
    registerCleanup(() => void order.push(1));
    registerCleanup(() => void order.push(2));
    registerCleanup(() => void order.push(3));
    await runCleanup();
    expect(order).toEqual([3, 2, 1]);
  });

  it("awaits async teardown functions", async () => {
    let done = false;
    registerCleanup(async () => {
      await Promise.resolve();
      done = true;
    });
    await runCleanup();
    expect(done).toBe(true);
  });

  it("clears the registry after running", async () => {
    registerCleanup(() => {});
    expect(cleanupCount()).toBe(1);
    await runCleanup();
    expect(cleanupCount()).toBe(0);
  });

  it("unregister() removes a pending teardown", async () => {
    let ran = false;
    const off = registerCleanup(() => void (ran = true));
    off();
    await runCleanup();
    expect(ran).toBe(false);
    expect(cleanupCount()).toBe(0);
  });

  it("clearCleanup() drops teardowns without running them", async () => {
    let ran = false;
    registerCleanup(() => void (ran = true));
    clearCleanup();
    await runCleanup();
    expect(ran).toBe(false);
  });

  it("runs every teardown even if one throws, then rethrows", async () => {
    const ran: number[] = [];
    registerCleanup(() => void ran.push(1));
    registerCleanup(() => {
      throw new Error("boom");
    });
    registerCleanup(() => void ran.push(3));
    await expect(runCleanup()).rejects.toThrow("boom");
    // 3 registered last runs first, 1 last — both ran despite the middle throw.
    expect(ran).toEqual([3, 1]);
  });

  it("aggregates multiple errors", async () => {
    registerCleanup(() => {
      throw new Error("a");
    });
    registerCleanup(() => {
      throw new Error("b");
    });
    await expect(runCleanup()).rejects.toBeInstanceOf(AggregateError);
  });
});
