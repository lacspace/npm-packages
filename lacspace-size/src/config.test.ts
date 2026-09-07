import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseConfig, loadConfig, discoverConfig, CONFIG_FILENAMES } from "./config.js";
import { evaluateBudgets, budgetsPass } from "./budget.js";
import type { FileMeasure } from "./measure.js";

const fm = (path: string, raw: number, gzip: number, brotli: number): FileMeasure => ({ path, raw, gzip, brotli });

describe("discoverConfig", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "lsize-cfg-")); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("returns undefined when no config file exists", () => {
    expect(discoverConfig(dir)).toBeUndefined();
  });

  it("finds a .sizerc.json in the directory", () => {
    const p = join(dir, ".sizerc.json");
    writeFileSync(p, JSON.stringify({ max: "100kb" }));
    expect(discoverConfig(dir)).toBe(p);
  });

  it("exposes the filename priority list", () => {
    expect(CONFIG_FILENAMES[0]).toBe(".sizerc.json");
    expect(CONFIG_FILENAMES).toContain(".sizerc");
  });
});

describe("loadConfig round-trip", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "lsize-cfgload-")); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads and parses a .sizerc.json from disk", () => {
    const p = join(dir, ".sizerc.json");
    writeFileSync(p, JSON.stringify({ metric: "brotli", max: "500kb", budgets: { "*.js": "200kb" } }));
    const cfg = loadConfig(p);
    expect(cfg.metric).toBe("brotli");
    expect(cfg.max).toBe(500_000);
    expect(cfg.budgets).toEqual([{ pattern: "*.js", max: 200_000 }]);
  });
});

describe("config-driven policy evaluation (CI gate)", () => {
  const files: FileMeasure[] = [
    fm("dist/app.js", 300_000, 100_000, 80_000),
    fm("dist/vendor.js", 500_000, 180_000, 150_000),
    fm("dist/style.css", 60_000, 20_000, 15_000),
  ];

  it("passes when every configured budget is within limits", () => {
    const cfg = parseConfig({ metric: "gzip", budgets: { "*.js": "300kb", "*.css": "30kb" } });
    const results = evaluateBudgets(cfg.budgets, files, cfg.metric ?? "gzip");
    expect(budgetsPass(results)).toBe(true);
  });

  it("fails when a configured budget is breached", () => {
    const cfg = parseConfig({ metric: "gzip", budgets: { "*.js": "100kb" } });
    const results = evaluateBudgets(cfg.budgets, files, cfg.metric ?? "gzip");
    expect(budgetsPass(results)).toBe(false);
    expect(results[0]!.over).toBe(180_000); // 280kb summed vs 100kb
  });

  it("evaluates a global max as a ** budget", () => {
    const cfg = parseConfig({ max: "300kb" });
    const results = evaluateBudgets([{ pattern: "**", max: cfg.max! }], files, "gzip");
    expect(results[0]!.actual).toBe(300_000);
    expect(budgetsPass(results)).toBe(true);
  });
});
