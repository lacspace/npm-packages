import { test, expect } from "vitest";
import { parse, stringify } from "./index";
import { coerce, coerceValue, inferValue } from "./coerce";
import { mapColumns } from "./mapping";
import { parseTSV, stringifyTSV, stripBom, addBom, BOM } from "./dialect";
import {
  CsvError,
  CsvStreamParser,
  parseChunks,
  parseDialect,
  parseStream,
} from "./stream";

// ── Type inference / coercion ────────────────────────────────────────────────

test("inferValue detects numbers, booleans, ISO dates, nulls", () => {
  expect(inferValue("42")).toBe(42);
  expect(inferValue("-3.5")).toBe(-3.5);
  expect(inferValue("true")).toBe(true);
  expect(inferValue("FALSE")).toBe(false);
  expect(inferValue("")).toBe(null);
  expect(inferValue("null")).toBe(null);
  expect(inferValue("hello")).toBe("hello");
  const d = inferValue("2026-09-07");
  expect(d).toBeInstanceOf(Date);
  expect((d as Date).getUTCFullYear()).toBe(2026);
});

test("inferValue preserves identifiers with leading zeros", () => {
  expect(inferValue("007")).toBe("007");
  expect(inferValue("0123")).toBe("0123");
});

test("coerce with auto turns string rows into typed rows", () => {
  const rows = parse("id,qty,ok\n007,3,true");
  const typed = coerce(rows, { auto: true });
  expect(typed).toEqual([{ id: "007", qty: 3, ok: true }]);
});

test("coerce with per-column types overrides auto", () => {
  const rows = parse("qty,flag\n5,1");
  const typed = coerce(rows, { columns: { qty: "number", flag: "boolean" } });
  expect(typed).toEqual([{ qty: 5, flag: true }]);
});

test("coerceValue forces explicit types", () => {
  expect(coerceValue("2.5", "number")).toBe(2.5);
  expect(coerceValue("no", "boolean")).toBe(false);
  expect(coerceValue("", "number")).toBe(null);
});

// ── Column mapping / select ──────────────────────────────────────────────────

test("mapColumns rename + select round-trips through stringify", () => {
  const src = parse("id,name,secret\n1,Ada,xyz");
  const mapped = mapColumns(src, {
    select: ["name", "id"],
    rename: { id: "ID", name: "Name" },
  });
  expect(mapped).toEqual([{ Name: "Ada", ID: "1" }]);
  const csv = stringify(mapped);
  const back = parse(csv);
  expect(back).toEqual([{ Name: "Ada", ID: "1" }]);
});

test("mapColumns drop removes columns", () => {
  const src = parse("a,b,c\n1,2,3");
  expect(mapColumns(src, { drop: ["b"] })).toEqual([{ a: "1", c: "3" }]);
});

// ── RFC 4180 edge cases + dialects ───────────────────────────────────────────

test("parseDialect handles quoted delimiters, quotes and newlines", () => {
  const csv = 'name,note\r\n"Bob, Jr","he said ""hi""\nbye"';
  expect(parseDialect(csv)).toEqual([
    { name: "Bob, Jr", note: 'he said "hi"\nbye' },
  ]);
});

test("parseDialect supports alternate delimiter and custom quote/escape", () => {
  const psv = parseDialect("a|b\n1|2", { delimiter: "|" });
  expect(psv).toEqual([{ a: "1", b: "2" }]);
  const bs = parseDialect("v\n'a\\'b'", { quote: "'", escape: "\\" });
  expect(bs).toEqual([{ v: "a'b" }]);
});

test("TSV convenience parse + stringify", () => {
  const rows = parseTSV("a\tb\n1\t2");
  expect(rows).toEqual([{ a: "1", b: "2" }]);
  expect(stringifyTSV([{ a: "x", b: "y\tz" }])).toBe('a\tb\r\nx\t"y\tz"');
});

test("BOM strip on parse and add on output", () => {
  expect(stripBom(BOM + "a,b\n1,2")).toBe("a,b\n1,2");
  expect(parseDialect(BOM + "a\n1")).toEqual([{ a: "1" }]);
  expect(addBom("a,b")).toBe(BOM + "a,b");
  expect(addBom(BOM + "a,b")).toBe(BOM + "a,b");
});

test("comment lines are skipped", () => {
  const csv = "# header comment\na,b\n# mid\n1,2";
  expect(parseDialect(csv, { comment: "#" })).toEqual([{ a: "1", b: "2" }]);
});

// ── Streaming / chunked ──────────────────────────────────────────────────────

test("parseChunks produces identical rows to one-shot parse", () => {
  const csv = 'id,note\r\n1,"a, b"\r\n2,"line1\nline2"\r\n3,"say ""hi"""';
  const oneShot = parse(csv);
  // Split at awkward boundaries: inside a quote, mid-CRLF, mid-field.
  const chunks = [
    'id,not',
    'e\r',
    '\n1,"a,',
    ' b"\r\n2,"line1\nli',
    'ne2"\r\n3,"say ""h',
    'i"""',
  ];
  expect(parseChunks(chunks)).toEqual(oneShot);
});

test("CsvStreamParser emits rows incrementally", () => {
  const p = new CsvStreamParser();
  const rows: unknown[] = [];
  rows.push(...p.write("a,b\n1,2\n3,"));
  rows.push(...p.write("4\n"));
  rows.push(...p.end());
  expect(rows).toEqual([
    { a: "1", b: "2" },
    { a: "3", b: "4" },
  ]);
});

test("parseStream async-iterates rows from chunks", async () => {
  async function* gen() {
    yield "name,age\n";
    yield "Ada,3";
    yield "6\n";
  }
  const out: unknown[] = [];
  for await (const row of parseStream(gen())) out.push(row);
  expect(out).toEqual([{ name: "Ada", age: "36" }]);
});

// ── Robustness: relaxed vs strict ────────────────────────────────────────────

test("relaxed mode pads and truncates ragged rows", () => {
  const csv = "a,b,c\n1,2\n4,5,6,7";
  expect(parseDialect(csv, { relaxed: true })).toEqual([
    { a: "1", b: "2", c: "" },
    { a: "4", b: "5", c: "6" },
  ]);
});

test("strict mode throws CsvError with row/column on ragged rows", () => {
  const csv = "a,b,c\n1,2";
  expect(() => parseDialect(csv, { strict: true })).toThrow(CsvError);
  try {
    parseDialect(csv, { strict: true });
  } catch (e) {
    expect(e).toBeInstanceOf(CsvError);
    expect((e as CsvError).row).toBe(2);
    expect((e as CsvError).column).toBe(2);
  }
});

test("strict mode throws on unterminated quoted field", () => {
  expect(() => parseDialect('a\n"oops', { strict: true })).toThrow(CsvError);
});

test("skipEmpty drops blank lines by default; header:false yields arrays", () => {
  const rows = parseDialect("1,2\n\n3,4\n", { header: false });
  expect(rows).toEqual([
    ["1", "2"],
    ["3", "4"],
  ]);
});
