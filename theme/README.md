<div align="center">

# @lacspace/theme

**SSR-safe dark / light / system theming for React in ~1 KB — `next-themes`, distilled.**

[![npm version](https://img.shields.io/npm/v/@lacspace/theme?color=%2338bdf8&label=npm)](https://www.npmjs.com/package/@lacspace/theme)
[![install size](https://packagephobia.com/badge?p=@lacspace/theme)](https://packagephobia.com/result?p=@lacspace/theme)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/theme?label=minzip)](https://bundlephobia.com/package/@lacspace/theme)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/theme)
[![license](https://img.shields.io/npm/l/@lacspace/theme?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> A tiny `ThemeProvider`, a `useTheme` hook, and a no-flash inline script — persists to storage, follows the OS, and toggles a class or a `data-*` attribute on `<html>`. Ships `"use client"`; zero dependencies, framework-agnostic, fully typed.

- **No flash of the wrong theme** — a self-contained script paints the theme before hydration.
- **SSR-safe** — never touches `window`/`document`/`localStorage` during render; the server markup is untouched.
- **Follows the OS** — `"system"` resolves live from `prefers-color-scheme` and updates when the OS changes.
- **Class or data-attribute** — `<html class="dark">` or `<html data-theme="dark">`, your call.
- **Zero dependencies** — one React peer dep, nothing else.

> **New in 1.1.0** — a **pure, framework-agnostic core** you can use anywhere (server, Vue, vanilla, tests): theme resolution (`resolveTheme`, `toggleTheme`, `cycleTheme`), **CSS-variable + stylesheet generation** from design tokens (`cssVariables`, `generateThemeCss`), **WCAG contrast helpers** (`contrastRatio`, `meetsContrast`, `bestContrastColor`), `prefers-color-scheme` query/selector builders, colour math (`mixHex`/`lighten`/`darken`), and a small **`createThemeController`** with **injectable** storage. All additive — every existing export is unchanged.

## Install

```bash
npm i @lacspace/theme
```

React 18+ is a peer dependency.

## Usage

### 1. Wrap your app

```tsx
import { ThemeProvider } from "@lacspace/theme";

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

### 2. A theme toggle with `useTheme`

```tsx
import { useTheme } from "@lacspace/theme";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <div>
      <button onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
        {resolvedTheme === "dark" ? "🌙 Dark" : "☀️ Light"}
      </button>
      <button onClick={() => setTheme("system")} aria-pressed={theme === "system"}>
        🖥️ System
      </button>
    </div>
  );
}
```

### 3. No flash of the wrong theme — built in

`<ThemeProvider>` renders a tiny inline no-flash script for you (because it's server-rendered to HTML, the script lands in the initial markup and runs **before** the browser paints). So the example in step 1 already has zero flicker — nothing else to wire up. Just add `suppressHydrationWarning` to your `<html>`:

```tsx
// Next.js App Router — app/layout.tsx
import { ThemeProvider } from "@lacspace/theme";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="system">{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

Prefer to inject the script yourself (e.g. a non-React app, or the document `<head>`)? Set `enableNoFlashScript={false}` on the provider and use `getThemeScript()` — a self-contained string — from a client component or plain HTML. Pass it the **same** options you give the provider:

```html
<head>
  <script>
    /* output of getThemeScript({ storageKey: "theme" }) */
  </script>
</head>
```

> **For _guaranteed_ zero flash, put `getThemeScript()` in the document `<head>`.**
> The provider's built-in script runs wherever `<ThemeProvider>` sits in the tree
> (typically inside `<body>`), which is early enough to avoid a flash in most apps.
> But the only way to _guarantee_ the theme is painted before the browser renders
> any content is to run the script as the **first thing in `<head>`, before any
> body markup** — so on frameworks that let you inject into `<head>` (e.g. Next.js
> `app/layout.tsx`'s own `<head>`, or a plain HTML shell), prefer setting
> `enableNoFlashScript={false}` on the provider and placing `getThemeScript(...)`
> in `<head>` with the **same options** you pass the provider.

### 4. Using a `data-*` attribute instead of a class

The built-in no-flash script follows the provider's options automatically — just set `attribute`:

```tsx
import { ThemeProvider } from "@lacspace/theme";

<ThemeProvider attribute="data-theme" storageKey="app-theme">
  {children}
</ThemeProvider>;
// → <html data-theme="dark"> before paint, no flicker
```

Then style against the attribute:

```css
:root { --bg: #ffffff; }
[data-theme="dark"] { --bg: #0b0b0c; }
```

## API

### `<ThemeProvider>`

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | — | Your app tree. |
| `defaultTheme` | `string` | `"system"` | Theme used until storage is read (and on the server). |
| `storageKey` | `string` | `"theme"` | `localStorage` key for persistence. |
| `themes` | `string[]` | `["light", "dark"]` | Selectable themes; their class names are cleared before applying. |
| `attribute` | `"class" \| \`data-${string}\`` | `"class"` | Toggle a class or set a data attribute on `<html>`. |
| `enableSystem` | `boolean` | `true` | Let `"system"` follow `prefers-color-scheme`. |
| `disableTransitionOnChange` | `boolean` | `false` | Suppress CSS transitions during the switch. |
| `nonce` | `string` | — | CSP nonce for the transient transition-blocking style. |

### `useTheme(): UseThemeReturn`

Throws if used outside a `ThemeProvider`.

| Field | Type | Description |
| --- | --- | --- |
| `theme` | `string` | Current setting (`"light"`, `"dark"`, `"system"`, …). |
| `setTheme` | `(t: string) => void` | Set and persist the theme. |
| `resolvedTheme` | `string` | Theme actually applied — `"system"` resolved to `light`/`dark`. |
| `systemTheme` | `"light" \| "dark" \| undefined` | OS scheme once known on the client. |
| `themes` | `string[]` | Configured theme list. |

### `getThemeScript(options?): string`

Returns a self-contained, `try/catch`-wrapped IIFE string (no external references) that applies the stored/OS theme to `<html>` before paint. Options mirror the provider: `storageKey`, `defaultTheme`, `attribute`, `themes`, `enableSystem`. **Always pass the same options you give `<ThemeProvider>`** so the pre-hydration paint matches React.

## Framework-agnostic core (new in 1.1.0)

Everything below is pure logic — **no React, no DOM, no `localStorage`**. Use it on the server, in a Vue/Svelte/vanilla app, or in tests. The React `ThemeProvider`/`useTheme` are thin wrappers over these same functions.

```ts
import {
  resolveTheme,
  generateThemeCss,
  contrastRatio,
  bestContrastColor,
  createThemeController,
  createMemoryStorage,
} from "@lacspace/theme";

// Resolve "system" against the OS scheme.
resolveTheme("system", { systemTheme: "dark" }); // "dark"

// Generate a theme stylesheet from design tokens.
generateThemeCss(
  { light: { bg: "#ffffff", fg: "#0b0b0c" }, dark: { bg: "#0b0b0c", fg: "#ffffff" } },
  { defaultTheme: "light", attribute: "data-theme" },
);
// :root { --bg: #ffffff; --fg: #0b0b0c; }
// [data-theme="dark"] { --bg: #0b0b0c; --fg: #ffffff; }

// WCAG contrast checks.
contrastRatio("#000000", "#ffffff"); // 21
bestContrastColor("#4d9fff");        // "#000000" — the readable text colour

// A portable controller with injectable storage (great for SSR/tests).
const theme = createThemeController({ storage: createMemoryStorage() });
theme.subscribe((s) => document.documentElement.setAttribute("data-theme", s.resolvedTheme));
theme.setTheme("dark");
theme.toggle();
```

### Core API

| Export | Signature | Purpose |
| --- | --- | --- |
| `resolveTheme` | `(theme, opts?) => string` | Resolve `"system"` to a concrete theme. |
| `toggleTheme` | `(resolved) => string` | Flip `light`↔`dark` (custom themes unchanged). |
| `cycleTheme` | `(current, themes) => string` | Next theme in the list, wrapping. |
| `isValidTheme` | `(theme, themes) => boolean` | Membership check. |
| `systemThemeFromMatches` | `(matches) => "light" \| "dark"` | Map a `matchMedia` result to a scheme. |
| `prefersColorSchemeQuery` | `(scheme?) => string` | Build `(prefers-color-scheme: …)`. |
| `themeSelector` | `(theme, attribute?) => string` | `.dark` or `[data-theme="dark"]`. |
| `cssVariables` | `(tokens, opts?) => Record<string,string>` | Token map → `--var` map. |
| `renderCssVariables` | `(tokens, opts?) => string` | Token map → declaration lines. |
| `generateThemeCss` | `(themes, opts?) => string` | Full multi-theme stylesheet. |
| `parseHex` / `rgbToHex` | `(hex) => Rgb \| null` / `(rgb) => string` | Hex ↔ RGB. |
| `relativeLuminance` | `(color) => number` | WCAG relative luminance. |
| `contrastRatio` | `(a, b) => number` | WCAG contrast ratio (1–21). |
| `meetsContrast` | `(fg, bg, opts?) => boolean` | AA/AAA pass check. |
| `bestContrastColor` | `(bg, opts?) => string` | Readable text colour for a surface. |
| `mixHex` / `lighten` / `darken` | `(hex, …) => string` | Colour math. |
| `createMemoryStorage` | `(seed?) => ThemeStorage` | In-memory storage shim. |
| `readStoredTheme` / `writeStoredTheme` | `(storage, key, …) => …` | Never-throw persistence codec. |
| `createThemeController` | `(opts?) => ThemeController` | Resolve + persist + subscribe, storage injected. |

## Why it's tiny

- **No dependencies.** Just React, which you already have.
- **No CSS import, no context gymnastics.** One provider, one hook, one string.
- **Isomorphic by construction.** Rendering never reads the DOM or storage; everything DOM-related lives in effects and the inline script.
- **Tree-shakeable.** `sideEffects: false`, ESM + CJS, and full `.d.ts` types.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/theme` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/theme
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

