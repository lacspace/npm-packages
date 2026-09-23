import { describe, it, expect } from "vitest";
import {
  nextFocusIndex,
  oppositePlacement,
  placementFits,
  positionFloating,
  toastReducer,
  visibleToasts,
  type ToastRecord,
  type ToastState,
} from "./overlay.js";

const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 200, height: 100 };

describe("popover placement", () => {
  it("names the side directly across the anchor", () => {
    expect(oppositePlacement("top")).toBe("bottom");
    expect(oppositePlacement("bottom")).toBe("top");
    expect(oppositePlacement("left")).toBe("right");
    expect(oppositePlacement("right")).toBe("left");
  });

  it("reports that a side with room to spare fits", () => {
    const anchor = { top: 100, left: 100, width: 100, height: 40 };
    expect(placementFits("bottom", anchor, PANEL, VIEWPORT)).toBe(true);
    expect(placementFits("right", anchor, PANEL, VIEWPORT)).toBe(true);
  });

  it("reports that a side with the panel hanging off the edge does not fit", () => {
    const anchor = { top: 40, left: 40, width: 100, height: 40 };
    expect(placementFits("top", anchor, PANEL, VIEWPORT)).toBe(false);
    expect(placementFits("left", anchor, PANEL, VIEWPORT)).toBe(false);
  });

  it("centres the panel under its anchor when the preferred side fits", () => {
    const anchor = { top: 100, left: 100, width: 100, height: 40 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "bottom" });
    expect(result).toEqual({ x: 50, y: 148, placement: "bottom", flipped: false });
  });

  it("flips a bottom panel above its anchor near the bottom of the screen", () => {
    const anchor = { top: 700, left: 400, width: 100, height: 40 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "bottom" });
    expect(result.placement).toBe("top");
    expect(result.flipped).toBe(true);
    expect(result.y).toBe(592);
  });

  it("flips a top panel below its anchor near the top of the screen", () => {
    const anchor = { top: 20, left: 400, width: 100, height: 40 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "top" });
    expect(result.placement).toBe("bottom");
    expect(result.flipped).toBe(true);
    expect(result.y).toBe(68);
  });

  it("flips a left panel to the right of an anchor pinned to the left edge", () => {
    const anchor = { top: 300, left: 50, width: 100, height: 40 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "left" });
    expect(result.placement).toBe("right");
    expect(result.x).toBe(158);
    expect(result.y).toBe(270);
  });

  it("keeps the preferred side when neither side fits, rather than flipping into the same problem", () => {
    const anchor = { top: 50, left: 400, width: 100, height: 20 };
    const result = positionFloating(anchor, PANEL, { width: 1000, height: 120 }, {
      placement: "bottom",
    });
    expect(result.placement).toBe("bottom");
    expect(result.flipped).toBe(false);
  });

  it("keeps a panel wider than its anchor inside the left edge of the viewport", () => {
    const anchor = { top: 300, left: 0, width: 20, height: 20 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "bottom" });
    expect(result.x).toBe(8);
  });

  it("keeps a panel inside the right edge of the viewport", () => {
    const anchor = { top: 300, left: 980, width: 20, height: 20 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "bottom" });
    expect(result.x).toBe(792);
  });

  it("honours a custom gap between anchor and panel", () => {
    const anchor = { top: 100, left: 100, width: 100, height: 40 };
    const result = positionFloating(anchor, PANEL, VIEWPORT, { placement: "bottom", gap: 24 });
    expect(result.y).toBe(164);
  });

  it("falls back to the viewport edge padding when the panel cannot fit at all", () => {
    const anchor = { top: 10, left: 10, width: 10, height: 10 };
    const result = positionFloating(anchor, { width: 4000, height: 4000 }, VIEWPORT);
    expect(result.x).toBe(8);
    expect(result.y).toBe(8);
  });
});

