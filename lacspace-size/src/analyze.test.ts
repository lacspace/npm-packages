import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyze, extOf, rollupByExtension, sumTotals, pick } from "./analyze.js";
import type { FileMeasure } from "./measure.js";

const fm = (path: string, raw: number, gzip: number, brotli: number): FileMeasure => ({ path, raw, gzip, brotli });

describe("extOf", () => {
  it("extracts a lowercased extension", () => {
    expect(extOf("dist/app.JS")).toBe(".js");
    expect(extOf("a/b/style.css")).toBe(".css");
  });
  it("returns (none) for no-dot names and dotfiles", () => {
    expect(extOf("README")).toBe("(none)");
    expect(extOf(".env")).toBe("(none)");
  });
});

describe("rollupByExtension", () => {
  it("groups and sums by extension, largest raw first", () => {
    const rows = rollupByExtension([
      fm("a.js", 100, 40, 30),
      fm("b.js", 200, 80, 60),
      fm("c.css", 50, 20, 15),
    ]);
    expect(rows[0]!.ext).toBe(".js");
    expect(rows[0]!.count).toBe(2);
    expect(rows[0]!.raw).toBe(300);
    expect(rows[1]!.ext).toBe(".css");
  });
});

describe("sumTotals", () => {
  it("sums sizes and counts files", () => {
    const t = sumTotals([fm("a", 100, 40, 30), fm("b", 200, 80, 60)]);
    expect(t).toEqual({ files: 2, raw: 300, gzip: 120, brotli: 90 });
  });
});

describe("pick", () => {
  it("selects the metric", () => {
    const s = { raw: 10, gzip: 5, brotli: 3 };
    expect(pick(s, "raw")).toBe(10);
    expect(pick(s, "gzip")).toBe(5);
    expect(pick(s, "brotli")).toBe(3);
  });
});

describe("analyze (end to end on a temp dir)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lsize-analyze-"));
    mkdirSync(join(dir, "dist"));
    writeFileSync(join(dir, "dist", "big.js"), "x".repeat(9000));
    writeFileSync(join(dir, "dist", "small.css"), "y".repeat(1000));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("measures all files and sorts largest-first", () => {
    const r = analyze(["dist"], { cwd: dir });
    expect(r.total.files).toBe(2);
    expect(r.files[0]!.path).toBe("dist/big.js");
    expect(r.files[0]!.raw).toBe(9000);
    expect(r.total.raw).toBe(10000);
    expect(r.withBrotli).toBe(true);
    expect(r.byExtension.map((e) => e.ext)).toEqual([".js", ".css"]);
  });

  it("skips brotli when disabled", () => {
    const r = analyze(["dist"], { cwd: dir, brotli: false });
    expect(r.withBrotli).toBe(false);
    expect(r.total.brotli).toBe(0);
    expect(r.total.gzip).toBeGreaterThan(0);
  });
});
