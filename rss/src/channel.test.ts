import { test, expect } from "vitest";
import { rss, atom, atomFeed, jsonFeed, feeds, type FeedOptions, type FeedItem } from "./index";

const feed: FeedOptions = { title: "Blog", link: "https://acme.com", description: "News" };
const items: FeedItem[] = [
  { title: "Hello", link: "https://acme.com/1", date: "2026-01-01T00:00:00Z" },
];

test("rss() output is byte-for-byte unchanged for a feed with no new fields", () => {
  const expected =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n` +
    `  <channel>\n` +
    `    <title>Blog</title>\n` +
    `    <link>https://acme.com</link>\n` +
    `    <description>News</description>\n` +
    `    <lastBuildDate>Thu, 01 Jan 2026 00:00:00 GMT</lastBuildDate>\n` +
    `    <item>\n` +
    `      <title>Hello</title>\n` +
    `      <link>https://acme.com/1</link>\n` +
    `      <guid isPermaLink="true">https://acme.com/1</guid>\n` +
    `      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>\n` +
    `    </item>\n` +
    `  </channel>\n</rss>`;
  expect(rss(feed, items)).toBe(expected);
});

test("rss() emits none of the new channel tags when the fields are absent", () => {
  const out = rss(feed, items);
  for (const tag of ["<ttl>", "<generator>", "<managingEditor>", "<webMaster>"]) {
    expect(out.includes(tag)).toBe(false);
  }
});

test("rss() emits ttl, generator, managingEditor and webMaster when provided", () => {
  const out = rss(
    {
      ...feed,
      ttl: 60,
      generator: "Lacspace RSS",
      managingEditor: "editor@acme.com",
      webMaster: "web@acme.com",
    },
    items,
  );
  expect(out).toContain("<ttl>60</ttl>");
  expect(out).toContain("<generator>Lacspace RSS</generator>");
  expect(out).toContain("<managingEditor>editor@acme.com</managingEditor>");
  expect(out).toContain("<webMaster>web@acme.com</webMaster>");
});

test("rss() XML-escapes special characters in new channel fields", () => {
  const out = rss({ ...feed, generator: `A & B <x> "q"` }, items);
  expect(out).toContain("<generator>A &amp; B &lt;x&gt; &quot;q&quot;</generator>");
});

test("atom() emits <generator> only when provided", () => {
  expect(atom(feed, items)).not.toContain("<generator>");
  expect(atom({ ...feed, generator: "Lacspace RSS" }, items)).toContain(
    "  <generator>Lacspace RSS</generator>\n",
  );
});

test("atomFeed is an alias producing identical output to atom", () => {
  expect(atomFeed(feed, items)).toBe(atom(feed, items));
});

test("feeds() returns all three formats consistent with the individual builders", () => {
  const all = feeds(feed, items);
  expect(all.rss).toBe(rss(feed, items));
  expect(all.atom).toBe(atom(feed, items));
  expect(all.json).toEqual(jsonFeed(feed, items));
});

test("feeds() json carries the JSON Feed 1.1 version marker", () => {
  expect(feeds(feed, items).json.version).toBe("https://jsonfeed.org/version/1.1");
});
