import { describe, it, expect } from "vitest";
import { formatMarkdown, formatHtml, formatSiteMarkdown, formatLeaderboard, formatRegressions } from "./formats.js";
import { analyzeHtml } from "./checks.js";
import { auditPage, analyzeSite } from "./site.js";
import type { Regression } from "./types.js";

const HTTPS = "https://example.com/";
const report = analyzeHtml("<html><body><p>hi</p></body></html>", { url: HTTPS });

describe("formatMarkdown", () => {
  it("renders a grade heading, a category table and inline fixes", () => {
    const md = formatMarkdown(report);
    expect(md).toMatch(/^## ◆ lacspace-inspect —/m);
    expect(md).toContain("| Category | Grade | Score |");
    expect(md).toContain("**Fix:**"); // failing findings carry a fix
    expect(md).toContain("SEO & Meta");
  });

  it("lists passing checks only in verbose mode", () => {
    expect(formatMarkdown(report, true).length).toBeGreaterThan(formatMarkdown(report, false).length);
  });
});

describe("formatHtml", () => {
  it("produces a standalone, self-contained HTML document", () => {
    const html = formatHtml(report);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<style>");
    expect(html).toContain(HTTPS);
    expect(html).toContain("class=\"fix\""); // fixes rendered
    expect(html).not.toContain("<script"); // no external/JS dependencies
  });
});

describe("formatSiteMarkdown", () => {
  it("renders a leaderboard table and duplicate-title section", () => {
    const a = auditPage(`<title>Dup</title><h1>a</h1>`, { url: "https://example.com/a", status: 200 });
    const b = auditPage(`<title>Dup</title><h1>b</h1>`, { url: "https://example.com/b", status: 200 });
    const md = formatSiteMarkdown(analyzeSite("https://example.com/", [a, b]));
    expect(md).toContain("### Leaderboard");
    expect(md).toContain("| Grade | Score | URL |");
    expect(md).toContain("Duplicate `<title>`");
  });
});

describe("formatLeaderboard + formatRegressions", () => {
  it("ranks batch entries best-first", () => {
    const out = formatLeaderboard([
      { url: "b", score: 50, grade: "F" },
      { url: "a", score: 95, grade: "A" },
    ]);
    expect(out.indexOf("a")).toBeLessThan(out.indexOf("b")); // A ranked above F
  });

  it("summarises regressions or a clean pass", () => {
    expect(formatRegressions([])).toContain("No regressions");
    const regs: Regression[] = [{ kind: "overall", id: "overall.grade", message: "dropped A → C", before: "A", after: "C" }];
    expect(formatRegressions(regs)).toContain("1 regression");
  });
});
