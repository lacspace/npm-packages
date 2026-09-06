import { describe, it, expect } from "vitest";
import { resultToHistory, summarizeHistory } from "./history.js";
import type { CheckResult, HistoryEntry } from "./types.js";

describe("resultToHistory", () => {
  it("keeps the essentials and drops empties", () => {
    const r: CheckResult = {
      id: "1", label: "Price", url: "u", type: "selector",
      changed: true, alerted: true, baseline: false, before: "$10", after: "$8",
      condition: "decreased", at: "2026-09-06T00:00:00Z",
    };
    const e = resultToHistory(r);
    expect(e).toMatchObject({ label: "Price", before: "$10", after: "$8", condition: "decreased" });
    expect("added" in e).toBe(false);
  });
});

describe("summarizeHistory", () => {
  const entries: HistoryEntry[] = [
    { at: "2026-09-01T00:00:00Z", id: "a", label: "Price", url: "u1", type: "selector", before: "$10", after: "$9" },
    { at: "2026-09-02T00:00:00Z", id: "a", label: "Price", url: "u1", type: "selector", before: "$9", after: "$8" },
    { at: "2026-09-03T00:00:00Z", id: "b", label: "Status", url: "u2", type: "status", before: "200", after: "503" },
    { at: "2026-09-04T00:00:00Z", id: "c", label: "Blog", url: "u3", type: "feed", added: ["x"] },
  ];
  it("totals, first/last and per-type counts", () => {
    const s = summarizeHistory(entries);
    expect(s.total).toBe(4);
    expect(s.first).toBe("2026-09-01T00:00:00Z");
    expect(s.last).toBe("2026-09-04T00:00:00Z");
    expect(s.byType).toEqual({ selector: 2, status: 1, feed: 1 });
  });
  it("ranks busiest watches first", () => {
    const s = summarizeHistory(entries);
    expect(s.byLabel[0]).toMatchObject({ label: "Price", count: 2 });
  });
  it("recent is newest-first and capped", () => {
    const s = summarizeHistory(entries, 2);
    expect(s.recent).toHaveLength(2);
    expect(s.recent[0]!.at).toBe("2026-09-04T00:00:00Z");
  });
  it("handles an empty log", () => {
    const s = summarizeHistory([]);
    expect(s.total).toBe(0);
    expect(s.first).toBeUndefined();
    expect(s.byLabel).toEqual([]);
  });
});
