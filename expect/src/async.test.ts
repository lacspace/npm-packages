import { describe, it, expect as vi } from "vitest";
import { expect } from "./index";

describe("async matchers", () => {
  it("resolves.toEqual", async () => {
    await expect(Promise.resolve({ a: 1 })).resolves.toEqual({ a: 1 });
    await expect(Promise.resolve(5)).resolves.toBeGreaterThan(3);
  });

  it("resolves.not", async () => {
    await expect(Promise.resolve(1)).resolves.not.toBe(2);
  });

  it("resolves fails when the value mismatches", async () => {
    let threw = false;
    try {
      await expect(Promise.resolve(1)).resolves.toBe(2);
    } catch {
      threw = true;
    }
    vi(threw).toBe(true);
  });

  it("resolves fails when the promise rejects", async () => {
    let threw = false;
    try {
      await expect(Promise.reject(new Error("nope"))).resolves.toBe(1);
    } catch (e) {
      threw = true;
      vi((e as Error).message).toContain("reject");
    }
    vi(threw).toBe(true);
  });

  it("rejects.toThrow", async () => {
    await expect(Promise.reject(new TypeError("bad input"))).rejects.toThrow("bad input");
    await expect(Promise.reject(new TypeError("bad input"))).rejects.toThrow(TypeError);
    await expect(Promise.reject(new Error("x"))).rejects.toThrow(/x/);
  });

  it("rejects fails when the promise resolves", async () => {
    let threw = false;
    try {
      await expect(Promise.resolve(1)).rejects.toThrow();
    } catch (e) {
      threw = true;
      vi((e as Error).message).toContain("resolve");
    }
    vi(threw).toBe(true);
  });

  it("works with real async functions", async () => {
    const load = async (id: number) => {
      if (id < 0) throw new RangeError("id must be >= 0");
      return { id, ok: true };
    };
    await expect(load(1)).resolves.toEqual({ id: 1, ok: true });
    await expect(load(-1)).rejects.toThrow(RangeError);
  });
});
