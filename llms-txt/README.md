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

## New in 1.1 — Response helpers

```ts
import { llmsTxtResponse, llmsFullTxtResponse } from "@lacspace/llms-txt";

// app/llms.txt/route.ts — served as text/plain
export function GET() {
  return llmsTxtResponse({ title: "Lacspace", summary: "…", sections });
}
```

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
