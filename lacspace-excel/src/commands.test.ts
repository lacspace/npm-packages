import { test, expect, describe } from "vitest";
import { readWorkbook } from "@lacspace/xlsx";
import {
  convertData,
  inspectData,
  addFormulaColumns,
  parseFormulaAdd,
  validateFormulaAdds,
  FormulaColumnError,
  dedupeRows,
  splitWorkbook,
  mergeTables,
  uniqueSheetNames,
  sanitizeSheetName,
  sheetNameFromPath,
  functionReference,
  formatFromPath,
  formatFromExtension,
  formatBytes,
  parseSheetRef,
  type Row,
} from "./commands";
import { buildTemplate } from "./templates";

const ROWS: Row[] = [
  { sku: "A-1", name: "Widget", qty: 2, rate: 5.5, note: "first" },
  { sku: "B-2", name: "Gadget", qty: 1, rate: 12, note: null },
  { sku: "C-3", name: "Doohickey", qty: 4, rate: 3.25, note: "bulk" },
];

const NESTED: Row[] = [
  { id: 1, customer: { name: "Ada", address: { city: "Lisbon" } } },
  { id: 2, customer: { name: "Ivy", address: { city: "Oslo" } } },
];

/* ------------------------------ formats ------------------------------ */

describe("formatFromPath / formatFromExtension", () => {
  const cases: [string, string][] = [
    ["a.xlsx", "xlsx"], ["a.csv", "csv"], ["a.tsv", "tsv"], ["a.json", "json"], ["a.ndjson", "ndjson"], ["a.jsonl", "ndjson"],
    ["a.yaml", "yaml"], ["a.yml", "yaml"], ["a.toml", "toml"], ["a.md", "markdown"], ["a.markdown", "markdown"],
    ["a.html", "html"], ["a.htm", "html"], ["a.sql", "sql"],
  ];
  for (const [path, fmt] of cases) {
    test(`${path} → ${fmt}`, () => { expect(formatFromPath(path)).toBe(fmt); });
  }
  test("is case-insensitive and path-aware", () => {
    expect(formatFromPath("out/dir/Report.XLSX")).toBe("xlsx");
    expect(formatFromPath("C:\\data\\x.CSV")).toBe("csv");
  });
  test("returns undefined for unknown / missing extensions", () => {
    expect(formatFromPath("README")).toBeUndefined();
    expect(formatFromPath("archive.zip")).toBeUndefined();
    expect(formatFromPath(".gitignore")).toBeUndefined();
    expect(formatFromExtension("")).toBeUndefined();
  });
  test("formatFromExtension accepts a leading dot", () => {
    expect(formatFromExtension(".yml")).toBe("yaml");
    expect(formatFromExtension("XLSX")).toBe("xlsx");
  });
});

/* ------------------------------ convert ------------------------------ */

