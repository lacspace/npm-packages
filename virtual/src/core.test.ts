import { describe, expect, it } from "vitest";
import {
  augmentRangeWithSticky,
  buildMeasurements,
  calculateRange,
  computeRange,
  findStartIndex,
  getTotalSize,
  normalizeStickyIndices,
  scrollToIndexOffset,
} from "./core";

// These tests exercise ONLY the pure, React-free virtualization core. They run
// under the monorepo's node-env vitest — no jsdom, no React, no DOM.

const NO_MEASURED = new Map<number, number>();
const fixed = (px: number) => () => px;

describe("buildMeasurements", () => {
  it("lays out fixed-size items with cumulative offsets", () => {
    const items = buildMeasurements(4, fixed(10), NO_MEASURED, 0, 0);
    expect(items.map((i) => i.start)).toEqual([0, 10, 20, 30]);
    expect(items.map((i) => i.end)).toEqual([10, 20, 30, 40]);
    expect(items.every((i) => i.size === 10)).toBe(true);
    expect(items.map((i) => i.index)).toEqual([0, 1, 2, 3]);
  });

  it("applies paddingStart to the first offset", () => {
    const items = buildMeasurements(3, fixed(10), NO_MEASURED, 25, 0);
    expect(items.map((i) => i.start)).toEqual([25, 35, 45]);
  });

  it("inserts a gap between adjacent items but not before the first", () => {
    const items = buildMeasurements(3, fixed(10), NO_MEASURED, 0, 4);
    expect(items.map((i) => i.start)).toEqual([0, 14, 28]);
    expect(items.map((i) => i.end)).toEqual([10, 24, 38]);
  });

  it("supports variable (per-index) estimated sizes", () => {
    const items = buildMeasurements(4, (i) => (i + 1) * 10, NO_MEASURED, 0, 0);
    expect(items.map((i) => i.size)).toEqual([10, 20, 30, 40]);
    expect(items.map((i) => i.start)).toEqual([0, 10, 30, 60]);
    expect(items.map((i) => i.end)).toEqual([10, 30, 60, 100]);
  });

  it("lets a measured-size cache override estimates and shift later offsets", () => {
    const measured = new Map<number, number>([
      [1, 50],
      [2, 5],
    ]);
    const items = buildMeasurements(4, fixed(10), measured, 0, 0);
    expect(items.map((i) => i.size)).toEqual([10, 50, 5, 10]);
    // 0:[0,10) 1:[10,60) 2:[60,65) 3:[65,75)
    expect(items.map((i) => i.start)).toEqual([0, 10, 60, 65]);
    expect(items.map((i) => i.end)).toEqual([10, 60, 65, 75]);
  });

  it("uses getItemKey for keys, defaulting to the index", () => {
    const items = buildMeasurements(3, fixed(10), NO_MEASURED, 0, 0, (i) => `row-${i}`);
    expect(items.map((i) => i.key)).toEqual(["row-0", "row-1", "row-2"]);
    const dflt = buildMeasurements(3, fixed(10), NO_MEASURED, 0, 0);
    expect(dflt.map((i) => i.key)).toEqual([0, 1, 2]);
  });
});

describe("getTotalSize", () => {
  it("returns 0 for an empty list", () => {
    expect(getTotalSize([])).toBe(0);
  });

  it("returns the last item's end for fixed sizes", () => {
    const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0);
    expect(getTotalSize(items)).toBe(100);
  });

  it("reflects paddingStart, gaps and measured overrides in the total", () => {
    const measured = new Map<number, number>([[0, 20]]);
    const items = buildMeasurements(10, fixed(10), measured, 5, 2, undefined);
    // padding 5 + sizes(20 + 9*10 = 110) + 9 inter-item gaps*2 = 18 (trailing
    // gap is not appended) => last item's end = 5 + 110 + 18 = 133
    expect(getTotalSize(items)).toBe(133);
  });
});

describe("findStartIndex", () => {
  const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0); // starts 0..90

  it("returns 0 at or before the first item", () => {
    expect(findStartIndex(items, 0)).toBe(0);
    expect(findStartIndex(items, -50)).toBe(0);
    expect(findStartIndex(items, 5)).toBe(0);
  });

  it("finds the last item whose start <= offset (inclusive boundary)", () => {
    expect(findStartIndex(items, 10)).toBe(1);
    expect(findStartIndex(items, 25)).toBe(2);
    expect(findStartIndex(items, 90)).toBe(9);
    expect(findStartIndex(items, 1000)).toBe(9);
  });
});

