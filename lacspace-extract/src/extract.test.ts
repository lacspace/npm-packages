import { describe, it, expect } from "vitest";
import { deflateSync } from "node:zlib";
import { extractPdfText } from "./pdf.js";
import { htmlTables, lineTables } from "./tables.js";

// Build a tiny but valid PDF with a text content stream (optionally FlateDecode).
function makePdf(content: string, flate: boolean): Uint8Array {
  const enc: BufferEncoding = "latin1";
  const stream = flate ? deflateSync(Buffer.from(content, enc)) : Buffer.from(content, enc);
  const dict = `<</Length ${stream.length}${flate ? "/Filter/FlateDecode" : ""}>>`;
  const parts: Buffer[] = [];
  const push = (b: string | Buffer): void => { parts.push(Buffer.isBuffer(b) ? b : Buffer.from(b, enc)); };
  push("%PDF-1.4\n");
  push("1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n");
  push("2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n");
  push("3 0 obj <</Type/Page/Parent 2 0 R/Contents 4 0 R>> endobj\n");
  push(`4 0 obj ${dict}\nstream\n`); push(stream); push("\nendstream endobj\n");
  push("trailer <</Root 1 0 R>>\n%%EOF");
  return new Uint8Array(Buffer.concat(parts));
}

const CONTENT = `BT /F1 24 Tf 72 720 Td (Hello Lacspace) Tj ET
BT /F1 12 Tf 72 690 Td (Invoice #1001) Tj ET`;

describe("extractPdfText", () => {
  it("reads an uncompressed content stream", () => {
    const { text, pageCount } = extractPdfText(makePdf(CONTENT, false));
    expect(text).toContain("Hello Lacspace");
    expect(text).toContain("Invoice #1001");
    expect(pageCount).toBe(1);
  });
  it("inflates a FlateDecode content stream", () => {
    const { text } = extractPdfText(makePdf(CONTENT, true));
    expect(text).toContain("Hello Lacspace");
    expect(text).toContain("Invoice #1001");
  });
  it("decodes TJ arrays and hex strings", () => {
    const c = "BT [(Hel) -250 (lo)] TJ <48656C6C6F> Tj ET";
    const { text } = extractPdfText(makePdf(c, false));
    expect(text.replace(/\s+/g, "")).toContain("Hello");
  });
  it("never throws on junk input", () => {
    expect(() => extractPdfText(new Uint8Array([1, 2, 3, 4]))).not.toThrow();
  });
});

describe("htmlTables", () => {
  it("reads a table into header-keyed rows", () => {
    const html = "<table><tr><th>Name</th><th>Qty</th></tr><tr><td>A</td><td>2</td></tr></table>";
    expect(htmlTables(html)).toEqual([[{ Name: "A", Qty: "2" }]]);
  });
});

describe("lineTables", () => {
  it("detects a column-aligned block", () => {
    const text = "Report\n\nItem      Qty   Price\nWidget    2     $9.99\nGadget    5     $19.99\n\nthe end";
    const tables = lineTables(text);
    expect(tables.length).toBe(1);
    expect(tables[0]![0]).toEqual(["Item", "Qty", "Price"]);
    expect(tables[0]![1]).toEqual(["Widget", "2", "$9.99"]);
  });
  it("ignores prose", () => {
    expect(lineTables("just a sentence here\nand another line")).toEqual([]);
  });
});
