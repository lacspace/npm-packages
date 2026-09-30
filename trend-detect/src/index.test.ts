import { describe, expect, it } from "vitest";
import { detectTrends, type Item } from "./index.js";

const HOUR = 3_600_000;
function mk(term: string, hoursAgo: number, now: number, category?: string, id?: string): Item {
  return { text: term, at: now - hoursAgo * HOUR, category, id };
}

describe("detectTrends", () => {
  const now = 1_700_000_000_000;

  it("ranks a bursting term above a steady one", () => {
    const items: Item[] = [];
    // "election" is steady: ~1/day across the baseline, 1 recent.
    for (let d = 1; d <= 7; d++) items.push(mk("election", d * 24, now));
    items.push(mk("election", 2, now));
    // "flood" is bursting: absent in baseline, 6 in the last window.
    for (let k = 0; k < 6; k++) items.push(mk("flood", k * 2 + 1, now));
    const trends = detectTrends(items, { now, windowHours: 24, baselineHours: 168, minCount: 3 });
    const flood = trends.find((t) => t.term === "flood")!;
    const election = trends.find((t) => t.term === "election");
    expect(flood).toBeTruthy();
    expect(flood.recent).toBe(6);
    expect(trends[0]!.term).toBe("flood");
    if (election) expect(flood.score).toBeGreaterThan(election.score);
  });

  it("respects minCount", () => {
    const items = [mk("rare", 1, now), mk("rare", 2, now)];
    expect(detectTrends(items, { now, minCount: 3 })).toHaveLength(0);
  });

  it("computes per-category trends separately", () => {
    const items: Item[] = [];
    for (let k = 0; k < 4; k++) items.push(mk("budget", k + 1, now, "economy"));
    for (let k = 0; k < 4; k++) items.push(mk("match", k + 1, now, "sports"));
    const trends = detectTrends(items, { now, minCount: 3 });
    const eco = trends.find((t) => t.category === "economy");
    const spo = trends.find((t) => t.category === "sports");
    expect(eco?.term).toBe("budget");
    expect(spo?.term).toBe("match");
  });

  it("works on Nepali text with Devanagari stopwords", () => {
    const items: Item[] = [];
    for (let k = 0; k < 5; k++) items.push({ text: "बाढी आयो र क्षति भयो", at: now - (k + 1) * HOUR });
    const trends = detectTrends(items, { now, minCount: 3 });
    expect(trends.some((t) => t.term.includes("बाढी"))).toBe(true); // बाढी (flood)
    expect(trends.some((t) => t.term === "र")).toBe(false); // stopword र excluded
  });

  it("accepts pre-extracted terms and a gazetteer", () => {
    const items: Item[] = [];
    for (let k = 0; k < 4; k++) items.push({ text: "x", at: now - (k + 1) * HOUR, terms: ["nrb", "policy rate"] });
    const trends = detectTrends(items, { now, minCount: 3 });
    expect(trends.some((t) => t.term === "policy rate")).toBe(true);
  });

  it("is deterministic and handles empty input", () => {
    expect(detectTrends([])).toEqual([]);
    const items = [mk("a", 1, now), mk("a", 2, now), mk("a", 3, now)];
    expect(detectTrends(items, { now })).toEqual(detectTrends(items, { now }));
  });
});