describe("computeRange (fixed sizes)", () => {
  const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0); // 100px tall

  it("returns null for an empty list", () => {
    expect(computeRange([], 0, 30, 5, 0)).toBeNull();
  });

  it("covers the visible window at scrollTop 0", () => {
    expect(computeRange(items, 0, 30, 0, 0)).toEqual({ startIndex: 0, endIndex: 2 });
  });

  it("covers the visible window at a mid scrollTop", () => {
    expect(computeRange(items, 45, 30, 0, 0)).toEqual({ startIndex: 4, endIndex: 7 });
  });

  it("handles a scrollTop exactly on an item boundary", () => {
    expect(computeRange(items, 40, 30, 0, 0)).toEqual({ startIndex: 4, endIndex: 6 });
  });

  it("clamps the range to the last item near the end", () => {
    expect(computeRange(items, 95, 30, 0, 0)).toEqual({ startIndex: 9, endIndex: 9 });
  });
});

describe("computeRange overscan", () => {
  const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0);

  it("widens the window symmetrically by the overscan", () => {
    const base = computeRange(items, 45, 30, 0, 0)!; // {4,7}
    const over = computeRange(items, 45, 30, 2, 0)!;
    expect(over).toEqual({ startIndex: base.startIndex - 2, endIndex: base.endIndex + 2 });
  });

  it("clamps the overscanned window to list bounds", () => {
    expect(computeRange(items, 0, 30, 5, 0)).toEqual({ startIndex: 0, endIndex: 7 });
    expect(computeRange(items, 95, 30, 5, 0)).toEqual({ startIndex: 4, endIndex: 9 });
  });
});

describe("computeRange scrollMargin", () => {
  const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0);

  it("subtracts scrollMargin from the scroll offset", () => {
    const withMargin = computeRange(items, 145, 30, 0, 100);
    const without = computeRange(items, 45, 30, 0, 0);
    expect(withMargin).toEqual(without);
  });
});

describe("computeRange (variable sizes)", () => {
  it("finds the correct window with per-index sizes", () => {
    const items = buildMeasurements(5, (i) => (i + 1) * 20, NO_MEASURED, 0, 0);
    // sizes 20,40,60,80,100 -> starts 0,20,60,120,200 ; ends ...,300
    // scroll 70, viewport 100 -> effective 70..170: start item2 (start60<=70),
    // end: item3 start120<170 yes, item4 start200<170 no => {2,3}
    expect(computeRange(items, 70, 100, 0, 0)).toEqual({ startIndex: 2, endIndex: 3 });
  });
});

describe("scrollToIndexOffset alignment", () => {
  const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0);

  it("start aligns the leading edge", () => {
    expect(scrollToIndexOffset(items, 5, { align: "start", containerSize: 30 })).toBe(50);
  });

  it("end aligns the trailing edge to the viewport end", () => {
    expect(scrollToIndexOffset(items, 5, { align: "end", containerSize: 30 })).toBe(30);
  });

  it("center centres the item in the viewport", () => {
    expect(scrollToIndexOffset(items, 5, { align: "center", containerSize: 30 })).toBe(40);
  });

  it("clamps the target to >= 0", () => {
    expect(scrollToIndexOffset(items, 0, { align: "end", containerSize: 30 })).toBe(0);
  });

  it("adds scrollMargin back into the target", () => {
    expect(
      scrollToIndexOffset(items, 5, { align: "start", containerSize: 30, scrollMargin: 100 }),
    ).toBe(150);
  });

  it("returns null for an empty list", () => {
    expect(scrollToIndexOffset([], 0, { align: "start", containerSize: 30 })).toBeNull();
  });

  it("clamps an out-of-range index to the last item", () => {
    expect(scrollToIndexOffset(items, 999, { align: "start", containerSize: 30 })).toBe(90);
  });
});

