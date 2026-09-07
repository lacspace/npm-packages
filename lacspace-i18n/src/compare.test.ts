import { describe, it, expect } from "vitest";
import { compareLocale, compareAll } from "./compare.js";

const base = { "a.b": "Hello", greeting: "Hi", bye: "Bye", n: "3" };

describe("compareLocale", () => {
  it("detects missing keys", () => {
    const r = compareLocale("ne", base, { "a.b": "Namaste", greeting: "Namaskar" });
    expect(r.missing).toEqual(["bye", "n"]);
  });

  it("detects extra keys not in base", () => {
    const r = compareLocale("ne", base, { ...base, stale: "x" });
    expect(r.extra).toEqual(["stale"]);
  });

  it("detects empty and identical values", () => {
    const r = compareLocale("ne", base, { "a.b": "", greeting: "Hi", bye: "Bidaa", n: "3" });
    expect(r.empty).toEqual(["a.b"]);
    expect(r.identical).toEqual(["greeting", "n"]);
  });

  it("treats null as empty", () => {
    const r = compareLocale("ne", base, { ...base, bye: null });
    expect(r.empty).toContain("bye");
  });

  it("computes coverage as translated / total", () => {
    // 2 of 4 translated (a.b, greeting present & non-empty; bye missing; n empty)
    const r = compareLocale("ne", base, { "a.b": "x", greeting: "y", n: "" });
    expect(r.total).toBe(4);
    expect(r.translated).toBe(2);
    expect(r.coverage).toBe(50);
  });

  it("reports 100% coverage for a complete locale", () => {
    const r = compareLocale("fr", base, { ...base });
    expect(r.coverage).toBe(100);
    expect(r.missing).toEqual([]);
  });
});

describe("compareAll", () => {
  it("skips the base locale and compares the rest", () => {
    const locales = [
      { code: "en", flat: base },
      { code: "ne", flat: { "a.b": "x" } },
      { code: "fr", flat: { ...base } },
    ];
    const results = compareAll(base, locales, "en");
    expect(results.map((r) => r.locale)).toEqual(["ne", "fr"]);
    expect(results[0]!.missing.length).toBe(3);
    expect(results[1]!.coverage).toBe(100);
  });
});
