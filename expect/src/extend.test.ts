import { describe, it, expect as vi } from "vitest";
import { expect } from "./index";
import type { MatcherContext } from "./index";

describe("expect.extend custom matchers", () => {
  expect.extend({
    toBeWithinRange(this: MatcherContext, received: number, floor: number, ceiling: number) {
      const pass = received >= floor && received <= ceiling;
      return {
        pass,
        message: () =>
          `expect(${received})${this.isNot ? ".not" : ""}.toBeWithinRange(${floor}, ${ceiling})`,
      };
    },
    toBeEven(this: MatcherContext, received: number) {
      return {
        pass: received % 2 === 0,
        message: () => `expected ${received} to be even`,
      };
    },
  });

  it("registers and runs a custom matcher", () => {
    (expect(5) as any).toBeWithinRange(1, 10);
    vi(() => (expect(50) as any).toBeWithinRange(1, 10)).toThrow();
  });

  it("custom matcher supports .not", () => {
    (expect(50) as any).not.toBeWithinRange(1, 10);
    vi(() => (expect(5) as any).not.toBeWithinRange(1, 10)).toThrow();
  });

  it("custom matcher works through resolves", async () => {
    await (expect(Promise.resolve(4)) as any).resolves.toBeEven();
  });

  it("uses the custom failure message", () => {
    let msg = "";
    try {
      (expect(3) as any).toBeEven();
    } catch (e) {
      msg = (e as Error).message;
    }
    vi(msg).toContain("to be even");
  });

  it("rejects non-function matchers", () => {
    vi(() => expect.extend({ bad: 123 as any })).toThrow();
  });
});
