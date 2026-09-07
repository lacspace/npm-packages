import { test, expect } from "vitest";
import { Workbook, jsonToXlsx, readWorkbook, xlsxToJson } from "./index";

/** Decode the (STORE-method, uncompressed) .xlsx bytes to a searchable string. */
const asText = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

test("a column numFmt is written into styles.xml and referenced by the data cell", () => {
  const bytes = jsonToXlsx([{ price: 9.5 }], {
    columns: [{ header: "price", key: "price", numFmt: "0.00" }],
  });
  const xml = asText(bytes);
  expect(xml).toContain('<numFmts count="1">');
  expect(xml).toContain('formatCode="0.00"');
  expect(xml).toContain('numFmtId="164"');
  // the price data cell uses the custom style index (3), value preserved
  expect(xml).toContain('s="3"><v>9.5</v>');
});

test("default output contains no <numFmts> block (byte-compatible with pre-1.2.0)", () => {
  const xml = asText(jsonToXlsx([{ a: 1 }]));
  expect(xml).not.toContain("<numFmts");
  expect(xml).toContain('<cellXfs count="3">');
});

test("numeric numFmt column still reads back as a plain number", async () => {
  const bytes = jsonToXlsx([{ price: 9.5 }, { price: 12 }], {
    columns: [{ header: "price", key: "price", numFmt: "$#,##0.00" }],
  });
  const rows = await xlsxToJson(bytes);
  expect(rows).toEqual([{ price: 9.5 }, { price: 12 }]);
});

test("a custom date numFmt round-trips as a real Date on read", async () => {
  const when = new Date(Date.UTC(2024, 5, 1));
  const bytes = jsonToXlsx([{ when }], {
    columns: [{ header: "when", key: "when", numFmt: "yyyy-mm-dd" }],
  });
  const rows = await xlsxToJson(bytes);
  expect(rows[0]!.when).toBeInstanceOf(Date);
  expect((rows[0]!.when as Date).toISOString().slice(0, 10)).toBe("2024-06-01");
});

test("column widths are emitted with customWidth in the worksheet XML", () => {
  const bytes = jsonToXlsx([{ name: "Ada" }], {
    columns: [{ header: "name", key: "name", width: 28 }],
  });
  const xml = asText(bytes);
  expect(xml).toContain('width="28"');
  expect(xml).toContain('customWidth="1"');
});

test("bold header row uses style index 1", () => {
  const xml = asText(jsonToXlsx([{ name: "Ada" }]));
  // header cell for an object sheet is bold (s="1") by default
  expect(xml).toMatch(/s="1"[^>]*t="inlineStr"/);
});

test("multi-sheet workbook shares one styles part; both sheets round-trip", async () => {
  const bytes = new Workbook()
    .sheet("Prices", [{ item: "A", cost: 1.5 }], {
      columns: [
        { header: "item", key: "item", width: 20 },
        { header: "cost", key: "cost", numFmt: "0.00" },
      ],
    })
    .sheet("Plain", [{ x: 1 }, { x: 2 }])
    .toBytes();

  const xml = asText(bytes);
  expect(xml).toContain('formatCode="0.00"');
  expect(xml).toContain("xl/worksheets/sheet1.xml");
  expect(xml).toContain("xl/worksheets/sheet2.xml");

  const wb = await readWorkbook(bytes);
  expect(wb.sheetNames).toEqual(["Prices", "Plain"]);
  expect((await xlsxToJson(bytes, { sheet: "Prices" }))[0]).toEqual({ item: "A", cost: 1.5 });
  expect(await xlsxToJson(bytes, { sheet: "Plain" })).toEqual([{ x: 1 }, { x: 2 }]);
});

test("output has the required OOXML package parts (structural validity)", () => {
  const xml = asText(new Workbook().sheet("S", [{ a: 1 }]).toBytes());
  for (const part of [
    "[Content_Types].xml",
    "_rels/.rels",
    "xl/workbook.xml",
    "xl/_rels/workbook.xml.rels",
    "xl/styles.xml",
    "xl/worksheets/sheet1.xml",
  ]) {
    expect(xml).toContain(part);
  }
  expect(xml).toContain("spreadsheetml.sheet.main+xml");
});
