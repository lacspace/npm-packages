import { describe, it, expect } from "vitest";
import { findObsoleteSnapshots, pruneSnapshots, serializeSnapshotFile, parseSnapshotFile } from "./index";

describe("findObsoleteSnapshots", () => {
  it("classifies stored vs used keys", () => {
    const stored = { a: "1", b: "2", c: "3" };
    const report = findObsoleteSnapshots(stored, ["a", "c", "d"]);
    expect(report.obsolete).toEqual(["b"]);
    expect(report.matched).toEqual(["a", "c"]);
    expect(report.missing).toEqual(["d"]);
    expect(report.storedCount).toBe(3);
    expect(report.usedCount).toBe(3);
  });

  it("returns sorted arrays and dedupes used keys", () => {
    const stored = { z: "1", a: "2" };
    const report = findObsoleteSnapshots(stored, ["a", "a"]);
    expect(report.obsolete).toEqual(["z"]);
    expect(report.matched).toEqual(["a"]);
    expect(report.usedCount).toBe(1);
  });

  it("reports nothing obsolete when everything is used", () => {
    const report = findObsoleteSnapshots({ a: "1" }, ["a"]);
    expect(report.obsolete).toEqual([]);
    expect(report.missing).toEqual([]);
  });

  it("accepts a Set of used keys", () => {
    const report = findObsoleteSnapshots({ a: "1", b: "2" }, new Set(["a"]));
    expect(report.obsolete).toEqual(["b"]);
  });
});

describe("pruneSnapshots", () => {
  it("drops obsolete keys and does not mutate the input", () => {
    const stored = { a: "1", b: "2", c: "3" };
    const pruned = pruneSnapshots(stored, ["a", "c"]);
    expect(pruned).toEqual({ a: "1", c: "3" });
    expect(stored).toEqual({ a: "1", b: "2", c: "3" });
  });

  it("round-trips through the .snap file format after pruning", () => {
    const stored = parseSnapshotFile(serializeSnapshotFile({ keep: "K", drop: "D" }));
    const pruned = pruneSnapshots(stored, ["keep"]);
    const reparsed = parseSnapshotFile(serializeSnapshotFile(pruned));
    expect(reparsed).toEqual({ keep: "K" });
  });
});
