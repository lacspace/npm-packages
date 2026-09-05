<div align="center">

# @lacspace/slugify

**Turn any text into a clean, SEO-friendly URL slug.**

[![npm version](https://img.shields.io/npm/v/@lacspace/slugify?color=%2322c55e&label=npm)](https://www.npmjs.com/package/@lacspace/slugify)
[![install size](https://packagephobia.com/badge?p=@lacspace/slugify)](https://packagephobia.com/result?p=@lacspace/slugify)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/slugify?label=minzip)](https://bundlephobia.com/package/@lacspace/slugify)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/slugify)
[![license](https://img.shields.io/npm/l/@lacspace/slugify?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Transliterates common diacritics (`é → e`), strips the rest, collapses separators, truncates on word boundaries, and can **guarantee uniqueness** against existing slugs. Perfect for article/product URLs.

- ✂️ `slugify()` with `lower` / `separator` / `maxLength` / custom `replace`
- 🔢 `uniqueSlug()` — appends `-2`, `-3`… against a `Set`/array
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/slugify      # or pnpm add / yarn add / bun add
```

## Usage

```ts
import { slugify, uniqueSlug } from "@lacspace/slugify";

slugify("Héllo, World! — 2026");            // "hello-world-2026"
slugify("StockYatra: Paper Trading");        // "stockyatra-paper-trading"
slugify("Über Café", { separator: "_" });    // "uber_cafe"
slugify("A very long article title here", { maxLength: 15 }); // "a-very-long" (word boundary)

uniqueSlug("Hello", new Set(["hello", "hello-2"])); // "hello-3"
```

## Custom replacements

```ts
slugify("C++ & C#", { replace: { "++": "pp", "#": "sharp" } }); // "cpp-csharp"
```

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| [`@lacspace/site-verify`](https://www.npmjs.com/package/@lacspace/site-verify) | Search-engine verification |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| **`@lacspace/slugify`** | SEO URL slugs (this package) |

## Advanced (new)

**Wider transliteration.** Cyrillic and Greek now fold to ASCII out of the box (in addition to Latin diacritics and Turkish, which already worked). Two opt-in options and a fallback keep the defaults 100% backward compatible:

```ts
import { slugify } from "@lacspace/slugify";

slugify("Привет мир");                          // "privet-mir"   (Cyrillic)
slugify("Καλημέρα");                            // "kalimera"     (Greek)
slugify("İstanbul Şehri");                       // "istanbul-sehri" (Turkish)

slugify("Zürich", { german: true });             // "zuerich"  (ü→ue, ö→oe, ä→ae, ß→ss)
slugify("Rock & Roll", { symbols: true });       // "rock-and-roll" (& % € $ £ ¥ ₹ @ + …)
slugify("!!!", { fallback: "untitled" });        // "untitled"  (empty-result fallback)
```

> `german` and `symbols` are **off by default** — without them, `ü→u` and `&` is stripped, exactly as before.

**`slugifyPath(path, opts?)`** — slugify each `/`-separated segment, preserving the slashes:

```ts
import { slugifyPath } from "@lacspace/slugify";
slugifyPath("/Blog/My First Post/"); // "/blog/my-first-post/"
```

**`slugifyFilename(name, opts?)`** — slugify the base name but keep the extension:

```ts
import { slugifyFilename } from "@lacspace/slugify";
slugifyFilename("My File.PDF");            // "my-file.pdf"
slugifyFilename("Résumé (final).docx");    // "resume-final.docx"
```

All existing exports (`slugify`, `uniqueSlug`) and their behavior for existing inputs are unchanged.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/slugify` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/slugify
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

