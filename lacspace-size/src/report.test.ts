import { describe, it, expect } from "vitest";
import { buildJsonReport, toMarkdown, toMarkdownComment, formatSummaryLine, pct } from "./report.js";
import { rollupByExtension, sumTotals } from "./analyze.js";
import { parseConfig } from "./config.js";
import { buildBaseline, diffBaseline } from "./baseline.js";
import type { AnalyzeResult } from "./analyze.js";
import type { FileMeasure } from "./measure.js";

const fm = (path: string, raw: number, gzip: number, brotli: number): FileMeasure => ({ path, raw, gzip, brotli });

const files: FileMeasure[] = [
  fm("dist/vendor.js", 2000, 800, 600),
  fm("dist/app.js", 1000, 400, 300),
  fm("dist/style.css", 500, 200, 150),
];
const result: AnalyzeResult = {
  files,
  total: sumTotals(files),
  byExtension: rollupByExtension(files),
  withBrotli: true,
  withGzip: true,
};

describe("pct", () => {
  it("computes a percentage, 0 when whole is 0", () => {
    expect(pct(50, 200)).toBe(25);
    expect(pct(1, 0)).toBe(0);
  });
});

describe("buildJsonReport", () => {
  it("includes totals, files, byExtension and metric", () => {
    const r = buildJsonReport(result, { metric: "gzip" });
    expect((r.total as { gzip: number }).gzip).toBe(1400);
    expect((r.files as unknown[]).length).toBe(3);
    expect(r.metric).toBe("gzip");
  });

  it("honours --top", () => {
    const r = buildJsonReport(result, { metric: "gzip", top: 2 });
    expect((r.files as unknown[]).length).toBe(2);
  });

  it("omits brotli columns when withBrotli is false", () => {
    const r = buildJsonReport({ ...result, withBrotli: false }, { metric: "gzip" });
    const first = (r.files as Array<Record<string, unknown>>)[0]!;
    expect("brotli" in first).toBe(false);
  });
});

describe("toMarkdown", () => {
  it("renders a table with a totals summary", () => {
    const md = toMarkdown(result, { metric: "gzip" });
    expect(md).toContain("## Size report");
    expect(md).toContain("| File | Raw | Gzip | Brotli | % |");
    expect(md).toContain("`dist/vendor.js`");
    expect(md).toContain("By extension");
  });

  it("includes a budgets section when provided", () => {
    const md = toMarkdown(result, {
      metric: "gzip",
      budgets: [{ pattern: "*.js", max: 1000, actual: 1200, matched: 2, metric: "gzip", ok: false, over: 200 }],
    });
    expect(md).toContain("Budgets");
    expect(md).toContain("over by");
  });
});

describe("formatSummaryLine", () => {
  it("packs files + raw/gzip/brotli totals into one line", () => {
    const line = formatSummaryLine(result, { metric: "gzip" });
    expect(line).toContain("3 files");
    expect(line).toContain("raw ");
    expect(line).toContain("gzip ");
    expect(line).toContain("brotli ");
  });

  it("appends a budgets pass count when budgets are supplied", () => {
    const line = formatSummaryLine(result, {
      metric: "gzip",
      budgets: [
        { pattern: "*.js", max: 1000, actual: 1200, matched: 2, metric: "gzip", ok: false, over: 200 },
        { pattern: "*.css", max: 1000, actual: 200, matched: 1, metric: "gzip", ok: true, over: -800 },
      ],
    });
    expect(line).toContain("budgets 1/2");
  });

  it("appends a signed Δ when a diff is supplied", () => {
    const baseline = buildBaseline({ ...result, total: sumTotals([fm("dist/vendor.js", 1000, 400, 300)]), files: [fm("dist/vendor.js", 1000, 400, 300)] });
    const diff = diffBaseline(result, baseline, "gzip");
    const line = formatSummaryLine(result, { metric: "gzip", diff });
    expect(line).toMatch(/Δ [+-]/);
    expect(line).toContain("%");
  });
});

describe("toMarkdownComment", () => {
  it("renders a compact PR-comment table with a Total row", () => {
    const md = toMarkdownComment(result, { metric: "gzip" });
    expect(md).toContain("### 📦 Size report");
    expect(md).toContain("| File | Raw | Gzip | Brotli |");
    expect(md).toContain("**Total**");
    expect(md).not.toContain("Δ gzip"); // no diff → no delta column
  });

  it("adds a signed Δ column when a baseline diff is present", () => {
    const baseline = buildBaseline({
      ...result,
      files: [fm("dist/vendor.js", 1500, 600, 450), fm("dist/app.js", 1000, 400, 300)],
      total: sumTotals([fm("dist/vendor.js", 1500, 600, 450), fm("dist/app.js", 1000, 400, 300)]),
    });
    const diff = diffBaseline(result, baseline, "gzip");
    const md = toMarkdownComment(result, { metric: "gzip", diff });
    expect(md).toContain("Δ gzip");
    expect(md).toMatch(/[+-]\d/); // a signed number somewhere
  });

  it("notes budget status", () => {
    const md = toMarkdownComment(result, {
      metric: "gzip",
      budgets: [{ pattern: "*.js", max: 100, actual: 200, matched: 1, metric: "gzip", ok: false, over: 100 }],
    });
    expect(md).toContain("budget");
  });
});

describe("buildJsonReport — 0.2.0 additive fields", () => {
  it("includes a summary line", () => {
    const r = buildJsonReport(result, { metric: "gzip" });
    expect(typeof r.summary).toBe("string");
  });

  it("folds in a changed[] list on the diff", () => {
    const baseline = buildBaseline({
      ...result,
      files: [fm("dist/vendor.js", 2000, 900, 700), fm("dist/app.js", 1000, 400, 300)],
      total: sumTotals([fm("dist/vendor.js", 2000, 900, 700), fm("dist/app.js", 1000, 400, 300)]),
    });
    const diff = diffBaseline(result, baseline, "gzip");
    const r = buildJsonReport(result, { metric: "gzip", diff });
    const d = r.diff as Record<string, unknown>;
    expect(Array.isArray(d.changed)).toBe(true);
  });
});

describe("parseConfig", () => {
  it("parses metric, max and a budgets map", () => {
    const cfg = parseConfig({ metric: "brotli", max: "500kb", budgets: { "*.js": "200kb" } });
    expect(cfg.metric).toBe("brotli");
    expect(cfg.max).toBe(500_000);
    expect(cfg.budgets).toEqual([{ pattern: "*.js", max: 200_000 }]);
  });

  it("parses a budgets array of specs", () => {
    const cfg = parseConfig({ budgets: ["*.css:50kb"] });
    expect(cfg.budgets).toEqual([{ pattern: "*.css", max: 50_000 }]);
  });

  it("rejects a bad metric", () => {
    expect(() => parseConfig({ metric: "nope" })).toThrow();
  });
});
