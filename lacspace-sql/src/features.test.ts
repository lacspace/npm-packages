import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runQuery } from "./run.js";
import { query, globFiles } from "./run.js";
import { parseSql, parseStatement } from "./parse.js";
import { evalValue, makeGetter } from "./evaluate.js";
import { toMarkdown } from "./format.js";
import type { DataRow } from "lacspace-scraper";
import type { ValueExpr } from "./parse.js";

const rows: DataRow[] = [
  { name: "Asha", city: "Kathmandu", price: 100, qty: 2, tier: "gold", manager: null },
  { name: "Bikash", city: "Pokhara", price: 90, qty: 3, tier: "silver", manager: "Asha" },
  { name: "Chandra", city: "Kathmandu", price: 110, qty: 1, tier: null, manager: "Asha" },
  { name: "Deepa", city: "Lalitpur", price: 95, qty: 4, tier: "gold", manager: "Chandra" },
];
const from = "FROM t";

// ---- 2. expressions & scalar functions ----

describe("expressions & scalar functions", () => {
  it("arithmetic computed column (price * qty)", () => {
    const out = runQuery(`SELECT name, price * qty AS total ${from} ORDER BY total DESC`, rows);
    expect(out[0]).toEqual({ name: "Deepa", total: 380 });
    expect(out.map((r) => r.total)).toEqual([380, 270, 200, 110]);
  });

  it("mixed +,-,%,/ with precedence and parentheses", () => {
    const out = runQuery(`SELECT (price + 10) * 2 AS a, price % 7 AS m, price / qty AS per ${from} LIMIT 1`, rows);
    expect(out[0]).toEqual({ a: 220, m: 100 % 7, per: 50 });
  });

  it("string functions UPPER/LOWER/TRIM/LENGTH/SUBSTR/REPLACE/CONCAT/COALESCE", () => {
    const out = runQuery(
      `SELECT UPPER(name) AS u, SUBSTR(name, 1, 2) AS s, REPLACE(city,'Kath','K') AS r, CONCAT(name,'@',city) AS e, COALESCE(tier,'none') AS t ${from} LIMIT 1`,
      rows,
    );
    expect(out[0]).toEqual({ u: "ASHA", s: "As", r: "Kmandu", e: "Asha@Kathmandu", t: "gold" });
    const c = runQuery(`SELECT COALESCE(tier,'none') AS t ${from} WHERE name = 'Chandra'`, rows);
    expect(c[0]).toEqual({ t: "none" });
  });

  it("numeric functions ROUND/ABS/FLOOR/CEIL/MOD", () => {
    const out = runQuery(
      `SELECT ROUND(price / qty, 1) AS avg, ABS(0 - price) AS ab, FLOOR(price / qty) AS fl, CEIL(price / qty) AS ce, MOD(price, qty) AS md ${from} WHERE name='Bikash'`,
      rows,
    );
    expect(out[0]).toEqual({ avg: 30, ab: 90, fl: 30, ce: 30, md: 0 });
  });

  it("expressions work in WHERE too", () => {
    const out = runQuery(`SELECT name ${from} WHERE price * qty > 250`, rows);
    expect(out.map((r) => r.name)).toEqual(["Bikash", "Deepa"]);
  });

  it("evalValue is exported and usable directly", () => {
    const expr: ValueExpr = { kind: "binary", op: "+", left: { kind: "literal", value: 2 }, right: { kind: "literal", value: 3 } };
    expect(evalValue(expr, {}, makeGetter())).toBe(5);
  });
});

// ---- CASE ----

describe("CASE WHEN … THEN … ELSE … END", () => {
  it("maps values with ELSE fallback", () => {
    const out = runQuery(
      `SELECT name, CASE WHEN price >= 100 THEN 'high' WHEN price >= 95 THEN 'mid' ELSE 'low' END AS band ${from}`,
      rows,
    );
    expect(out.map((r) => r.band)).toEqual(["high", "low", "high", "mid"]);
  });

  it("CASE without ELSE yields null", () => {
    const out = runQuery(`SELECT CASE WHEN city = 'Pokhara' THEN 1 END AS p ${from}`, rows);
    expect(out.map((r) => r.p)).toEqual([null, 1, null, null]);
  });
});

