<div align="center">

# @lacspace/seo

**Typed metadata + JSON-LD — stop copy-pasting fragile structured data.**

[![npm version](https://img.shields.io/npm/v/@lacspace/seo?color=%230ea5e9&label=npm)](https://www.npmjs.com/package/@lacspace/seo)
[![install size](https://packagephobia.com/badge?p=@lacspace/seo)](https://packagephobia.com/result?p=@lacspace/seo)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/seo?label=minzip)](https://bundlephobia.com/package/@lacspace/seo)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/seo)
[![license](https://img.shields.io/npm/l/@lacspace/seo?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Build valid **schema.org** JSON-LD and Next.js App Router **`Metadata`** objects with typed one-liners. Autocomplete instead of guesswork; no malformed rich-results markup.

- 🏷️ `seoMetadata()` → a Next `Metadata` object (title, description, canonical, OG, Twitter)
- 🧩 16 JSON-LD builders: `organization` · `website` · `article` · `product` · `breadcrumb` · `faqPage` · `softwareApp` · `localBusiness` · `event` · `person` · `review` · `videoObject` · `howTo` · `jobPosting` · `course` · `recipe`
- 🌐 `hreflang()` for multilingual `alternates`
- 🛡️ `jsonLdScript()` renders a safe `<script>` (escapes `</script>`)
- ⚡ Zero dependencies · 🌍 isomorphic (any framework) · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/seo      # or pnpm add / yarn add / bun add
```

## Next.js metadata in one line

```ts
// app/pricing/page.tsx
import { seoMetadata } from "@lacspace/seo";

export const metadata = seoMetadata({
  title: "Pricing — Lacspace",
  description: "Simple, transparent plans.",
  canonical: "/pricing",
  image: "https://lacspace.com/og/pricing.png",
  baseUrl: "https://lacspace.com",
});
```

## JSON-LD, typed

```tsx
import { article, breadcrumb, faqPage, jsonLdScript } from "@lacspace/seo";

const schema = article({
  headline: "Launching StockKit",
  author: { name: "Lumi AI", url: "https://lacspace.com" },
  datePublished: "2026-08-22",
  image: "https://lacspace.com/og/stockkit.png",
  publisher: { name: "Lacspace", url: "https://lacspace.com", logo: "https://lacspace.com/logo.png" },
});

// In a Server Component:
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

// Or get the whole tag as a string (safely escaped):
jsonLdScript(faqPage([{ question: "Is it free?", answer: "Yes — MIT licensed." }]));
```

```ts
breadcrumb([
  { name: "Home", url: "https://lacspace.com" },
  { name: "Blog", url: "https://lacspace.com/blog" },
]);
```

## Builders

| Builder | schema.org type |
| --- | --- |
| `organization(o)` | Organization |
| `website(o)` | WebSite (+ SearchAction) |
| `article(o)` | Article |
| `product(o)` | Product (+ Offer, AggregateRating) |
| `breadcrumb(items)` | BreadcrumbList |
| `faqPage(items)` | FAQPage |
| `softwareApp(o)` | SoftwareApplication |
| `localBusiness` `event` `person` `review` | LocalBusiness / Event / Person / Review |
| `videoObject` `howTo` `jobPosting` `course` `recipe` | VideoObject / HowTo / JobPosting / Course / Recipe |
| `seoMetadata(input)` | Next.js `Metadata` |
| `hreflang(map)` | `alternates.languages` for Next |

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| **`@lacspace/seo`** | Metadata & JSON-LD (this package) |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| [`@lacspace/site-verify`](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine verification |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| [`@lacspace/slugify`](https://www.npmjs.com/package/@lacspace/slugify) | SEO URL slugs |

## New in 1.2 — @graph, breadcrumbs-from-path, richer OG & linting

```ts
import { graph, organization, website, breadcrumbFromPath, seoMetadata, lintSeo, blogPosting, jsonLdScript } from "@lacspace/seo";

// Compose many nodes into ONE @graph (shared @context, no duplication)
const ld = graph(organization({ name: "Lacspace", url: "https://lacspace.com" }), website({ name: "Lacspace", url: "https://lacspace.com" }));

// Breadcrumbs straight from the URL path — no manual wiring
breadcrumbFromPath("/blog/my-post", { baseUrl: "https://x.com" });

// Richer social cards + i18n in one call
export const metadata = seoMetadata({
  title, description, image, imageAlt, imageWidth: 1200,
  type: "article", article: { publishedTime, authors: ["Lumi"] },
  twitterSite: "@lacspace", languages: { en: "/en", ne: "/ne" },
});

// Catch SEO mistakes before deploy
lintSeo({ title, description, canonical, image }).warnings; // ["description is 210 chars (>160…)"]
```

Also: `blogPosting`, `newsArticle`, `webPage` builders.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
