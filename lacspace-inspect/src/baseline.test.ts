import { describe, it, expect } from "vitest";
import { diffReports } from "./baseline.js";
import { analyzeHtml } from "./checks.js";
import type { Report } from "./types.js";

const HTTPS = "https://example.com/";

const GOOD = `<html lang="en"><head>
  <meta charset="utf-8">
  <title>A Perfectly Reasonable Page Title</title>
  <meta name="description" content="This description sits comfortably within the fifty to one hundred sixty character sweet spot for search snippets today.">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="https://example.com/">
</head><body><h1>The One True Heading</h1><p>${"word ".repeat(200)}</p></body></html>`;

const REGRESSED = `<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head><body><h1>One</h1><h1>Two</h1><p>${"word ".repeat(200)}</p></body></html>`;

describe("diffReports", () => {
  it("finds no regression when the report is unchanged", () => {
    const r = analyzeHtml(GOOD, { url: HTTPS });
    expect(diffReports(r, r)).toEqual([]);
  });

  it("detects overall, category and finding regressions", () => {
    const base = analyzeHtml(GOOD, { url: HTTPS });
    const now = analyzeHtml(REGRESSED, { url: HTTPS });
    const regs = diffReports(base, now);
    expect(regs.length).toBeGreaterThan(0);

    // Overall grade/score dropped.
    expect(regs.some((x) => x.kind === "overall")).toBe(true);
    // The title finding went from ok → fail.
    const titleReg = regs.find((x) => x.kind === "finding" && x.id === "seo.title");
    expect(titleReg).toBeTruthy();
    expect(titleReg!.before).toBe("ok");
    expect(titleReg!.after).toBe("fail");
    // A category score dropped.
    expect(regs.some((x) => x.kind === "category")).toBe(true);
  });

  it("does not flag improvements as regressions", () => {
    const base = analyzeHtml(REGRESSED, { url: HTTPS });
    const now = analyzeHtml(GOOD, { url: HTTPS });
    expect(diffReports(base, now)).toEqual([]);
  });

  it("honours a score tolerance", () => {
    const base = analyzeHtml(GOOD, { url: HTTPS }) as Report;
    const now = analyzeHtml(GOOD, { url: HTTPS }) as Report;
    now.score = base.score - 1; // a 1-point wobble
    expect(diffReports(base, now, 1)).toEqual([]);      // within tolerance
    expect(diffReports(base, now, 0).length).toBeGreaterThan(0); // not tolerated
  });
});