// ---- 3. more WHERE operators ----

describe("BETWEEN / NOT IN / NOT LIKE / LIKE ESCAPE", () => {
  it("BETWEEN and NOT BETWEEN are inclusive", () => {
    expect(runQuery(`SELECT name ${from} WHERE price BETWEEN 95 AND 110`, rows).map((r) => r.name))
      .toEqual(["Asha", "Chandra", "Deepa"]);
    expect(runQuery(`SELECT name ${from} WHERE price NOT BETWEEN 95 AND 110`, rows).map((r) => r.name))
      .toEqual(["Bikash"]);
  });

  it("NOT IN and NOT LIKE", () => {
    expect(runQuery(`SELECT name ${from} WHERE city NOT IN ('Kathmandu')`, rows).map((r) => r.name))
      .toEqual(["Bikash", "Deepa"]);
    expect(runQuery(`SELECT name ${from} WHERE name NOT LIKE 'A%'`, rows).map((r) => r.name))
      .toEqual(["Bikash", "Chandra", "Deepa"]);
  });

  it("LIKE … ESCAPE treats the escaped metachar literally", () => {
    const pct: DataRow[] = [{ code: "50%" }, { code: "500" }, { code: "5x0" }];
    const out = runQuery(`SELECT code FROM t WHERE code LIKE '50!%' ESCAPE '!'`, pct);
    expect(out).toEqual([{ code: "50%" }]);
  });
});

// ---- 8. ORDER BY NULLS FIRST/LAST ----

describe("ORDER BY multi-key + NULLS FIRST|LAST", () => {
  it("multi-key sort", () => {
    const out = runQuery(`SELECT name, tier ${from} ORDER BY city ASC, price DESC`, rows);
    expect(out.map((r) => r.name)).toEqual(["Chandra", "Asha", "Deepa", "Bikash"]);
  });

  it("NULLS FIRST vs LAST", () => {
    const last = runQuery(`SELECT name ${from} ORDER BY tier ASC NULLS LAST`, rows);
    expect(last.map((r) => r.name)[3]).toBe("Chandra"); // the null tier goes last
    const first = runQuery(`SELECT name ${from} ORDER BY tier ASC NULLS FIRST`, rows);
    expect(first.map((r) => r.name)[0]).toBe("Chandra"); // the null tier goes first
  });
});

// ---- 4. UNION ----

describe("UNION / UNION ALL (in memory)", () => {
  const a: DataRow[] = [{ name: "Asha" }, { name: "Bikash" }];
  it("UNION dedupes; UNION ALL keeps duplicates", () => {
    const u = runQuery("SELECT name FROM t WHERE name='Asha' UNION SELECT name FROM t", a);
    expect(u.map((r) => r.name).sort()).toEqual(["Asha", "Bikash"]);
    const ua = runQuery("SELECT name FROM t WHERE name='Asha' UNION ALL SELECT name FROM t", a);
    expect(ua.map((r) => r.name)).toEqual(["Asha", "Asha", "Bikash"]);
  });

  it("parseStatement produces a union node", () => {
    const stmt = parseStatement("SELECT a FROM x.csv UNION ALL SELECT b FROM y.csv");
    expect(stmt.type).toBe("union");
  });
});

// ---- 6. markdown formatter ----

describe("markdown formatter", () => {
  const data: DataRow[] = [{ name: "Asha", city: "Kathmandu" }, { name: "Bikash", city: "Pok|hara" }];
  it("renders a GFM table and escapes pipes", () => {
    const md = toMarkdown(data);
    const lines = md.split("\n");
    expect(lines[0]).toBe("| name | city |");
    expect(lines[1]).toBe("| --- | --- |");
    expect(lines[2]).toBe("| Asha | Kathmandu |");
    expect(lines[3]).toContain("Pok\\|hara");
  });

  it("--no-header omits the header + separator", () => {
    const md = toMarkdown(data, { noHeader: true });
    const lines = md.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("| Asha | Kathmandu |");
  });
});

// ---- AST / parse ----

