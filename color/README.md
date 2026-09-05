<div align="center">

# @lacspace/color

**Parse, convert, manipulate and check colours — hex/rgb/hsl, lighten/darken/mix, and WCAG contrast.**

[![npm version](https://img.shields.io/npm/v/@lacspace/color?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/color)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/color?label=minzip)](https://bundlephobia.com/package/@lacspace/color)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/color)
[![license](https://img.shields.io/npm/l/@lacspace/color?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> The small colour toolkit every app rebuilds — convert between formats, tweak lightness/saturation, mix, and (crucially) check **WCAG contrast** so your UI is actually readable. Tiny and dependency-free.

- 🎨 Parse `#hex` / `#rgba` / `rgb()` / `rgba()` / `hsl()` / `hsla()` → RGBA
- 🔁 `toHex` / `toRgb` / `toHsl` conversions
- ✨ `lighten` / `darken` / `saturate` / `desaturate` / `rotate` / `mix` / `alpha` / `grayscale`
- ♿ `contrast`, `isReadable` (AA/AAA), `readableTextColor`, `luminance`, `isDark`

## Install

```bash
npm install @lacspace/color      # or pnpm add / yarn add / bun add
```

## Convert & manipulate

```ts
import { toHsl, lighten, mix, alpha } from "@lacspace/color";

toHsl("#ff0000");            // "hsl(0, 100%, 50%)"
lighten("#2563eb", 15);      // a lighter blue
mix("#000000", "#ffffff");   // "#808080"
alpha("#2563eb", 0.2);       // "rgba(37, 99, 235, 0.2)"
```

## Accessible by default

```ts
import { contrast, isReadable, readableTextColor } from "@lacspace/color";

contrast("#000", "#fff");                  // 21
isReadable("#767676", "#ffffff", "AA");    // true  (meets 4.5:1)
readableTextColor("#2563eb");              // "#ffffff"  ← pick text colour for a background
```

## API

| Group | Functions |
| --- | --- |
| Parse / format | `parse`, `toHex`, `toRgb`, `toHsl`, `toHslObject`, `hslToRgb` |
| Manipulate | `lighten`, `darken`, `saturate`, `desaturate`, `rotate`, `mix`, `alpha`, `grayscale` |
| Accessibility | `luminance`, `contrast`, `isReadable`, `readableTextColor`, `isDark` |

Every function accepts a colour string or an `RGBA` object.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/color` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/color
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

