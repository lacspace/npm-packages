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

## New in 1.5 — SEO auditor (`generate` *and* `grade`)

Grade any live page's on-page SEO from the terminal — or `auditHtml()` in code/CI:

```bash
npx @lacspace/seo audit https://example.com
# Score 88/100  Grade B  · title/description/canonical/OG/JSON-LD/alt/indexable …
npx @lacspace/seo audit https://example.com --json   # machine output for CI (exits non-zero on any fail)
```

```ts
import { auditHtml } from "@lacspace/seo";

const report = auditHtml(await (await fetch(url)).text(), { url });
report.score;   // 0–100
report.grade;   // "A" … "F"
report.checks;  // [{ id, label, status: "pass"|"warn"|"fail", detail }]
```

Checks title, meta description, canonical, single H1, Open Graph, Twitter card, viewport, `lang`, charset, JSON-LD validity, image alts and indexability — each with a human explanation.

## New in 1.4 — scaffolder + more page presets

Skip the setup entirely — scaffold the whole SEO layer into a Next.js app:

```bash
npm create lacspace-seo@latest
# drops in lib/site.ts + robots.txt, sitemap.xml, feed.xml, llms.txt & a dynamic OG route
```

And three more `defineSite()` presets, each returning `{ metadata, jsonLd }`:

```ts
site.softwareApp({ title: "My App", path: "/app", price: 0, operatingSystem: "Web" });
site.event({ title: "Launch", path: "/events/launch", startDate: "2026-09-01", online: true });
site.localBusiness({ title: "Acme Cafe", path: "/cafe", telephone: "+1-555-0100", rating: { value: 4.8, count: 30 } });
```

## New in 1.3 — SEO Autopilot (configure once, auto-fill everything)

Set your brand **once** with `defineSite()`, then every page's metadata **and** JSON-LD is a one-liner — canonical URL, title template, Open Graph, Twitter card, auto description and auto OG image all filled in for you.

```ts
import { defineSite, jsonLdScript } from "@lacspace/seo";

export const site = defineSite({
  name: "Acme",
  url: "https://acme.com",
  logo: "/logo.png",
  twitter: "acmehq",
  ogImage: "/og",   // dynamic social cards → /og?title=<page> (zero design work)
  searchUrl: "https://acme.com/search?q={search_term_string}",
});

// app/layout.tsx — sitewide Organization + WebSite, declared once
// <>{/* */}<div dangerouslySetInnerHTML={{ __html: jsonLdScript(site.rootJsonLd()) }} /></>

// app/pricing/page.tsx
export const metadata = site.meta({ title: "Pricing", path: "/pricing" });
// → "Pricing · Acme" + canonical + OG + Twitter + og:image?title=Pricing

// app/blog/[slug]/page.tsx — metadata + BlogPosting + BreadcrumbList in ONE call
const { metadata, jsonLd } = site.article({
  title: post.title,
  path: `/blog/${post.slug}`,
  datePublished: post.date,
  author: "Lumi AI",
  content: post.body,   // ← description auto-derived, no copywriting
});
```

Also `site.product(...)`, `site.faq(...)`, `site.page(...)` — each returns `{ metadata, jsonLd }`. Plus content auto-derivation helpers you can use anywhere: **`excerpt()`**, **`metaDescription()`**, **`readingTime()`**, **`stripMarkdown()`** and **`ogImageUrl()`**.

## Advanced (new)

More schema.org builders for listing pages, Q&A, open-source pages and profiles — plus `defineSite()` gains a `collection()` preset, per-page `robots` control and `languages` hreflang everywhere. All additive and backward-compatible.

**New JSON-LD builders:**

```ts
import { itemList, collectionPage, qaPage, imageObject, softwareSourceCode, profilePage } from "@lacspace/seo";

// ItemList — for index / listing / "related" pages
itemList([{ name: "Post A", url: "/a" }, { name: "Post B", url: "/b", image: "/b.png" }], { name: "Latest posts", url: "/blog" });

// CollectionPage — a category / archive page (embeds a hasPart ItemList when items are given)
collectionPage({ name: "Blog", url: "https://x.com/blog", description: "All posts", items: [{ name: "A", url: "/a" }] });

// QAPage — question + accepted answer (+ optional community answers)
qaPage([{ question: "Is it free?", acceptedAnswer: "Yes.", suggestedAnswers: ["For personal use."] }]);

// ImageObject — a standalone image with dimensions & caption
imageObject({ url: "https://x.com/hero.png", width: 1200, height: 630, caption: "Hero" });

// SoftwareSourceCode — for open-source package / library pages
softwareSourceCode({ name: "@lacspace/seo", codeRepository: "https://github.com/lacspace/npm-packages", programmingLanguage: "TypeScript", license: "https://lacspace.com/licenses/lacspace-free-1.0", runtimePlatform: "Node.js" });

// ProfilePage — a page about a single person (wraps a Person as mainEntity)
profilePage({ person: { name: "Lumi AI", url: "https://lacspace.com", jobTitle: "AI" }, dateModified: "2026-09-05" });
```

**`defineSite()` enhancements:**

```ts
const site = defineSite({ name: "Acme", url: "https://acme.com" });

// Listing page in one call → @graph(CollectionPage, ItemList, BreadcrumbList)
const { metadata, jsonLd } = site.collection({
  title: "Blog",
  path: "/blog",
  items: [{ name: "Post A", url: "/blog/a" }, { name: "Post B", url: "/blog/b" }], // relative URLs auto-resolve
});

// Per-page robots + hreflang alternates (also on seoMetadata())
site.meta({
  title: "Staging",
  robots: { index: false, follow: true },          // → Metadata.robots (noindex still forces both false)
  languages: { en: "https://acme.com/en", ne: "https://acme.com/ne" }, // → alternates.languages
});
```

`robots` and `languages` are accepted by both **`seoMetadata()`** and every `defineSite()` page preset.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
