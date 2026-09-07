/**
 * @lacspace/virtual — pure virtualization core (React-free).
 *
 * This module contains **all** the virtualization math with **zero React and
 * zero DOM** dependencies. Given a scroll offset, a container size, an item
 * count and a per-index size estimate (plus optional overscan, padding, gap,
 * scroll margin and a measured-size cache), it computes the visible index
 * range, every item's offset/size, the total size, the scroll-to-index target
 * offset, and sticky-index augmentation.
 *
 * The React hook in `index.ts` is a thin state/effects wrapper around these
 * functions, so the geometry can be unit-tested directly under a Node
 * environment without a DOM or a renderer.
 *
 * @packageDocumentation
 */

/**
 * A single virtualized item with its computed geometry.
 *
 * `start`/`end` are offsets (in pixels) along the scroll axis, relative to the
 * top (or left, when horizontal) of the inner sizing container — i.e. they do
 * **not** include `scrollMargin`. Position a row with
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

/** An inclusive rendered index window. */
export interface Range {
  startIndex: number;
  endIndex: number;
}

/** Alignment for {@link scrollToIndexOffset}. */
export type ScrollAlign = "start" | "center" | "end" | "auto";

/**
 * Build the full geometry table for the list. O(count).
 *
 * A pure cumulative-offset pass: each item's size is its measured size (from
 * `measured`) when present, otherwise `estimateSize(index)`. `paddingStart`
 * offsets the first item and `gap` is inserted between adjacent items; both
 * count toward the running cursor (and therefore the total size).
 */
export function buildMeasurements(
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
export function findStartIndex(items: VirtualItem[], offset: number): number {
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
 *
 * `scrollMargin` is subtracted from `scrollOffset` (for window/document
 * scrolling where the list starts partway down the page). `overscan` extra
 * items are added on each side of the strictly-visible window and clamped to
 * the list bounds.
 */
export function computeRange(
  items: VirtualItem[],
  scrollOffset: number,
  viewport: number,
  overscan: number,
  scrollMargin: number,
): Range | null {
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
 * Total size (px) of the full list — the offset just past the last item,
 * i.e. the last item's `end`. Returns `0` for an empty list. (Note: any
 * trailing `gap` is not appended, matching the inner-spacer contract.)
 */
export function getTotalSize(items: VirtualItem[]): number {
  const last = items[items.length - 1];
  return last !== undefined ? last.end : 0;
}

/**
 * Normalise and de-duplicate a list of sticky indices: drop out-of-range and
 * non-integer values, sort ascending, and remove duplicates. Pure.
 */
export function normalizeStickyIndices(
  stickyIndices: readonly number[] | undefined,
  count: number,
): number[] {
  if (!stickyIndices || stickyIndices.length === 0) return [];
  const seen = new Set<number>();
  for (const raw of stickyIndices) {
    if (!Number.isInteger(raw)) continue;
    if (raw < 0 || raw >= count) continue;
    seen.add(raw);
  }
  return Array.from(seen).sort((a, b) => a - b);
}

/**
 * Augment a rendered range with sticky/pinned indices, returning the full,
 * ascending, de-duplicated list of indices that should be rendered.
 *
 * Sticky indices are always included even when they fall outside the visible
 * window (e.g. section headers pinned above the fold). Indices already inside
 * the range are not duplicated. Pure — no React, no DOM.
 */
export function augmentRangeWithSticky(
  range: Range | null,
  stickyIndices: readonly number[] | undefined,
  count: number,
): number[] {
  const sticky = normalizeStickyIndices(stickyIndices, count);
  if (!range) return sticky;

  const out: number[] = [];
  let si = 0;
  for (let i = range.startIndex; i <= range.endIndex; i++) {
    // Emit any sticky indices that sort before `i` and are outside the range.
    while (si < sticky.length && sticky[si]! < i) {
      const s = sticky[si]!;
      if (s < range.startIndex) out.push(s);
      si++;
    }
    if (si < sticky.length && sticky[si] === i) si++; // already covered by range
    out.push(i);
  }
  // Trailing sticky indices after the range end.
  for (; si < sticky.length; si++) {
    if (sticky[si]! > range.endIndex) out.push(sticky[si]!);
  }
  return out;
}

/**
 * Compute the absolute scroll offset that brings `index` into view under the
 * given alignment. Pure — returns the target offset in px, or `null` when
 * `align` is `"auto"` and the item is already fully visible (no scroll needed)
 * or when the list/index is empty/invalid.
 *
 * - `start` — align the item's leading edge to the viewport start.
 * - `end` — align the item's trailing edge to the viewport end.
 * - `center` — centre the item in the viewport.
 * - `auto` — scroll the minimum amount to reveal the item, or `null` if it is
 *   already fully visible.
 *
 * `scrollMargin` is added back into the returned offset (the mirror of how
 * {@link computeRange} subtracts it). The result is clamped to `>= 0`.
 */
export function scrollToIndexOffset(
  items: VirtualItem[],
  index: number,
  opts: {
    align?: ScrollAlign;
    containerSize: number;
    scrollMargin?: number;
    currentOffset?: number;
  },
): number | null {
  const count = items.length;
  if (count === 0) return null;
  const item = items[Math.max(0, Math.min(index, count - 1))];
  if (item === undefined) return null;

  const sm = opts.scrollMargin ?? 0;
  const vp = opts.containerSize;
  const current = opts.currentOffset ?? 0;
  const align: ScrollAlign = opts.align ?? "auto";
  const itemStart = item.start + sm;
  const itemEnd = item.end + sm;

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
        return null; // already fully visible — no scroll needed
      }
  }

  return Math.max(0, target);
}

