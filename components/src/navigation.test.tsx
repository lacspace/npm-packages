import { describe, it, expect } from "vitest";
import {
  ELLIPSIS,
  collapseBreadcrumbs,
  deriveStepStates,
  firstEnabledIndex,
  lastEnabledIndex,
  paginationRange,
  rovingIndex,
  toggleAccordionValue,
  typeaheadBuffer,
  typeaheadMatch,
} from "./navigation.js";

describe("paginationRange", () => {
  it("lists every page when they all fit without a gap", () => {
    expect(paginationRange(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("gaps only on the right while the current page is near the start", () => {
    expect(paginationRange(1, 10)).toEqual([1, 2, 3, 4, 5, ELLIPSIS, 10]);
  });

  it("gaps on both sides while the current page is in the middle", () => {
    expect(paginationRange(5, 10)).toEqual([1, ELLIPSIS, 4, 5, 6, ELLIPSIS, 10]);
  });

  it("gaps only on the left while the current page is near the end", () => {
    expect(paginationRange(10, 10)).toEqual([1, ELLIPSIS, 6, 7, 8, 9, 10]);
  });

  it("keeps the control the same width while paging through the middle", () => {
    const widths = [4, 5, 6, 7, 8].map((page) => paginationRange(page, 20).length);
    expect(new Set(widths).size).toBe(1);
  });

  it("shows more neighbours when asked for more siblings", () => {
    expect(paginationRange(10, 20, 2)).toEqual([1, ELLIPSIS, 8, 9, 10, 11, 12, ELLIPSIS, 20]);
  });

  it("pins two pages at each end when boundaries is 2", () => {
    expect(paginationRange(10, 20, 1, 2)).toEqual([1, 2, ELLIPSIS, 9, 10, 11, ELLIPSIS, 19, 20]);
  });

  it("clamps a page that sits outside the range", () => {
    expect(paginationRange(99, 10)).toEqual(paginationRange(10, 10));
    expect(paginationRange(0, 10)).toEqual(paginationRange(1, 10));
  });

  it("renders nothing when there are no pages at all", () => {
    expect(paginationRange(1, 0)).toEqual([]);
    expect(paginationRange(1, Number.NaN)).toEqual([]);
  });
});

describe("collapseBreadcrumbs", () => {
  const trail = ["Home", "Docs", "Guides", "Forms", "Validation"];

  it("leaves a trail that is already short enough alone", () => {
    const slots = collapseBreadcrumbs(trail, 8);
    expect(slots).toHaveLength(5);
    expect(slots.every((slot) => slot.kind === "item")).toBe(true);
  });

  it("never collapses when no maximum is given", () => {
    expect(collapseBreadcrumbs(trail)).toHaveLength(5);
  });

  it("collapses the middle and hands back what it hid", () => {
    const slots = collapseBreadcrumbs(trail, 3);
    expect(slots.map((slot) => (slot.kind === "item" ? slot.item : ELLIPSIS))).toEqual([
      "Home",
      ELLIPSIS,
      "Validation",
    ]);
    const gap = slots[1];
    expect(gap?.kind === "ellipsis" ? gap.hidden : []).toEqual(["Docs", "Guides", "Forms"]);
  });

  it("keeps the requested number of crumbs at each end", () => {
    const slots = collapseBreadcrumbs(trail, 3, 2, 2);
    expect(slots.map((slot) => (slot.kind === "item" ? slot.item : ELLIPSIS))).toEqual([
      "Home",
      "Docs",
      ELLIPSIS,
      "Forms",
      "Validation",
    ]);
  });

  it("reports the positions the collapsed crumbs came from", () => {
    const gap = collapseBreadcrumbs(trail, 3)[1];
    expect(gap?.kind === "ellipsis" ? [gap.from, gap.to] : []).toEqual([1, 3]);
  });

  it("stays whole when collapsing would hide nothing", () => {
    expect(collapseBreadcrumbs(["a", "b", "c", "d"], 3, 2, 2)).toHaveLength(4);
  });
});

describe("rovingIndex", () => {
  const all = [false, false, false];

  it("wraps past the last item back to the first", () => {
    expect(rovingIndex(2, 1, all)).toBe(0);
  });

  it("wraps backwards from the first item to the last", () => {
    expect(rovingIndex(0, -1, all)).toBe(2);
  });

  it("skips over a disabled item on the way", () => {
    expect(rovingIndex(0, 1, [false, true, false])).toBe(2);
  });

  it("stays put at the edge when wrapping is turned off", () => {
    expect(rovingIndex(2, 1, all, false)).toBe(2);
    expect(rovingIndex(0, -1, all, false)).toBe(0);
  });

  it("lands on the first item when nothing is focused yet", () => {
    expect(rovingIndex(-1, 1, all)).toBe(0);
  });

  it("gives up with -1 when every item is disabled", () => {
    expect(rovingIndex(0, 1, [true, true, true])).toBe(-1);
    expect(rovingIndex(0, 1, [])).toBe(-1);
  });

  it("finds the first and last items that can actually take focus", () => {
    const flags = [true, false, false, true];
    expect(firstEnabledIndex(flags)).toBe(1);
    expect(lastEnabledIndex(flags)).toBe(2);
    expect(firstEnabledIndex([true])).toBe(-1);
    expect(lastEnabledIndex([])).toBe(-1);
  });
});

describe("typeahead", () => {
  const labels = ["Archive", "Copy", "Cut", "Delete"];

  it("extends the search while the typing keeps going", () => {
    expect(typeaheadBuffer("s", "e", 120)).toBe("se");
  });

  it("starts a fresh search after a pause", () => {
    expect(typeaheadBuffer("se", "t", 900)).toBe("t");
  });

  it("ignores keys that are not a single character", () => {
    expect(typeaheadBuffer("se", "ArrowDown", 100)).toBe("se");
    expect(typeaheadBuffer("se", "Shift", 100)).toBe("se");
  });

  it("jumps to the item the typed letters start", () => {
    expect(typeaheadMatch(labels, "cu")).toBe(2);
    expect(typeaheadMatch(labels, "DEL")).toBe(3);
  });

  it("cycles through the matches when one letter is repeated", () => {
    expect(typeaheadMatch(labels, "cc", 1)).toBe(2);
    expect(typeaheadMatch(labels, "ccc", 2)).toBe(1);
  });

  it("wraps around the end of the list while searching", () => {
    expect(typeaheadMatch(labels, "a", 2)).toBe(0);
  });

  it("never lands on a disabled item", () => {
    expect(typeaheadMatch(labels, "c", -1, [false, true, false, false])).toBe(2);
  });

  it("answers -1 when nothing matches or nothing was typed", () => {
    expect(typeaheadMatch(labels, "zz")).toBe(-1);
    expect(typeaheadMatch(labels, "   ")).toBe(-1);
  });
});

describe("deriveStepStates", () => {
  it("marks earlier steps done and later ones upcoming", () => {
    expect(deriveStepStates(4, 2)).toEqual(["done", "done", "current", "upcoming"]);
  });

  it("lets a failed step outrank its position", () => {
    expect(deriveStepStates(3, 0, { errors: [2] })).toEqual(["current", "upcoming", "error"]);
  });

  it("marks every step done once the flow is complete", () => {
    expect(deriveStepStates(3, 1, { complete: true })).toEqual(["done", "done", "done"]);
    expect(deriveStepStates(3, 1, { complete: true, errors: [1] })).toEqual([
      "done",
      "error",
      "done",
    ]);
  });

  it("treats a step index past the end as everything being done", () => {
    expect(deriveStepStates(3, 5)).toEqual(["done", "done", "done"]);
  });

  it("treats a negative step index as not started", () => {
    expect(deriveStepStates(3, -1)).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect(deriveStepStates(0, 0)).toEqual([]);
  });
});

describe("toggleAccordionValue", () => {
  it("opens one panel at a time by default", () => {
    expect(toggleAccordionValue(["a"], "b", false)).toEqual(["b"]);
  });

  it("keeps the other panels open in multiple mode", () => {
    expect(toggleAccordionValue(["a"], "b", true)).toEqual(["a", "b"]);
  });

  it("closes a panel that was already open", () => {
    expect(toggleAccordionValue(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("refuses to close the open panel when the accordion is not collapsible", () => {
    expect(toggleAccordionValue(["a"], "a", false, false)).toEqual(["a"]);
  });

  it("never mutates the array it was handed", () => {
    const open = ["a"];
    toggleAccordionValue(open, "b", true);
    expect(open).toEqual(["a"]);
  });
});
