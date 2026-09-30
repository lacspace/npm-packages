import { describe, expect, it } from "vitest";
import {
  parseFeed,
  discoverFeeds,
  commonFeedPaths,
  scoreFeedHealth,
  feedFetchAllowed,
  readFeed,
  type ParsedFeed,
} from "./index.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("parseFeed — RSS 2.0", () => {
  const xml = `<?xml version="1.0"?>
  <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel>
      <title>Nepal Wire</title>
      <link>https://nepalwire.example</link>
      <description>News</description>
      <item>
        <title>Rate cut to 5.5%</title>
        <link>https://nepalwire.example/a</link>
        <guid isPermaLink="false">post-1</guid>
        <pubDate>Wed, 30 Sep 2026 09:00:00 GMT</pubDate>
        <dc:creator>Sita Rai</dc:creator>
        <category>economy</category>
        <description>Short &amp; sweet.</description>
        <content:encoded><![CDATA[<p>Full <b>HTML</b> body.</p>]]></content:encoded>
        <enclosure url="https://cdn.example/a.mp3" type="audio/mpeg" length="1234"/>
      </item>
    </channel>
  </rss>`;

  it("normalizes channel + item", () => {
    const feed = parseFeed(xml)!;
    expect(feed.type).toBe("rss");
    expect(feed.title).toBe("Nepal Wire");
    expect(feed.link).toBe("https://nepalwire.example");
    expect(feed.entries).toHaveLength(1);
    const e = feed.entries[0]!;
    expect(e.id).toBe("post-1");
    expect(e.title).toBe("Rate cut to 5.5%");
    expect(e.link).toBe("https://nepalwire.example/a");
    expect(e.author).toBe("Sita Rai");
    expect(e.summary).toBe("Short & sweet.");
    expect(e.content).toContain("<b>HTML</b>");
    expect(e.categories).toEqual(["economy"]);
    expect(e.published).toBe("2026-09-30T09:00:00.000Z");
    expect(e.enclosure).toEqual({ url: "https://cdn.example/a.mp3", type: "audio/mpeg", length: 1234 });
  });
});

describe("parseFeed — Atom", () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom">
    <title>Blog</title>
    <link rel="self" href="https://b.example/atom.xml"/>
    <link rel="alternate" href="https://b.example/"/>
    <updated>2026-09-29T12:00:00Z</updated>
    <entry>
      <title>Hello</title>
      <id>tag:b.example,2026:1</id>
      <link rel="alternate" href="https://b.example/hello"/>
      <published>2026-09-29T12:00:00Z</published>
      <author><name>Ram</name></author>
      <category term="tech"/>
      <summary>Summary text</summary>
      <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
    </entry>
  </feed>`;

  it("picks alternate link, author name, id, category term", () => {
    const feed = parseFeed(xml)!;
    expect(feed.type).toBe("atom");
    expect(feed.link).toBe("https://b.example/");
    const e = feed.entries[0]!;
    expect(e.id).toBe("tag:b.example,2026:1");
    expect(e.link).toBe("https://b.example/hello");
    expect(e.author).toBe("Ram");
    expect(e.categories).toEqual(["tech"]);
    expect(e.content).toContain("<p>Body</p>");
    expect(e.published).toBe("2026-09-29T12:00:00.000Z");
  });
});

describe("parseFeed — RSS 1.0 (RDF)", () => {
  const xml = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel rdf:about="https://r.example/">
      <title>RDF Site</title>
      <link>https://r.example/</link>
    </channel>
    <item rdf:about="https://r.example/x">
      <title>Item X</title>
      <link>https://r.example/x</link>
      <dc:date>2026-09-28T08:00:00Z</dc:date>
    </item>
  </rdf:RDF>`;

  it("reads items that are siblings of channel", () => {
    const feed = parseFeed(xml)!;
    expect(feed.type).toBe("rdf");
    expect(feed.title).toBe("RDF Site");
    expect(feed.entries).toHaveLength(1);
    expect(feed.entries[0]!.link).toBe("https://r.example/x");
    expect(feed.entries[0]!.published).toBe("2026-09-28T08:00:00.000Z");
  });
});

