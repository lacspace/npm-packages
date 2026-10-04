import { describe, expect, it } from "vitest";
import nabil from "./fixtures/nabil-15m-2026-10-02.json";
import { chartPatterns, describe as describeApi, elliott, harmonics, kagi, pointFigure, sessionVolumeProfiles, swings, tpoProfiles, type Bar } from "./index.js";

// Public NEPSE prices: NABIL 15-minute candles, 22 Sep – 2 Oct 2026 (125 bars), snapshotted
// from ShareRocketPro's candles endpoint. Expected values were reported by the ShareRocketPro
// team running the original lib/patterns.ts with default parameters.
const bars = nabil as Bar[];

describe("NABIL 15m fixture (matches ShareRocketPro's original implementation)", () => {
  it("has the snapshot", () => expect(bars.length).toBe(125));

  it("chartPatterns → Double bottom ×2 + Range (rectangle)", () => {
    expect(chartPatterns(bars).found).toEqual(["Double bottom", "Double bottom", "Range (rectangle)"]);
  });

  it("harmonics → no hits", () => {
    expect(harmonics(bars).hits).toEqual([]);
  });

  it("elliott → Impulse down + Correction", () => {
    const labels = elliott(bars).paths.map((p) => p.label?.replace(/ · .*/, ""));
    expect(labels).toEqual(["Impulse down", "Correction"]);
  });

  it("tpoProfiles(bars, 24, 5) → 5 sessions; last = bars 109–124, POC row 17, VA 527–529.8", () => {
    const t = tpoProfiles(bars, 24, 5);
    expect(t.length).toBe(5);
    const last = t[t.length - 1]!;
    expect([last.from, last.to]).toEqual([109, 124]);
    expect(last.poc).toBe(17);
    expect(last.vaLow).toBeCloseTo(527, 6);
    expect(last.vaHigh).toBeCloseTo(529.8, 6);
  });

  it("swings alternate and session volume profiles cover the sessions", () => {
    const { piv } = swings(bars, 2);
    for (let i = 1; i < piv.length; i++) expect(piv[i]!.hi).not.toBe(piv[i - 1]!.hi);
    expect(sessionVolumeProfiles(bars, 20, 5).length).toBe(5);
  });
});

describe("Kagi / Point & Figure", () => {
  const line: Bar[] = [100, 103, 106, 104, 101, 98, 99, 104, 108].map((c, i) => ({ time: i * 60, open: c, high: c, low: c, close: c, volume: 1 }));
  it("kagi turns on a reversal of rev", () => {
    const k = kagi(line, 3);
    expect(k.bars.map((b) => [b.open, b.close])).toEqual([[100, 106], [106, 98], [98, 108]]);
  });
  it("pointFigure builds X/O columns", () => {
    const p = pointFigure(line, 2, 2);
    expect(p.cols.map((c) => c.up)).toEqual([true, false, true]);
  });
});

it("describe()", () => {
  expect(describeApi().commands.map((c) => c.name)).toContain("chartPatterns");
});
