import { describe, it, expect } from "vitest";
import { parseFields, parseJsonSchema, generateRows } from "./schema.js";

describe("unique constraint", () => {
  it("unique(uuid) yields no duplicates across rows", () => {
    const rows = generateRows(parseFields("id:unique(uuid)"), { count: 500, seed: 1 });
    const values = rows.map((r) => r["id"]);
    expect(new Set(values).size).toBe(values.length);
  });

  it("unique(int(1..N)) exhausts the space exactly and stays distinct", () => {
    const rows = generateRows(parseFields("n:unique(int(1..20))"), { count: 20, seed: 5 });
    const values = rows.map((r) => r["n"]) as number[];
    expect(new Set(values).size).toBe(20);
    expect([...values].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("throws when the value space is too small for the row count", () => {
    expect(() => generateRows(parseFields("n:unique(int(1..3))"), { count: 10, seed: 1 })).toThrow(
      /unique value/i,
    );
  });

  it("non-unique fields may repeat (control)", () => {
    const rows = generateRows(parseFields("r:oneOf(a|b)"), { count: 50, seed: 2 });
    const values = rows.map((r) => r["r"]);
    expect(new Set(values).size).toBeLessThan(values.length);
  });

  it("unique via JSON schema object form", () => {
    const rows = generateRows(
      parseJsonSchema({ id: { type: "int", min: 1, max: 1000, unique: true } }),
      { count: 100, seed: 9 },
    );
    const values = rows.map((r) => r["id"]);
    expect(new Set(values).size).toBe(100);
  });

  it("unique is deterministic under a seed", () => {
    const a = generateRows(parseFields("id:unique(int(1..999))"), { count: 50, seed: 3 });
    const b = generateRows(parseFields("id:unique(int(1..999))"), { count: 50, seed: 3 });
    expect(a).toEqual(b);
  });
});

describe("weighted enums", () => {
  it("respects the weight distribution over a fixed seed", () => {
    const rows = generateRows(parseFields("role:weighted(admin:1|user:9)"), { count: 2000, seed: 4 });
    const counts = { admin: 0, user: 0 } as Record<string, number>;
    for (const r of rows) counts[String(r["role"])]!++;
    // ~10% admin, ~90% user — assert the ordering & rough ratio, not an exact count.
    expect(counts["user"]!).toBeGreaterThan(counts["admin"]! * 4);
    expect(counts["admin"]!).toBeGreaterThan(0);
    // deterministic: same seed → same tallies
    const rows2 = generateRows(parseFields("role:weighted(admin:1|user:9)"), { count: 2000, seed: 4 });
    expect(rows2).toEqual(rows);
  });

  it("only ever returns declared options", () => {
    const rows = generateRows(parseFields("t:weighted(x:2|y:2|z:1)"), { count: 200, seed: 6 });
    for (const r of rows) expect(["x", "y", "z"]).toContain(r["t"]);
  });
});
