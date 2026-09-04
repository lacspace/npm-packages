import { test, expect } from "vitest";
import { PdfDocument, invoice, receipt } from "./index";

// The package exposes the builder as the `PdfDocument` class (no `createPdf`
// factory export exists). Decode bytes back to a latin1 string to inspect the
// raw PDF structure.
function decode(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function pageCount(bytes: Uint8Array): number {
  const m = decode(bytes).match(/\/Type\s*\/Pages\s*\/Count\s+(\d+)/);
  return m ? Number(m[1]) : -1;
}

test("toBytes() starts with %PDF- and contains %%EOF", () => {
  const doc = new PdfDocument();
  doc.heading("Hello").paragraph("A little document body.");
  const bytes = doc.toBytes();
  expect(bytes).toBeInstanceOf(Uint8Array);
  expect(bytes.length).toBeGreaterThan(100);
  const s = decode(bytes);
  expect(s.startsWith("%PDF-")).toBe(true);
  expect(s).toContain("%%EOF");
});

test("invoice() produces a non-empty valid PDF", () => {
  const bytes = invoice({
    number: "INV-001",
    from: { name: "Acme Inc" },
    to: { name: "Client Co" },
    items: [
      { description: "Widget", quantity: 2, rate: 25 },
      { description: "Gadget", quantity: 1, rate: 100 },
    ],
    taxRate: 10,
  });
  const s = decode(bytes);
  expect(bytes.length).toBeGreaterThan(200);
  expect(s.startsWith("%PDF-")).toBe(true);
  expect(s).toContain("%%EOF");
});

test("receipt() produces a non-empty valid PDF", () => {
  const bytes = receipt({
    brand: "Coffee Shop",
    number: "R-99",
    items: [
      { name: "Latte", amount: 4.5 },
      { name: "Muffin", quantity: 2, amount: 6 },
    ],
    taxRate: 5,
  });
  const s = decode(bytes);
  expect(bytes.length).toBeGreaterThan(200);
  expect(s.startsWith("%PDF-")).toBe(true);
  expect(s).toContain("%%EOF");
});

test("addPage then finalize leaves no trailing blank page", () => {
  const doc = new PdfDocument();
  doc.text("Only page content");
  doc.addPage(); // trailing empty page that must be dropped
  const bytes = doc.toBytes();
  expect(pageCount(bytes)).toBe(1);
});

test("real multi-page content keeps every page", () => {
  const doc = new PdfDocument();
  doc.text("page one");
  doc.addPage();
  doc.text("page two");
  const bytes = doc.toBytes();
  expect(pageCount(bytes)).toBe(2);
});
