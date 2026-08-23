# @lacspace/hooks

**Essential, SSR-safe React hooks — everything you reach for, zero dependencies.**

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

## Why it's tiny

- **Zero runtime dependencies** — nothing but React, which you already ship.
- **Tree-shakeable** — `sideEffects: false` and per-hook exports; bundle only what you import.
- **Isomorphic / SSR-safe** — no `window`, `document`, or storage access at module load or during render; safe under Next.js, Remix, and any server renderer.
- **Fully typed** — strict TypeScript with complete `.d.ts` for ESM and CJS.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — MIT-equivalent freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

---

**Part of the Lacspace ecosystem — zero-dependency, isomorphic TypeScript packages.**

[All packages ↗](https://lacspace.com/packages) · [npm org ↗](https://www.npmjs.com/org/lacspace) · [Licence Centre ↗](https://lacspace.com/licenses) · [GitHub ↗](https://github.com/lacspace/npm-packages)

<div align="center"><sub>Built with care by <a href="https://lacspace.com">Lacspace</a> · Lacspace Free Licence · <a href="https://github.com/lacspace/npm-packages">source</a></sub></div>
