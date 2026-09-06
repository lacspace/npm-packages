import { describe, it, expect } from "vitest";
import { lintEnv } from "./lint.js";

const rules = (text: string): string[] => lintEnv(text).map((i) => i.rule);

describe("lintEnv", () => {
  it("finds duplicate keys", () => {
    const issues = lintEnv("A=1\nA=2\n");
    const dup = issues.find((i) => i.rule === "duplicate-key");
    expect(dup?.line).toBe(2);
    expect(dup?.key).toBe("A");
  });

  it("warns on non-UPPER_SNAKE_CASE keys", () => {
    expect(rules("apiKey=1\n")).toContain("naming");
    expect(rules("API_KEY=1\n")).not.toContain("naming");
  });

  it("warns on empty values", () => {
    expect(rules("EMPTY=\n")).toContain("empty-value");
  });

  it("warns on spaces around '='", () => {
    expect(rules("KEY = value\n")).toContain("space-around-equals");
    expect(rules("KEY=value\n")).not.toContain("space-around-equals");
  });

  it("warns on trailing whitespace", () => {
    expect(rules("KEY=value   \n")).toContain("trailing-whitespace");
  });

  it("reports syntax errors as errors", () => {
    const issues = lintEnv("this is not valid\n");
    expect(issues.some((i) => i.level === "error" && i.rule === "syntax")).toBe(true);
  });

  it("flags committed secrets with the key name, masked", () => {
    const issues = lintEnv("SECRET=AKIAIOSFODNN7EXAMPLE\n");
    const s = issues.find((i) => i.rule === "secret");
    expect(s?.key).toBe("SECRET");
    expect(s?.message).toContain("SECRET");
    expect(s?.message).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });

  it("returns nothing for a clean file", () => {
    expect(lintEnv("API_KEY=abc\nPORT=3000\n")).toEqual([]);
  });
});