describe("convertData", () => {
  test("json → xlsx → json round trip keeps values and types", async () => {
    const xlsx = await convertData(JSON.stringify(ROWS), { to: "xlsx" });
    expect(xlsx.output).toBeInstanceOf(Uint8Array);
    expect(xlsx.rows).toBe(3);
    expect(xlsx.tables).toBe(1);
    expect(xlsx.from).toBe("json");
    expect(xlsx.bytes).toBeGreaterThan(100);

    const back = await convertData(xlsx.output as Uint8Array, { to: "json" });
    expect(back.from).toBe("xlsx");
    const rows = JSON.parse(back.output as string) as Row[];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ sku: "A-1", name: "Widget", qty: 2, rate: 5.5, note: "first" });
    expect(rows[1]!.note).toBeNull();
  });

  test("csv → markdown with a column subset in the given order", async () => {
    const csv = "sku,name,qty\nA-1,Widget,2\nB-2,Gadget,1\n";
    const md = await convertData(csv, { from: "csv", to: "markdown", columns: ["qty", "sku"] });
    const text = md.output as string;
    expect(text.split("\n")[0]).toBe("| qty | sku |");
    expect(text).toContain("| 2 | A-1 |");
    expect(text).not.toContain("Widget");
  });

  test("rename maps column names", async () => {
    const out = await convertData(ROWS, { to: "csv", rename: { sku: "code", qty: "quantity" }, columns: ["sku", "qty"] });
    expect((out.output as string).split("\n")[0]).toBe("code,quantity");
  });

  test("flatten turns nested objects into dotted columns", async () => {
    const out = await convertData(NESTED, { to: "csv", flatten: true });
    const lines = (out.output as string).trim().split("\n");
    expect(lines[0]).toBe("id,customer.name,customer.address.city");
    expect(lines[1]).toBe("1,Ada,Lisbon");
  });

  test("unflatten rebuilds nested objects from dotted csv columns", async () => {
    const csv = "id,customer.name,customer.address.city\n1,Ada,Lisbon\n";
    const out = await convertData(csv, { from: "csv", to: "json", unflatten: true });
    const rows = JSON.parse(out.output as string) as Row[];
    expect(rows[0]).toEqual({ id: 1, customer: { name: "Ada", address: { city: "Lisbon" } } });
  });

  test("sheet picks one table by index or name", async () => {
    const book = mergeTables([{ name: "Alpha", rows: [{ a: 1 }] }, { name: "Beta", rows: [{ b: 2 }, { b: 3 }] }]);
    const byName = await convertData(book, { to: "json", sheet: "Beta" });
    expect(JSON.parse(byName.output as string)).toEqual([{ b: 2 }, { b: 3 }]);
    const byIndex = await convertData(book, { to: "json", sheet: 0 });
    expect(JSON.parse(byIndex.output as string)).toEqual([{ a: 1 }]);
    await expect(convertData(book, { to: "json", sheet: "Nope" })).rejects.toThrow(/Sheet not found/);
  });

  test("infer:false keeps csv cells as text; default coerces numbers", async () => {
    const csv = "id,qty\n007,2\n";
    const typed = JSON.parse((await convertData(csv, { from: "csv", to: "json" })).output as string) as Row[];
    expect(typed[0]!.qty).toBe(2);
    const raw = JSON.parse((await convertData(csv, { from: "csv", to: "json", infer: false })).output as string) as Row[];
    expect(raw[0]!.qty).toBe("2");
  });

  test("sql output with ddl and a table name", async () => {
    const out = await convertData(ROWS.slice(0, 1), { to: "sql", ddl: true, tableName: "items" });
    const sql = out.output as string;
    expect(sql).toMatch(/CREATE TABLE "items"/);
    expect(sql).toMatch(/INSERT INTO "items"/);
  });

  test("throws a clear error when the format cannot be detected", async () => {
    await expect(convertData("just some prose without structure", { to: "json" })).rejects.toThrow(/detect/);
  });
});

/* ------------------------------ inspect ------------------------------ */

describe("inspectData", () => {
  test("reports name, row count, schema with nullable and sample rows", async () => {
    const report = await inspectData(JSON.stringify(ROWS));
    expect(report.format).toBe("json");
    expect(report.tables).toHaveLength(1);
    const t = report.tables[0]!;
    expect(t.rows).toBe(3);
    expect(t.columns.map((c) => c.name)).toEqual(["sku", "name", "qty", "rate", "note"]);
    const byName = Object.fromEntries(t.columns.map((c) => [c.name, c]));
    expect(byName["qty"]!.type).toBe("number");
    expect(byName["sku"]!.type).toBe("string");
    expect(byName["note"]!.nullable).toBe(true);
    expect(byName["qty"]!.nullable).toBe(false);
    expect(byName["qty"]!.samples.length).toBeGreaterThan(0);
    expect(t.sample).toHaveLength(3);
  });

  test("respects the samples limit and reads every xlsx sheet by name", async () => {
    const book = mergeTables([{ name: "One", rows: ROWS }, { name: "Two", rows: [{ z: true }] }]);
    const report = await inspectData(book, "xlsx", { samples: 2 });
    expect(report.tables.map((t) => t.name)).toEqual(["One", "Two"]);
    expect(report.tables[0]!.sample).toHaveLength(2);
    expect(report.tables[1]!.columns[0]).toMatchObject({ name: "z", type: "boolean" });
  });
});

/* ------------------------------ formula ------------------------------ */

