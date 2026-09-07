import { describe, it, expect } from "vitest";
import {
  parseFields,
  parseJsonSchema,
  parseArgString,
  generateRows,
  generateValues,
} from "./schema.js";

describe("inline field parsing", () => {
  it("parses key:generator pairs in order", () => {
    const fields = parseFields("id:autoincrement,name:fullName,email:email");
    expect(fields.map((f) => f.key)).toEqual(["id", "name", "email"]);
  });

  it("parses generator args with .. and |", () => {
    expect(parseArgString("18..65")).toEqual([18, 65]);
    expect(parseArgString("admin|user|guest")).toEqual(["admin", "user", "guest"]);
    expect(parseArgString("")).toEqual([]);
  });

  it("throws on a field without a colon", () => {
    expect(() => parseFields("justname")).toThrow(/key:generator/);
  });

  it("throws on an unknown generator", () => {
    expect(() => parseFields("x:bogusGen")).toThrow(/Unknown generator/);
  });
});

describe("row generation determinism", () => {
  const spec = "id:autoincrement,name:fullName,email:email,age:int(18..65),role:oneOf(admin|user)";

  it("same seed → identical rows", () => {
    const a = generateRows(parseFields(spec), { count: 10, seed: 42 });
    const b = generateRows(parseFields(spec), { count: 10, seed: 42 });
    expect(a).toEqual(b);
  });

  it("different seed → different rows", () => {
    const a = generateRows(parseFields(spec), { count: 5, seed: 1 });
    const b = generateRows(parseFields(spec), { count: 5, seed: 2 });
    expect(a).not.toEqual(b);
  });

  it("count controls row length", () => {
    expect(generateRows(parseFields(spec), { count: 7, seed: 1 })).toHaveLength(7);
    expect(generateRows(parseFields(spec), { count: 0, seed: 1 })).toHaveLength(0);
  });

  it("autoincrement counts up from 1", () => {
    const rows = generateRows(parseFields("id:autoincrement"), { count: 3, seed: 1 });
    expect(rows.map((r) => r["id"])).toEqual([1, 2, 3]);
  });

  it("email derives from firstName/lastName earlier in the row", () => {
    const rows = generateRows(parseFields("firstName:firstName,lastName:lastName,email:email"), {
      count: 5,
      seed: 9,
    });
    for (const r of rows) {
      const first = String(r["firstName"]).toLowerCase();
      expect(String(r["email"]).toLowerCase()).toContain(first);
    }
  });

  it("oneOf values only come from the option set", () => {
    const rows = generateRows(parseFields("role:oneOf(admin|user)"), { count: 40, seed: 3 });
    for (const r of rows) expect(["admin", "user"]).toContain(r["role"]);
  });
});

describe("JSON schema", () => {
  it("maps fields → specs", () => {
    const rows = generateRows(
      parseJsonSchema({ id: "autoincrement", name: "fullName", age: "int(18..30)" }),
      { count: 3, seed: 5 },
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]!["id"]).toBe(1);
    expect(rows[0]!["age"]).toBeGreaterThanOrEqual(18);
  });

  it("supports arrays with a fixed count", () => {
    const rows = generateRows(
      parseJsonSchema({ tags: { type: "array", of: "word", count: 3 } }),
      { count: 1, seed: 1 },
    );
    expect(Array.isArray(rows[0]!["tags"])).toBe(true);
    expect(rows[0]!["tags"]).toHaveLength(3);
  });

  it("supports nested objects", () => {
    const rows = generateRows(
      parseJsonSchema({
        id: "autoincrement",
        profile: { type: "object", properties: { city: "city", zip: "zip" } },
      }),
      { count: 1, seed: 2 },
    );
    const profile = rows[0]!["profile"] as Record<string, unknown>;
    expect(typeof profile["city"]).toBe("string");
    expect(typeof profile["zip"]).toBe("string");
  });

  it("supports generator-object form with min/max", () => {
    const rows = generateRows(
      parseJsonSchema({ score: { type: "int", min: 1, max: 5 } }),
      { count: 20, seed: 4 },
    );
    for (const r of rows) {
      expect(r["score"]).toBeGreaterThanOrEqual(1);
      expect(r["score"]).toBeLessThanOrEqual(5);
    }
  });

  it("accepts a { fields: {...} } wrapper", () => {
    const rows = generateRows(parseJsonSchema({ fields: { n: "int(1..2)" } }), { count: 2, seed: 1 });
    expect(rows).toHaveLength(2);
  });

  it("rejects a non-object schema", () => {
    expect(() => parseJsonSchema("nope")).toThrow();
  });
});

describe("single-generator values", () => {
  it("generateValues is deterministic and length-correct", () => {
    const a = generateValues("email", { count: 5, seed: 1 });
    const b = generateValues("email", { count: 5, seed: 1 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });

  it("accepts inline args in the spec string", () => {
    const vals = generateValues("int(1..2)", { count: 30, seed: 7 }) as number[];
    expect(vals.every((v) => v === 1 || v === 2)).toBe(true);
  });
});
