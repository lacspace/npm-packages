import { describe, it, expect } from "vitest";
import { gradeOf, scoreFindings, overallScore, makeCategory } from "./grade.js";
import type { Finding } from "./types.js";

describe("gradeOf", () => {
  it("maps scores to letters at the right thresholds", () => {
    expect(gradeOf(100)).toBe("A");
    expect(gradeOf(90)).toBe("A");
    expect(gradeOf(89)).toBe("B");
    expect(gradeOf(80)).toBe("B");
    expect(gradeOf(79)).toBe("C");
    expect(gradeOf(70)).toBe("C");
    expect(gradeOf(69)).toBe("D");
    expect(gradeOf(60)).toBe("D");
    expect(gradeOf(59)).toBe("F");
    expect(gradeOf(0)).toBe("F");
  });
});

describe("scoreFindings", () => {
  it("weights ok=1, warn=0.5, fail=0 and ignores info", () => {
    const f: Finding[] = [
      { id: "a", status: "ok", message: "" },
      { id: "b", status: "warn", message: "" },
      { id: "c", status: "fail", message: "" },
      { id: "d", status: "info", message: "" },
    ];
    // (1 + 0.5 + 0) / 3 = 0.5 -> 50
    expect(scoreFindings(f)).toBe(50);
  });

  it("returns null when nothing is gradeable", () => {
    expect(scoreFindings([{ id: "a", status: "info", message: "" }])).toBeNull();
    expect(scoreFindings([])).toBeNull();
  });

  it("honours per-finding weight", () => {
    const f: Finding[] = [
      { id: "a", status: "ok", message: "", weight: 3 },
      { id: "b", status: "fail", message: "", weight: 1 },
    ];
    // (3 + 0) / 4 = 0.75 -> 75
    expect(scoreFindings(f)).toBe(75);
  });
});

describe("overallScore", () => {
  it("weights graded categories and skips un-graded ones", () => {
    const cats = [
      makeCategory("seo", "SEO", 2, [{ id: "x", status: "ok", message: "" }]),      // 100
      makeCategory("content", "Content", 1, [{ id: "y", status: "fail", message: "" }]), // 0
      makeCategory("tech", "Tech", 0, [{ id: "z", status: "info", message: "" }]),    // null -> skipped
    ];
    // (100*2 + 0*1) / 3 = 66.67 -> 67
    expect(overallScore(cats)).toBe(67);
  });
});
