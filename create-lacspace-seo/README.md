<div align="center">

# create-lacspace-seo

**Scaffold a complete, production-ready SEO setup into a Next.js app in one command.**

[![npm version](https://img.shields.io/npm/v/create-lacspace-seo?color=%2316a34a&label=npm)](https://www.npmjs.com/package/create-lacspace-seo)
[![license](https://img.shields.io/npm/l/create-lacspace-seo?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> One command drops in a `defineSite()` config plus **ready-made `robots.txt`, `sitemap.xml`, `feed.xml`, `llms.txt` and a dynamic OG-image route** — all wired to a single source of truth. No copywriting, no boilerplate, no fragile hand-written structured data.

## Use it

```bash
npm create lacspace-seo@latest
# or
npx create-lacspace-seo
```

Run it inside a Next.js **App Router** project. It auto-detects `app/` or `src/app/`, asks a few questions (or take flags), and writes:

```
lib/site.ts               ← one defineSite() config, used everywhere
app/robots.txt/route.ts   ← robots.txt (auto sitemap ref, optional AI blocking)
app/sitemap.xml/route.ts  ← sitemap.xml from bare paths
app/feed.xml/route.ts     ← RSS feed, prefilled from the site config
app/llms.txt/route.ts     ← llms.txt map for LLMs (llmstxt.org)
app/og/route.tsx          ← dynamic Open Graph images (/og?title=…)
```

Then install the packages it uses and you're done:

```bash
npm i @lacspace/seo @lacspace/robots @lacspace/sitemap @lacspace/rss @lacspace/llms-txt
```

## Non-interactive (CI / scripts)

```bash
npx create-lacspace-seo --yes \
  --name "Acme" \
  --url "https://acme.com" \
  --description "We build things" \
  --twitter acmehq \
  --logo /logo.png
```

| Flag | Meaning |
| --- | --- |
| `--name <name>` | Site / brand name |
| `--url <url>` | Absolute site URL |
| `--description <text>` | Default meta description |
| `--twitter <handle>` | Twitter/X handle |
| `--logo <path>` | Logo path (e.g. `/logo.png`) |
| `--no-og` | Skip the dynamic OG-image route |
| `-y, --yes` | No prompts (needs `--name` & `--url`) |
| `--force` | Overwrite existing files |

Existing files are **never overwritten** unless you pass `--force` — safe to re-run.

## What you get

Every page becomes a one-liner, powered by the file it generated:

```ts
import { site } from "@/lib/site";

export const metadata = site.meta({ title: "Pricing", path: "/pricing" });
// → title template, canonical, Open Graph, Twitter card, dynamic OG image — all filled in
```

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata, JSON-LD & the `defineSite()` engine |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| **`create-lacspace-seo`** | Scaffolder (this package) |

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`create-lacspace-seo` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

