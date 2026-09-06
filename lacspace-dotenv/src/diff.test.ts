import { describe, it, expect } from "vitest";
import { diffEnvs, appendKeys } from "./diff.js";

describe("diffEnvs", () => {
  it("reports missing keys in both directions", () => {
    const a = "SHARED=1\nONLY_A=2\n";
    const b = "SHARED=1\nONLY_B=3\n";
    const { missingInA, missingInB } = diffEnvs(a, b);
    expect(missingInA).toEqual(["ONLY_B"]);
    expect(missingInB).toEqual(["ONLY_A"]);
  });

  it("is empty when both declare the same keys", () => {
    expect(diffEnvs("A=1\nB=2\n", "B=x\nA=y\n")).toEqual({ missingInA: [], missingInB: [] });
  });
});

describe("appendKeys", () => {
  it("appends placeholder lines only", () => {
    expect(appendKeys("A=1\n", ["B", "C"])).toBe("A=1\nB=\nC=\n");
  });
  it("adds a newline separator when needed", () => {
    expect(appendKeys("A=1", ["B"])).toBe("A=1\nB=\n");
  });
  it("returns the text unchanged when there is nothing to add", () => {
    expect(appendKeys("A=1\n", [])).toBe("A=1\n");
  });
});
