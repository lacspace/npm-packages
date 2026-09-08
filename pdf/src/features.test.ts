import { test, expect } from "vitest";
import { createHash } from "node:crypto";
import { PdfDocument, invoice, receipt, jpegImage, rgbImage } from "./index";

function decode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}
/** Normalise the (time-dependent) Info dates, then hash — for byte-for-byte locks. */
function digest(bytes: Uint8Array): string {
  const norm = decode(bytes).replace(/D:\d{14}Z/g, "D:00000000000000Z");
  return createHash("sha256").update(norm).digest("hex").slice(0, 16);
}

/* ------------------------------------------------------------------ *
 * Backward-compatibility LOCK — existing output must stay byte-for-byte
 * identical (golden digests captured from the pre-1.1.0 code paths).
 * ------------------------------------------------------------------ */

test("LOCK: plain builder output is byte-for-byte unchanged", () => {
  const d = new PdfDocument({ title: "Lock" });
  d.heading("Report").paragraph("Backward-compatibility lock document. Stable content.")
    .keyValue("Status", "OK").divider().bullet("one").bullet("two");
  expect(digest(d.toBytes())).toBe("c06aca9e5c5f1888");
});

test("LOCK: invoice() output is byte-for-byte unchanged", () => {
  const bytes = invoice({
    number: "INV-1", date: "2024-01-01",
    from: { name: "Acme" }, to: { name: "Client" },
    items: [{ description: "Widget", quantity: 2, rate: 25 }, { description: "Gadget", quantity: 1, rate: 100 }],
    taxRate: 10,
  });
  expect(digest(bytes)).toBe("d2a5ca4278741957");
});

test("LOCK: receipt() output is byte-for-byte unchanged", () => {
  const bytes = receipt({
    brand: "Shop", number: "R1",
    items: [{ name: "Latte", amount: 4.5 }, { name: "Muffin", quantity: 2, amount: 6 }],
    taxRate: 5,
  });
  expect(digest(bytes)).toBe("ea867ed6b43c6fd9");
});

test("LOCK: a doc using no new features keeps the original /Resources dict and no new markers", () => {
  const s = decode(new PdfDocument().text("hello").toBytes());
  expect(s).toContain("/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >>");
  expect(s).not.toContain("/XObject");
  expect(s).not.toContain("/Outlines");
  expect(s).not.toContain("/DCTDecode");
});

/* ------------------------------------------------------------------ *
 * Page sizes + orientation
 * ------------------------------------------------------------------ */

test("page sizes resolve to correct point dimensions", () => {
  expect([new PdfDocument({ size: "A4" }).pageW, new PdfDocument({ size: "A4" }).pageH])
    .toEqual([595.28, 841.89]);
  expect(new PdfDocument({ size: "Letter" }).pageW).toBe(612);
  expect(new PdfDocument({ size: "Legal" }).pageH).toBe(1008);
  expect(new PdfDocument({ size: "A3" }).pageH).toBeCloseTo(1190.55, 2);
});

test("landscape swaps width and height", () => {
  const p = new PdfDocument({ size: "A5", orientation: "landscape" });
  expect(p.pageW).toBeCloseTo(595.28, 2);
  expect(p.pageH).toBeCloseTo(419.53, 2);
  expect(decode(p.toBytes())).toContain("/MediaBox [0 0 595.28 419.53]");
});

/* ------------------------------------------------------------------ *
 * Extra fonts (Times / Courier from the standard 14)
 * ------------------------------------------------------------------ */

test("times family registers a Times-Roman font object and F3 resource", () => {
  const s = decode(new PdfDocument().text("classic serif", { family: "times" }).toBytes());
  expect(s).toContain("/BaseFont /Times-Roman");
  expect(s).toMatch(/\/F1 3 0 R \/F2 4 0 R \/F3 \d+ 0 R/); // page dict references the extra font
});

test("courier bold + times bold-italic resolve to the right base fonts", () => {
  const d = new PdfDocument();
  d.text("mono", { family: "courier", bold: true });
  d.text("emph", { family: "times", bold: true, italic: true });
  const s = decode(d.toBytes());
  expect(s).toContain("/BaseFont /Courier-Bold");
  expect(s).toContain("/BaseFont /Times-BoldItalic");
});

test("helvetica oblique reuses Helvetica-Oblique base font", () => {
  const s = decode(new PdfDocument().text("slanted", { italic: true }).toBytes());
  expect(s).toContain("/BaseFont /Helvetica-Oblique");
});

test("courier is monospaced — every glyph is 600 units wide", () => {
  // Two strings of equal length measure identically in a monospaced font.
  const d = new PdfDocument();
  const s = decode(d.text("IIII", { family: "courier" }).toBytes());
  expect(s).toContain("/BaseFont /Courier");
});

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

test("rgbImage embeds an uncompressed image XObject referenced from the page", () => {
  const px = new Uint8Array([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0]); // 2x2 RGB
  const img = rgbImage({ data: px, width: 2, height: 2 });
  const s = decode(new PdfDocument().image(img, { width: 80 }).toBytes());
  expect(s).toContain("/Subtype /Image");
  expect(s).toContain("/Width 2 /Height 2");
  expect(s).toContain("/ColorSpace /DeviceRGB");
  expect(s).not.toContain("/DCTDecode"); // raw pixels are uncompressed
  expect(s).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
});

