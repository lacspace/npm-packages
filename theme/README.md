# @lacspace/theme

**SSR-safe dark / light / system theming for React in ~1 KB.** A tiny `ThemeProvider`, a `useTheme` hook, and a no-flash inline script — persists to storage, follows the OS, and toggles a class or a `data-*` attribute. Zero dependencies, framework-agnostic, fully typed. Think `next-themes`, distilled.

- **No flash of the wrong theme** — a self-contained script paints the theme before hydration.
- **SSR-safe** — never touches `window`/`document`/`localStorage` during render; the server markup is untouched.
- **Follows the OS** — `"system"` resolves live from `prefers-color-scheme` and updates when the OS changes.
- **Class or data-attribute** — `<html class="dark">` or `<html data-theme="dark">`, your call.
- **Zero dependencies** — one React peer dep, nothing else.

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

## Why it's tiny

- **No dependencies.** Just React, which you already have.
- **No CSS import, no context gymnastics.** One provider, one hook, one string.
- **Isomorphic by construction.** Rendering never reads the DOM or storage; everything DOM-related lives in effects and the inline script.
- **Tree-shakeable.** `sideEffects: false`, ESM + CJS, and full `.d.ts` types.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
