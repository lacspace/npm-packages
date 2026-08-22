<div align="center">

# @lacspace/robots

**Build & parse `robots.txt` — with AI-crawler block presets and Next.js output.**

[![npm version](https://img.shields.io/npm/v/@lacspace/robots?color=%2322c55e&label=npm)](https://www.npmjs.com/package/@lacspace/robots)
[![install size](https://packagephobia.com/badge?p=@lacspace/robots)](https://packagephobia.com/result?p=@lacspace/robots)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/robots?label=minzip)](https://bundlephobia.com/package/@lacspace/robots)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/robots)
[![license](https://img.shields.io/npm/l/@lacspace/robots?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Typed per-user-agent rules, `Sitemap:` / `Host:` / `Crawl-delay:`, a **parser**, Next.js `robots.ts` output — and a one-liner to **block AI crawlers** (GPTBot, ClaudeBot, CCBot, Google-Extended, PerplexityBot…).

- 🤖 `robots()` builder · `parseRobots()` parser
- 🚫 `blockAiBots()` + the `AI_BOTS` list (18 known crawlers)
- ▲ `toNextRobots()` for `app/robots.ts`
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/robots      # or pnpm add / yarn add / bun add
```

## Build robots.txt

```ts
import { robots } from "@lacspace/robots";

robots({
  groups: [
    { userAgent: "*", disallow: ["/admin", "/api"], allow: ["/api/public"] },
    { userAgent: "Googlebot", disallow: [] }, // allow all
  ],
  sitemap: "https://lacspace.com/sitemap.xml",
  host: "lacspace.com",
});
```

## Block AI crawlers, allow everyone else

```ts
import { blockAiBots } from "@lacspace/robots";

blockAiBots({ sitemap: "https://lacspace.com/sitemap.xml" });
// User-agent: *
// Disallow:
//
// User-agent: GPTBot
// User-agent: ClaudeBot
// User-agent: CCBot
// … (Disallow: / for each)
//
// Sitemap: https://lacspace.com/sitemap.xml
```

## Next.js `app/robots.ts`

```ts
import { toNextRobots } from "@lacspace/robots";

export default function robots() {
  return toNextRobots({
    groups: [{ userAgent: "*", allow: ["/"], disallow: ["/admin"] }],
    sitemap: "https://lacspace.com/sitemap.xml",
  });
}
```

## Parse an existing file

```ts
import { parseRobots } from "@lacspace/robots";

const { groups, sitemaps, host } = parseRobots(txt);
```

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| **`@lacspace/robots`** | robots.txt (this package) |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| [`@lacspace/site-verify`](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine verification |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| [`@lacspace/slugify`](https://www.npmjs.com/package/@lacspace/slugify) | SEO URL slugs |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
