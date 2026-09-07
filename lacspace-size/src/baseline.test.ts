import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildBaseline, saveBaseline, loadBaseline, validateBaseline,
  diffBaseline, exceedsMaxIncrease, parseMaxIncrease,
} from "./baseline.js";
import type { AnalyzeResult } from "./analyze.js";
import type { FileMeasure } from "./measure.js";

const fm = (path: string, raw: number, gzip: number, brotli: number): FileMeasure => ({ path, raw, gzip, brotli });

function result(files: FileMeasure[]): AnalyzeResult {
  const total = files.reduce(
    (t, f) => ({ files: t.files + 1, raw: t.raw + f.raw, gzip: t.gzip + f.gzip, brotli: t.brotli + f.brotli }),
    { files: 0, raw: 0, gzip: 0, brotli: 0 },
  );
  return { files, total, byExtension: [], withBrotli: true, withGzip: true };
}

const base = result([
  fm("app.js", 1000, 400, 300),
  fm("vendor.js", 2000, 800, 600),
  fm("old.css", 500, 200, 150),
]);

describe("buildBaseline / validate", () => {
  it("captures per-file and total sizes", () => {
    const b = buildBaseline(base);
    expect(b.tool).toBe("lacspace-size");
    expect(b.total.gzip).toBe(1400);
    expect(b.files["app.js"]).toEqual({ raw: 1000, gzip: 400, brotli: 300 });
  });

  it("rejects non-baseline objects", () => {
    expect(() => validateBaseline({})).toThrow();
    expect(() => validateBaseline({ tool: "other" })).toThrow();
  });
});

describe("save → load round-trip", () => {
  let dir: string;
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), "lsize-base-")); });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("writes and reads back an identical baseline", () => {
    const path = join(dir, "snap.json");
    saveBaseline(path, base);
    const loaded = loadBaseline(path);
    expect(loaded.total).toEqual(buildBaseline(base).total);
    expect(loaded.files["vendor.js"]!.gzip).toBe(800);
  });
});

describe("diffBaseline", () => {
  const baseline = buildBaseline(base);
  // Current: app grew, vendor shrank, old.css removed, new.js added.
  const current = result([
    fm("app.js", 1000, 500, 380),   // grew +100 gzip
    fm("vendor.js", 2000, 700, 520), // shrank -100 gzip
    fm("new.js", 300, 120, 90),      // added
  ]);

  it("classifies added / removed / grew / shrank", () => {
    const d = diffBaseline(current, baseline, "gzip");
    expect(d.grew.map((f) => f.path)).toEqual(["app.js"]);
    expect(d.shrank.map((f) => f.path)).toEqual(["vendor.js"]);
    expect(d.added.map((f) => f.path)).toEqual(["new.js"]);
    expect(d.removed.map((f) => f.path)).toEqual(["old.css"]);
  });

  it("computes total delta and percent", () => {
    const d = diffBaseline(current, baseline, "gzip");
    // before gzip total = 1400, after = 500+700+120 = 1320
    expect(d.before).toBe(1400);
    expect(d.after).toBe(1320);
    expect(d.delta).toBe(-80);
    expect(d.percent).toBeCloseTo((-80 / 1400) * 100);
  });

  it("per-file deltas are sorted by magnitude", () => {
    const d = diffBaseline(current, baseline, "gzip");
    const mags = d.files.map((f) => Math.abs(f.delta));
    for (let i = 1; i < mags.length; i++) expect(mags[i - 1]!).toBeGreaterThanOrEqual(mags[i]!);
  });
});

describe("parseMaxIncrease + exceedsMaxIncrease", () => {
  it("parses percent and size thresholds", () => {
    expect(parseMaxIncrease("10%")).toEqual({ kind: "percent", value: 10 });
    expect(parseMaxIncrease("5kb")).toEqual({ kind: "bytes", value: 5000 });
  });

  const grow = diffBaseline(result([fm("a.js", 2000, 1600, 1200)]), buildBaseline(result([fm("a.js", 1000, 1000, 800)])), "gzip");
  // before 1000, after 1600, delta +600, percent +60%

  it("fails a byte threshold when exceeded", () => {
    expect(exceedsMaxIncrease(grow, { kind: "bytes", value: 500 })).toBe(true);
    expect(exceedsMaxIncrease(grow, { kind: "bytes", value: 700 })).toBe(false);
  });

  it("fails a percent threshold when exceeded", () => {
    expect(exceedsMaxIncrease(grow, { kind: "percent", value: 50 })).toBe(true);
    expect(exceedsMaxIncrease(grow, { kind: "percent", value: 70 })).toBe(false);
  });

  it("never fails when size dropped", () => {
    const shrink = diffBaseline(result([fm("a.js", 500, 400, 300)]), buildBaseline(result([fm("a.js", 1000, 1000, 800)])), "gzip");
    expect(exceedsMaxIncrease(shrink, { kind: "bytes", value: 0 })).toBe(false);
  });
});