describe("parseFeed — JSON Feed", () => {
  const json = JSON.stringify({
    version: "https://jsonfeed.org/version/1.1",
    title: "JF",
    home_page_url: "https://jf.example/",
    items: [
      {
        id: "42",
        title: "Item",
        url: "https://jf.example/42",
        content_html: "<p>hi</p>",
        date_published: "2026-09-27T00:00:00Z",
        authors: [{ name: "Gita" }],
        tags: ["a", "b"],
        attachments: [{ url: "https://cdn/x.mp3", mime_type: "audio/mpeg", size_in_bytes: 99 }],
      },
    ],
  });

  it("maps JSON Feed items", () => {
    const feed = parseFeed(json)!;
    expect(feed.type).toBe("json");
    expect(feed.link).toBe("https://jf.example/");
    const e = feed.entries[0]!;
    expect(e.id).toBe("42");
    expect(e.author).toBe("Gita");
    expect(e.categories).toEqual(["a", "b"]);
    expect(e.enclosure).toEqual({ url: "https://cdn/x.mp3", type: "audio/mpeg", length: 99 });
    expect(e.published).toBe("2026-09-27T00:00:00.000Z");
  });
});

describe("parseFeed — robustness", () => {
  it("returns null on non-feeds and empty", () => {
    expect(parseFeed("")).toBeNull();
    expect(parseFeed("<html><body>not a feed</body></html>")).toBeNull();
    expect(parseFeed("{not json")).toBeNull();
  });
  it("does not throw on an unclosed tag", () => {
    const feed = parseFeed(`<rss version="2.0"><channel><title>Broken<item><title>x</title></item></channel></rss>`);
    expect(feed).not.toBeNull();
  });
});

describe("discoverFeeds", () => {
  const html = `<html><head>
    <link rel="alternate" type="application/rss+xml" title="RSS" href="/feed.xml">
    <link rel="alternate" type="application/atom+xml" href="https://x.example/atom">
    <link rel="alternate" type="application/feed+json" href="/feed.json">
    <link rel="stylesheet" href="/style.css">
    <link rel="alternate" type="text/html" href="/es/">
  </head></html>`;

  it("finds and resolves feed links only", () => {
    const feeds = discoverFeeds(html, "https://x.example/blog/");
    expect(feeds).toHaveLength(3);
    expect(feeds[0]).toMatchObject({ href: "https://x.example/feed.xml", type: "rss", title: "RSS" });
    expect(feeds[1]).toMatchObject({ href: "https://x.example/atom", type: "atom" });
    expect(feeds[2]).toMatchObject({ href: "https://x.example/feed.json", type: "json" });
  });
  it("leaves href raw without a baseUrl and de-dupes", () => {
    const dup = `<link rel="alternate" type="application/rss+xml" href="/f"><link rel="alternate" type="application/rss+xml" href="/f">`;
    expect(discoverFeeds(dup)).toHaveLength(1);
    expect(discoverFeeds(dup)[0]!.href).toBe("/f");
  });
  it("commonFeedPaths resolves guess URLs", () => {
    const paths = commonFeedPaths("https://x.example");
    expect(paths).toContain("https://x.example/feed");
    expect(paths).toContain("https://x.example/rss.xml");
  });
});

