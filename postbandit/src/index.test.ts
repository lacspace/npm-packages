import { describe, expect, it } from "vitest";
import { Bandit, createBandit, describe as describeApi } from "./index.js";

describe("Bandit — Thompson sampling", () => {
  it("is deterministic when seeded", () => {
    const a = createBandit(["x", "y", "z"], { seed: 42 });
    const b = createBandit(["x", "y", "z"], { seed: 42 });
    const seqA = Array.from({ length: 5 }, () => a.choose());
    const seqB = Array.from({ length: 5 }, () => b.choose());
    expect(seqA).toEqual(seqB);
  });

  it("converges on the arm with the best reward", () => {
    const b = createBandit(["good", "bad"], { seed: 7 });
    // Simulate: "good" pays off 80% of the time, "bad" 10%.
    const rng = (() => {
      let s = 123;
      return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    })();
    for (let i = 0; i < 200; i++) {
      const arm = b.choose();
      const p = arm === "good" ? 0.8 : 0.1;
      b.update(arm, rng() < p ? 1 : 0);
    }
    expect(b.best()).toBe("good");
    const good = b.stats().find((s) => s.id === "good")!;
    expect(good.mean).toBeGreaterThan(0.6);
  });

  it("accepts fractional rewards and booleans", () => {
    const b = createBandit(["a"]);
    b.update("a", 0.5);
    b.update("a", true);
    const s = b.stats()[0]!;
    expect(s.pulls).toBe(2);
    expect(s.alpha).toBeCloseTo(1 + 1.5, 5); // prior 1 + 0.5 + 1
  });

  it("adds unknown arms on update and ranks all arms", () => {
    const b = createBandit(["a", "b"], { seed: 1 });
    b.update("c", 1); // new arm
    expect(b.stats().some((s) => s.id === "c")).toBe(true);
    expect(new Set(b.rank())).toEqual(new Set(["a", "b", "c"]));
  });

  it("round-trips through JSON (persistable state)", () => {
    const b = createBandit(["a", "b"], { seed: 3 });
    b.update("a", 1);
    b.update("b", 0);
    const restored = Bandit.fromJSON(b.toJSON(), { seed: 3 });
    expect(restored.stats()).toEqual(b.stats());
  });

  it("describe() advertises the bandit commands", () => {
    expect(describeApi().commands.map((c) => c.name)).toEqual(expect.arrayContaining(["choose", "update", "stats"]));
  });
});
