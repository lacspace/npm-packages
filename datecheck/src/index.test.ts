import { describe, expect, it } from "vitest";
import {
  adToBs, assessFreshness, assessFreshnessWithAI, bsToAd, extractPublishedDate,
  freshnessPrompt, parseAnyDate, textStaleness,
} from "./index.js";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const NOW = new Date("2026-10-02T06:00:00Z"); // BS 2083 Asoj 16

describe("Bikram Sambat conversion", () => {
  it("hits the published anchors exactly", () => {
    expect(iso(bsToAd(2000, 1, 1))).toBe("1943-04-14"); // epoch
    expect(iso(bsToAd(2083, 6, 16))).toBe("2026-10-02"); // the WeNepal-supplied anchor
    expect(iso(bsToAd(2080, 1, 1))).toBe("2023-04-14");
    expect(iso(bsToAd(2081, 1, 1))).toBe("2024-04-13");
  });
  it("round-trips AD → BS → AD", () => {
    const bs = adToBs(new Date("2026-10-02T00:00:00Z"));
    expect(bs).toEqual({ year: 2083, month: 6, day: 16 });
    expect(iso(bsToAd(bs.year, bs.month, bs.day))).toBe("2026-10-02");
  });
  it("throws outside the supported range", () => {
    expect(() => bsToAd(1999, 1, 1)).toThrow();
    expect(() => bsToAd(2101, 1, 1)).toThrow();
    expect(() => bsToAd(2083, 13, 1)).toThrow();
  });
});

