<div align="center">

# @lacspace/sitemap

**Generate `sitemap.xml`, sitemap indexes and Next.js sitemaps — typed.**

[![npm version](https://img.shields.io/npm/v/@lacspace/sitemap?color=%2322c55e&label=npm)](https://www.npmjs.com/package/@lacspace/sitemap)
[![install size](https://packagephobia.com/badge?p=@lacspace/sitemap)](https://packagephobia.com/result?p=@lacspace/sitemap)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/sitemap?label=minzip)](https://bundlephobia.com/package/@lacspace/sitemap)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/sitemap)
[![license](https://img.shields.io/npm/l/@lacspace/sitemap?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> URL entries with `lastmod` / `changefreq` / `priority`, **image / video / news** extensions and **hreflang** alternates. Auto-splits past 50,000 URLs into a sitemap index. Emits XML strings *and* Next.js `MetadataRoute.Sitemap` objects.

- 🗺️ `sitemap()` → valid XML · `sitemapIndex()` for multi-file sites
- 🖼️ image / 🎬 video / 📰 news extensions · 🌐 hreflang alternates
- ✂️ `splitSitemaps()` auto-shards big sets into an index
- ▲ `toNextSitemap()` for `app/sitemap.ts`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/sitemap      # or pnpm add / yarn add / bun add
```

## Basic sitemap

```ts
import { sitemap } from "@lacspace/sitemap";

const xml = sitemap([
  { loc: "https://lacspace.com/", changefreq: "daily", priority: 1.0, lastmod: new Date() },
  { loc: "https://lacspace.com/packages", changefreq: "weekly", priority: 0.8 },
  {
    loc: "https://lacspace.com/blog/launch",
    images: [{ loc: "https://lacspace.com/og/launch.png", title: "Launch" }],
    alternates: [{ hreflang: "ne", href: "https://lacspace.com/ne/blog/launch" }],
  },
]);
```

## Next.js `app/sitemap.ts`

```ts
import { toNextSitemap } from "@lacspace/sitemap";

export default function sitemap() {
  return toNextSitemap([
    { loc: "https://lacspace.com/", priority: 1.0, changefreq: "daily" },
    { loc: "https://lacspace.com/packages", priority: 0.8 },
  ]);
}
```

## Large sites — auto-split into an index

```ts
import { splitSitemaps } from "@lacspace/sitemap";

const { index, files } = splitSitemaps(allUrls, { baseUrl: "https://lacspace.com", perFile: 50000 });
// write `index` → /sitemap.xml, and each files[i] → /sitemap-i.xml
```

## API

| Export | Description |
| --- | --- |
| `sitemap(urls)` | a single `<urlset>` document |
| `sitemapIndex(list)` | a `<sitemapindex>` document |
| `splitSitemaps(urls, opts)` | `{ index, files[] }` for big sets |
| `toNextSitemap(urls)` | `MetadataRoute.Sitemap` array |

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| **`@lacspace/sitemap`** | sitemap.xml (this package) |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| [`@lacspace/site-verify`](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine verification |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| [`@lacspace/slugify`](https://www.npmjs.com/package/@lacspace/slugify) | SEO URL slugs |

## New in 1.1 — sitemap from bare paths

```ts
import { sitemapForSite } from "@lacspace/sitemap";

sitemapForSite({ url: "https://acme.com" }, [
  "/",
  "/pricing",
  { path: "/blog", changefreq: "daily", priority: 0.8 },
]);
// no repeating your domain on every row — relative paths resolve automatically
```

Pairs with `defineSite()` from [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) — `sitemapForSite(site.config, routes)`.

## Advanced (new)

Specialised extension sitemaps and a human-readable stylesheet — all additive, existing exports unchanged.

```ts
import {
  newsSitemap, videoSitemap, imageSitemap,
  sitemap, sitemapStylesheet,
} from "@lacspace/sitemap";

// Google News sitemap (last ~2 days of articles)
newsSitemap([
  { loc: "https://x.com/a", publicationName: "The Times", language: "en",
    title: "Big Headline", publicationDate: new Date() },
]);

// Video extension sitemap
videoSitemap([
  { loc: "https://x.com/watch", thumbnailLoc: "https://x.com/t.jpg",
    title: "Clip", description: "…", contentLoc: "https://x.com/v.mp4", duration: 120 },
]);

// Image extension sitemap (multiple images grouped per URL)
imageSitemap([
  { loc: "https://x.com/gallery", images: [{ loc: "https://x.com/1.jpg", title: "One" }] },
]);

// Make a raw sitemap.xml render as a table in the browser:
// serve sitemapStylesheet() at /sitemap.xsl, then reference it
sitemap(urls, { stylesheet: "/sitemap.xsl" });
```

- **`newsSitemap(items, opts?)`** — Google News sitemap (`<news:news>` with publication name/language, `publication_date`, `title`).
- **`videoSitemap(items, opts?)`** — video sitemap (`<video:video>` with `thumbnail_loc`, `title`, `description`, `content_loc`/`player_loc`, `duration`).
- **`imageSitemap(items, opts?)`** — image sitemap (`<image:image>` entries grouped per URL).
- **`sitemapStylesheet()`** — returns an XSL stylesheet string; theme-aware HTML table view of any sitemap.
- **`sitemap(urls, { stylesheet })`** — the existing builder now optionally adds an `<?xml-stylesheet?>` PI (each extension builder accepts the same `opts`).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/sitemap` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/sitemap
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

