import { describe, it, expect } from "vitest";
import { toExample, redactEnv } from "./example.js";

describe("toExample", () => {
  it("blanks values but keeps keys, comments and blank lines", () => {
    const src = "# App config\nAPI_KEY=super-secret\n\nPORT=3000\n";
    expect(toExample(src)).toBe("# App config\nAPI_KEY=\n\nPORT=\n");
  });

  it("supports a custom placeholder and collapses a multiline value", () => {
    const src = 'NAME=alice\nPEM="line1\nline2"\n';
    const out = toExample(src, { placeholder: (k) => `<${k}>` });
    expect(out).toBe("NAME=<NAME>\nPEM=<PEM>\n");
  });
});

describe("redactEnv", () => {
  it("masks values, keeps empty ones empty, and preserves comments", () => {
    const out = redactEnv("# note\nSECRET=AKIAIOSFODNN7EXAMPLE\nEMPTY=\n");
    expect(out).toContain("# note");
    expect(out).toContain("EMPTY=");
    expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
    const secretLine = out.split("\n").find((l) => l.startsWith("SECRET="))!;
    expect(secretLine.startsWith("SECRET=AKI")).toBe(true); // maskSecret hint, not the whole value
  });
});