describe("parseAnyDate", () => {
  it("parses English and ISO forms", () => {
    expect(iso(parseAnyDate("2019-09-10", { now: NOW }))).toBe("2019-09-10");
    expect(iso(parseAnyDate("10 September 2019", { now: NOW }))).toBe("2019-09-10");
    expect(iso(parseAnyDate("September 10, 2019", { now: NOW }))).toBe("2019-09-10");
    expect(iso(parseAnyDate("2019-09-10T14:30:00+05:45", { now: NOW }))).toBe("2019-09-10");
  });
  it("parses Bikram Sambat in Devanagari and Latin digits", () => {
    expect(iso(parseAnyDate("२०८३ असोज १६", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("2083 Asoj 16", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("वि.सं. २०८३ असोज १६", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("असोज १६, २०८३", { now: NOW }))).toBe("2026-10-02");
  });
  it("parses relative phrases (en + ne)", () => {
    expect(iso(parseAnyDate("2 hours ago", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("today", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("३ घण्टा अगाडि", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("आज", { now: NOW }))).toBe("2026-10-02");
  });
  it("rejects impossible dates (pre-1990, far future)", () => {
    expect(parseAnyDate("1975-01-01", { now: NOW })).toBeNull();
    expect(parseAnyDate("2030-01-01", { now: NOW })).toBeNull();
  });
});

describe("extractPublishedDate", () => {
  it("reads JSON-LD datePublished (incl. @graph)", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[
        {"@type":"WebPage"},
        {"@type":"NewsArticle","datePublished":"2019-09-10T09:00:00+05:45","dateModified":"2019-09-12T10:00:00+05:45"}
      ]}</script></head><body>...</body></html>`;
    const r = extractPublishedDate(html, "https://example.com/story", { now: NOW });
    expect(iso(r.publishedAt)).toBe("2019-09-10");
    expect(iso(r.modifiedAt)).toBe("2019-09-12");
    expect(r.source).toBe("jsonld");
    expect(r.confidence).toBeGreaterThan(0.9);
  });
  it("reads meta tags when JSON-LD is absent", () => {
    const html = `<head><meta property="article:published_time" content="2024-03-15T08:00:00Z">
      <meta name="parsely-pub-date" content="2024-03-15"></head>`;
    expect(iso(extractPublishedDate(html, "", { now: NOW }).publishedAt)).toBe("2024-03-15");
  });
  it("reads <time datetime>", () => {
    const html = `<article><time datetime="2025-01-20">Jan 20</time></article>`;
    const r = extractPublishedDate(html, "", { now: NOW });
    expect(iso(r.publishedAt)).toBe("2025-01-20");
    expect(r.source).toBe("time");
  });
  it("falls back to the URL date pattern", () => {
    const r = extractPublishedDate("<p>no date here</p>", "https://site.np/2019/09/10/some-story", { now: NOW });
    expect(iso(r.publishedAt)).toBe("2019-09-10");
    expect(r.source).toBe("url");
  });
  it("reads a Nepali BS date from visible text", () => {
    const html = `<article><p class="date">प्रकाशित: २०८३ असोज १६ गते</p><p>समाचार...</p></article>`;
    const r = extractPublishedDate(html, "", { now: NOW });
    expect(iso(r.publishedAt)).toBe("2026-10-02");
    expect(["byline", "text"]).toContain(r.source);
  });
  it("returns null for a truly undated page", () => {
    const r = extractPublishedDate("<html><body><h1>Some headline</h1><p>Body.</p></body></html>", "https://x.np/story", { now: NOW });
    expect(r.publishedAt).toBeNull();
    expect(r.source).toBeNull();
  });
});

describe("textStaleness", () => {
  it("flags an article that only talks about old events (keeps day precision)", () => {
    const text = "The iPhone 11 launched on September 10, 2019 with new cameras. Pre-orders began that week in 2019.";
    const r = textStaleness(text, { now: NOW, maxAgeDays: 7 });
    expect(r.stale).toBe(true);
    expect(iso(r.newestMention)).toBe("2019-09-10"); // the explicit day, NOT inflated to 2019-12-31
  });
  it("does not flag fresh news with historical background", () => {
    const text = "Today the central bank cut rates. The last such cut was back in 2019 during the slowdown.";
    const r = textStaleness(text, { now: NOW, maxAgeDays: 7 });
    expect(r.stale).toBe(false); // the "today" keeps it fresh despite the 2019 mention
  });
  it("handles a Nepali relative recency marker", () => {
    const r = textStaleness("काठमाडौंमा आज महत्वपूर्ण बैठक भयो।", { now: NOW, maxAgeDays: 2 });
    expect(r.stale).toBe(false);
  });
  it("returns not-stale with low confidence when nothing is dated", () => {
    const r = textStaleness("A general statement with no dates at all.", { now: NOW, maxAgeDays: 7 });
    expect(r.stale).toBe(false);
    expect(r.newestMention).toBeNull();
    expect(r.confidence).toBeLessThan(0.5);
  });
});

describe("assessFreshness — the 2019-republished-as-today bug", () => {
  it("marks an old page date stale even if the feed has no date", () => {
    const html = `<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2019-09-10"}</script>`;
    const r = assessFreshness({ html, text: "iPhone 11 launch dates announced", url: "", feedDate: null, now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("stale");
    expect(r.ageHours).toBeGreaterThan(48);
  });
  it("is UNKNOWN (never silently fresh) when there is no date and no signal", () => {
    const r = assessFreshness({ html: "<p>Some evergreen explainer with no dates.</p>", text: "Some evergreen explainer with no dates.", url: "https://x.np/p", feedDate: null, now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("unknown");
    expect(r.ageHours).toBeNull();
  });
  it("is fresh when the page date is recent", () => {
    const html = `<time datetime="2026-10-02T05:00:00Z">now</time>`;
    const r = assessFreshness({ html, text: "breaking", url: "", feedDate: null, now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("fresh");
  });
  it("uses the feed date when no page date exists", () => {
    const r = assessFreshness({ text: "no dates in body", feedDate: new Date("2026-10-01T06:00:00Z"), now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("fresh");
    expect(r.ageHours).toBeCloseTo(24, 0);
  });
  it("falls back to text staleness when no date exists", () => {
    const r = assessFreshness({ text: "It all happened on 10 September 2019 at the launch.", feedDate: null, now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("stale");
  });
});

describe("assessFreshnessWithAI + freshnessPrompt", () => {
  it("consults the AI hook only for an unknown verdict", async () => {
    let called = 0;
    const ai = async () => {
      called++;
      return 'Here you go: {"eventDate":"2019-09-10","isCurrentNews":false}';
    };
    const r = await assessFreshnessWithAI({ html: "<p>no dates</p>", text: "no dates", url: "https://x.np/p", feedDate: null, now: NOW, maxAgeHours: 48, ai });
    expect(called).toBe(1);
    expect(r.verdict).toBe("stale");
  });
  it("does NOT consult the AI when a deterministic date was found", async () => {
    let called = 0;
    const ai = async () => {
      called++;
      return "{}";
    };
    const html = `<time datetime="2026-10-02T05:00:00Z">now</time>`;
    const r = await assessFreshnessWithAI({ html, text: "x", feedDate: null, now: NOW, maxAgeHours: 48, ai });
    expect(called).toBe(0);
    expect(r.verdict).toBe("fresh");
  });
  it("freshnessPrompt is compact, includes today, and asks for the JSON shape", () => {
    const p = freshnessPrompt("<p>Some news body text.</p>", { now: NOW });
    expect(p).toContain("eventDate");
    expect(p).toContain("isCurrentNews");
    expect(p).toContain("2026-10-02"); // today is in the prompt (WeNepal ask)
    expect(p).not.toContain("<p>"); // tags stripped
  });
});

describe("1.0.1 — WeNepal integration fixes", () => {
  it("parses day-month-year order, filler words, Devanagari-English months, ordinals", () => {
    expect(iso(parseAnyDate("शुक्रबार, ६ मंसिर, २०७६", { now: NOW }))).toBe("2019-11-22");
    expect(iso(parseAnyDate("६ मङ्सिर २०७६", { now: NOW }))).toBe("2019-11-22");
    expect(iso(parseAnyDate("२०८३ साल आश्विन १६", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("16 Asoj 2083", { now: NOW }))).toBe("2026-10-02");
    expect(iso(parseAnyDate("१ बैशाख २०८०", { now: NOW }))).toBe("2023-04-14");
    expect(iso(parseAnyDate("सेप्टेम्बर १०, २०१९", { now: NOW }))).toBe("2019-09-10");
    expect(iso(parseAnyDate("on 10th Sept. 2019", { now: NOW }))).toBe("2019-09-10");
  });
  it("keeps full time precision and treats zone-less times as Nepal time (+05:45)", () => {
    // 13:38 NPT = 07:53 UTC
    expect(parseAnyDate("प्रकाशित मिति: शुक्रबार, असोज १६, २०८३ १३:३८", { now: NOW })!.toISOString())
      .toBe("2026-10-02T07:53:00.000Z");
    // explicit zone preserved
    expect(parseAnyDate("2026-10-01T09:15:00+05:45", { now: NOW })!.toISOString())
      .toBe("2026-10-01T03:30:00.000Z");
    // date-only → noon NPT = 06:15 UTC
    expect(parseAnyDate("2019-09-10", { now: NOW })!.toISOString()).toBe("2019-09-10T06:15:00.000Z");
    // "आज १३:३८" → today at that NPT time
    expect(parseAnyDate("आज १३:३८", { now: NOW })!.toISOString()).toBe("2026-10-02T07:53:00.000Z");
  });

  it("extractPublishedDate ignores site chrome and reads the article's own date", () => {
    const ict = `<header><div class="today-bar">१६ असोज २०८३, शुक्रबार <span>आज</span></div></header>
      <article><h1>Headline</h1><p class="meta post__date">शुक्रबार, ६ मंसिर, २०७६</p><p>body</p></article>`;
    const r = extractPublishedDate(ict, "https://ictsamachar.com/story/1897", { now: NOW });
    expect(iso(r.publishedAt)).toBe("2019-11-22"); // NOT today's header "आज"
    expect(r.source).toBe("byline");

    const sidebar = `<aside class="sidebar"><div class="date">२०८३ असोज १६</div></aside>
      <article><p class="post__date">शुक्रबार, ६ मंसिर, २०७६</p></article>`;
    expect(iso(extractPublishedDate(sidebar, "", { now: NOW }).publishedAt)).toBe("2019-11-22");
  });
  it("reads labeled BS datetimes at full precision (Setopati / Onlinekhabar)", () => {
    const seto = `<span class="date">प्रकाशित मिति: शुक्रबार, असोज १६, २०८३ १३:३८</span>`;
    expect(extractPublishedDate(seto, "", { now: NOW }).publishedAt!.toISOString()).toBe("2026-10-02T07:53:00.000Z");
    const ok = `<div class="ok-news-post-hour"><span>२०८३ असोज  १६ गते १३:१२</span></div>`;
    expect(extractPublishedDate(ok, "", { now: NOW }).publishedAt!.toISOString()).toBe("2026-10-02T07:27:00.000Z");
  });
  it("the ICT bug: old article + recent feed date is still stale", () => {
    const html = `<header><div class="today-bar">आज</div></header><article><p class="post__date">शुक्रबार, ६ मंसिर, २०७६</p></article>`;
    const r = assessFreshness({ html, text: "body", feedDate: new Date("2026-10-01T00:00:00Z"), now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("stale");
  });

  it("textStaleness flags upcoming (future) events instead of stale", () => {
    const r = textStaleness("The summit will be held on 20 December 2026 in Kathmandu.", { now: NOW, maxAgeDays: 7 });
    expect(r.stale).toBe(false);
    expect(r.upcoming).toBe(true);
    expect(iso(r.newestMention)).toBe("2026-12-20");
  });
  it("assessFreshness surfaces an upcoming verdict when only future dates exist", () => {
    const r = assessFreshness({ text: "Election scheduled for 15 Mangsir 2083.", feedDate: null, now: NOW, maxAgeHours: 48 });
    expect(r.verdict).toBe("upcoming");
  });
});