describe("focus ring maths", () => {
  it("moves forward one step inside the ring", () => {
    expect(nextFocusIndex(0, 4, 1)).toBe(1);
  });

  it("wraps to the first element when tabbing off the end", () => {
    expect(nextFocusIndex(3, 4, 1)).toBe(0);
  });

  it("wraps to the last element when shift-tabbing off the start", () => {
    expect(nextFocusIndex(0, 4, -1)).toBe(3);
  });

  it("enters at the first element when focus is not in the ring yet", () => {
    expect(nextFocusIndex(-1, 4, 1)).toBe(0);
  });

  it("enters at the last element when shift-tabbing in from outside", () => {
    expect(nextFocusIndex(-1, 4, -1)).toBe(3);
  });

  it("reports nothing to focus for an empty ring", () => {
    expect(nextFocusIndex(0, 0, 1)).toBe(-1);
    expect(nextFocusIndex(-1, 0, -1)).toBe(-1);
  });

  it("stays on the only element of a single-item ring in both directions", () => {
    expect(nextFocusIndex(0, 1, 1)).toBe(0);
    expect(nextFocusIndex(0, 1, -1)).toBe(0);
  });
});

function toast(id: string, extra: Partial<ToastRecord> = {}): ToastRecord {
  return { id, tone: "default", duration: 5000, dismissible: true, ...extra };
}

function state(ids: string[], maxVisible = 3): ToastState {
  return { items: ids.map((id) => toast(id)), maxVisible };
}

describe("toast queue", () => {
  it("appends a new toast to the end of the queue", () => {
    const next = toastReducer(state(["a"]), { type: "add", toast: toast("b") });
    expect(next.items.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("replaces a toast in place when the same id is added again", () => {
    const next = toastReducer(state(["a", "b"]), {
      type: "add",
      toast: toast("a", { tone: "success" }),
    });
    expect(next.items.map((t) => t.id)).toEqual(["a", "b"]);
    expect(next.items[0]?.tone).toBe("success");
  });

  it("patches an existing toast without reordering the queue", () => {
    const next = toastReducer(state(["a", "b"]), {
      type: "update",
      id: "b",
      patch: { title: "done", tone: "success" },
    });
    expect(next.items[1]?.title).toBe("done");
    expect(next.items[0]?.tone).toBe("default");
  });

  it("ignores an update for a toast that has already gone", () => {
    const before = state(["a"]);
    expect(toastReducer(before, { type: "update", id: "gone", patch: { tone: "danger" } })).toBe(
      before,
    );
  });

  it("removes a toast when it is dismissed", () => {
    const next = toastReducer(state(["a", "b", "c"]), { type: "dismiss", id: "b" });
    expect(next.items.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("dismisses a queued toast that was never shown", () => {
    const next = toastReducer(state(["a", "b", "c", "d"], 2), { type: "dismiss", id: "d" });
    expect(next.items.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps the same state object when dismissing an unknown id", () => {
    const before = state(["a"]);
    expect(toastReducer(before, { type: "dismiss", id: "nope" })).toBe(before);
  });

  it("expires a toast that is on screen", () => {
    const next = toastReducer(state(["a", "b"], 3), { type: "expire", id: "a" });
    expect(next.items.map((t) => t.id)).toEqual(["b"]);
  });

  it("refuses to expire a toast still waiting its turn in the queue", () => {
    const before = state(["a", "b", "c", "d"], 2);
    expect(toastReducer(before, { type: "expire", id: "c" })).toBe(before);
  });

  it("shows only as many toasts as maxVisible allows", () => {
    expect(visibleToasts(state(["a", "b", "c", "d", "e"], 3)).map((t) => t.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("promotes the next queued toast once a visible one leaves", () => {
    const next = toastReducer(state(["a", "b", "c", "d"], 3), { type: "expire", id: "a" });
    expect(visibleToasts(next).map((t) => t.id)).toEqual(["b", "c", "d"]);
  });

  it("shows nothing when maxVisible is zero", () => {
    expect(visibleToasts(state(["a", "b"], 0))).toEqual([]);
  });

  it("empties the whole queue on clear, waiting toasts included", () => {
    const next = toastReducer(state(["a", "b", "c", "d"], 2), { type: "clear" });
    expect(next.items).toEqual([]);
  });

  it("changes how many toasts are visible without touching the queue", () => {
    const next = toastReducer(state(["a", "b", "c"], 1), { type: "configure", maxVisible: 3 });
    expect(next.items.map((t) => t.id)).toEqual(["a", "b", "c"]);
    expect(visibleToasts(next).map((t) => t.id)).toEqual(["a", "b", "c"]);
  });
});
