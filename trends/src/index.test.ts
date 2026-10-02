import { describe, expect, it, vi } from "vitest";
import {
  describe as describeApi, hashtagsFor, mergeTrends, parseGoogleTrendsRss, relevanceTo, trends,
} from "./index.js";
import type { FetchLike } from "./index.js";

const GOOGLE_RSS = `<rss><channel>
<item><title>Dashain</title><ht:approx_traffic>50,000+</ht:approx_traffic><ht:news_item><ht:news_item_url>https://ex/1</ht:news_item_url></ht:news_item></item>
<item><title>NEPSE index</title><ht:approx_traffic>20,000+</ht:approx_traffic></item>
<item><title>Monsoon</title></item>
</channel></rss>`;
const WIKI = { items: [{ articles: [
  { article: "Main_Page", views: 99999, rank: 1 },
  { article: "दशैं", views: 4000, rank: 2 },
  { article: "NEPSE", views: 3000, rank: 3 },
] }] };
const YT = { items: [{ id: "v1", snippet: { title: "NEPSE hits record high" }, statistics: { viewCount: "12000" } }] };

function mockFetch(): FetchLike {
  return vi.fn(async (url: string) => {
    if (url.includes("trends.google.com")) return { ok: true, status: 200, text: async () => GOOGLE_RSS, json: async () => ({}) };
    if (url.includes("wikimedia.org")) return { ok: true, status: 200, text: async () => "", json: async () => WIKI };
    if (url.includes("googleapis.com/youtube")) return { ok: true, status: 200, text: async () => "", json: async () => YT };
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) };
  }) as unknown as FetchLike;
}

describe("parseGoogleTrendsRss", () => {
  it("extracts titles, traffic and news links with rank weights", () => {
    const r = parseGoogleTrendsRss(GOOGLE_RSS);
    expect(r.map((t) => t.term)).toEqual(["Dashain", "NEPSE index", "Monsoon"]);
    expect(r[0]!.volume).toBe(50000);
    expect(r[0]!.weight).toBeGreaterThan(r[2]!.weight);
    expect(r[0]!.links).toContain("https://ex/1");
  });
});

describe("mergeTrends", () => {
  it("merges the same term across scripts/sources and boosts multi-source", () => {
    const merged = mergeTrends([
      { term: "Dashain", source: "google", weight: 1 },
      { term: "दशैं", source: "wikipedia", weight: 0.8 }, // romanizes to "dashain" → merges
      { term: "Monsoon", source: "google", weight: 0.3 },
    ]);
    const dashain = merged.find((t) => /dashain|दशैं/i.test(t.term))!;
    expect(dashain.sources.sort()).toEqual(["google", "wikipedia"]);
    expect(dashain.score).toBeGreaterThan(1.8 * 1.0); // (1+0.8) * diversity boost 1.5
    expect(merged[0]!.term).toMatch(/dashain|दशैं/i); // top
  });
});

describe("relevanceTo", () => {
  it("scores trends by overlap with a story and can filter", () => {
    const base = mergeTrends([
      { term: "NEPSE index", source: "google", weight: 1 },
      { term: "Dashain", source: "google", weight: 0.9 },
    ]);
    const scored = relevanceTo(base, "The NEPSE index rose sharply as investors returned to the share market.");
    expect(scored.find((t) => /nepse/i.test(t.term))!.relevance).toBeGreaterThan(0);
    const filtered = relevanceTo(base, "NEPSE share market", { min: 0.5 });
    expect(filtered.every((t) => /nepse/i.test(t.term))).toBe(true); // Dashain dropped
  });
});

describe("hashtagsFor", () => {
  it("builds platform-limited, de-duplicated, camel-cased hashtags", () => {
    const tags = hashtagsFor(["NEPSE index", "Dashain", "दशैं"], "x");
    expect(tags.length).toBeLessThanOrEqual(3); // X limit
    expect(tags).toContain("#NEPSEIndex");
    // "दशैं" romanizes near "Dashain" → de-duplicated
    expect(tags.filter((t) => /dashain/i.test(t)).length).toBeLessThanOrEqual(1);
  });
  it("drops banned / shadow-ban tags", () => {
    const tags = hashtagsFor(["viral", "News", "fyp"], "instagram");
    expect(tags.some((t) => /viral|fyp/i.test(t))).toBe(false);
    expect(tags).toContain("#News");
  });
});

describe("trends()", () => {
  it("fetches, merges and scores across sources (mock fetch)", async () => {
    const r = await trends({ geo: "NP", youtubeApiKey: "k", fetch: mockFetch() });
    expect(r.sources.sort()).toEqual(["google", "wikipedia", "youtube"]);
    expect(r.trends.length).toBeGreaterThan(0);
    // "Dashain" (google) + "दशैं" (wikipedia) romanize to the same key → merged, 2 sources.
    const dashain = r.trends.find((t) => /dashain|दशैं/i.test(t.term))!;
    expect(dashain.sources.sort()).toEqual(["google", "wikipedia"]);
    expect(r.warnings).toEqual([]);
  });

  it("gates by story relevance when asked", async () => {
    const r = await trends({ relevanceTo: "NEPSE share market report", minRelevance: 0.5, fetch: mockFetch() });
    expect(r.trends.every((t) => /nepse/i.test(t.term))).toBe(true);
  });

  it("warns (not throws) when a source fails", async () => {
    const f: FetchLike = (async (url: string) => (url.includes("wikimedia") ? { ok: false, status: 500, text: async () => "", json: async () => ({}) } : { ok: true, status: 200, text: async () => GOOGLE_RSS, json: async () => ({}) })) as any;
    const r = await trends({ sources: ["google", "wikipedia"], fetch: f });
    expect(r.warnings.some((w) => w.includes("wikipedia"))).toBe(true);
    expect(r.sources).toContain("google");
  });

  it("describe() advertises sources + commands", () => {
    const d = describeApi();
    expect(d.sources).toContain("google");
    expect(d.commands.map((c) => c.name)).toContain("trends");
  });
});
