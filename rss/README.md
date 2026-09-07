<div align="center">

# @lacspace/rss

**RSS 2.0, Atom 1.0 & JSON Feed 1.1 — one item set, three formats.**

[![npm version](https://img.shields.io/npm/v/@lacspace/rss?color=%2322c55e&label=npm)](https://www.npmjs.com/package/@lacspace/rss)
[![install size](https://packagephobia.com/badge?p=@lacspace/rss)](https://packagephobia.com/result?p=@lacspace/rss)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/rss?label=minzip)](https://bundlephobia.com/package/@lacspace/rss)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/rss)
[![license](https://img.shields.io/npm/l/@lacspace/rss?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Define your feed and items once; emit valid **RSS 2.0**, **Atom 1.0** or **JSON Feed 1.1**. Proper escaping, `CDATA` content, correct dates, enclosures for podcasts. Great for blogs, changelogs and news.

- 📡 `rss()` · `atom()`/`atomFeed()` · `jsonFeed()` — or all three at once with `feeds()`
- 🧱 Full-content (`content:encoded`), categories, authors, enclosures
- 🗓️ Correct `pubDate` (RFC-822) / `updated` (RFC-3339 / ISO-8601) handling
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

> **New in 1.4** — richer channel metadata (`ttl`, `generator`, `managingEditor`, `webMaster`), a one-call `feeds()` builder, an `atomFeed` alias, and exported formatting helpers (`escapeXml`, `cdata`, `rfc822Date`, `rfc3339Date`). All additive — the existing RSS 2.0 / Atom / JSON output is byte-for-byte unchanged.

## Install

```bash
npm install @lacspace/rss      # or pnpm add / yarn add / bun add
```

## Usage

```ts
import { rss, atom, jsonFeed } from "@lacspace/rss";

const feed = {
  title: "Lacspace Blog",
  link: "https://lacspace.com/blog",
  description: "Product updates and engineering notes.",
  feedUrl: "https://lacspace.com/rss.xml",
  language: "en",
};

const items = [
  {
    title: "Launching the SEO Kit",
    link: "https://lacspace.com/blog/seo-kit",
    content: "<p>Six new packages…</p>",
    author: "Lumi AI",
    date: new Date("2026-08-22"),
    categories: ["release"],
  },
];

rss(feed, items);       // RSS 2.0 XML string
atom(feed, items);      // Atom 1.0 XML string
jsonFeed(feed, items);  // JSON Feed 1.1 object
```

## Serve it (Next.js Route Handler)

```ts
// app/rss.xml/route.ts
import { rss } from "@lacspace/rss";

export function GET() {
  return new Response(rss(feed, items), {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
```

## Podcast enclosure

```ts
{ title: "Episode 1", link: "…", enclosure: { url: "https://…/ep1.mp3", type: "audio/mpeg", length: 12345678 } }
```

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| [`@lacspace/site-verify`](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine verification |
| **`@lacspace/rss`** | RSS / Atom / JSON feeds (this package) |
| [`@lacspace/slugify`](https://www.npmjs.com/package/@lacspace/slugify) | SEO URL slugs |

## New in 1.1 — Response helpers

```ts
import { rssResponse, atomResponse, jsonFeedResponse } from "@lacspace/rss";

// app/feed.xml/route.ts — correct content-type, zero boilerplate
export function GET() {
  return rssResponse({ title: "Blog", link: "https://x.com", description: "…" }, items);
}
```

## New in 1.2 — prefill the feed from your site

```ts
import { rss, feedForSite } from "@lacspace/rss";

// app/feed.xml/route.ts — title, link, feedUrl and language auto-filled
export function GET() {
  return new Response(rss(feedForSite({ name: "Acme Blog", url: "https://acme.com" }, "/feed.xml"), posts), {
    headers: { "content-type": "application/rss+xml" },
  });
}
```

Pairs with `defineSite()` from [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) — `feedForSite(site.config)`.

## Advanced (new)

All additive and backward-compatible — the existing `rss()`, `atom()`, `jsonFeed()`, `*Response()` and `feedForSite()` are unchanged.

### Podcast feeds (iTunes namespace)

`podcastRss(feed, episodes)` builds an RSS 2.0 feed with the Apple Podcasts / Spotify `itunes:*` tags, and `podcastRssResponse(...)` returns it as a `Response` (`application/rss+xml`). Uses the typed `PodcastFeed` / `PodcastEpisode` interfaces.

```ts
import { podcastRss } from "@lacspace/rss";

podcastRss(
  {
    title: "The Show",
    link: "https://show.fm",
    image: "https://show.fm/cover.jpg", // itunes:image + <image>
    itunesAuthor: "Jane",
    category: ["Technology", "Society & Culture > Personal Journals"], // nested via ">"
    explicit: false,
    podcastType: "episodic",
    owner: { name: "Jane", email: "jane@show.fm" },
  },
  [
    {
      title: "Ep 1",
      link: "https://show.fm/1",
      duration: 1830, // seconds → itunes:duration "30:30" (or pass "HH:MM:SS")
      episode: 1,
      season: 1,
      episodeType: "full",
      enclosure: { url: "https://show.fm/1.mp3", type: "audio/mpeg", length: 29344 },
    },
  ],
);
```

Channel: `itunes:author/image/category/explicit/type/owner`. Per-episode: `<enclosure>`, `itunes:duration/episode/season/episodeType/image/explicit`, `<guid>`.

### Media RSS on regular items

`FeedItem` gains an optional `media?: MediaContent | MediaContent[]`. Both `rss()` and `atom()` now emit `media:content` (and `atom()` also emits an `<enclosure>` link when `enclosure` is set). Feeds without the field are byte-for-byte unchanged.

```ts
rss(feed, [
  {
    title: "Photo post",
    link: "https://acme.com/p",
    media: { url: "https://acme.com/p.jpg", type: "image/jpeg", medium: "image", width: 1200, height: 630 },
  },
]);
```

## New in 1.4 — richer channel + all-in-one + helpers

**Extra channel metadata** (all optional, additive) on `FeedOptions`:

```ts
rss(
  {
    title: "Blog",
    link: "https://acme.com",
    description: "News",
    ttl: 60,                         // <ttl> cache minutes
    generator: "Lacspace RSS",       // <generator> (also emitted by atom())
    managingEditor: "editor@acme.com", // <managingEditor>
    webMaster: "web@acme.com",       // <webMaster>
  },
  items,
);
```

**All three formats in one call** — and an `atomFeed` alias for naming parity:

```ts
import { feeds, atomFeed } from "@lacspace/rss";

const { rss, atom, json } = feeds(feed, items); // { rss: string, atom: string, json: JsonFeed }
atomFeed(feed, items); // === atom(feed, items)
```

**Formatting helpers** — the same escaping/date rules the generators use, exported for hand-built feeds:

```ts
import { escapeXml, cdata, rfc822Date, rfc3339Date } from "@lacspace/rss";

escapeXml(`A & B <x> "q"`);              // "A &amp; B &lt;x&gt; &quot;q&quot;"
cdata("<p>hi</p>");                       // "<![CDATA[<p>hi</p>]]>"
rfc822Date("2026-01-01T00:00:00Z");       // "Thu, 01 Jan 2026 00:00:00 GMT" (RSS)
rfc3339Date(new Date());                   // ISO-8601 (Atom / JSON Feed)
```

| Export | Signature | Purpose |
| --- | --- | --- |
| `feeds` | `(feed, items) => { rss, atom, json }` | Build RSS + Atom + JSON Feed at once |
| `atomFeed` | `(feed, items) => string` | Alias of `atom()` |
| `escapeXml` | `(s: string) => string` | XML-escape text/attributes |
| `cdata` | `(s: string) => string` | Wrap HTML in a CDATA section |
| `rfc822Date` | `(d: string \| number \| Date) => string` | RFC-822 date (RSS) |
| `rfc3339Date` | `(d: string \| number \| Date) => string` | RFC-3339 / ISO-8601 date (Atom/JSON) |

`FeedOptions` also gains optional `ttl`, `generator`, `managingEditor`, `webMaster`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/rss` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/rss
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

