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

## New in 1.2 — stack presets & a crawlability matcher

```ts
import { nextjsRobots, blockAll, envRobots, allowSearchBlockTraining, isAllowed, parseRobots } from "@lacspace/robots";

// Stack-aware defaults (Next.js/_next, WordPress, Shopify)
export default () => nextjsRobots({ sitemap: "https://x.com/sitemap.xml" });

// Block everything on preview/staging, index in production
envRobots(process.env.VERCEL_ENV === "production", { sitemap });

// Allow search + answer engines but block AI-training crawlers
allowSearchBlockTraining({ sitemap });

// Test whether a URL is crawlable (longest-match wins; ties favour Allow)
const parsed = parseRobots(txt);
isAllowed("/admin/secret", parsed);        // false
isAllowed("/files/a.pdf", parseRobots("User-agent: *\nDisallow: /*.pdf$")); // false
```

## New in 1.2 — one-line robots.txt from your site URL

```ts
import { robotsForSite } from "@lacspace/robots";

robotsForSite({ url: "https://acme.com" }, { blockAi: true });
// allow all · Sitemap: https://acme.com/sitemap.xml · Host: … · blocks GPTBot, ClaudeBot, CCBot, Google-Extended…
```

Pairs with `defineSite()` from [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) — `robotsForSite(site.config, { blockAi: true })`.

## Advanced (new)

Broader AI-crawler coverage, a spreadable AI-policy helper, Yandex `Clean-param`, and robots directive builders — all additive, existing exports unchanged.

```ts
import {
  aiPolicy, robots, toNextRobots,
  AI_BOTS, AI_TRAINING_BOTS,
  xRobotsTag, metaRobots,
} from "@lacspace/robots";

// Spread a policy into your own groups
robots({
  groups: [{ userAgent: "*", allow: ["/"] }, ...aiPolicy("block-all-ai")],
  sitemap: "https://x.com/sitemap.xml",
});
// presets: "block-all-ai" | "allow-search-block-training" | "allow-all"

// Yandex Clean-param + Crawl-delay per group
robots({ groups: [{ userAgent: "Yandex", crawlDelay: 2, cleanParam: ["ref /articles/"] }] });

// X-Robots-Tag header value + <meta name="robots"> content
xRobotsTag({ noindex: true, maxImagePreview: "large", unavailableAfter: new Date("2026-12-31") });
xRobotsTag({ noindex: true }, { userAgent: "googlebot" }); // "googlebot: noindex"
metaRobots({ noindex: true, nofollow: true });             // "noindex, nofollow"
```

- **`AI_BOTS`** — now also covers `Perplexity-User`, `Meta-ExternalAgent`, `YouBot` (plus the existing GPTBot/ClaudeBot/CCBot/Google-Extended… set).
- **`AI_TRAINING_BOTS`** — the training-only subset (excludes AI *search* engines like OAI-SearchBot/PerplexityBot).
- **`aiPolicy(preset)`** — returns `RobotsGroup[]` to spread into `robots()` / `toNextRobots()`.
- **`cleanParam`** on any group — emits Yandex `Clean-param:` lines (`crawlDelay` already emitted `Crawl-delay:`); both round-trip through `parseRobots()`.
- **`xRobotsTag(directives, { userAgent? })`** / **`metaRobots(directives)`** — typed builders for `noindex`, `nofollow`, `none`, `all`, `noarchive`, `nosnippet`, `noimageindex`, `notranslate`, `max-snippet`, `max-image-preview`, `max-video-preview`, `unavailable_after`.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/robots` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/robots
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