describe("scoreFeedHealth", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  function feedWith(times: number[]): ParsedFeed {
    return {
      type: "rss",
      entries: times.map((t, i) => ({ id: `id-${i}`, title: `t${i}`, link: `https://s/${i}`, published: new Date(t).toISOString(), categories: [] })),
    };
  }

  it("scores a fresh, regularly-posting feed as healthy", () => {
    const times = [0, 1, 2, 3, 4].map((d) => now - d * DAY);
    const h = scoreFeedHealth(feedWith(times), { now });
    expect(h.status).toBe("healthy");
    expect(h.score).toBeGreaterThan(0.8);
    expect(h.entries).toBe(5);
    expect(h.postsPerDay).toBeCloseTo(1, 1);
  });

  it("flags an empty feed as broken", () => {
    const h = scoreFeedHealth({ type: "rss", entries: [] }, { now });
    expect(h.status).toBe("broken");
    expect(h.score).toBe(0);
    expect(h.reasons.join(" ")).toMatch(/no entries/);
  });

  it("penalizes a stale feed", () => {
    // Daily cadence but last post 40 days ago.
    const times = [40, 41, 42, 43].map((d) => now - d * DAY);
    const h = scoreFeedHealth(feedWith(times), { now, expectedMaxAgeHours: 48 });
    expect(h.status).toBe("stale");
    expect(h.score).toBeLessThan(0.6);
    expect(h.reasons.join(" ")).toMatch(/stale/);
  });

  it("detects duplicate / poisoned items", () => {
    const dupFeed: ParsedFeed = {
      type: "rss",
      entries: [0, 1, 2, 3].map((i) => ({ id: "same", title: "same", link: "https://s/same", published: new Date(now - i * HOUR).toISOString(), categories: [] })),
    };
    const h = scoreFeedHealth(dupFeed, { now });
    expect(h.duplicateRatio).toBeGreaterThan(0.5);
    expect(h.reasons.join(" ")).toMatch(/duplicate/);
    expect(h.score).toBeLessThan(0.8);
  });

  it("detects a volume spike", () => {
    // Baseline daily, then 6 posts in the last hour.
    const base = [3, 4, 5, 6].map((d) => now - d * DAY);
    const burst = [0, 1, 2, 3, 4, 5].map((m) => now - m * 60_000);
    const h = scoreFeedHealth(feedWith([...burst, ...base]), { now });
    expect(h.spike).toBe(true);
    expect(h.reasons.join(" ")).toMatch(/spike/);
  });

  it("factors in fetch error rate from history", () => {
    const times = [0, 1, 2].map((d) => now - d * DAY);
    const history = [
      { at: now - HOUR, ok: false },
      { at: now - 2 * HOUR, ok: false },
      { at: now - 3 * HOUR, ok: true },
      { at: now - 4 * HOUR, ok: false },
    ];
    const h = scoreFeedHealth(feedWith(times), { now, history });
    expect(h.errorRate).toBeCloseTo(0.75, 2);
    expect(h.status).toBe("broken");
  });
});

describe("feedFetchAllowed (robots via @lacspace/robots)", () => {
  const robots = `User-agent: *\nDisallow: /private/\n\nUser-agent: BadBot\nDisallow: /`;

  it("allows a normal feed path", () => {
    expect(feedFetchAllowed("https://s.example/feed.xml", robots)).toBe(true);
  });
  it("blocks a disallowed path", () => {
    expect(feedFetchAllowed("https://s.example/private/feed", robots)).toBe(false);
  });
  it("blocks a named bot from everything", () => {
    expect(feedFetchAllowed("https://s.example/feed.xml", robots, "BadBot")).toBe(false);
  });
  it("treats a missing robots.txt as allowed", () => {
    expect(feedFetchAllowed("https://s.example/feed.xml", "")).toBe(true);
    expect(feedFetchAllowed("https://s.example/feed.xml", null)).toBe(true);
  });
});

describe("readFeed", () => {
  it("parses and scores in one call", () => {
    const now = Date.now();
    const xml = `<rss version="2.0"><channel><title>T</title><item><title>a</title><link>https://s/a</link><pubDate>${new Date(now).toUTCString()}</pubDate></item></channel></rss>`;
    const { feed, health } = readFeed(xml, { now });
    expect(feed!.title).toBe("T");
    expect(health!.entries).toBe(1);
  });
  it("returns nulls on garbage", () => {
    expect(readFeed("nope")).toEqual({ feed: null, health: null });
  });
});
