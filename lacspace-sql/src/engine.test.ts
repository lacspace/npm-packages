import { describe, it, expect } from "vitest";
import { runQuery } from "./run.js";
import { parseSql } from "./parse.js";
import type { DataRow } from "lacspace-scraper";

const people: DataRow[] = [
  { name: "Asha", city: "Kathmandu", age: 30, dept: "eng", salary: 120, manager: null },
  { name: "Bikash", city: "Pokhara", age: 25, dept: "eng", salary: 90, manager: "Asha" },
  { name: "Chandra", city: "Kathmandu", age: 41, dept: "sales", salary: 110, manager: "Asha" },
  { name: "Deepa", city: "Lalitpur", age: 35, dept: "sales", salary: 95, manager: "Chandra" },
  { name: "Esha", city: "Kathmandu", age: 28, dept: "eng", salary: 90, manager: "Asha" },
];

// FROM here is a bare name; runQuery ignores FROM (rows are supplied directly).
const from = "FROM people";

describe("SELECT projection", () => {
  it("select * returns every row and column", () => {
    const rows = runQuery(`SELECT * ${from}`, people);
    expect(rows).toHaveLength(5);
    expect(Object.keys(rows[0]!)).toContain("salary");
  });

  it("select columns + alias", () => {
    const rows = runQuery(`SELECT name, city AS town ${from} LIMIT 1`, people);
    expect(rows[0]).toEqual({ name: "Asha", town: "Kathmandu" });
  });

  it("column matching is case-insensitive", () => {
    const rows = runQuery(`SELECT NAME ${from} WHERE CITY = 'Pokhara'`, people);
    expect(rows).toEqual([{ NAME: "Bikash" }]);
  });
});

describe("WHERE", () => {
  it("numeric comparison compares numerically", () => {
    const rows = runQuery(`SELECT name ${from} WHERE age > 30`, people);
    expect(rows.map((r) => r.name)).toEqual(["Chandra", "Deepa"]);
  });

  it("!= and <> both work", () => {
    const a = runQuery(`SELECT name ${from} WHERE dept != 'eng'`, people);
    const b = runQuery(`SELECT name ${from} WHERE dept <> 'eng'`, people);
    expect(a).toEqual(b);
    expect(a.map((r) => r.name)).toEqual(["Chandra", "Deepa"]);
  });

  it("LIKE with % and _ is case-insensitive", () => {
    const rows = runQuery(`SELECT name ${from} WHERE city LIKE 'k%'`, people);
    expect(rows.map((r) => r.name)).toEqual(["Asha", "Chandra", "Esha"]);
    const one = runQuery(`SELECT name ${from} WHERE name LIKE 'Ash_'`, people);
    expect(one.map((r) => r.name)).toEqual(["Asha"]);
  });

  it("IN list", () => {
    const rows = runQuery(`SELECT name ${from} WHERE city IN ('Pokhara', 'Lalitpur')`, people);
    expect(rows.map((r) => r.name)).toEqual(["Bikash", "Deepa"]);
  });

  it("IS NULL / IS NOT NULL", () => {
    expect(runQuery(`SELECT name ${from} WHERE manager IS NULL`, people).map((r) => r.name)).toEqual(["Asha"]);
    expect(runQuery(`SELECT name ${from} WHERE manager IS NOT NULL`, people)).toHaveLength(4);
  });

  it("AND / OR / NOT with parentheses", () => {
    const rows = runQuery(
      `SELECT name ${from} WHERE (dept = 'eng' AND age < 30) OR city = 'Lalitpur'`,
      people,
    );
    expect(rows.map((r) => r.name).sort()).toEqual(["Bikash", "Deepa", "Esha"]);
    const negated = runQuery(`SELECT name ${from} WHERE NOT dept = 'eng'`, people);
    expect(negated.map((r) => r.name)).toEqual(["Chandra", "Deepa"]);
  });
});

describe("ORDER BY / LIMIT / OFFSET / DISTINCT", () => {
  it("ORDER BY asc and desc", () => {
    const asc = runQuery(`SELECT name ${from} ORDER BY age ASC`, people);
    expect(asc.map((r) => r.name)).toEqual(["Bikash", "Esha", "Asha", "Deepa", "Chandra"]);
    const desc = runQuery(`SELECT name ${from} ORDER BY age DESC`, people);
    expect(desc.map((r) => r.name)).toEqual(["Chandra", "Deepa", "Asha", "Esha", "Bikash"]);
  });

  it("LIMIT with OFFSET", () => {
    const rows = runQuery(`SELECT name ${from} ORDER BY age ASC LIMIT 2 OFFSET 1`, people);
    expect(rows.map((r) => r.name)).toEqual(["Esha", "Asha"]);
  });

  it("DISTINCT removes duplicate projected rows", () => {
    const rows = runQuery(`SELECT DISTINCT dept ${from} ORDER BY dept`, people);
    expect(rows).toEqual([{ dept: "eng" }, { dept: "sales" }]);
  });
});

describe("aggregates + GROUP BY", () => {
  it("whole-table COUNT / SUM / AVG / MIN / MAX", () => {
    const rows = runQuery(
      `SELECT COUNT(*) AS n, SUM(salary) AS total, AVG(age) AS avgAge, MIN(salary) AS lo, MAX(salary) AS hi ${from}`,
      people,
    );
    expect(rows).toEqual([{ n: 5, total: 505, avgAge: (30 + 25 + 41 + 35 + 28) / 5, lo: 90, hi: 120 }]);
  });

  it("COUNT(col) ignores nulls; COUNT(DISTINCT col)", () => {
    expect(runQuery(`SELECT COUNT(manager) AS c ${from}`, people)[0]!.c).toBe(4);
    expect(runQuery(`SELECT COUNT(DISTINCT dept) AS c ${from}`, people)[0]!.c).toBe(2);
  });

  it("GROUP BY with aggregates", () => {
    const rows = runQuery(
      `SELECT dept, COUNT(*) AS n, AVG(salary) AS avgPay ${from} GROUP BY dept ORDER BY dept`,
      people,
    );
    expect(rows).toEqual([
      { dept: "eng", n: 3, avgPay: (120 + 90 + 90) / 3 },
      { dept: "sales", n: 2, avgPay: (110 + 95) / 2 },
    ]);
  });

  it("HAVING filters groups by alias", () => {
    const rows = runQuery(
      `SELECT dept, COUNT(*) AS n ${from} GROUP BY dept HAVING n > 2`,
      people,
    );
    expect(rows).toEqual([{ dept: "eng", n: 3 }]);
  });
});

describe("parsing", () => {
  it("parseSql returns a typed AST", () => {
    const ast = parseSql("SELECT name, COUNT(*) AS n FROM ./x.csv WHERE age > 5 GROUP BY name ORDER BY n DESC LIMIT 3");
    expect(ast.type).toBe("select");
    expect(ast.from).toEqual({ kind: "path", value: "./x.csv" });
    expect(ast.groupBy).toEqual(["name"]);
    expect(ast.orderBy).toEqual([{ column: "n", dir: "desc" }]);
    expect(ast.limit).toBe(3);
  });

  it("invalid SQL throws a clear error", () => {
    expect(() => runQuery("SELECT FROM t", people)).toThrow(/column/i);
    expect(() => runQuery("SELCT * FROM t", people)).toThrow(/select/i);
    expect(() => runQuery("SELECT * FROM t WHERE", people)).toThrow();
    expect(() => runQuery("", people)).toThrow(/empty/i);
  });
});
