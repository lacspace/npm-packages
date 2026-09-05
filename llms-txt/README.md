<div align="center">

# @lacspace/llms-txt

**Generate & parse `llms.txt` and `llms-full.txt` — the [llmstxt.org](https://llmstxt.org) standard.**

[![npm version](https://img.shields.io/npm/v/@lacspace/llms-txt?color=%2322c55e&label=npm)](https://www.npmjs.com/package/@lacspace/llms-txt)
[![install size](https://packagephobia.com/badge?p=@lacspace/llms-txt)](https://packagephobia.com/result?p=@lacspace/llms-txt)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/llms-txt?label=minzip)](https://bundlephobia.com/package/@lacspace/llms-txt)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/llms-txt)
[![license](https://img.shields.io/npm/l/@lacspace/llms-txt?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> `llms.txt` is a Markdown file at your site root that gives LLMs a curated map of your most useful pages; `llms-full.txt` inlines the full content so a model can read everything in one request. This builds (and parses) both — the SEO layer for the AI era.

- 📄 `llmsTxt()` — H1 title, blockquote summary, linked sections
- 📚 `llmsFullTxt()` — full content inlined for one-shot ingestion
- 🔁 `parseLlmsTxt()` — read an existing file back into structured data
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/llms-txt      # or pnpm add / yarn add / bun add
```

## Generate `llms.txt`

```ts
import { llmsTxt } from "@lacspace/llms-txt";

const txt = llmsTxt({
  title: "Lacspace",
  summary: "Open-source TypeScript packages and products.",
  details: "Zero-dependency, isomorphic, Lacspace-Free-Licensed.",
  sections: [
    {
      title: "Docs",
      links: [
        { title: "npm Packages", url: "https://lacspace.com/packages", notes: "20 packages" },
        { title: "SDK", url: "https://www.npmjs.com/package/@lacspace/sdk" },
      ],
    },
  ],
});
```

```markdown
# Lacspace

> Open-source TypeScript packages and products.

Zero-dependency, isomorphic, Lacspace-Free-Licensed.

## Docs

- [npm Packages](https://lacspace.com/packages): 20 packages
- [SDK](https://www.npmjs.com/package/@lacspace/sdk)
```

## Generate `llms-full.txt`

```ts
import { llmsFullTxt } from "@lacspace/llms-txt";

llmsFullTxt({
  title: "Lacspace Docs",
  sections: [
    { title: "Getting started", url: "https://lacspace.com/docs", content: "# Getting started\n\nInstall with npm…" },
  ],
});
```

## Parse

```ts
import { parseLlmsTxt } from "@lacspace/llms-txt";

const doc = parseLlmsTxt(existing); // { title, summary, details, sections: [{ title, links }] }
```

> Serve `llmsTxt(...)` at `/llms.txt` and `llmsFullTxt(...)` at `/llms-full.txt` (e.g. from a Next.js Route Handler or any static build step).

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| **`@lacspace/llms-txt`** | llms.txt / llms-full.txt (this package) |
| [`@lacspace/site-verify`](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine verification |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| [`@lacspace/slugify`](https://www.npmjs.com/package/@lacspace/slugify) | SEO URL slugs |

## New in 1.2 — build from your sitemap

```ts
import { llmsTxtFromSitemap } from "@lacspace/llms-txt";

// Feed the same URL list your sitemap uses; sections + titles are derived
const txt = llmsTxtFromSitemap(
  [
    { url: "https://x.com/", section: "Main" },
    { url: "https://x.com/docs/sdk", section: "Docs", title: "SDK" },
  ],
  { title: "Lacspace", summary: "Open-source packages & products." },
);
```

## New in 1.1 — Response helpers

```ts
import { llmsTxtResponse, llmsFullTxtResponse } from "@lacspace/llms-txt";

// app/llms.txt/route.ts — served as text/plain
export function GET() {
  return llmsTxtResponse({ title: "Lacspace", summary: "…", sections });
}
```

## Advanced (new)

All additive and backward-compatible — `llmsTxt`, `llmsFullTxt`, `parseLlmsTxt`, `llmsTxtFromSitemap` and the `*Response` helpers keep their existing behavior.

### Build from routes

`llmsTxtFromRoutes(routes, meta)` turns a flat list of `{ title, url, notes?, section? }` into an `llms.txt`, grouping by `section` (first-seen order preserved).

```ts
import { llmsTxtFromRoutes } from "@lacspace/llms-txt";

llmsTxtFromRoutes(
  [
    { title: "Home", url: "https://acme.com/", section: "Start" },
    { title: "API", url: "https://acme.com/api", notes: "reference", section: "Docs" },
    { title: "CLI", url: "https://acme.com/cli", section: "Docs" },
  ],
  { title: "Acme", summary: "Acme docs", defaultSection: "Docs" },
);
```

### Sitemap: XML string, auto-sections, dedupe

`llmsTxtFromSitemap` now accepts a **raw sitemap XML string** as well as an array, de-duplicates repeated URLs, and can derive sections from the first path segment with `sectionFromPath: true`. The original array signature is unchanged.

```ts
llmsTxtFromSitemap(sitemapXmlString, { title: "Acme", sectionFromPath: true });
// "/docs/intro" → "## Docs", "/blog/hello" → "## Blog"
```

### Sort links within sections

`llmsTxt(doc, { sort })` — and the `sort` option on `llmsTxtFromRoutes` / `llmsTxtFromSitemap` — orders the links inside each section. Sections keep their array order.

```ts
llmsTxt(doc, { sort: "title" });        // ascending by title
llmsTxt(doc, { sort: "url-desc" });     // descending by url
llmsTxt(doc, { sort: (a, b) => /* custom */ 0 });
```

`parseLlmsTxt` round-trips what `llmsTxt` produces (title, summary, details, sections and links).

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/llms-txt` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/llms-txt
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

