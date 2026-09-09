<div align="center">

# @lacspace/brand

**The official Lacspace mark, colours and animations — for everyone to use.**

[![npm version](https://img.shields.io/npm/v/@lacspace/brand?color=%230BB9D9&label=npm)](https://www.npmjs.com/package/@lacspace/brand)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/brand?label=minzip)](https://bundlephobia.com/package/@lacspace/brand)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/brand)
[![brand licence](https://img.shields.io/badge/licence-Brand%20Usage-7C3AED)](https://lacspace.com/brand)

</div>

> Render the Lacspace logo — and its **signature self-crafting animation** — anywhere, with **zero dependencies**. Make Lacspace **installable** as a favicon / PWA app-icon in one call. Reach the pixel-exact master artwork, **Lottie** motion and the full favicon set bundled inside. This is Lacspace's *actual* identity, shared openly so you can represent and integrate with Lacspace correctly.

**Free to reference Lacspace — don't alter the mark or imply endorsement.** See the [Brand Usage Licence](https://lacspace.com/brand).

## Install

```bash
npm i @lacspace/brand
```

## The mark, self-contained

```ts
import { mark } from "@lacspace/brand";

el.innerHTML = mark({ size: 256 });                    // full-colour neural mark
mark({ variant: "white" });                            // for dark grounds
mark({ variant: "black", style: "line", network: false });
mark({ background: "ink", rounded: true });            // an app-icon tile
```

No fonts, no external refs, no JS — a complete `<svg>` string that renders identically everywhere.

## The signature animation ✨

The mark that **builds itself** — the one on [developer.lacspace.com](https://developer.lacspace.com): the neural network grows node-by-node, the wires fire signal pulses, then the logo blooms in and breathes. Pure CSS, zero JS, `prefers-reduced-motion` aware.

```ts
import { craftMark, pulseMark, floatMark, revealMark, shimmerMark } from "@lacspace/brand";

el.innerHTML = craftMark({ size: 320 });          // the hero self-crafting reveal
el.innerHTML = pulseMark({ loop: true });         // calm breathing loop (splash/loader)
```

Drop the returned string straight into a page, a README, an email, or save it as an `.svg`.

## Make Lacspace installable

```ts
import { installable } from "@lacspace/brand";

const { svg, headLinks, manifest, dataUri } = installable({ base: "/brand/", name: "Lacspace" });
// headLinks → <link rel="icon"…> + apple-touch + manifest + theme-color
// manifest  → a ready web app manifest (PWA app-icon)
// dataUri   → an inline SVG favicon with nothing to host
```

## Colours & tokens

```ts
import { COLORS, HEX, brandCss, brandScss } from "@lacspace/brand";

brandCss();   // :root { --brand-lacspace-orange: #F97316; … --brand-gradient: … }
HEX.cyan;     // "#0BB9D9"  (the mark accent)
```

| | Role | HEX |
|---|---|---|
| Lacspace Orange | primary | `#F97316` |
| Lacspace Violet | accent | `#7C3AED` |
| Lacspace Blue | dark-accent | `#3B82F6` |
| Lacspace Cyan | mark | `#0BB9D9` |
| Ink | surface-dark | `#0A101C` |
| Off-White | surface-light | `#FAFAFA` |

## React

```tsx
import { LacspaceMark } from "@lacspace/brand/react";

<LacspaceMark animation="craft" size={320} />
<LacspaceMark variant="white" />
```

## Pixel-exact assets (SVG · Lottie · favicon)

For the master traced artwork, Lottie motion and raster icons, import the bundled files:

```ts
import markUrl from "@lacspace/brand/assets/svg/mark.svg";
import pulseLottie from "@lacspace/brand/assets/lottie/pulse.json";
```

`import { ASSETS } from "@lacspace/brand"` lists every bundled file. Full raster/video/wallpaper kit lives at [lacspace.com/brand](https://lacspace.com/brand).

## Using it right

- **Mark first** — white on dark, black/ink on light; the gradient mark wants an ink or off-white ground.
- **Clear space** = half the mark's height on every side. **Min size** 48px favicon / 96px UI / 200px print.
- **Wordmark** = one word, capital L: `Lacspace`.
- **Don't** recolour the gradient, add effects, distort, box the mark, or imply endorsement — use the provided variants.

`import { GUIDELINES } from "@lacspace/brand"` exposes these as data.

## Licence

[Lacspace Brand Usage Licence v1.0](https://lacspace.com/brand) — free to use to reference and integrate with Lacspace; the marks may not be altered or used to imply endorsement. This package contains Lacspace's actual brand identity, not public-domain art.

<div align="center"><sub>Part of the <a href="https://developer.lacspace.com/packages">Lacspace</a> ecosystem · zero-dependency · isomorphic · fully typed</sub></div>
