/**
 * @lacspace/virtual — headless list virtualization for React.
 *
 * Render only the rows that are actually in view, out of a list of any size
 * (100k+ rows stay smooth). Supports fixed or dynamically-measured item sizes,
 * configurable overscan, horizontal lists, gaps, padding, and scroll-to-index.
 *
 * Zero runtime dependencies. SSR-safe (no DOM access during render; measurement
 * happens only inside effects). Fully typed.
 *
 * @packageDocumentation
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * A single virtualized item with its computed geometry.
 *
 * `start`/`end` are offsets (in pixels) along the scroll axis, relative to the
 * top (or left, when {@link VirtualizerOptions.horizontal | horizontal}) of the
 * inner sizing container — i.e. they do **not** include
 * {@link VirtualizerOptions.scrollMargin | scrollMargin}. Position a row with
 * `transform: translateY(${item.start}px)` (or `translateX` when horizontal).
 */
export interface VirtualItem {
  /** Index of this item in the source list. */
  index: number;
  /** Offset of the item's leading edge (px), relative to the inner container. */
  start: number;
  /** Measured or estimated size of the item (px) along the scroll axis. */
  size: number;
  /** Offset of the item's trailing edge (px) — equal to `start + size`. */
  end: number;
  /** Stable React key for the item (from `getItemKey`, defaults to `index`). */
  key: number | string;
}

/**
 * Options for {@link useVirtualizer}.
 */
export interface VirtualizerOptions {
  /** Total number of items in the list. */
  count: number;
  /**
   * Returns the scrollable element that clips the list, or `null` if it is not
   * mounted yet. Typically `() => scrollRef.current`. Re-resolved on every
   * render, so a late-mounting element is picked up automatically.
   */
  getScrollElement: () => HTMLElement | null;
  /**
   * Estimated size (px) for the item at `index` along the scroll axis. Used
   * before an item has been measured (and always, when sizes are fixed).
   */
  estimateSize: (index: number) => number;
  /**
   * Number of extra items to render on each side of the visible window, to
   * avoid blank frames while scrolling.
   * @defaultValue 5
   */
  overscan?: number;
  /**
   * Lay the list out horizontally (uses `left`/`width` and `scrollLeft`)
   * instead of vertically.
   * @defaultValue false
   */
  horizontal?: boolean;
  /**
   * Gap (px) inserted between adjacent items.
   * @defaultValue 0
   */
  gap?: number;
  /** Returns a stable key for the item at `index`. Defaults to the index. */
  getItemKey?: (index: number) => number | string;
  /**
   * Leading padding (px) before the first item, included in the total size.
   * @defaultValue 0
   */
  paddingStart?: number;
  /**
   * Offset (px) between the scroll container's content start and the list's
   * start — useful when the whole document/window scrolls and the list begins
   * partway down the page. Subtracted from the scroll offset when computing the
   * visible range.
   * @defaultValue 0
   */
  scrollMargin?: number;
}

/**
 * The virtualizer instance returned by {@link useVirtualizer}.
 */
export interface Virtualizer {
  /** The items currently in view (plus overscan), with computed geometry. */
  getVirtualItems: () => VirtualItem[];
  /** Total size (px) of the full list — use as the inner container's height/width. */
  getTotalSize: () => number;
  /** Programmatically scroll so the item at `index` becomes visible. */
  scrollToIndex: (
    index: number,
    options?: { align?: "start" | "center" | "end" | "auto"; behavior?: ScrollBehavior },
  ) => void;
  /** Programmatically scroll to an absolute pixel offset. */
  scrollToOffset: (offset: number, options?: { behavior?: ScrollBehavior }) => void;
  /**
   * Ref callback for dynamic sizing: attach to each row (`ref={measureElement}`)
   * together with a `data-index` attribute. Measures the element and, if its
   * size changed, updates the layout.
   */
  measureElement: (el: HTMLElement | null) => void;
  /** The rendered index range (including overscan), or `null` when empty. */
  range: { startIndex: number; endIndex: number } | null;
  /** The options this virtualizer was created with. */
  options: VirtualizerOptions;
}

/** Run a layout effect on the client, a plain effect on the server. */
const useIsomorphicLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Build the full geometry table for the list. O(count), memoized by the caller.
 */
function buildMeasurements(
  count: number,
  estimateSize: (index: number) => number,
  measured: Map<number, number>,
  paddingStart: number,
  gap: number,
  getItemKey?: (index: number) => number | string,
): VirtualItem[] {
  const items: VirtualItem[] = new Array(count);
  let cursor = paddingStart;
  for (let i = 0; i < count; i++) {
    const override = measured.get(i);
    const size = override !== undefined ? override : estimateSize(i);
    const start = cursor;
    const end = start + size;
    items[i] = {
      index: i,
      start,
      size,
      end,
      key: getItemKey ? getItemKey(i) : i,
    };
    cursor = end + gap;
  }
  return items;
}