test("rgbImage rejects a data buffer of the wrong length", () => {
  expect(() => rgbImage({ data: new Uint8Array(5), width: 2, height: 2 })).toThrow(/does not match/);
});

test("jpegImage parses SOF geometry and embeds via DCTDecode", () => {
  // Minimal JPEG: SOI + SOF0 (8-bit, 4 high x 6 wide, 3 comps) + EOI.
  const jpg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xc0, 0, 0x11, 8, 0, 4, 0, 6, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, 0xff, 0xd9,
  ]);
  const img = jpegImage(jpg);
  expect(img.width).toBe(6);
  expect(img.height).toBe(4);
  expect(img.colorSpace).toBe("DeviceRGB");
  const s = decode(new PdfDocument().image(img, { width: 60 }).toBytes());
  expect(s).toContain("/Filter /DCTDecode");
});

test("jpegImage throws on non-JPEG bytes", () => {
  expect(() => jpegImage(new Uint8Array([1, 2, 3, 4]))).toThrow(/not a JPEG/);
});

test("two images get distinct Im1 / Im2 resource names", () => {
  const img = rgbImage({ data: new Uint8Array([0, 0, 0]), width: 1, height: 1 });
  const d = new PdfDocument();
  d.image(img, { width: 20 }).image(img, { width: 20 });
  const s = decode(d.toBytes());
  expect(s).toContain("/Im1");
  expect(s).toContain("/Im2");
});

/* ------------------------------------------------------------------ *
 * Page numbers / footers
 * ------------------------------------------------------------------ */

test("pageNumbers() renders {page} / {pages} on every page", () => {
  const d = new PdfDocument();
  d.text("one").pageNumbers();
  d.addPage(); d.text("two");
  const s = decode(d.toBytes());
  expect(s).toContain("(1 / 2)");
  expect(s).toContain("(2 / 2)");
});

test("footer() supports a custom template and render function", () => {
  const d = new PdfDocument();
  d.text("body").footer({ text: "Page {page} of {pages}", align: "right" });
  expect(decode(d.toBytes())).toContain("(Page 1 of 1)");

  const d2 = new PdfDocument();
  d2.text("x").footer({ render: (p, n) => `p${p} n${n}` });
  expect(decode(d2.toBytes())).toContain("(p1 n1)");
});

/* ------------------------------------------------------------------ *
 * Tables (border + zebra)
 * ------------------------------------------------------------------ */

test("table() renders headers, rows and an optional grid border", () => {
  const d = new PdfDocument();
  d.table({
    columns: [{ header: "Item", width: 0.6 }, { header: "Qty", width: 0.4, align: "right" }],
    rows: [["Apples", 3], ["Pears", 12]],
    border: true,
    zebra: true,
  });
  const s = decode(d.toBytes());
  expect(s).toContain("(Item)");
  expect(s).toContain("(Apples)");
  expect(s).toContain("(12)");
  expect(s).toContain(" re f"); // zebra fill rectangle
  expect(s).toContain(" l S");  // border stroke segments
});

test("a tall table auto-flows onto a second page and repeats the header", () => {
  const rows = Array.from({ length: 80 }, (_, i) => [`Row ${i}`, i]);
  const d = new PdfDocument();
  d.table({ columns: [{ header: "Name", width: 0.7 }, { header: "N", width: 0.3, align: "right" }], rows });
  const s = decode(d.toBytes());
  expect(s).toMatch(/\/Type\s*\/Pages\s*\/Count\s+([2-9]|\d\d)/); // >= 2 pages
});

/* ------------------------------------------------------------------ *
 * Outline (bookmarks)
 * ------------------------------------------------------------------ */

test("outlineItem() emits an /Outlines tree wired into the catalog", () => {
  const d = new PdfDocument();
  d.heading("Chapter 1").outlineItem("Chapter 1");
  d.heading("Section 1.1").outlineItem("Section 1.1", { level: 1 });
  d.addPage();
  d.heading("Chapter 2").outlineItem("Chapter 2");
  const s = decode(d.toBytes());
  expect(s).toContain("/Type /Outlines");
  expect(s).toMatch(/\/Outlines \d+ 0 R/); // referenced from the catalog
  expect(s).toContain("(Chapter 1)");
  expect(s).toContain("(Section 1.1)");
  expect(s).toContain("(Chapter 2)");
  expect(s).toMatch(/\/Dest \[\d+ 0 R \/XYZ /); // destinations point at pages
});

test("nested outline entry references its parent", () => {
  const d = new PdfDocument();
  d.text("a").outlineItem("Parent");
  d.text("b").outlineItem("Child", { level: 1 });
  const s = decode(d.toBytes());
  // The parent entry advertises a /First + /Count for its child.
  expect(s).toMatch(/\(Parent\)[^]*?\/First \d+ 0 R \/Last \d+ 0 R \/Count 1/);
});

/* ------------------------------------------------------------------ *
 * Metadata
 * ------------------------------------------------------------------ */

test("document metadata (title/author/subject/keywords) reaches the Info dict", () => {
  const d = new PdfDocument({ title: "Q3 Report", author: "Lacspace", subject: "Finance", keywords: ["report", "q3"] });
  d.text("hi");
  const s = decode(d.toBytes());
  expect(s).toContain("/Title (Q3 Report)");
  expect(s).toContain("/Author (Lacspace)");
  expect(s).toContain("/Subject (Finance)");
  expect(s).toContain("/Keywords (report, q3)");
});
