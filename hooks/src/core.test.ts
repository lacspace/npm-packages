import { describe, expect, it } from "vitest";
import {
  buildMediaQuery,
  betweenWidthQuery,
  canRedo,
  canUndo,
  clamp,
  clampStep,
  createHistory,
  getPaginationRange,
  getPaginationState,
  listInsert,
  listMove,
  listRemoveAt,
  listUpdateAt,
  maxWidthQuery,
  minWidthQuery,
  moveStep,
  pushHistory,
  redoHistory,
  resetHistory,
  stepProgress,
  undoHistory,
} from "./core";

// These tests exercise ONLY the pure, React-free core. They run under the
// monorepo's node-env vitest — no jsdom, no React, no DOM.

describe("clamp", () => {
  it("bounds a value and tolerates swapped min/max", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(5, 10, 0)).toBe(5);
  });
});

describe("getPaginationState", () => {
  it("derives indices and flags for a middle page", () => {
    const s = getPaginationState({ totalItems: 95, page: 3, pageSize: 10 });
    expect(s.pageCount).toBe(10);
    expect(s.startIndex).toBe(20);
    expect(s.endIndex).toBe(29);
    expect(s.itemCountOnPage).toBe(10);
    expect(s.hasPrev).toBe(true);
    expect(s.hasNext).toBe(true);
    expect(s.isFirst).toBe(false);
    expect(s.isLast).toBe(false);
  });

  it("clamps an out-of-range page and shrinks the last page", () => {
    const s = getPaginationState({ totalItems: 95, page: 999, pageSize: 10 });
    expect(s.page).toBe(10);
    expect(s.isLast).toBe(true);
    expect(s.startIndex).toBe(90);
    expect(s.endIndex).toBe(94);
    expect(s.itemCountOnPage).toBe(5);
  });

  it("handles an empty dataset with one empty page", () => {
    const s = getPaginationState({ totalItems: 0, page: 1, pageSize: 20 });
    expect(s.pageCount).toBe(1);
    expect(s.itemCountOnPage).toBe(0);
    expect(s.endIndex).toBe(-1);
    expect(s.isFirst).toBe(true);
    expect(s.isLast).toBe(true);
  });
});

describe("getPaginationRange", () => {
  it("lists all pages when they fit", () => {
    expect(getPaginationRange(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it("inserts ellipsis gaps on both sides", () => {
    expect(getPaginationRange(6, 20)).toEqual([1, "…", 5, 6, 7, "…", 20]);
  });

  it("omits the left gap near the start", () => {
    expect(getPaginationRange(2, 20)).toEqual([1, 2, 3, "…", 20]);
  });

  it("shows only a right gap near the start", () => {
    const r = getPaginationRange(1, 20, { siblings: 1, boundaries: 1 });
    expect(r[0]).toBe(1);
    expect(r[r.length - 1]).toBe(20);
    expect(r.filter((t) => t === "…").length).toBe(1);
  });
});

describe("stepper math", () => {
  it("clamps a step into range", () => {
    expect(clampStep(-2, 4)).toBe(0);
    expect(clampStep(9, 4)).toBe(3);
    expect(clampStep(2, 4)).toBe(2);
    expect(clampStep(0, 0)).toBe(0);
  });

  it("saturates without loop and wraps with loop", () => {
    expect(moveStep(3, 4, +1, false)).toBe(3);
    expect(moveStep(3, 4, +1, true)).toBe(0);
    expect(moveStep(0, 4, -1, true)).toBe(3);
    expect(moveStep(0, 4, -1, false)).toBe(0);
  });

  it("reports progress as a 0..1 fraction", () => {
    expect(stepProgress(0, 5)).toBe(0);
    expect(stepProgress(1, 5)).toBe(0.25);
    expect(stepProgress(4, 5)).toBe(1);
    expect(stepProgress(0, 1)).toBe(1);
  });
});

describe("history buffer", () => {
  it("pushes present into past and clears future", () => {
    let h = createHistory(0);
    h = pushHistory(h, 1);
    h = pushHistory(h, 2);
    expect(h.present).toBe(2);
    expect(h.past).toEqual([0, 1]);
    expect(canUndo(h)).toBe(true);
    expect(canRedo(h)).toBe(false);
  });

  it("undo and redo walk the timeline", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b");
    h = pushHistory(h, "c");
    h = undoHistory(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
    h = redoHistory(h);
    expect(h.present).toBe("c");
  });

  it("a new push after undo clears the redo branch", () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = undoHistory(h);
    h = pushHistory(h, 9);
    expect(h.present).toBe(9);
    expect(canRedo(h)).toBe(false);
  });

  it("no-ops on identical push and at the ends", () => {
    let h = createHistory(5);
    expect(pushHistory(h, 5)).toBe(h);
    expect(undoHistory(h)).toBe(h);
    expect(redoHistory(h)).toBe(h);
  });

  it("honours the past-entry limit", () => {
    let h = createHistory(0, 2);
    for (let i = 1; i <= 5; i++) h = pushHistory(h, i);
    expect(h.present).toBe(5);
    expect(h.past).toEqual([3, 4]);
  });

  it("reset discards past and future", () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = resetHistory(h, 42);
    expect(h.present).toBe(42);
    expect(h.past).toEqual([]);
    expect(h.future).toEqual([]);
  });
});

describe("immutable list ops", () => {
  it("inserts (incl. negative index) without mutating the source", () => {
    const src = [1, 2, 3];
    expect(listInsert(src, 1, 9)).toEqual([1, 9, 2, 3]);
    expect(listInsert(src, -1, 9)).toEqual([1, 2, 9, 3]);
    expect(src).toEqual([1, 2, 3]);
  });

  it("removes at an index and clamps out-of-range", () => {
    expect(listRemoveAt([1, 2, 3], 1)).toEqual([1, 3]);
    expect(listRemoveAt([1, 2, 3], 99)).toEqual([1, 2]);
    expect(listRemoveAt<number>([], 0)).toEqual([]);
  });

  it("updates at an index with a value or updater", () => {
    expect(listUpdateAt([1, 2, 3], 1, 20)).toEqual([1, 20, 3]);
    expect(listUpdateAt([1, 2, 3], 2, (p) => p * 10)).toEqual([1, 2, 30]);
  });

  it("moves an item between positions", () => {
    expect(listMove([1, 2, 3, 4], 0, 2)).toEqual([2, 3, 1, 4]);
    expect(listMove([1, 2, 3, 4], 3, 0)).toEqual([4, 1, 2, 3]);
    expect(listMove([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
  });
});

describe("media-query builders", () => {
  it("joins feature clauses with and", () => {
    expect(buildMediaQuery({ minWidth: 768, maxWidth: 1024 })).toBe(
      "(min-width: 768px) and (max-width: 1024px)",
    );
  });

  it("supports type prefix and preference features", () => {
    expect(buildMediaQuery({ type: "screen", prefersDark: true })).toBe(
      "screen and (prefers-color-scheme: dark)",
    );
    expect(buildMediaQuery({})).toBe("all");
    expect(buildMediaQuery({ minWidth: "40rem" })).toBe("(min-width: 40rem)");
  });

  it("exposes width shorthands", () => {
    expect(minWidthQuery(600)).toBe("(min-width: 600px)");
    expect(maxWidthQuery(600)).toBe("(max-width: 600px)");
    expect(betweenWidthQuery(600, 900)).toBe("(min-width: 600px) and (max-width: 900px)");
  });
});