/**
 * Binary search for the last item whose `start` is `<= offset` (the first item
 * intersecting the top of the viewport). Returns `0` for an empty list.
 */
function findStartIndex(items: VirtualItem[], offset: number): number {
  let low = 0;
  let high = items.length - 1;
  let result = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const item = items[mid];
    if (item === undefined) break;
    if (item.start <= offset) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/**
 * Compute the rendered index range (including overscan) for the given scroll
 * position and viewport size, or `null` when the list is empty.
 */
function computeRange(
  items: VirtualItem[],
  scrollOffset: number,
  viewport: number,
  overscan: number,
  scrollMargin: number,
): { startIndex: number; endIndex: number } | null {
  const count = items.length;
  if (count === 0) return null;

  const effectiveScroll = Math.max(0, scrollOffset - scrollMargin);
  const viewportEnd = effectiveScroll + viewport;

  let startIndex = findStartIndex(items, effectiveScroll);
  let endIndex = startIndex;
  while (endIndex < count - 1) {
    const next = items[endIndex + 1];
    if (next !== undefined && next.start < viewportEnd) {
      endIndex++;
    } else {
      break;
    }
  }

  startIndex = Math.max(0, startIndex - overscan);
  endIndex = Math.min(count - 1, endIndex + overscan);
  return { startIndex, endIndex };
}

/**
 * Headless list virtualizer for React.
 *
 * Returns a {@link Virtualizer} that tells you which items to render and where
 * to place them. You own the markup; the hook owns the math. It attaches a
 * passive `scroll` listener and a `ResizeObserver` to your scroll element (in
 * effects only, never during render), so it is safe to call during SSR — on the
 * server it returns an estimated layout with a `0` scroll offset.
 *
 * @param options - See {@link VirtualizerOptions}.
 * @returns A {@link Virtualizer} instance.
 *
 * @example
 * ```tsx
 * import { useRef } from "react";
 * import { useVirtualizer } from "@lacspace/virtual";
 *
 * function List({ rows }: { rows: string[] }) {
 *   const parentRef = useRef<HTMLDivElement>(null);
 *   const v = useVirtualizer({
 *     count: rows.length,
 *     getScrollElement: () => parentRef.current,
 *     estimateSize: () => 40,
 *     overscan: 8,
 *   });
 *
 *   return (
 *     <div ref={parentRef} style={{ height: 400, overflow: "auto" }}>
 *       <div style={{ height: v.getTotalSize(), position: "relative" }}>
 *         {v.getVirtualItems().map((item) => (
 *           <div
 *             key={item.key}
 *             data-index={item.index}
 *             ref={v.measureElement}
 *             style={{
 *               position: "absolute",
 *               top: 0,
 *               left: 0,
 *               width: "100%",
 *               transform: `translateY(${item.start}px)`,
 *             }}
 *           >
 *             {rows[item.index]}
 *           </div>
 *         ))}
 *       </div>
 *     </div>
 *   );
 * }
 * ```
 */
export function useVirtualizer(options: VirtualizerOptions): Virtualizer {
  const {
    count,
    estimateSize,
    getItemKey,
    overscan = 5,
    horizontal = false,
    gap = 0,
    paddingStart = 0,
    scrollMargin = 0,
  } = options;

  // Always read the freshest options/callbacks inside effects and imperative
  // methods, so we can keep effect/memo dependency lists narrow and stable.
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [scrollOffset, setScrollOffset] = useState(0);
  const [viewport, setViewport] = useState(0);
  const [element, setElement] = useState<HTMLElement | null>(null);

  // Map<index, measuredSize> — overrides estimateSize once a row is measured.
  const measuredRef = useRef<Map<number, number>>(new Map());
  const [measureVersion, setMeasureVersion] = useState(0);

  const measurements = useMemo(
    () =>
      buildMeasurements(
        count,
        estimateSize,
        measuredRef.current,
        paddingStart,
        gap,
        getItemKey,
      ),
    // estimateSize/getItemKey are real deps: a changed estimator or key fn must
    // rebuild the table. measureVersion forces a rebuild after a measure.
    [count, estimateSize, getItemKey, paddingStart, gap, measureVersion],
  );

  // Resolve the scroll element every render; setState bails out when unchanged,
  // so a late-mounting element is adopted without an infinite loop.
  useIsomorphicLayoutEffect(() => {
    const el = optionsRef.current.getScrollElement();
    setElement((prev) => (prev === el ? prev : el));
  });

  // Track scroll offset and viewport size for the resolved element.
  useEffect(() => {
    if (!element) return;

    const readScroll = () => {
      const off = horizontal ? element.scrollLeft : element.scrollTop;
      setScrollOffset((prev) => (prev === off ? prev : off));
    };
    const readSize = () => {
      const size = horizontal ? element.clientWidth : element.clientHeight;
      setViewport((prev) => (prev === size ? prev : size));
    };

    readScroll();
    readSize();

    element.addEventListener("scroll", readScroll, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(readSize);
      observer.observe(element);
    } else if (typeof window !== "undefined") {
      window.addEventListener("resize", readSize);
    }

    return () => {
      element.removeEventListener("scroll", readScroll);
      if (observer) {
        observer.disconnect();
      } else if (typeof window !== "undefined") {
        window.removeEventListener("resize", readSize);
      }
    };
  }, [element, horizontal]);

  const range = useMemo(
    () => computeRange(measurements, scrollOffset, viewport, overscan, scrollMargin),
    [measurements, scrollOffset, viewport, overscan, scrollMargin],
  );

  const getVirtualItems = useCallback((): VirtualItem[] => {
    if (!range) return [];
    const out: VirtualItem[] = [];
    for (let i = range.startIndex; i <= range.endIndex; i++) {
      const item = measurements[i];
      if (item !== undefined) out.push(item);
    }
    return out;
  }, [measurements, range]);

  const getTotalSize = useCallback((): number => {
    const last = measurements[measurements.length - 1];
    return last !== undefined ? last.end : 0;
  }, [measurements]);

  const measureElement = useCallback((el: HTMLElement | null): void => {
    if (!el) return;
    const attr = el.getAttribute("data-index");
    if (attr === null) return;
    const index = Number.parseInt(attr, 10);
    if (Number.isNaN(index)) return;

    const rect = el.getBoundingClientRect();
    const size = optionsRef.current.horizontal ? rect.width : rect.height;
    const prev = measuredRef.current.get(index);
    if (prev === size) return;

    measuredRef.current.set(index, size);
    setMeasureVersion((v) => v + 1);
  }, []);

  const scrollToOffset = useCallback(
    (offset: number, opts?: { behavior?: ScrollBehavior }): void => {
      const el = optionsRef.current.getScrollElement();
      if (!el) return;
      const behavior = opts?.behavior ?? "auto";
      if (optionsRef.current.horizontal) {
        el.scrollTo({ left: Math.max(0, offset), behavior });
      } else {
        el.scrollTo({ top: Math.max(0, offset), behavior });
      }
    },
    [],
  );

  const scrollToIndex = useCallback(
    (
      index: number,
      opts?: { align?: "start" | "center" | "end" | "auto"; behavior?: ScrollBehavior },
    ): void => {
      const list = measurements;
      const cnt = list.length;
      if (cnt === 0) return;
      const item = list[Math.max(0, Math.min(index, cnt - 1))];
      if (item === undefined) return;

      const el = optionsRef.current.getScrollElement();
      if (!el) return;

      const h = optionsRef.current.horizontal ?? false;
      const sm = optionsRef.current.scrollMargin ?? 0;
      const vp = h ? el.clientWidth : el.clientHeight;
      const current = h ? el.scrollLeft : el.scrollTop;
      const itemStart = item.start + sm;
      const itemEnd = item.end + sm;
      const align = opts?.align ?? "auto";

      let target: number;
      switch (align) {
        case "start":
          target = itemStart;
          break;
        case "end":
          target = itemEnd - vp;
          break;
        case "center":
          target = itemStart - vp / 2 + item.size / 2;
          break;
        case "auto":
        default:
          if (itemStart < current) {
            target = itemStart;
          } else if (itemEnd > current + vp) {
            target = itemEnd - vp;
          } else {
            return; // already fully/partly visible — no scroll needed
          }
      }

      target = Math.max(0, target);
      const behavior = opts?.behavior ?? "auto";
      if (h) {
        el.scrollTo({ left: target, behavior });
      } else {
        el.scrollTo({ top: target, behavior });
      }
    },
    [measurements],
  );

  return useMemo<Virtualizer>(
    () => ({
      getVirtualItems,
      getTotalSize,
      scrollToIndex,
      scrollToOffset,
      measureElement,
      range,
      options,
    }),
    // Depend on the specific primitive fields rather than the raw `options`
    // object, which is a fresh reference each render for inline callers and
    // would defeat this memo. The callbacks/range above already track behavior.
    [
      getVirtualItems,
      getTotalSize,
      scrollToIndex,
      scrollToOffset,
      measureElement,
      range,
      count,
      overscan,
      horizontal,
      gap,
      paddingStart,
      scrollMargin,
    ],
  );
}
