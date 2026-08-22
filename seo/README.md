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
- 🧩 JSON-LD builders: `organization` · `website` · `article` · `product` · `breadcrumb` · `faqPage` · `softwareApp`
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
| `seoMetadata(input)` | Next.js `Metadata` |

## The Lacspace WebKit

| Package | For |
| --- | --- |
| **`@lacspace/seo`** | Metadata & JSON-LD (this package) |
| [`@lacspace/env`](https://www.npmjs.com/package/@lacspace/env) | Typed env variables |
| [`@lacspace/rate-limit`](https://www.npmjs.com/package/@lacspace/rate-limit) | Rate limiting |
| [`@lacspace/otp`](https://www.npmjs.com/package/@lacspace/otp) | TOTP/HOTP 2FA |
| [`@lacspace/next`](https://www.npmjs.com/package/@lacspace/next) | Next.js SDK integration |

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · MIT licensed · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
