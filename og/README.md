<div align="center">

# @lacspace/og

**Dynamic Open Graph images — configure the look once, call it per page.**

[![npm version](https://img.shields.io/npm/v/@lacspace/og?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/og)
[![license](https://img.shields.io/npm/l/@lacspace/og?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Every page deserves a gorgeous share card. `@lacspace/og` gives you one design system that renders **two ways from the same options** — a `next/og` element tree (real PNG via Satori) and a standalone **SVG** (no browser, no deps) — with auto-fitting titles, eyebrows, badges, logos and gradients.

## Install

```bash
npm i @lacspace/og
```

## Use it with `next/og` (dynamic PNG)

```tsx
// app/og/route.tsx
import { ImageResponse } from "next/og";
import { ogCard } from "@lacspace/og";

export const runtime = "edge";

export function GET(req: Request) {
  const title = new URL(req.url).searchParams.get("title") ?? "My site";
  return new ImageResponse(
    ogCard({
      title,
      eyebrow: "Guide",
      subtitle: "my-site.com",
      logo: "M",
      from: "#22d3ee",
      to: "#6366f1",
    }) as any,
    { width: 1200, height: 630 },
  );
}
```

Then point your metadata at it: `openGraph.images = ["/og?title=" + encodeURIComponent(pageTitle)]`.

## Use it anywhere (zero-dependency SVG)

`ogSvg()` needs no browser and no Satori — perfect for previews, email headers, README banners, or a guaranteed fallback:

```ts
import { ogSvg, ogSvgDataUri } from "@lacspace/og";

const svg = ogSvg({ title: "Launch day", badge: "NEW", from: "#f43f5e", to: "#f59e0b" });
// -> "<svg …>…</svg>"  (write to a file, return as image/svg+xml, embed inline)

const uri = ogSvgDataUri({ title: "Hello" });
// -> "data:image/svg+xml;utf8,…"  (drop straight into <img src> or background-image)
```

## Options

| Option | Meaning |
| --- | --- |
| `title` | Headline — **font size auto-fits** to length |
| `subtitle` | Secondary line (often your domain) |
| `eyebrow` | Small uppercase label above the title |
| `badge` | A pill (e.g. `"NEW"`, `"Guide"`) |
| `logo` | Initial / emoji for the corner mark |
| `footer` | Bottom-left line (e.g. your URL) |
| `from` / `to` | Accent gradient stops |
| `theme` | `"dark"` (default) or `"light"` |
| `preset` | `"gradient"` · `"split"` · `"minimal"` · `"terminal"` |
| `width` / `height` | Canvas — defaults to the OG standard `1200×630` |

Also exports `fitFontSize(title)` if you want the sizing math for your own layout.

Pairs with [`@lacspace/seo`](https://www.npmjs.com/package/@lacspace/seo) — feed the generated URL to `defineSite().meta({ image })`.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

<div align="center">

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

</div>

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
