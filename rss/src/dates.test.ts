import { test, expect } from "vitest";
import {
  rss,
  atom,
  jsonFeed,
  podcastRss,
  type FeedOptions,
  type FeedItem,
  type PodcastFeed,
  type PodcastEpisode,
} from "./index";

// Regression cover for the epoch-fallback bug: a feed or item we could not date
// used to be published as `Thu, 01 Jan 1970 00:00:00 GMT`. Feed validators flag
// that, and readers treat the channel as decades stale. Every assertion below
// distinguishes "absent" from "1970" — those are the two outcomes that got
// confused, and only one of them is correct.

const feed: FeedOptions = { title: "Blog", link: "https://acme.com", description: "News" };
const dated: FeedItem[] = [{ title: "A", link: "https://acme.com/a", date: "2026-03-04T05:06:07Z" }];
const undatedItems: FeedItem[] = [{ title: "A", link: "https://acme.com/a" }];

const pod: PodcastFeed = { title: "Show", link: "https://acme.com/pod", description: "Pod" };
const undatedEps: PodcastEpisode[] = [
  { title: "Ep 1", link: "https://acme.com/pod/1", enclosure: { url: "https://acme.com/1.mp3", type: "audio/mpeg" } },
];

test("rss() omits lastBuildDate for an empty feed instead of stamping the epoch", () => {
  const out = rss(feed, []);
  expect(out).not.toContain("<lastBuildDate>");
  expect(out).not.toContain("1970");
});

test("rss() omits lastBuildDate when no item carries a date", () => {
  const out = rss(feed, undatedItems);
  expect(out).not.toContain("<lastBuildDate>");
  expect(out).not.toContain("1970");
});

test("rss() omits pubDate on an undated item rather than dating it 1970", () => {
  const out = rss(feed, undatedItems);
  expect(out).not.toContain("<pubDate>");
  expect(out).not.toContain("1970");
  // The item is still published — only its date is withheld.
  expect(out).toContain("<title>A</title>");
});

test("rss() omits lastBuildDate when feed.updated is unparseable", () => {
  const out = rss({ ...feed, updated: "not-a-date" }, []);
  expect(out).not.toContain("<lastBuildDate>");
  expect(out).not.toContain("1970");
});

test("rss() still dates a feed from its newest item, and still emits pubDate", () => {
  const out = rss(feed, [
    { title: "old", link: "https://acme.com/o", date: "2026-01-01T00:00:00Z" },
    { title: "new", link: "https://acme.com/n", date: "2026-06-30T12:00:00Z" },
  ]);
  expect(out).toContain("<lastBuildDate>Tue, 30 Jun 2026 12:00:00 GMT</lastBuildDate>");
  expect(out).toContain("<pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>");
});

test("rss() prefers an explicit feed.updated over the newest item", () => {
  const out = rss({ ...feed, updated: "2026-12-25T00:00:00Z" }, dated);
  expect(out).toContain("<lastBuildDate>Fri, 25 Dec 2026 00:00:00 GMT</lastBuildDate>");
});

test("podcastRss() omits lastBuildDate for undated episodes", () => {
  const out = podcastRss(pod, undatedEps);
  expect(out).not.toContain("<lastBuildDate>");
  expect(out).not.toContain("1970");
  expect(out).toContain("<title>Ep 1</title>");
});

// Atom differs from RSS: RFC 4287 4.2.15 makes <updated> mandatory on the feed
// and on every entry, so these cannot be omitted — they must carry a real date.
test("atom() never emits 1970, and feed and entry agree when nothing is dated", () => {
  const out = atom(feed, undatedItems);
  expect(out).not.toContain("1970");
  const stamps = [...out.matchAll(/<updated>([^<]+)<\/updated>/g)].map((m) => m[1]);
  expect(stamps).toHaveLength(2); // one feed, one entry
  expect(new Set(stamps).size).toBe(1); // resolved once, not drifting with the clock
  expect(Number.isNaN(Date.parse(stamps[0]!))).toBe(false);
});

test("atom() keeps an entry's own date when it has one", () => {
  const out = atom(feed, dated);
  expect(out).toContain("<updated>2026-03-04T05:06:07.000Z</updated>");
  expect(out).not.toContain("1970");
});

test("atom() backstops an undated entry with the feed's date, not the epoch", () => {
  const out = atom({ ...feed, updated: "2026-05-05T00:00:00Z" }, undatedItems);
  const stamps = [...out.matchAll(/<updated>([^<]+)<\/updated>/g)].map((m) => m[1]);
  expect(stamps).toEqual(["2026-05-05T00:00:00.000Z", "2026-05-05T00:00:00.000Z"]);
});

test("jsonFeed() leaves date_published off an undated item", () => {
  const out = jsonFeed(feed, undatedItems);
  expect(out.items[0]!.date_published).toBeUndefined();
  expect(JSON.stringify(out)).not.toContain("1970");
});
