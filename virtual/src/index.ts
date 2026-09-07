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
import {
  augmentRangeWithSticky,
  buildMeasurements,
  computeRange,
  getTotalSize as coreTotalSize,
  scrollToIndexOffset,
} from "./core";
import type { VirtualItem } from "./core";

// Re-export the React-free geometry core so non-React / SSR / worker consumers
// (and tests) can use the exact same math without importing the hook.
export type {
  VirtualItem,
  Range,
  ScrollAlign,
  CalculateRangeInput,
  CalculateRangeResult,
} from "./core";
export {
  calculateRange,
  buildMeasurements,
  computeRange,
  findStartIndex,
  getTotalSize,
  scrollToIndexOffset,
  augmentRangeWithSticky,
  normalizeStickyIndices,
} from "./core";

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
  /**
   * Indices that must stay rendered even when scrolled out of the visible
   * window — e.g. sticky section headers or pinned rows. They are always
   * included in {@link Virtualizer.getVirtualItems | getVirtualItems} (in
   * ascending order, without duplicating items already in range). Out-of-range
   * and non-integer values are ignored. Purely additive: the geometry of every
   * other item is unchanged.
   * @defaultValue []
   */
  stickyIndices?: number[];
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
    stickyIndices,
  } = options;

  // Stable, order-insensitive key for the sticky list, so the render memo only
  // recomputes when the actual set of pinned indices changes.
  const stickyKey = stickyIndices ? stickyIndices.join(",") : "";

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
    // Range window unioned with any sticky/pinned indices (ascending, no dupes).
    const indices = augmentRangeWithSticky(range, stickyIndices, measurements.length);
    const out: VirtualItem[] = [];
    for (const i of indices) {
      const item = measurements[i];
      if (item !== undefined) out.push(item);
    }
    return out;
    // stickyKey stands in for the stickyIndices array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measurements, range, stickyKey]);

  const getTotalSize = useCallback(
    (): number => coreTotalSize(measurements),
    [measurements],
  );

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
      const el = optionsRef.current.getScrollElement();
      if (!el) return;

      const h = optionsRef.current.horizontal ?? false;
      const target = scrollToIndexOffset(measurements, index, {
        align: opts?.align ?? "auto",
        containerSize: h ? el.clientWidth : el.clientHeight,
        scrollMargin: optionsRef.current.scrollMargin ?? 0,
        currentOffset: h ? el.scrollLeft : el.scrollTop,
      });
      if (target === null) return; // empty list, or already visible ("auto")

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
