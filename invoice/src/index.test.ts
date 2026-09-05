import { describe, it, expect } from "vitest";
import {
  createInvoice,
  recordPayment,
  markVoid,
  markIssued,
  isOverdue,
  invoiceNumber,
  renderRows,
  InvoiceError,
  type Party,
} from "./index";

const seller: Party = { name: "Lacspace", taxId: "T-1" };
const buyer: Party = { name: "Acme Co" };

function baseInvoice() {
  return createInvoice({
    number: "INV-2026-000001",
    currency: "USD",
    seller,
    buyer,
    lines: [
      // 2 * 1000 - 200 = 1800 net; tax 13% = round(234) = 234; total 2034
      { description: "Widget", qty: 2, unitPrice: 1000, taxRate: 0.13, discount: 200 },
      // 1 * 500 = 500 net; tax 0 = 0; total 500
      { description: "Sticker", qty: 1, unitPrice: 500, taxRate: 0 },
    ],
  });
}

describe("createInvoice", () => {
  it("computes per-line net/tax/total with discount and taxRate", () => {
    const inv = baseInvoice();
    expect(inv.lines[0].net).toBe(1800);
    expect(inv.lines[0].tax).toBe(234);
    expect(inv.lines[0].total).toBe(2034);
    expect(inv.lines[1].net).toBe(500);
    expect(inv.lines[1].tax).toBe(0);
  });

  it("sums totals correctly in minor units", () => {
    const inv = baseInvoice();
    expect(inv.totals.subtotal).toBe(2300); // 1800 + 500
    expect(inv.totals.discount).toBe(200);
    expect(inv.totals.taxTotal).toBe(234);
    expect(inv.totals.total).toBe(2534); // 2300 + 234
    expect(inv.totals.amountPaid).toBe(0);
    expect(inv.totals.balanceDue).toBe(2534);
    expect(inv.status).toBe("draft");
  });

  it("throws on empty lines and on negative qty", () => {
    expect(() =>
      createInvoice({ number: "X", currency: "USD", seller, buyer, lines: [] }),
    ).toThrow(InvoiceError);
    expect(() =>
      createInvoice({
        number: "X",
        currency: "USD",
        seller,
        buyer,
        lines: [{ description: "bad", qty: -1, unitPrice: 100 }],
      }),
    ).toThrow(InvoiceError);
  });
});

describe("taxSummary", () => {
  it("groups same rate and separates different rates", () => {
    const inv = createInvoice({
      number: "INV-2",
      currency: "USD",
      seller,
      buyer,
      lines: [
        { description: "A", qty: 1, unitPrice: 1000, taxRate: 0.13 }, // net 1000 tax 130
        { description: "B", qty: 1, unitPrice: 2000, taxRate: 0.13 }, // net 2000 tax 260
        { description: "C", qty: 1, unitPrice: 500, taxRate: 0 }, // net 500 tax 0
      ],
    });
    expect(inv.taxSummary).toHaveLength(2);
    const zero = inv.taxSummary.find((r) => r.rate === 0)!;
    const std = inv.taxSummary.find((r) => r.rate === 0.13)!;
    expect(zero.net).toBe(500);
    expect(zero.tax).toBe(0);
    expect(std.net).toBe(3000);
    expect(std.tax).toBe(390); // 130 + 260
    expect(std.net + std.tax + zero.net).toBe(inv.totals.total);
  });
});

describe("recordPayment", () => {
  it("partial payment sets status and balanceDue", () => {
    const inv = baseInvoice();
    const p = recordPayment(inv, 2000);
    expect(p.status).toBe("partial");
    expect(p.totals.amountPaid).toBe(2000);
    expect(p.totals.balanceDue).toBe(534);
    expect(inv.totals.amountPaid).toBe(0); // immutable
  });

  it("full payment sets paid with zero balance", () => {
    const inv = baseInvoice();
    const p = recordPayment(inv, 2534);
    expect(p.status).toBe("paid");
    expect(p.totals.balanceDue).toBe(0);
  });

  it("throws on overpay and on non-positive amount", () => {
    const inv = baseInvoice();
    expect(() => recordPayment(inv, 3000)).toThrow(/exceeds/);
    try {
      recordPayment(inv, 3000);
    } catch (e) {
      expect((e as InvoiceError).code).toBe("overpayment");
    }
    expect(() => recordPayment(inv, 0)).toThrow(InvoiceError);
  });
});

describe("status transitions", () => {
  it("markIssued and markVoid transition immutably", () => {
    const inv = baseInvoice();
    const issued = markIssued(inv, 111);
    expect(issued.status).toBe("issued");
    expect(issued.issuedAt).toBe(111);
    expect(inv.status).toBe("draft");
    expect(markVoid(inv).status).toBe("void");
  });

  it("cannot issue or void a paid invoice", () => {
    const paid = recordPayment(baseInvoice(), 2534);
    expect(() => markIssued(paid)).toThrow(InvoiceError);
    expect(() => markVoid(paid)).toThrow(InvoiceError);
  });
});

describe("isOverdue", () => {
  it("true when past dueAt with balance", () => {
    const inv = { ...baseInvoice(), dueAt: 1000 };
    expect(isOverdue(inv, 2000)).toBe(true);
  });

  it("false when paid or not yet due", () => {
    const paid = { ...recordPayment(baseInvoice(), 2534), dueAt: 1000 };
    expect(isOverdue(paid, 2000)).toBe(false);
    const future = { ...baseInvoice(), dueAt: 5000 };
    expect(isOverdue(future, 2000)).toBe(false);
  });
});

describe("invoiceNumber", () => {
  it("formats deterministically with defaults and overrides", () => {
    expect(invoiceNumber(123, { year: 2026 })).toBe("INV-2026-000123");
    expect(
      invoiceNumber(7, { prefix: "AC", year: 2025, pad: 4, separator: "/" }),
    ).toBe("AC/2025/0007");
  });
});

describe("renderRows", () => {
  it("returns columns and one row per line", () => {
    const inv = baseInvoice();
    const { columns, rows } = renderRows(inv);
    expect(columns).toEqual(["Description", "Qty", "Unit", "Tax %", "Line total"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["Widget", 2, 1000, 13, 2034]);
  });
});
