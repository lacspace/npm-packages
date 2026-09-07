import { describe, it, expect } from "vitest";
import { serializeSnapshotFile, parseSnapshotFile, lineDiff, mismatchMessage } from "./index";

describe("snapfile format", () => {
  it("round-trips a simple snapshot", () => {
    const map = { "example 1": 'Object {\n  "a": 1,\n}' };
    const file = serializeSnapshotFile(map);
    expect(file).toContain("// Lacspace Snapshot v1");
    expect(parseSnapshotFile(file)).toEqual(map);
  });

  it("escapes and round-trips backticks, backslashes and ${} sequences", () => {
    const map = { tricky: "has ` backtick, \\ backslash and ${interp}" };
    const file = serializeSnapshotFile(map);
    expect(parseSnapshotFile(file)).toEqual(map);
  });

  it("round-trips multiple, out-of-order keys deterministically", () => {
    const a = serializeSnapshotFile({ b: "2", a: "1" });
    const b = serializeSnapshotFile({ a: "1", b: "2" });
    expect(a).toBe(b);
    expect(parseSnapshotFile(a)).toEqual({ a: "1", b: "2" });
  });

  it("preserves multi-line content exactly", () => {
    const content = "line1\nline2\n  indented\n";
    const parsed = parseSnapshotFile(serializeSnapshotFile({ k: content }));
    expect(parsed.k).toBe(content);
  });
});

describe("lineDiff", () => {
  it("marks changed lines with - and +", () => {
    const d = lineDiff("a\nb\nc", "a\nX\nc");
    expect(d).toContain("  a");
    expect(d).toContain("- b");
    expect(d).toContain("+ X");
    expect(d).toContain("  c");
  });
  it("mismatchMessage includes the legend", () => {
    const m = mismatchMessage("label", "a", "b");
    expect(m).toContain("label");
    expect(m).toContain("- Expected");
    expect(m).toContain("+ Received");
  });
});
