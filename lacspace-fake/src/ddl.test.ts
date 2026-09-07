import { describe, it, expect } from "vitest";
import { toSql, toCreateTable, inferSqlType, formatRows, formatDataset } from "./format.js";

const rows = [
  { id: 1, name: "Ada", score: 9.5, active: true, born: "1815-12-10", created: "2020-01-02T03:04:05.000Z", note: null },
  { id: 2, name: "Bob", score: 3.0, active: false, born: "1990-06-01", created: "2021-02-03T04:05:06.000Z", note: "hi" },
];

describe("inferSqlType", () => {
  it("maps values to portable SQL types", () => {
    expect(inferSqlType([1, 2, 3])).toBe("INTEGER");
    expect(inferSqlType([1.5, 2])).toBe("REAL");
    expect(inferSqlType([true, false])).toBe("BOOLEAN");
    expect(inferSqlType(["2020-01-01"])).toBe("DATE");
    expect(inferSqlType(["2020-01-01T00:00:00Z"])).toBe("TIMESTAMP");
    expect(inferSqlType(["hello", "world"])).toBe("TEXT");
    expect(inferSqlType([])).toBe("TEXT");
    expect(inferSqlType([null, undefined])).toBe("TEXT");
  });
});

describe("toCreateTable", () => {
  it("emits a CREATE TABLE with inferred column types", () => {
    const ddl = toCreateTable(rows, "users");
    expect(ddl.startsWith('CREATE TABLE "users" (')).toBe(true);
    expect(ddl.trimEnd().endsWith(");")).toBe(true);
    expect(ddl).toContain('"id" INTEGER NOT NULL');
    expect(ddl).toContain('"name" TEXT NOT NULL');
    expect(ddl).toContain('"score" REAL NOT NULL');
    expect(ddl).toContain('"active" BOOLEAN NOT NULL');
    expect(ddl).toContain('"born" DATE NOT NULL');
    expect(ddl).toContain('"created" TIMESTAMP NOT NULL');
    // note has a null → nullable (no NOT NULL)
    expect(ddl).toContain('"note" TEXT');
    expect(ddl).not.toContain('"note" TEXT NOT NULL');
  });
});

describe("toSql with ddl", () => {
  it("prepends the DDL before the INSERT when ddl:true", () => {
    const out = toSql(rows, "users", { ddl: true });
    expect(out).toContain("CREATE TABLE");
    expect(out).toContain("INSERT INTO");
    expect(out.indexOf("CREATE TABLE")).toBeLessThan(out.indexOf("INSERT INTO"));
  });

  it("omits the DDL by default (backward compatible)", () => {
    const out = toSql(rows, "users");
    expect(out).not.toContain("CREATE TABLE");
    expect(out.startsWith("INSERT INTO")).toBe(true);
  });

  it("formatRows passes ddl through", () => {
    const out = formatRows(rows, { format: "sql", table: "t", ddl: true });
    expect(out).toContain("CREATE TABLE");
  });
});

describe("formatDataset", () => {
  const dataset = {
    users: [{ id: 1, name: "Ada" }],
    orders: [{ id: 1, userId: 1 }],
  };

  it("json emits one object of arrays", () => {
    const out = formatDataset(dataset, { format: "json" });
    expect(JSON.parse(out)).toEqual(dataset);
  });

  it("sql emits an INSERT per table", () => {
    const out = formatDataset(dataset, { format: "sql" });
    expect(out).toContain('INSERT INTO "users"');
    expect(out).toContain('INSERT INTO "orders"');
  });

  it("sql with ddl emits CREATE TABLE per table", () => {
    const out = formatDataset(dataset, { format: "sql", ddl: true });
    expect(out).toContain('CREATE TABLE "users"');
    expect(out).toContain('CREATE TABLE "orders"');
  });

  it("csv sections each table with a header", () => {
    const out = formatDataset(dataset, { format: "csv" });
    expect(out).toContain("# users");
    expect(out).toContain("# orders");
  });
});
