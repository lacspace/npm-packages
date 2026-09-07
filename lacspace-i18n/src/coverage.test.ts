import { describe, it, expect } from "vitest";
import { localeCoverage, coverageReport, belowThreshold } from "./coverage.js";

const base = { a: "A", b: "B", c: "C", d: "D" };

describe("localeCoverage", () => {
  it("counts translated / total as a percentage", () => {
    const r = localeCoverage("ne", base, { a: "क", b: "ख" });
    expect(r.total).toBe(4);
    expect(r.translated).toBe(2);
    expect(r.coverage).toBe(50);
  });

  it("excludes empty values", () => {
    const r = localeCoverage("ne", base, { a: "क", b: "" });
    expect(r.translated).toBe(1);
    expect(r.coverage).toBe(25);
  });

  it("excludes marker values from the translated count", () => {
    const r = localeCoverage("ne", base, { a: "क", b: "__MISSING__", c: "ग" });
    expect(r.translated).toBe(2);
    expect(r.markers).toBe(1);
    expect(r.coverage).toBe(50);
  });

  it("honours a custom marker list", () => {
    const r = localeCoverage("ne", base, { a: "[TODO]", b: "ख" }, { markers: ["[TODO]"] });
    expect(r.translated).toBe(1);
    expect(r.markers).toBe(1);
  });

  it("is 100% for an empty base", () => {
    expect(localeCoverage("x", {}, {}).coverage).toBe(100);
  });

  it("rounds to one decimal place", () => {
    const r = localeCoverage("ne", { a: "", b: "", c: "" }, { a: "x" });
    expect(r.coverage).toBe(33.3);
  });
});

describe("coverageReport + belowThreshold", () => {
  const locales = [
    { code: "en", flat: base },
    { code: "fr", flat: { a: "A", b: "B", c: "C", d: "D" } },
    { code: "ne", flat: { a: "क" } },
  ];

  it("reports every non-base locale", () => {
    const r = coverageReport(base, locales, "en");
    expect(r.map((x) => x.locale).sort()).toEqual(["fr", "ne"]);
    expect(r.find((x) => x.locale === "fr")!.coverage).toBe(100);
    expect(r.find((x) => x.locale === "ne")!.coverage).toBe(25);
  });

  it("finds locales below a threshold", () => {
    const r = coverageReport(base, locales, "en");
    const failing = belowThreshold(r, 80);
    expect(failing.map((x) => x.locale)).toEqual(["ne"]);
  });

  it("returns nothing below threshold when all pass", () => {
    const r = coverageReport(base, locales, "en");
    expect(belowThreshold(r, 20)).toEqual([]);
  });
});
