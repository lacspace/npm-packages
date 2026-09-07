import { describe, it, expect } from "vitest";
import { formatRows, formatValues, toCsv, toSql, sqlValue, columnsOf } from "./format.js";

const rows = [
  { id: 1, name: "Ada Lovelace", active: true, note: null },
  { id: 2, name: "O'Brien, Bob", active: false, note: "hi" },
];

describe("json / ndjson", () => {
  it("json produces a parseable array", () => {
    const out = formatRows(rows, { format: "json" });
    expect(JSON.parse(out)).toEqual(rows);
  });
  it("pretty json is indented", () => {
    const out = formatRows(rows, { format: "json", pretty: true });
    expect(out).toContain("\n  ");
  });
  it("ndjson is one object per line", () => {
    const out = formatRows(rows, { format: "ndjson" });
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toEqual(rows[0]);
  });
});

describe("csv", () => {
  it("has a header row and escapes commas/quotes", () => {
    const out = toCsv(rows);
    const lines = out.split("\n");
    expect(lines[0]).toBe("id,name,active,note");
    // "O'Brien, Bob" contains a comma → must be quoted
    expect(lines[2]).toContain('"O\'Brien, Bob"');
  });
  it("doubles embedded double-quotes", () => {
    const out = toCsv([{ v: 'a "b" c' }]);
    expect(out.split("\n")[1]).toBe('"a ""b"" c"');
  });
});

describe("sql", () => {
  it("builds an INSERT with quoted identifiers", () => {
    const out = toSql(rows, "users");
    expect(out.startsWith('INSERT INTO "users" ("id", "name", "active", "note") VALUES')).toBe(true);
    expect(out.trimEnd().endsWith(";")).toBe(true);
  });

  it("escapes single quotes to prevent injection", () => {
    const out = toSql([{ name: "Robert'); DROP TABLE users;--" }], "t");
    expect(out).toContain("'Robert''); DROP TABLE users;--'");
    // the raw unescaped single quote must not appear as a value terminator
    expect(out).not.toContain("'Robert');");
  });

  it("sqlValue renders types correctly", () => {
    expect(sqlValue(5)).toBe("5");
    expect(sqlValue(true)).toBe("TRUE");
    expect(sqlValue(false)).toBe("FALSE");
    expect(sqlValue(null)).toBe("NULL");
    expect(sqlValue(undefined)).toBe("NULL");
    expect(sqlValue("hi")).toBe("'hi'");
    expect(sqlValue({ a: 1 })).toBe(`'{"a":1}'`);
  });

  it("requires a table name", () => {
    expect(() => toSql(rows, "")).toThrow(/table/);
  });
});

describe("helpers", () => {
  it("columnsOf unions keys in first-seen order", () => {
    expect(columnsOf([{ a: 1 }, { b: 2, a: 3 }])).toEqual(["a", "b"]);
  });

  it("formatValues wraps scalars for csv/sql and stays flat for json", () => {
    const vals = ["a@x.com", "b@y.com"];
    expect(JSON.parse(formatValues(vals, "email", { format: "json" }))).toEqual(vals);
    expect(formatValues(vals, "email", { format: "csv" }).split("\n")[0]).toBe("email");
    expect(formatValues(vals, "email", { format: "sql", table: "e" })).toContain("INSERT INTO");
  });
});