describe("addFormulaColumns", () => {
  test("computes a column per row", () => {
    const out = addFormulaColumns(ROWS, [{ key: "amount", formula: "=qty*rate" }]);
    expect(out.map((r) => r.amount)).toEqual([11, 12, 13]);
    expect(ROWS[0]).not.toHaveProperty("amount"); // input untouched
  });

  test("chains: later adds see earlier keys, with functions", () => {
    const out = addFormulaColumns(ROWS, [
      { key: "amount", formula: "qty*rate" },
      { key: "tax", formula: "=ROUND(amount*0.13,2)" },
      { key: "total", formula: "=amount+tax" },
      { key: "big", formula: '=IF(total>12,"yes","no")' },
    ]);
    expect(out[0]).toMatchObject({ amount: 11, tax: 1.43, total: 12.43, big: "yes" });
    expect(out[1]!.big).toBe("yes");
  });

  test("flattens nested rows so dotted keys are addressable", () => {
    const out = addFormulaColumns(NESTED, [{ key: "label", formula: '=UPPER(customer.name)&" / "&customer.address.city' }]);
    expect(out[0]!.label).toBe("ADA / Lisbon");
    expect(out[0]).toHaveProperty("customer.name", "Ada");
  });

  test("aggregate functions see the whole column", () => {
    const out = addFormulaColumns(ROWS, [{ key: "share", formula: "=ROUND(qty/SUM(qty),4)" }]);
    expect(out.map((r) => r.share)).toEqual([0.2857, 0.1429, 0.5714]);
  });

  test("invalid formula throws before computing, with the position when known", () => {
    expect(() => addFormulaColumns(ROWS, [{ key: "x", formula: "=qty*" }])).toThrow(FormulaColumnError);
    let err: unknown;
    try { addFormulaColumns(ROWS, [{ key: "x", formula: "=qty ) rate" }]); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(FormulaColumnError);
    const fe = err as FormulaColumnError;
    expect(fe.key).toBe("x");
    expect(fe.message).toMatch(/Invalid formula for "x"/);
    expect(typeof fe.position).toBe("number");
    expect(fe.message).toMatch(/position \d+/);
  });

  test("validates all adds up front and refuses prototype keys", () => {
    expect(() => validateFormulaAdds([{ key: "ok", formula: "1+1" }, { key: "bad", formula: "((" }])).toThrow(/"bad"/);
    expect(() => addFormulaColumns(ROWS, [{ key: "__proto__", formula: "1" }])).toThrow(/not an allowed/);
  });

  test("parseFormulaAdd splits on the first '=' and keeps the rest verbatim", () => {
    expect(parseFormulaAdd("total=amount+tax")).toEqual({ key: "total", formula: "amount+tax" });
    expect(parseFormulaAdd('flag = IF(a=1,"x","y")')).toEqual({ key: "flag", formula: 'IF(a=1,"x","y")' });
    expect(() => parseFormulaAdd("nokey")).toThrow(/key=<formula>/);
    expect(() => parseFormulaAdd("=x")).toThrow();
  });
});

/* ------------------------------ dedupe ------------------------------ */

describe("dedupeRows", () => {
  test("by all columns (order-insensitive keys) keeps the first", () => {
    const rows: Row[] = [{ a: 1, b: "x" }, { b: "x", a: 1 }, { a: 1, b: "y" }, { a: 1, b: "x" }];
    const r = dedupeRows(rows);
    expect(r.removed).toBe(2);
    expect(r.rows).toEqual([{ a: 1, b: "x" }, { a: 1, b: "y" }]);
  });

  test("by key columns keeps the first row per key", () => {
    const rows: Row[] = [{ sku: "A", n: 1 }, { sku: "B", n: 2 }, { sku: "A", n: 3 }, { sku: "b", n: 4 }];
    const r = dedupeRows(rows, ["sku"]);
    expect(r.removed).toBe(1);
    expect(r.rows.map((x) => x.n)).toEqual([1, 2, 4]);
  });

  test("distinguishes types and treats blanks as equal; empty by falls back to all columns", () => {
    const rows: Row[] = [{ v: 1 }, { v: "1" }, { v: null }, { v: "" }, { v: undefined }];
    expect(dedupeRows(rows).rows).toEqual([{ v: 1 }, { v: "1" }, { v: null }]);
    expect(dedupeRows(rows, []).removed).toBe(2);
    expect(dedupeRows([], ["x"])).toEqual({ rows: [], removed: 0 });
  });
});

/* ------------------------------ split / merge ------------------------------ */

describe("splitWorkbook / mergeTables", () => {
  test("round trip preserves sheet names, order and rows", async () => {
    const bytes = mergeTables([{ name: "Orders", rows: ROWS }, { name: "Empty", rows: [] }, { name: "Flags", rows: [{ ok: true, when: "2024-01-05" }] }]);
    const sheets = await splitWorkbook(bytes);
    expect(sheets.map((s) => s.name)).toEqual(["Orders", "Empty", "Flags"]);
    expect(sheets[0]!.rows).toHaveLength(3);
    expect(sheets[0]!.rows[2]).toMatchObject({ sku: "C-3", qty: 4, rate: 3.25 });
    expect(sheets[1]!.rows).toEqual([]);
    expect(sheets[2]!.rows[0]!.ok).toBe(true);
  });

  test("merge sanitizes and de-duplicates sheet names", async () => {
    const bytes = mergeTables([{ name: "a/b:c", rows: [{ x: 1 }] }, { name: "a-b-c", rows: [{ x: 2 }] }, { name: "x".repeat(40), rows: [] }]);
    const wb = await readWorkbook(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(["a-b-c", "a-b-c (2)", "x".repeat(31)]);
    expect(() => mergeTables([])).toThrow(/at least one/);
  });

  test("merge accepts a template workbook split into sheets", async () => {
    const tpl = buildTemplate("invoice");
    const sheets = await splitWorkbook(tpl);
    expect(sheets.length).toBeGreaterThanOrEqual(2);
    const merged = mergeTables(sheets);
    const again = await splitWorkbook(merged);
    expect(again.map((s) => s.name)).toEqual(sheets.map((s) => s.name));
    expect(again[0]!.rows.length).toBe(sheets[0]!.rows.length);
  });

  test("sheet name helpers", () => {
    expect(sanitizeSheetName("  Q1 [draft]?  ")).toBe("Q1 -draft--");
    expect(sanitizeSheetName("")).toBe("Sheet");
    expect(uniqueSheetNames(["A", "a", "A"])).toEqual(["A", "a (2)", "A (3)"]);
    expect(sheetNameFromPath("out/2024/Sales Report.final.csv")).toBe("Sales Report.final");
    expect(sheetNameFromPath("noext")).toBe("noext");
  });
});

/* ------------------------------ functions ------------------------------ */

describe("functionReference", () => {
  test("lists every function grouped by category, sorted", () => {
    const groups = functionReference();
    expect(groups.length).toBeGreaterThanOrEqual(5);
    expect(groups[0]!.category).toBe("math");
    const all = groups.flatMap((g) => g.functions);
    expect(all.length).toBeGreaterThan(80);
    expect(new Set(all.map((f) => f.name)).size).toBe(all.length);
    for (const g of groups) {
      const names = g.functions.map((f) => f.name);
      expect([...names].sort((a, b) => a.localeCompare(b))).toEqual(names);
      for (const f of g.functions) expect(f.category).toBe(g.category);
    }
  });

  test("single function by name is case-insensitive and tolerant of '=' / '()'", () => {
    const doc = functionReference("sumif");
    expect(doc).toMatchObject({ name: "SUMIF", category: "math" });
    expect(doc!.signature).toMatch(/^SUMIF\(/);
    expect(functionReference("=IF()")!.name).toBe("IF");
    expect(functionReference("NOPE")).toBeUndefined();
  });
});

/* ------------------------------ misc ------------------------------ */

describe("misc helpers", () => {
  test("formatBytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12_698)).toBe("12.4 KB");
    expect(formatBytes(3 * 1024 * 1024)).toBe("3.00 MB");
  });
  test("parseSheetRef", () => {
    expect(parseSheetRef("2")).toBe(2);
    expect(parseSheetRef("Sales")).toBe("Sales");
    expect(parseSheetRef(undefined)).toBeUndefined();
  });
});
