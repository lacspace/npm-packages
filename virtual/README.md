# @lacspace/virtual

**Headless list virtualization for React — render 100k rows smoothly.** Only the items in view are mounted, with fixed or dynamically-measured sizes, overscan, gaps, horizontal lists, and scroll-to-index. `useVirtualizer` in ~2KB. Zero runtime dependencies, SSR-safe, fully typed.

You own the markup; the hook owns the math. No components, no styling, no opinions — just geometry.

## Install

```sh
npm install @lacspace/virtual
```

React `>=18` is a peer dependency.

## Usage

A complete vertical list. A scroll container holds an inner spacer sized to the
full list; each visible row is absolutely positioned via `translateY(item.start)`.
Adding `data-index` + `ref={measureElement}` opts each row into dynamic
height measurement (drop them for fixed heights).

```tsx
import { useRef } from "react";
import { useVirtualizer } from "@lacspace/virtual";

function BigList({ rows }: { rows: string[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 44, // best guess before measuring
    overscan: 8,
  });

  return (
    <div ref={parentRef} style={{ height: 480, overflow: "auto" }}>
      {/* inner spacer: full scrollable size */}
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${item.start}px)`,
            }}
          >
            {rows[item.index]}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Fixed sizes

If every row is the same known height, drop `data-index` and `measureElement`
and return that height from `estimateSize` — the layout is exact with zero
measurement work.

### Horizontal lists

Pass `horizontal: true` and swap the axis in your styles (`width` from
`getTotalSize()`, `transform: translateX(${item.start}px)`).

### Scroll to an item

```tsx
virtualizer.scrollToIndex(5000, { align: "center", behavior: "smooth" });
virtualizer.scrollToOffset(0, { behavior: "smooth" }); // back to top
```

### Window / document scrolling

When the whole page scrolls and the list starts partway down, point
`getScrollElement` at the scrolling element and set `scrollMargin` to the list's
distance from the top of the scrollable content.

## API

### `useVirtualizer(options): Virtualizer`

#### `VirtualizerOptions`

| Option             | Type                                   | Default | Description                                                        |
| ------------------ | -------------------------------------- | ------- | ------------------------------------------------------------------ |
| `count`            | `number`                               | —       | Total number of items.                                             |
| `getScrollElement` | `() => HTMLElement \| null`            | —       | Returns the scroll container (re-resolved each render).            |
| `estimateSize`     | `(index: number) => number`            | —       | Estimated (or fixed) size in px along the scroll axis.             |
| `overscan`         | `number`                               | `5`     | Extra items rendered on each side of the viewport.                 |
| `horizontal`       | `boolean`                              | `false` | Lay out along the x-axis (`left`/`width`, `scrollLeft`).           |
| `gap`              | `number`                               | `0`     | Gap in px between items.                                           |
| `getItemKey`       | `(index: number) => number \| string`  | index   | Stable key per item.                                               |
| `paddingStart`     | `number`                               | `0`     | Leading padding before the first item (counts toward total size).  |
| `scrollMargin`     | `number`                               | `0`     | Offset from scroll-content start to the list start.                |

#### `Virtualizer`

| Member             | Type                                                                                          | Description                                                          |
| ------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `getVirtualItems()`| `() => VirtualItem[]`                                                                         | Items currently in view, plus overscan.                             |
| `getTotalSize()`   | `() => number`                                                                                | Full list size (px) for the inner spacer.                           |
| `scrollToIndex()`  | `(index, { align?: "start"\|"center"\|"end"\|"auto"; behavior? }) => void`                    | Scroll an item into view.                                           |
| `scrollToOffset()` | `(offset, { behavior? }) => void`                                                             | Scroll to an absolute px offset.                                    |
| `measureElement()` | `(el: HTMLElement \| null) => void`                                                          | Ref callback for dynamic sizing (needs `data-index` on the node).   |
| `range`            | `{ startIndex: number; endIndex: number } \| null`                                            | The rendered index range (incl. overscan).                         |
| `options`          | `VirtualizerOptions`                                                                          | The options passed in.                                              |

#### `VirtualItem`

```ts
interface VirtualItem {
  index: number; // position in the source list
  start: number; // leading edge offset (px), relative to the inner container
  size: number;  // measured or estimated size (px)
  end: number;   // start + size
  key: number | string;
}
```

## Why it's tiny

- **No components, no CSS.** It returns numbers; you render whatever you like.
- **Zero dependencies.** Pure React hooks and the platform (`ResizeObserver`,
  `getBoundingClientRect`, `scrollTo`).
- **Cheap math.** A cumulative-offset table is built once per data change and the
  visible window is found with a binary search — item lookups don't scan the list.
- **SSR-safe.** No DOM access during render; measurement happens only in effects.
  On the server you get an estimated layout, so markup matches on hydration.
- **No render loops.** State updates only fire when a value actually changes, and
  measured sizes are cached, so re-measuring a stable row is a no-op.

## Licensing

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/virtual` is part of **63 zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/virtual
- 🗂️ **All 63 packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

