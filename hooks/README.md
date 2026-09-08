<div align="center">

# @lacspace/hooks

**Essential, SSR-safe React hooks — everything you reach for, in one zero-dependency package.**

[![npm version](https://img.shields.io/npm/v/@lacspace/hooks?color=%2338bdf8&label=npm)](https://www.npmjs.com/package/@lacspace/hooks)
[![install size](https://packagephobia.com/badge?p=@lacspace/hooks)](https://packagephobia.com/result?p=@lacspace/hooks)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/hooks?label=minzip)](https://bundlephobia.com/package/@lacspace/hooks)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/hooks)
[![license](https://img.shields.io/npm/l/@lacspace/hooks?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Instead of installing a handful of single-purpose hook libraries, get **36 SSR-safe, fully-typed React hooks** — storage, debounce/throttle, media queries, click-outside, clipboard, pagination, steppers, undo/redo and more — in one tree-shakeable package.

- 💾 `useLocalStorage` / `useSessionStorage` — JSON state, cross-tab sync, SSR-safe
- ⏱️ `useDebounce` / `useDebouncedCallback` / `useThrottle` / `useInterval` / `useTimeout`
- 🖱️ `useOnClickOutside` / `useHover` / `useEventListener` / `useIntersectionObserver`
- 📐 `useMediaQuery` / `useBreakpoint` / `usePrefersDark` / `useWindowSize` / `useScrollPosition`
- 📄 `usePagination` / `useStep` / `useHistory` (undo/redo) / `useList`
- 🧰 `useToggle` / `useCounter` / `useDisclosure` / `useCopyToClipboard` / `useIdle` + more
- ⚡ Zero deps · 🌍 SSR-safe · 📦 ESM + CJS · fully typed · tree-shakeable

> **New in 1.1.0** — `usePagination` (clamped state + ellipsis page range), `useStep` (wizard/stepper), `useHistory` (undo/redo), `useList` (immutable array state), `useBreakpoint` / `usePrefersDark` / `usePrefersReducedMotion`, plus pure, DOM-free helpers (`getPaginationState`, `getPaginationRange`, `buildMediaQuery`, list/history/step utilities) you can use without React. All additive and fully backward-compatible.

## Install

```sh
npm i @lacspace/hooks
```

`react` (`>=18`) is a **peer dependency** — you already have it in your app.

## Usage

Persist state to `localStorage` (SSR-safe, syncs across tabs):

```tsx
import { useLocalStorage } from "@lacspace/hooks";

function ThemeToggle() {
  const [theme, setTheme] = useLocalStorage("theme", "light");
  return (
    <button onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}>
      {theme}
    </button>
  );
}
```

Debounce a search box:

```tsx
import { useState } from "react";
import { useDebounce } from "@lacspace/hooks";

function Search() {
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  // ...run the query effect on `debounced`
  return <input value={query} onChange={(e) => setQuery(e.target.value)} />;
}
```

Close a menu when clicking outside:

```tsx
import { useRef } from "react";
import { useOnClickOutside } from "@lacspace/hooks";

function Menu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, onClose);
  return <div ref={ref}>…</div>;
}
```

React to a media query and copy to the clipboard:

```tsx
import { useMediaQuery, useCopyToClipboard } from "@lacspace/hooks";

function Share({ url }: { url: string }) {
  const isDark = useMediaQuery("(prefers-color-scheme: dark)");
  const [copied, copy] = useCopyToClipboard();
  return (
    <button data-dark={isDark} onClick={() => copy(url)}>
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
```

## All hooks

| Hook | What it does |
| --- | --- |
| `useIsomorphicLayoutEffect` | `useLayoutEffect` on the client, `useEffect` on the server |
| `useIsMounted` | Stable getter for whether the component is still mounted |
| `useMountEffect` | Runs an effect once, on mount |
| `useUpdateEffect` | Like `useEffect` but skips the first run |
| `usePrevious` | The value from the previous render |
| `useLocalStorage` | JSON `localStorage` state — SSR-safe, cross-tab sync, `remove()` |
| `useSessionStorage` | Same contract, backed by `sessionStorage` |
| `useDebounce` | Debounced copy of a value |
| `useDebouncedCallback` | Debounced callback with `.cancel()` |
| `useThrottle` | Throttled copy of a value |
| `useToggle` | Boolean state with `toggle/on/off/set` |
| `useCounter` | Numeric state with `inc/dec/set/reset` |
| `useDisclosure` | Open/close state for modals, drawers, menus |
| `useInterval` | `setInterval` with a latest-callback ref; pause with `null` |
| `useTimeout` | `setTimeout` with a latest-callback ref; cancel with `null` |
| `useMediaQuery` | Tracks a CSS media query (SSR-safe) |
| `useWindowSize` | Current viewport `{ width, height }` (SSR-safe) |
| `useScrollPosition` | Current window scroll `{ x, y }` (SSR-safe) |
| `useEventListener` | Typed listener for `window`, `document`, or a ref/element |
| `useOnClickOutside` | Fires when a pointer event lands outside a ref |
| `useHover` | `[ref, hovered]` hover tracking |
| `useIntersectionObserver` | `[ref, isIntersecting, entry]` viewport observing |
| `useKeyPress` | `true` while a given key is held |
| `useCopyToClipboard` | `[copied, copy]` with a safe `execCommand` fallback |
| `useDocumentTitle` | Sets `document.title` while mounted |
| `useOnlineStatus` | Tracks online/offline (SSR-safe, `true` on server) |
| `useIdle` | `true` after N ms of no user activity |
| `useLockBodyScroll` | Locks body scroll while active, restores on cleanup |
| `usePagination` | Clamped pagination state + navigation + ellipsis page `range` |
| `useStep` | Stepper/wizard state — `next/prev/go`, `progress`, `isFirst/isLast` |
| `useHistory` | State with built-in undo/redo (`canUndo/canRedo`, `limit`) |
| `useList` | Immutable array state — `push/insertAt/updateAt/removeAt/move/filter` |
| `useBreakpoint` | `true` when the viewport is at/above (and optionally below) a width |
| `usePrefersDark` | `true` when the user prefers a dark color scheme |
| `usePrefersReducedMotion` | `true` when the user requests reduced motion |

### Pure helpers (no React)

Framework-agnostic building blocks — importable and testable without React:

| Helper | What it does |
| --- | --- |
| `getPaginationState({ totalItems, page, pageSize })` | Fully-derived, clamped pagination snapshot |
| `getPaginationRange(page, pageCount, opts?)` | Compact page range with `"…"` gaps |
| `clampStep` / `moveStep` / `stepProgress` | Stepper math |
| `createHistory` / `pushHistory` / `undoHistory` / `redoHistory` / `resetHistory` / `canUndo` / `canRedo` | Undo/redo buffer |
| `listInsert` / `listRemoveAt` / `listUpdateAt` / `listMove` | Immutable array operations |
| `buildMediaQuery` / `minWidthQuery` / `maxWidthQuery` / `betweenWidthQuery` | CSS media-query string builders |
| `clamp` | Bound a number into a range |

```tsx
import { usePagination, useStep, useHistory, useList } from "@lacspace/hooks";

// Paginate a list with a ready-to-render page range.
const p = usePagination({ totalItems: 240, pageSize: 20 });
// p.page, p.pageCount, p.range → [1, "…", 5, 6, 7, "…", 12], p.next(), p.setPage(5)

// Drive a multi-step wizard.
const s = useStep(4);
// s.step, s.next(), s.progress, s.isLast

// Undo/redo any state.
const [value, { set, undo, redo, canUndo }] = useHistory("");

// Immutable array state with ergonomic mutators.
const [items, { push, removeAt, move }] = useList<string>([]);
```

## Why it's tiny

- **Zero runtime dependencies** — nothing but React, which you already ship.
- **Tree-shakeable** — `sideEffects: false` and per-hook exports; bundle only what you import.
- **Isomorphic / SSR-safe** — no `window`, `document`, or storage access at module load or during render; safe under Next.js, Remix, and any server renderer.
- **Fully typed** — strict TypeScript with complete `.d.ts` for ESM and CJS.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/hooks` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/hooks
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

