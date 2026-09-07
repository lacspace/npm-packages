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

- 📄 `llmsTxt()` — H1 title, blockquote summary, linked sections, `## Optional` block
- 📚 `llmsFullTxt()` — full content inlined for one-shot ingestion
- 🗺️ `llmsFromPages()` — build BOTH files from one list of pages (title + url + content)
- ✅ `validateLlmsTxt()` — check the required H1 + summary shape, report issues
- 🔁 `parseLlmsTxt()` — read an existing file back into structured data
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

> **New in 1.4.0** — `llmsFromPages()` / `llmsFullTxtFromPages()` generate `llms.txt` **and** `llms-full.txt` from a page list; a first-class `## Optional` block (`doc.optional`, round-trips through `parseLlmsTxt`); `validateLlmsTxt()`; and opt-in Markdown escaping via `escapeLlmsText()` / `{ escape: true }`. All additive — existing output is byte-for-byte unchanged.

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

## New in 1.4 — pages → both files, Optional block, validation

### Build both files from a page list

`llmsFromPages(pages, meta)` returns `{ txt, full }` — the compact `llms.txt` (a link per page with a `url`, grouped by `section`) **and** the expanded `llms-full.txt` (every page's `content` inlined). Also available split: `llmsTxtFromPages` / `llmsFullTxtFromPages`.

```ts
import { llmsFromPages } from "@lacspace/llms-txt";

const { txt, full } = llmsFromPages(
  [
    { title: "Home", url: "https://acme.com/", content: "# Home\n\nWelcome.", section: "Start" },
    { title: "API", url: "https://acme.com/api", content: "# API\n\n…", notes: "reference", section: "Docs" },
    { title: "Legacy", url: "https://acme.com/legacy", content: "# Legacy", optional: true },
  ],
  { title: "Acme", summary: "Acme docs" },
);
// serve `txt` at /llms.txt and `full` at /llms-full.txt
```

### The `## Optional` block

`LlmsDoc.optional?: LlmsLink[]` renders the special `## Optional` section (links an LLM may skip) last, and round-trips through `parseLlmsTxt`. Pages with `optional: true` are routed there automatically.

### Validate

```ts
import { validateLlmsTxt } from "@lacspace/llms-txt";

const { valid, issues } = validateLlmsTxt(text);
// valid === false only on errors (missing H1); warnings flag a missing
// summary, malformed link lines, duplicate/mis-placed H1.
```

### Markdown escaping (opt-in)

`escapeLlmsText(s)` escapes `\ [ ] ( )` in link text; pass `{ escape: true }` to `llmsTxt` / the builders to apply it to titles and notes. Off by default — the default output is unchanged.

| Function | Returns |
| --- | --- |
| `llmsTxt(doc, opts?)` | `llms.txt` string (now supports `doc.optional`, `opts.escape`) |
| `llmsFullTxt(doc)` | `llms-full.txt` string |
| `llmsFromPages(pages, meta)` | `{ txt, full }` from one page list |
| `llmsTxtFromPages(pages, meta)` | `llms.txt` from pages |
| `llmsFullTxtFromPages(pages, meta)` | `llms-full.txt` from pages |
| `llmsTxtFromRoutes(routes, meta)` | `llms.txt` from flat routes |
| `llmsTxtFromSitemap(entries, meta)` | `llms.txt` from a sitemap (array or XML) |
| `parseLlmsTxt(text)` | `{ title, summary, details?, sections, optional? }` |
| `validateLlmsTxt(text)` | `{ valid, issues }` |
| `escapeLlmsText(s)` | escaped link text |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/llms-txt` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/llms-txt
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