describe("scrollToIndexOffset auto", () => {
  const items = buildMeasurements(10, fixed(10), NO_MEASURED, 0, 0);

  it("returns null when the item is already fully visible", () => {
    expect(
      scrollToIndexOffset(items, 5, { align: "auto", containerSize: 30, currentOffset: 50 }),
    ).toBeNull();
  });

  it("scrolls up (to the item start) when the item is above the viewport", () => {
    expect(
      scrollToIndexOffset(items, 5, { align: "auto", containerSize: 30, currentOffset: 55 }),
    ).toBe(50);
  });

  it("scrolls down (item end to viewport end) when the item is below", () => {
    expect(
      scrollToIndexOffset(items, 5, { align: "auto", containerSize: 30, currentOffset: 0 }),
    ).toBe(30);
  });
});

describe("normalizeStickyIndices", () => {
  it("sorts, de-duplicates and drops out-of-range / non-integer values", () => {
    expect(normalizeStickyIndices([3, 1, 1, 3, -1, 99, 2.5], 10)).toEqual([1, 3]);
  });

  it("returns an empty array for no sticky indices", () => {
    expect(normalizeStickyIndices(undefined, 10)).toEqual([]);
    expect(normalizeStickyIndices([], 10)).toEqual([]);
  });
});

describe("augmentRangeWithSticky", () => {
  it("includes out-of-range sticky indices, ascending, without duplicates", () => {
    expect(augmentRangeWithSticky({ startIndex: 4, endIndex: 6 }, [0, 9], 10)).toEqual([
      0, 4, 5, 6, 9,
    ]);
  });

  it("does not duplicate a sticky index already inside the range", () => {
    expect(augmentRangeWithSticky({ startIndex: 4, endIndex: 6 }, [5], 10)).toEqual([4, 5, 6]);
  });

  it("returns just the sticky indices when the range is null", () => {
    expect(augmentRangeWithSticky(null, [0, 9], 10)).toEqual([0, 9]);
  });

  it("keeps sticky before AND after the window", () => {
    expect(augmentRangeWithSticky({ startIndex: 4, endIndex: 5 }, [0, 1, 9], 10)).toEqual([
      0, 1, 4, 5, 9,
    ]);
  });
});

describe("calculateRange (all-in-one pipeline)", () => {
  it("returns items, total size, range and the render window", () => {
    const r = calculateRange({
      count: 10,
      estimateSize: fixed(10),
      scrollOffset: 0,
      containerSize: 30,
      overscan: 0,
    });
    expect(r.totalSize).toBe(100);
    expect(r.range).toEqual({ startIndex: 0, endIndex: 2 });
    expect(r.virtualItems.map((i) => i.index)).toEqual([0, 1, 2]);
    expect(r.stickyItems).toEqual([]);
  });

  it("unions sticky indices into the render window", () => {
    const r = calculateRange({
      count: 10,
      estimateSize: fixed(10),
      scrollOffset: 0,
      containerSize: 30,
      overscan: 0,
      stickyIndices: [9],
    });
    expect(r.virtualItems.map((i) => i.index)).toEqual([0, 1, 2, 9]);
    expect(r.stickyItems.map((i) => i.index)).toEqual([9]);
  });

  it("honours the measured cache in offsets and total", () => {
    const r = calculateRange({
      count: 10,
      estimateSize: fixed(10),
      scrollOffset: 0,
      containerSize: 30,
      overscan: 0,
      measured: new Map([[0, 20]]),
    });
    expect(r.items[0]!.size).toBe(20);
    expect(r.items[1]!.start).toBe(20);
    expect(r.totalSize).toBe(110);
  });

  it("horizontal mirrors vertical: identical geometry for identical numbers", () => {
    const shared = {
      count: 25,
      estimateSize: (i: number) => 10 + (i % 3) * 5,
      scrollOffset: 120,
      containerSize: 80,
      overscan: 3,
      gap: 4,
      paddingStart: 8,
    } as const;
    const vertical = calculateRange({ ...shared, horizontal: false });
    const horizontal = calculateRange({ ...shared, horizontal: true });
    expect(horizontal.range).toEqual(vertical.range);
    expect(horizontal.totalSize).toBe(vertical.totalSize);
    expect(horizontal.items).toEqual(vertical.items);
    expect(horizontal.virtualItems).toEqual(vertical.virtualItems);
  });
});
