import { describe, it, expect } from "vitest";
import {
  createInvoice,
  recordPayment,
  markVoid,
  createCreditNote,
  applyCreditNote,
  creditNoteRows,
  InvoiceError,
  type Party,
} from "./index";

const seller: Party = { name: "Lacspace" };
const buyer: Party = { name: "Acme Co" };

function baseInvoice() {
  return createInvoice({
    number: "INV-2026-000001",
    currency: "USD",
    seller,
    buyer,
    lines: [
      { description: "Widget", qty: 2, unitPrice: 1000, taxRate: 0.13, discount: 200 },
      { description: "Sticker", qty: 1, unitPrice: 500, taxRate: 0 },
    ],
  }); // total 2534
}

describe("createCreditNote", () => {
  it("defaults to a full credit of the balance due", () => {
    const note = createCreditNote({ number: "CN-1", invoice: baseInvoice() });
    expect(note.amount).toBe(2534);
    expect(note.invoiceNumber).toBe("INV-2026-000001");
    expect(note.currency).toBe("USD");
  });

  it("computes the amount from itemised lines", () => {
    const note = createCreditNote({
      number: "CN-2",
      invoice: baseInvoice(),
      lines: [{ description: "Returned Widget", qty: 1, unitPrice: 1000, taxRate: 0.13 }],
      reason: "1 unit returned",
    });
    // net 1000, tax 130, total 1130
    expect(note.amount).toBe(1130);
    expect(note.lines).toHaveLength(1);
    expect(note.lines![0]!.total).toBe(1130);
    expect(note.reason).toBe("1 unit returned");
  });

  it("throws when the credit exceeds what is owed", () => {
    expect(() =>
      createCreditNote({ number: "CN-3", invoice: baseInvoice(), amount: 3000 }),
    ).toThrow(InvoiceError);
    try {
      createCreditNote({ number: "CN-3", invoice: baseInvoice(), amount: 3000 });
    } catch (e) {
      expect((e as InvoiceError).code).toBe("credit_exceeds_due");
    }
  });

  it("throws on a non-positive amount", () => {
    expect(() =>
      createCreditNote({ number: "CN-4", invoice: baseInvoice(), amount: 0 }),
    ).toThrow(InvoiceError);
  });

  it("is a plain, JSON-serializable object", () => {
    const note = createCreditNote({ number: "CN-5", invoice: baseInvoice(), amount: 500 });
    expect(JSON.parse(JSON.stringify(note))).toEqual(note);
  });
});

describe("applyCreditNote", () => {
  it("reduces the amount due, immutably", () => {
    const inv = baseInvoice();
    const note = createCreditNote({ number: "CN-6", invoice: inv, amount: 534 });
    const credited = applyCreditNote(inv, note);
    expect(credited.totals.credited).toBe(534);
    expect(credited.totals.balanceDue).toBe(2000);
    expect(inv.totals.balanceDue).toBe(2534); // untouched
    expect(inv.totals.credited).toBeUndefined();
  });

  it("marks the invoice paid when a full credit clears the balance", () => {
    const inv = baseInvoice();
    const note = createCreditNote({ number: "CN-7", invoice: inv });
    const credited = applyCreditNote(inv, note);
    expect(credited.totals.balanceDue).toBe(0);
    expect(credited.status).toBe("paid");
  });

  it("stacks with a payment: balanceDue = total - amountPaid - credited", () => {
    let inv = baseInvoice();
    inv = recordPayment(inv, 1000); // paid 1000, due 1534
    const note = createCreditNote({ number: "CN-8", invoice: inv, amount: 534 });
    const credited = applyCreditNote(inv, note);
    expect(credited.totals.credited).toBe(534);
    expect(credited.totals.balanceDue).toBe(1000);
    expect(credited.totals.balanceDue).toBe(
      credited.totals.total - credited.totals.amountPaid - credited.totals.credited!,
    );
  });

  it("throws credit_mismatch for a different invoice", () => {
    const note = createCreditNote({ number: "CN-9", invoice: baseInvoice(), amount: 100 });
    const other = { ...baseInvoice(), number: "INV-OTHER" };
    expect(() => applyCreditNote(other, note)).toThrow(InvoiceError);
    try {
      applyCreditNote(other, note);
    } catch (e) {
      expect((e as InvoiceError).code).toBe("credit_mismatch");
    }
  });

  it("refuses to credit a void invoice", () => {
    const inv = baseInvoice();
    const note = createCreditNote({ number: "CN-10", invoice: inv, amount: 100 });
    const voided = markVoid(inv);
    expect(() => applyCreditNote(voided, note)).toThrow(/void/);
  });
});

describe("creditNoteRows", () => {
  it("emits one row per itemised line", () => {
    const note = createCreditNote({
      number: "CN-11",
      invoice: baseInvoice(),
      lines: [{ description: "Returned Widget", qty: 1, unitPrice: 1000, taxRate: 0.13 }],
    });
    const { columns, rows } = creditNoteRows(note);
    expect(columns).toEqual(["Description", "Qty", "Unit", "Tax %", "Line total"]);
    expect(rows).toEqual([["Returned Widget", 1, 1000, 13, 1130]]);
  });

  it("emits a single summary row for a flat credit", () => {
    const note = createCreditNote({
      number: "CN-12",
      invoice: baseInvoice(),
      amount: 500,
      reason: "Goodwill",
    });
    const { rows } = creditNoteRows(note);
    expect(rows).toEqual([["Goodwill", 1, 500, 0, 500]]);
  });
});