describe("parse: joins & aliases in the AST", () => {
  it("captures tables, aliases and the ON expression", () => {
    const ast = parseSql("SELECT x.id FROM a.csv x JOIN b.csv y ON x.id = y.aid");
    expect(ast.from).toEqual({ kind: "path", value: "a.csv" });
    expect(ast.tables.map((t) => t.alias)).toEqual(["x", "y"]);
    expect(ast.joins).toHaveLength(1);
    expect(ast.joins[0]!.kind).toBe("inner");
    expect(ast.joins[0]!.on?.type).toBe("compare");
  });

  it("LEFT JOIN and comma cross-join parse", () => {
    expect(parseSql("SELECT * FROM a.csv LEFT JOIN b.csv ON a.id = b.id").joins[0]!.kind).toBe("left");
    expect(parseSql("SELECT * FROM a.csv, b.csv").joins[0]!.kind).toBe("cross");
  });

  it("globFiles matches a directory", () => {
    // covered functionally in the file-backed suite; here just ensure no throw on a miss
    expect(globFiles("/definitely/not/here/*.csv")).toEqual([]);
  });
});

// ---- 1 & 5. file-backed: JOINs, glob, stdin binding ----

describe("file-backed features (JOIN inner+left, glob, bound tables)", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "lsql-"));
    writeFileSync(join(dir, "users.csv"), "id,name\n1,Asha\n2,Bikash\n3,Chandra\n");
    writeFileSync(join(dir, "users2.csv"), "id,name\n4,Deepa\n");
    writeFileSync(join(dir, "orders.json"), JSON.stringify([
      { user_id: 1, amount: 100 },
      { user_id: 1, amount: 50 },
      { user_id: 2, amount: 75 },
      { user_id: 9, amount: 10 },
    ]));
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("INNER JOIN matches on the key, qualified columns resolve", async () => {
    const out = await query(
      `SELECT u.name, o.amount FROM ${join(dir, "users.csv")} u JOIN ${join(dir, "orders.json")} o ON u.id = o.user_id ORDER BY o.amount`,
    );
    expect(out).toEqual([
      { name: "Asha", amount: 50 },
      { name: "Bikash", amount: 75 },
      { name: "Asha", amount: 100 },
    ]);
  });

  it("LEFT JOIN keeps unmatched left rows with null right columns", async () => {
    const out = await query(
      `SELECT u.name, o.amount FROM ${join(dir, "users.csv")} u LEFT JOIN ${join(dir, "orders.json")} o ON u.id = o.user_id ORDER BY u.name, o.amount NULLS LAST`,
    );
    // Chandra (id 3) has no order → one row with null amount
    const chandra = out.filter((r) => r.name === "Chandra");
    expect(chandra).toEqual([{ name: "Chandra", amount: null }]);
    expect(out.filter((r) => r.name === "Asha")).toHaveLength(2);
  });

  it("aggregate over a JOIN", async () => {
    const out = await query(
      `SELECT u.name, SUM(o.amount) AS spent FROM ${join(dir, "users.csv")} u JOIN ${join(dir, "orders.json")} o ON u.id = o.user_id GROUP BY u.name ORDER BY spent DESC`,
    );
    expect(out).toEqual([{ name: "Asha", spent: 150 }, { name: "Bikash", spent: 75 }]);
  });

  it("glob FROM unions matching files", async () => {
    const out = await query(`SELECT COUNT(*) AS n FROM '${join(dir, "users*.csv")}'`);
    expect(out).toEqual([{ n: 4 }]);
  });

  it("UNION across two files", async () => {
    const out = await query(
      `SELECT name FROM ${join(dir, "users.csv")} UNION SELECT name FROM ${join(dir, "users2.csv")} ORDER BY name`,
    );
    expect(out.map((r) => r.name)).toEqual(["Asha", "Bikash", "Chandra", "Deepa"]);
  });

  it("a bound table (as stdin would be) resolves via opts.tables", async () => {
    const out = await query("SELECT name FROM stdin WHERE id = 2", { tables: { stdin: join(dir, "users.csv") } });
    expect(out).toEqual([{ name: "Bikash" }]);
  });

  it("preloaded rows bind a table name without touching disk", async () => {
    const out = await query("SELECT COUNT(*) AS n FROM feed", { preloaded: { feed: [{ a: 1 }, { a: 2 }] } });
    expect(out).toEqual([{ n: 2 }]);
  });
});
