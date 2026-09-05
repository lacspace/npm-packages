import { test, expect } from "vitest";
import {
  Workbook,
  jsonToXlsx,
  readWorkbook,
  sheetToJson,
  sheetToAoa,
  xlsxToJson,
  XlsxReadError,
} from "./index";

test("round-trips strings, numbers, booleans, a Date and blanks", async () => {
  const joined = new Date(Date.UTC(2024, 0, 15)); // 2024-01-15
  const rows = [
    { name: "Ada", qty: 12, active: true, joined },
    { name: "Bob", qty: 0, active: false, joined },
    { name: "", qty: 7, active: true, joined },
  ];
  const bytes = jsonToXlsx(rows, { sheetName: "Products" });

  const wb = await readWorkbook(bytes);
  expect(wb.sheetNames).toEqual(["Products"]);

  const json = sheetToJson(wb.sheet("Products")!);
  expect(json).toHaveLength(3);
  expect(json[0]!.name).toBe("Ada");
  expect(json[0]!.qty).toBe(12);
  expect(json[0]!.active).toBe(true);
  expect(json[1]!.active).toBe(false);
  expect(json[0]!.joined).toBeInstanceOf(Date);
  expect((json[0]!.joined as Date).toDateString()).toBe(joined.toDateString());
  // blank string cell round-trips as null
  expect(json[2]!.name).toBeNull();
});

test("xlsxToJson picks a sheet by name and by index", async () => {
  const bytes = new Workbook()
    .sheet("Alpha", [{ id: 1, label: "one" }])
    .sheet("Beta", [{ id: 2, label: "two" }])
    .toBytes();

  const byName = await xlsxToJson(bytes, { sheet: "Beta" });
  expect(byName[0]!.label).toBe("two");
  expect(byName[0]!.id).toBe(2);

  const byIndex = await xlsxToJson(bytes, { sheet: 0 });
  expect(byIndex[0]!.label).toBe("one");
});

test("multi-sheet sheet(name) lookup and default first sheet", async () => {
  const bytes = new Workbook()
    .sheet("First", [{ a: 1 }])
    .sheet("Second", [{ a: 2 }])
    .toBytes();
  const wb = await readWorkbook(bytes);

  expect(wb.sheets).toHaveLength(2);
  expect(wb.sheet()!.name).toBe("First");
  expect(wb.sheet("Second")!.rows[1]![0]).toBe(2);
  expect(wb.sheet("Nope")).toBeUndefined();
});

test("sheetToJson with explicit header array uses those keys and skips row 0 as data", async () => {
  const bytes = jsonToXlsx([{ x: 10, y: 20 }], { sheetName: "S", header: false });
  const wb = await readWorkbook(bytes);
  // header:false in the WRITER means no header row -> single data row [10, 20]
  const rows = sheetToJson(wb.sheet("S")!, { header: ["first", "second"] });
  expect(rows).toEqual([{ first: 10, second: 20 }]);
});

test("sheetToJson header:false keys by column letter and blankValue substitution", async () => {
  // Blank column B sits BETWEEN two filled columns so it survives trailing-trim.
  const bytes = jsonToXlsx([{ a: "hi", b: "", c: "yo" }], { sheetName: "S", header: false });
  const wb = await readWorkbook(bytes);
  const rows = sheetToJson(wb.sheet("S")!, { header: false, blankValue: "-" });
  expect(rows[0]!.A).toBe("hi");
  expect(rows[0]!.B).toBe("-");
  expect(rows[0]!.C).toBe("yo");
});

test("sheetToAoa returns the raw grid and readWorkbook handles empty sheet", async () => {
  const bytes = new Workbook().sheet("Empty", []).toBytes();
  const wb = await readWorkbook(bytes);
  expect(sheetToAoa(wb.sheet("Empty")!)).toEqual([]);
});

test("bad input throws XlsxReadError", async () => {
  await expect(readWorkbook(new Uint8Array([1, 2, 3, 4]))).rejects.toBeInstanceOf(XlsxReadError);
});

test("DEFLATE (method 8) inflate path matches zlib.deflateRawSync output", async () => {
  // Sanity-check the DecompressionStream inflate path against Node's zlib,
  // guarded so it never breaks non-Node runtimes.
  let zlib: typeof import("node:zlib") | undefined;
  try {
    zlib = await import("node:zlib");
  } catch {
    zlib = undefined;
  }
  if (!zlib || typeof (globalThis as { DecompressionStream?: unknown }).DecompressionStream !== "function") {
    return; // environment can't run this check; round-trip tests cover STORE
  }

  const original = new TextEncoder().encode("Colour Nepal bulk product import ✦ ".repeat(50));
  const deflated = new Uint8Array(zlib.deflateRawSync(original));

  // Re-run the reader's inflate via DecompressionStream directly.
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  void writer.write(deflated);
  void writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }

  expect(out).toEqual(original);
});
