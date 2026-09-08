import { describe, it, expect } from "vitest";
import {
  cx,
  clamp,
  lerp,
  mapRange,
  easings,
  ease,
  formatCount,
  linearGradient,
  tiltTransform,
  pointerFraction,
  nextIndex,
  scoreMatch,
  filterCommands,
  rankCommands,
  typewriterStep,
  createUid,
  stagger,
  type TypewriterState,
} from "./core";

describe("cx", () => {
  it("joins truthy values and drops falsy ones", () => {
    expect(cx("a", false, null, undefined, "b")).toBe("a b");
  });
  it("drops zero but keeps other numbers", () => {
    expect(cx("col", 0, 3)).toBe("col 3");
  });
  it("returns empty string for no truthy parts", () => {
    expect(cx(false, null, undefined)).toBe("");
  });
});

describe("clamp / lerp / mapRange", () => {
  it("clamps into range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
  it("lerps linearly", () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });
  it("re-maps ranges", () => {
    expect(mapRange(5, 0, 10, 0, 100)).toBe(50);
    expect(mapRange(0, 0, 0, 7, 9)).toBe(7); // zero-width input guard
  });
});

describe("easings", () => {
  it("all easings pin the endpoints", () => {
    for (const fn of Object.values(easings)) {
      expect(fn(0)).toBeCloseTo(0, 6);
      expect(fn(1)).toBeCloseTo(1, 6);
    }
  });
  it("easeOutCubic matches the counter's inline math", () => {
    const t = 0.4;
    expect(easings.easeOutCubic(t)).toBeCloseTo(1 - Math.pow(1 - t, 3), 12);
  });
  it("ease clamps t before applying", () => {
    expect(ease("linear", 2)).toBe(1);
    expect(ease("linear", -3)).toBe(0);
  });
  it("easeOut is ahead of linear mid-way", () => {
    expect(easings.easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("formatCount", () => {
  it("groups thousands and appends suffix", () => {
    expect(formatCount(12480, { suffix: "+" })).toBe("12,480+");
  });
  it("honours decimals and prefix", () => {
    expect(formatCount(1234.5, { decimals: 2, prefix: "$" })).toBe("$1,234.50");
  });
  it("can disable the separator", () => {
    expect(formatCount(1000000, { separator: false })).toBe("1000000");
  });
  it("defaults to a plain integer", () => {
    expect(formatCount(42)).toBe("42");
  });
});

describe("linearGradient", () => {
  it("builds the CSS string with a default angle", () => {
    expect(linearGradient("#22d3ee", "#6366f1")).toBe("linear-gradient(135deg, #22d3ee, #6366f1)");
  });
  it("honours a custom angle", () => {
    expect(linearGradient("red", "blue", 90)).toBe("linear-gradient(90deg, red, blue)");
  });
});

describe("tiltTransform / pointerFraction", () => {
  it("returns no rotation at the centre", () => {
    expect(tiltTransform({ px: 0, py: 0 })).toBe(
      "perspective(900px) rotateY(0deg) rotateX(0deg) scale(1.02)",
    );
  });
  it("tilts by max*fraction and inverts the X axis", () => {
    expect(tiltTransform({ px: 0.5, py: 0.5, max: 8, scale: 1 })).toBe(
      "perspective(900px) rotateY(4deg) rotateX(-4deg) scale(1)",
    );
  });
  it("pointerFraction is centre-relative in [-0.5, 0.5]", () => {
    const rect = { left: 0, top: 0, width: 100, height: 200 };
    expect(pointerFraction(rect, 100, 200)).toEqual({ px: 0.5, py: 0.5 });
    expect(pointerFraction(rect, 50, 100)).toEqual({ px: 0, py: 0 });
  });
  it("guards a zero-size rect", () => {
    expect(pointerFraction({ left: 0, top: 0, width: 0, height: 0 }, 5, 5)).toEqual({ px: 0, py: 0 });
  });
});

describe("nextIndex", () => {
  it("clamps within bounds by default", () => {
    expect(nextIndex(0, -1, 3)).toBe(0);
    expect(nextIndex(2, 1, 3)).toBe(2);
    expect(nextIndex(1, 1, 3)).toBe(2);
  });
  it("wraps when loop is enabled", () => {
    expect(nextIndex(2, 1, 3, { loop: true })).toBe(0);
    expect(nextIndex(0, -1, 3, { loop: true })).toBe(2);
  });
  it("returns 0 for an empty list", () => {
    expect(nextIndex(0, 1, 0)).toBe(0);
  });
});

describe("scoreMatch", () => {
  it("ranks exact > prefix > substring > subsequence > none", () => {
    expect(scoreMatch("Settings", "settings")).toBeGreaterThan(scoreMatch("Settings", "sett"));
    expect(scoreMatch("Settings", "sett")).toBeGreaterThan(scoreMatch("Open settings", "sett"));
    expect(scoreMatch("Sign out", "sgt")).toBeGreaterThan(0); // subsequence
    expect(scoreMatch("Sign out", "zzz")).toBe(0);
  });
  it("treats a blank query as a match", () => {
    expect(scoreMatch("anything", "   ")).toBe(1);
  });
});

describe("filterCommands", () => {
  const items = [
    { label: "Go home", group: "Nav" },
    { label: "Read docs", group: "Help" },
  ];
  const key = (i: (typeof items)[number]) => `${i.label} ${i.group}`;
  it("returns everything for a blank query", () => {
    expect(filterCommands(items, "  ", key)).toHaveLength(2);
  });
  it("narrows by case-insensitive substring", () => {
    expect(filterCommands(items, "help", key)).toEqual([items[1]]);
  });
});

describe("rankCommands", () => {
  const items = [{ label: "Open settings" }, { label: "Settings" }];
  const key = (i: (typeof items)[number]) => i.label;
  it("orders better matches first and drops non-matches", () => {
    const out = rankCommands(items, "settings", key);
    expect(out[0]).toBe(items[1]); // exact beats substring
    expect(out).toHaveLength(2);
    expect(rankCommands(items, "zzz", key)).toHaveLength(0);
  });
  it("returns the list unchanged for a blank query", () => {
    expect(rankCommands(items, "", key)).toBe(items);
  });
});

describe("typewriterStep", () => {
  it("types one character at a time", () => {
    const s: TypewriterState = { text: "fa", wordIndex: 0, deleting: false };
    const { state, delay } = typewriterStep(["faster"], s, { typeSpeed: 70 });
    expect(state.text).toBe("fas");
    expect(delay).toBe(70);
  });
  it("switches to deleting after a full word (holds)", () => {
    const s: TypewriterState = { text: "faster", wordIndex: 0, deleting: false };
    const { state, delay } = typewriterStep(["faster"], s, { hold: 1400 });
    expect(state.deleting).toBe(true);
    expect(delay).toBe(1400);
  });
  it("advances to the next word once fully deleted", () => {
    const s: TypewriterState = { text: "", wordIndex: 0, deleting: true };
    const { state } = typewriterStep(["a", "b"], s);
    expect(state.wordIndex).toBe(1);
    expect(state.deleting).toBe(false);
  });
  it("is safe on an empty word list", () => {
    const s: TypewriterState = { text: "", wordIndex: 0, deleting: false };
    expect(typewriterStep([], s).state.text).toBe("");
  });
});

describe("createUid / stagger", () => {
  it("produces prefixed, unique, deterministic ids", () => {
    const a = createUid("mq");
    const first = a();
    const second = a();
    expect(first.startsWith("mq-")).toBe(true);
    expect(first).not.toBe(second);
    const b = createUid("mq");
    expect(b()).toBe(first); // same seed sequence
  });
  it("computes stagger delays", () => {
    expect(stagger(0)).toBe(0);
    expect(stagger(3, 0.08)).toBeCloseTo(0.24, 10);
    expect(stagger(-5, 0.08)).toBe(0); // negative index guarded
  });
});
