<div align="center">

# @lacspace/logo

**Generate real logos from a name + a few keywords — no AI.**

[![npm version](https://img.shields.io/npm/v/@lacspace/logo?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/logo)
[![install size](https://packagephobia.com/badge?p=@lacspace/logo)](https://packagephobia.com/result?p=@lacspace/logo)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/logo?label=minzip)](https://bundlephobia.com/package/@lacspace/logo)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/logo)
[![license](https://img.shields.io/npm/l/@lacspace/logo?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Give a brand **name** and a few **keywords** and get an on-brand **SVG logo** — a monogram, an icon lockup, a geometric mark or an emblem. Choices (palette, type, icon, shape, layout) come deterministically from a curated JSON brain, so the same brief always yields the same logo, and a changed seed spins endless variations. Editable, infinitely scalable, and rasterizable to PNG/JPEG/WebP via [`@lacspace/image`](https://www.npmjs.com/package/@lacspace/image).

**Not AI art — designed brand assets.** Instant, free, reproducible, keyless, zero-dependency, isomorphic.

## Install

```bash
npm i @lacspace/logo
```

## One brief → a logo

```ts
import { generateLogo } from "@lacspace/logo";

const { svg, palette, icon } = generateLogo({
  name: "Kopi House",
  keywords: "coffee, cozy, artisanal, warm",
});
// svg → a complete <svg> string (coffee ☕ mark, warm amber palette, emblem seal)
```

Pass a longer brief and it extracts the keywords for you:

```ts
generateLogo({
  name: "Ledgerly",
  brief: "A trustworthy fintech that automates bookkeeping for small businesses.",
});
// → finance mood, deep-indigo palette, wallet icon, clean corporate type
```

## 12 concepts to choose from (the slot-machine)

```ts
import { generateLogoSet } from "@lacspace/logo";

const concepts = generateLogoSet({ name: "Orbit Labs", keywords: "ai, network, fast" }, 12);
// 12 reproducible variations — different engines, palettes, layouts
```

## See *why* it chose what it did

```ts
import { suggest } from "@lacspace/logo";

suggest({ name: "Ledgerly", keywords: "fintech trust money" });
// { mood: "finance", paletteId: "deep-indigo", fontId: "...", iconKey: "wallet",
//   notes: ["mood \"Finance\" from keywords", "palette Deep Indigo", ...] }
```

## 🆕 Brand-in-a-box (v1.1.0)

One brief → a whole consistent identity: logo lockups, a favicon/app-icon set, the palette and CSS variables — all sharing the same palette, type and icon.

```ts
import { generateBrandKit } from "@lacspace/logo";

const kit = generateBrandKit({ name: "Orbit Labs", keywords: "ai, network, fast" });
kit.primary.svg;    // horizontal lockup     kit.stacked.svg;  // icon over wordmark
kit.mark.svg;       // app icon / avatar     kit.wordmark.svg; // wordmark only
kit.mono.svg;       // single-colour stamp   kit.favicon;      // { svg, sizes[], links, manifestIcons }
kit.colors;         // [{ role, hex }, …]     kit.css;          // :root { --brand-primary: … }
```

Just need a favicon set?

```ts
import { generateFavicon } from "@lacspace/logo";
const fav = generateFavicon({ name: "Nova", keywords: "tech" });
// fav.svg (scalable) + fav.sizes (16…512) + fav.links (<link> tags) + fav.manifestIcons
```

> **v1.1.0** also grows the JSON brain to **67 icons**, **36 palettes**, **18 type pairings** and new industry moods (education, legal, real-estate, kids, fitness…).

## 🆕 Animated logo reveal (v1.2.0)

Turn any logo into a **self-contained animated SVG** that crafts itself on load (wipe + scale-in + a light shimmer) — pure CSS, no JS, works in any browser, README or site, and respects `prefers-reduced-motion`.

```ts
import { animateLogo } from "@lacspace/logo";

const svg = animateLogo({ name: "Orbit Labs", keywords: "ai, network" }, { loop: true });
// drop `svg` straight into a page or save as .svg — it animates itself
```

> **v1.2.0** also grows the brain to **79 icons** (insurance, dental, eyewear, audio, construction, HR, jewelry, marine, energy…).

## The five engines

| Engine | What you get |
| --- | --- |
| `monogram` | Initials on a gradient badge (circle · squircle · hexagon · shield · seal) |
| `wordmark` | A keyword-matched **icon** locked up with the name |
| `abstract` | A seeded **geometric mark** — orbit/network, venn, arcs, burst, waves, dot-grid |
| `emblem` | A seal/ring with an icon and the name **curved along the bottom** |
| `lettermark` | One big display letter filled with the brand gradient |

Let the brief pick the engine, or force one: `generateLogo({ name, engine: "emblem" })`.

## Everything is overridable

```ts
generateLogo({
  name: "Aurelia",
  keywords: "luxury, beauty",
  palette: "royal-gold",   // force a palette id
  font: "playfair-luxe",   // force a type pairing
  icon: "crown",           // force an icon
  shape: "seal",           // circle | rounded | squircle | hexagon | shield | seal | diamond | blob | none
  layout: "emblem",        // icon-left | icon-top | stacked | wordmark-only | emblem | mark-only
  engine: "emblem",
  background: "surface",   // transparent | solid | surface | gradient
  size: 512,
  seed: 7,                  // deterministic variation
});
```

## Export to raster (PNG / JPEG / WebP) with a size budget

Logos are SVG — universal and editable. To rasterize, pair with `@lacspace/image`:

```ts
import { generateLogo } from "@lacspace/logo";
import { rasterizeSvg, fit } from "@lacspace/image";

const { svg } = generateLogo({ name: "Orbit Labs", keywords: "ai, network" });
const surface = await rasterizeSvg(svg, { width: 512, height: 512 });     // browser Canvas / optional sharp in Node
const png = await fit(surface, { format: "png", maxSize: "40kb" });
```

> **SVG renders everywhere.** Rasterizing text logos in **Node** needs the optional `sharp` peer (`npm i sharp`); in the **browser** it uses the native Canvas with no extra deps. The geometric/icon marks rasterize anywhere.

## The JSON brain (extensible)

The creativity lives in data you can extend: `palettes` (mood-tagged), `fonts` (curated Google pairings), `icons` (keyword-tagged line glyphs), `moods` (style presets), plus a color/vibe keyword interpreter. They're exported for building your own UI:

```ts
import { PALETTES, FONTS, ICONS, MOODS } from "@lacspace/logo";
```

## API

- `generateLogo(brief)` → `{ svg, width, height, engine, palette, font, icon, shape, layout, mood, seed, interpreted }`
- `generateLogoSet(brief, count = 12)` → `LogoResult[]`
- `suggest(brief)` → the interpretation only (no render)
- `tokenize(brief)`, `initials(name)`, and the `PALETTES` / `FONTS` / `ICONS` / `MOODS` data

## Contributing 💙

This generator gets smarter the more curated data it has — and **the JSON brain is the easiest place to help.** Adding a palette, an icon (with keyword tags) or a font pairing is a small, high-impact PR:

- Palettes → `logo/src/data/palettes.json`
- Icons (24-grid line SVG + `keywords`) → `logo/src/data/icons.json`
- Fonts, moods, keyword mappings → the other files in `logo/src/data/`

See [CONTRIBUTING.md](https://github.com/lacspace/npm-packages/blob/main/CONTRIBUTING.md). New contributors welcome — open an issue or PR.

## License

[Lacspace Free Licence v1.0](https://github.com/lacspace/npm-packages/blob/main/LICENSE) — free, permissive, Lacspace-branded.

<div align="center"><sub>Part of the <a href="https://developer.lacspace.com/packages">Lacspace</a> ecosystem · zero-dependency · isomorphic · fully typed</sub></div>
