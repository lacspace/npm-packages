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

- 📡 `rss()` · `atom()` · `jsonFeed()` from the same input
- 🧱 Full-content (`content:encoded`), categories, authors, enclosures
- 🗓️ Correct `pubDate` (RFC-822) / `updated` (ISO-8601) handling
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

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

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