/** Input for the all-in-one pure {@link calculateRange}. */
export interface CalculateRangeInput {
  /** Total number of items in the list. */
  count: number;
  /** Estimated (or fixed) size in px for the item at `index`. */
  estimateSize: (index: number) => number;
  /** Current scroll offset (`scrollTop`, or `scrollLeft` when horizontal). */
  scrollOffset: number;
  /** Viewport size (`clientHeight`, or `clientWidth` when horizontal). */
  containerSize: number;
  /** Extra items rendered each side of the window. @defaultValue 5 */
  overscan?: number;
  /** Leading padding before the first item. @defaultValue 0 */
  paddingStart?: number;
  /** Gap between adjacent items. @defaultValue 0 */
  gap?: number;
  /** Offset from scroll-content start to the list start. @defaultValue 0 */
  scrollMargin?: number;
  /** Measured-size overrides (index → px), taking precedence over estimates. */
  measured?: Map<number, number>;
  /** Indices that must always be rendered (pinned headers etc.). */
  stickyIndices?: readonly number[];
  /** Stable key per item. Defaults to the index. */
  getItemKey?: (index: number) => number | string;
  /**
   * Present for symmetry/documentation only — the geometry is axis-agnostic, so
   * horizontal virtualization uses the identical math with `scrollOffset` =
   * `scrollLeft` and `containerSize` = `clientWidth`.
   * @defaultValue false
   */
  horizontal?: boolean;
}

/** Result of the all-in-one pure {@link calculateRange}. */
export interface CalculateRangeResult {
  /** The full geometry table (every item's offset/size), length `count`. */
  items: VirtualItem[];
  /** Total size (px) of the full list. */
  totalSize: number;
  /** The strictly-computed rendered range (incl. overscan), or `null`. */
  range: Range | null;
  /**
   * The items to actually render: the range window unioned with any sticky
   * indices, ascending and de-duplicated.
   */
  virtualItems: VirtualItem[];
  /** Just the sticky items (subset of `items`), ascending. */
  stickyItems: VirtualItem[];
}

/**
 * One pure call that does the whole pipeline: build the measurement table,
 * compute the visible range with overscan, add sticky indices, and gather the
 * items to render plus the total size. No React, no DOM — this is the exact
 * math the {@link useVirtualizer} hook runs, exposed for testing and for
 * non-React or worker/SSR consumers.
 *
 * The same call drives horizontal lists: pass `scrollLeft` as `scrollOffset`
 * and `clientWidth` as `containerSize`.
 */
export function calculateRange(input: CalculateRangeInput): CalculateRangeResult {
  const {
    count,
    estimateSize,
    scrollOffset,
    containerSize,
    overscan = 5,
    paddingStart = 0,
    gap = 0,
    scrollMargin = 0,
    measured,
    stickyIndices,
    getItemKey,
  } = input;

  const items = buildMeasurements(
    count,
    estimateSize,
    measured ?? EMPTY_MEASURED,
    paddingStart,
    gap,
    getItemKey,
  );
  const totalSize = getTotalSize(items);
  const range = computeRange(items, scrollOffset, containerSize, overscan, scrollMargin);
  const indices = augmentRangeWithSticky(range, stickyIndices, count);

  const virtualItems: VirtualItem[] = [];
  for (const i of indices) {
    const item = items[i];
    if (item !== undefined) virtualItems.push(item);
  }

  const stickySet = normalizeStickyIndices(stickyIndices, count);
  const stickyItems: VirtualItem[] = [];
  for (const i of stickySet) {
    const item = items[i];
    if (item !== undefined) stickyItems.push(item);
  }

  return { items, totalSize, range, virtualItems, stickyItems };
}

/** Shared empty measured cache, so callers need not allocate one. */
const EMPTY_MEASURED: Map<number, number> = new Map();
