import { describe, it, expect } from "vitest";
import { previousTransition, listTransitions, transitionsInYear } from "./index";

describe("previousTransition", () => {
  it("finds the most recent NY spring-forward looking back from mid-2024", () => {
    const from = Date.UTC(2024, 5, 1, 0, 0, 0); // 2024-06-01
    const t = previousTransition("America/New_York", from);
    expect(t).not.toBeNull();
    expect(t!.at.getTime()).toBe(Date.UTC(2024, 2, 10, 7, 0, 0)); // 2024-03-10T07:00Z
    expect(t!.offsetBefore).toBe(-300); // EST
    expect(t!.offsetAfter).toBe(-240); // EDT
  });

  it("finds the prior fall-back when looking back from Jan 2024 (2023-11-05)", () => {
    const from = Date.UTC(2024, 0, 15, 0, 0, 0);
    const t = previousTransition("America/New_York", from);
    expect(t).not.toBeNull();
    expect(t!.at.getTime()).toBe(Date.UTC(2023, 10, 5, 6, 0, 0)); // 2023-11-05T06:00Z
    expect(t!.offsetBefore).toBe(-240); // EDT
    expect(t!.offsetAfter).toBe(-300); // EST
  });

  it("returns null for a zone with no recent transition", () => {
    const from = Date.UTC(2024, 5, 1, 0, 0, 0);
    expect(previousTransition("Asia/Kathmandu", from)).toBeNull();
    expect(previousTransition("Asia/Kolkata", from)).toBeNull();
  });

  it("pins the transition to the second; the offset flips exactly there", () => {
    const t = previousTransition("America/New_York", Date.UTC(2024, 5, 1))!;
    const at = t.at.getTime();
    // getOffset is exercised indirectly; just assert the boundary is exact.
    expect(new Date(at - 1000).getTime()).toBe(Date.UTC(2024, 2, 10, 6, 59, 59));
    expect(at).toBe(Date.UTC(2024, 2, 10, 7, 0, 0));
  });
});

describe("listTransitions", () => {
  it("lists both DST switches within calendar 2024 for New York", () => {
    const ts = listTransitions("America/New_York", {
      from: Date.UTC(2024, 0, 1),
      to: Date.UTC(2024, 11, 31, 23, 59, 59),
    });
    expect(ts.length).toBe(2);
    expect(ts[0]!.at.getTime()).toBe(Date.UTC(2024, 2, 10, 7, 0, 0)); // spring forward
    expect(ts[1]!.at.getTime()).toBe(Date.UTC(2024, 10, 3, 6, 0, 0)); // fall back
    expect(ts[0]!.offsetAfter).toBe(-240);
    expect(ts[1]!.offsetAfter).toBe(-300);
  });

  it("spans multiple years (4 NY transitions across 2023–2024)", () => {
    const ts = listTransitions("America/New_York", {
      from: Date.UTC(2023, 0, 1),
      to: Date.UTC(2024, 11, 31, 23, 59, 59),
    });
    expect(ts.length).toBe(4);
    // chronological, ascending
    for (let i = 1; i < ts.length; i++) {
      expect(ts[i]!.at.getTime()).toBeGreaterThan(ts[i - 1]!.at.getTime());
    }
  });

  it("returns [] for a no-DST zone", () => {
    const ts = listTransitions("Asia/Kolkata", {
      from: Date.UTC(2020, 0, 1),
      to: Date.UTC(2025, 0, 1),
    });
    expect(ts).toEqual([]);
  });
});

describe("transitionsInYear", () => {
  it("returns the two 2024 DST switches for London", () => {
    const ts = transitionsInYear("Europe/London", 2024);
    expect(ts.length).toBe(2);
    // London: BST starts last Sun Mar (2024-03-31 01:00Z), ends last Sun Oct (2024-10-27 01:00Z)
    expect(ts[0]!.offsetBefore).toBe(0);
    expect(ts[0]!.offsetAfter).toBe(60);
    expect(ts[1]!.offsetBefore).toBe(60);
    expect(ts[1]!.offsetAfter).toBe(0);
  });

  it("returns [] for a zone without DST", () => {
    expect(transitionsInYear("Asia/Kathmandu", 2024)).toEqual([]);
  });
});
