import { describe, it, expect } from "vitest";
import { parseBudgetSpec, fileMatchesBudget, evaluateBudget, evaluateBudgets, budgetsPass } from "./budget.js";
import type { FileMeasure } from "./measure.js";

const fm = (path: string, raw: number, gzip: number, brotli: number): FileMeasure => ({ path, raw, gzip, brotli });

const files: FileMeasure[] = [
  fm("dist/app.js", 300_000, 100_000, 80_000),
  fm("dist/vendor.js", 500_000, 180_000, 150_000),
  fm("dist/style.css", 60_000, 20_000, 15_000),
];

describe("parseBudgetSpec", () => {
  it("parses pattern:size", () => {
    expect(parseBudgetSpec("*.js:200kb")).toEqual({ pattern: "*.js", max: 200_000 });
  });
  it("uses the last colon so paths survive", () => {
    expect(parseBudgetSpec("dist/**/*.js:1mb")).toEqual({ pattern: "dist/**/*.js", max: 1_000_000 });
  });
  it("a bare size becomes a ** budget", () => {
    expect(parseBudgetSpec("500kb")).toEqual({ pattern: "**", max: 500_000 });
  });
});

describe("fileMatchesBudget", () => {
  it("* and ** match everything", () => {
    expect(fileMatchesBudget("**", "dist/app.js")).toBe(true);
    expect(fileMatchesBudget("*", "anything")).toBe(true);
  });
  it("basename patterns match anywhere", () => {
    expect(fileMatchesBudget("*.js", "dist/app.js")).toBe(true);
    expect(fileMatchesBudget("*.css", "dist/app.js")).toBe(false);
  });
  it("path patterns match by path", () => {
    expect(fileMatchesBudget("dist/**/*.js", "dist/app.js")).toBe(true);
  });
});

describe("evaluateBudget", () => {
  it("passes when the summed metric is within budget", () => {
    const r = evaluateBudget({ pattern: "*.css", max: 30_000 }, files, "gzip");
    expect(r.matched).toBe(1);
    expect(r.actual).toBe(20_000);
    expect(r.ok).toBe(true);
    expect(r.over).toBe(-10_000);
  });

  it("fails and reports the overage when over budget", () => {
    const r = evaluateBudget({ pattern: "*.js", max: 200_000 }, files, "gzip");
    expect(r.matched).toBe(2);
    expect(r.actual).toBe(280_000);
    expect(r.ok).toBe(false);
    expect(r.over).toBe(80_000);
  });

  it("honours the chosen metric", () => {
    const raw = evaluateBudget({ pattern: "**", max: 1_000_000 }, files, "raw");
    expect(raw.actual).toBe(860_000);
    const br = evaluateBudget({ pattern: "**", max: 1_000_000 }, files, "brotli");
    expect(br.actual).toBe(245_000);
  });
});

describe("evaluateBudgets + budgetsPass (exit-code decision)", () => {
  it("passes only when every budget passes", () => {
    const ok = evaluateBudgets([{ pattern: "*.css", max: 30_000 }], files, "gzip");
    expect(budgetsPass(ok)).toBe(true);

    const mixed = evaluateBudgets(
      [{ pattern: "*.css", max: 30_000 }, { pattern: "*.js", max: 100_000 }],
      files,
      "gzip",
    );
    expect(budgetsPass(mixed)).toBe(false);
  });

  it("empty budget set passes", () => {
    expect(budgetsPass([])).toBe(true);
  });
});
