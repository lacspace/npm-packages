<div align="center">

# @lacspace/site-verify

**Search-engine site verification — meta tags & file tokens for GSC, Bing, Yandex & more.**

[![npm version](https://img.shields.io/npm/v/@lacspace/site-verify?color=%2322c55e&label=npm)](https://www.npmjs.com/package/@lacspace/site-verify)
[![install size](https://packagephobia.com/badge?p=@lacspace/site-verify)](https://packagephobia.com/result?p=@lacspace/site-verify)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/site-verify?label=minzip)](https://bundlephobia.com/package/@lacspace/site-verify)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/site-verify)
[![license](https://img.shields.io/npm/l/@lacspace/site-verify?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> One typed input → verification `<meta>` tags, a Next.js `verification` metadata object, or the file-based verification content — for **Google Search Console, Bing Webmaster, Yandex, Baidu, Pinterest, Ahrefs, Facebook** and any custom provider. Stop hunting for the right meta `name`.

- 🏷️ `verificationMeta()` / `verificationMetaHtml()`
- ▲ `toNextVerification()` for `metadata.verification`
- 📄 `verificationFile()` for file-upload verification (Google, Bing, Yandex)
- ⚡ Zero dependencies · 🌍 isomorphic · 📦 ESM + CJS · fully typed

## Install

```bash
npm install @lacspace/site-verify      # or pnpm add / yarn add / bun add
```

## Meta tags (any framework)

```ts
import { verificationMeta, verificationMetaHtml } from "@lacspace/site-verify";

verificationMeta({ google: "abc123", bing: "XYZ789", pinterest: "pin456" });
// [{ name: "google-site-verification", content: "abc123" },
//  { name: "msvalidate.01", content: "XYZ789" },
//  { name: "p:domain_verify", content: "pin456" }]

verificationMetaHtml({ google: "abc123" });
// <meta name="google-site-verification" content="abc123" />
```

## Next.js

```ts
// app/layout.tsx
import { toNextVerification } from "@lacspace/site-verify";

export const metadata = {
  verification: toNextVerification({ google: "abc123", bing: "XYZ789", yandex: "y1" }),
  // → { google: "abc123", yandex: "y1", other: { "msvalidate.01": "XYZ789" } }
};
```

## File-based verification

```ts
import { verificationFile } from "@lacspace/site-verify";

verificationFile("google", "abc123");
// { path: "/googleabc123.html", content: "google-site-verification: googleabc123.html", contentType: "text/html" }

verificationFile("bing", "TOKEN");   // → /BingSiteAuth.xml
verificationFile("yandex", "TOKEN"); // → /yandex_TOKEN.html
```

## Supported providers (meta)

`google` · `bing` · `yandex` · `baidu` · `pinterest` · `ahrefs` · `facebook` · `norton` · plus any via `other: { "meta-name": "token" }`.

## The Lacspace SEO Kit

| Package | For |
| --- | --- |
| [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) | Metadata & JSON-LD |
| [`@lacspace/sitemap`](https://www.npmjs.com/package/@lacspace/sitemap) | sitemap.xml |
| [`@lacspace/robots`](https://www.npmjs.com/package/@lacspace/robots) | robots.txt |
| [`@lacspace/llms-txt`](https://www.npmjs.com/package/@lacspace/llms-txt) | llms.txt / llms-full.txt |
| **`@lacspace/site-verify`** | Search-engine verification (this package) |
| [`@lacspace/rss`](https://www.npmjs.com/package/@lacspace/rss) | RSS / Atom / JSON feeds |
| [`@lacspace/slugify`](https://www.npmjs.com/package/@lacspace/slugify) | SEO URL slugs |

## New in 1.1 — Response helper

```ts
import { verificationFileResponse } from "@lacspace/site-verify";

// app/googleXXXX.html/route.ts — serve the verification file
export function GET() {
  return verificationFileResponse("google", "googleXXXX.html");
}
```

## Advanced (new)

**More engines, and a public registry.** `VERIFICATION_PROVIDERS` maps every known provider id to its exact meta `name` — now including **Naver**, **Brave** and **Alexa** alongside Google, Bing, Yandex, Baidu, Pinterest, Ahrefs, Facebook and Norton. `VerificationInput` gains the matching optional fields; anything unknown still goes through `other`.

```ts
import { VERIFICATION_PROVIDERS } from "@lacspace/site-verify";
// { google: "google-site-verification", bing: "msvalidate.01", …, naver: "naver-site-verification", brave: "brave-site-verification", alexa: "alexaVerifyID" }
```

**`allVerifications(record)`** — pass a loose record keyed by provider id *or* raw meta `name`; get back the `<meta>` tag descriptors. Empty values are skipped.

```ts
import { allVerifications } from "@lacspace/site-verify";

allVerifications({ google: "abc", bing: "xyz", "custom-verify": "t" });
// [{ name: "google-site-verification", content: "abc" },
//  { name: "msvalidate.01", content: "xyz" },
//  { name: "custom-verify", content: "t" }]
```

**`nextVerification(record)`** — the same loose record → a Next.js `metadata.verification`-shaped object, ready to spread.

```ts
import { nextVerification } from "@lacspace/site-verify";

export const metadata = {
  verification: nextVerification({ google: "abc", bing: "xyz", yandex: "y1" }),
  // → { google: "abc", yandex: "y1", other: { "msvalidate.01": "xyz" } }
};
```

**`verificationTag(providerOrName, content)`** — build a single tag, resolving a known provider id or using a raw meta `name` verbatim (the generic escape hatch).

All existing exports (`verificationMeta`, `verificationMetaHtml`, `toNextVerification`, `verificationFile`, `verificationFileResponse`) are unchanged.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial** (paid), **Client-specific**, and **Private** (proprietary) packages under separate terms. See the full **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — 35 zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
