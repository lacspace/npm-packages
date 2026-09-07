import { describe, it, expect } from "vitest";
import {
  createInvoice,
  recordPayments,
  amountDue,
  amountPaid,
  settlement,
  isSettled,
  InvoiceError,
  type Party,
  type Payment,
} from "./index";

const seller: Party = { name: "Lacspace" };
const buyer: Party = { name: "Acme Co" };

function baseInvoice() {
  return createInvoice({
    number: "INV-2026-000001",
    currency: "USD",
    seller,
    buyer,
    // 2534 total, matching the core suite's fixture
    lines: [
      { description: "Widget", qty: 2, unitPrice: 1000, taxRate: 0.13, discount: 200 },
      { description: "Sticker", qty: 1, unitPrice: 500, taxRate: 0 },
    ],
  });
}

describe("amountDue / amountPaid", () => {
  it("mirror the totals", () => {
    const inv = baseInvoice();
    expect(amountDue(inv)).toBe(2534);
    expect(amountPaid(inv)).toBe(0);
    const p = recordPayments(inv, [{ amount: 1000 }]);
    expect(amountPaid(p)).toBe(1000);
    expect(amountDue(p)).toBe(1534);
  });
});

describe("recordPayments", () => {
  it("applies a sequence immutably and reaches paid", () => {
    const inv = baseInvoice();
    const payments: Payment[] = [
      { amount: 1000, method: "card" },
      { amount: 1534, method: "bank", reference: "TX-9" },
    ];
    const done = recordPayments(inv, payments);
    expect(done.status).toBe("paid");
    expect(done.totals.balanceDue).toBe(0);
    expect(inv.totals.amountPaid).toBe(0); // untouched
  });

  it("leaves an invoice partial after an under-payment", () => {
    const done = recordPayments(baseInvoice(), [{ amount: 2000 }]);
    expect(done.status).toBe("partial");
    expect(done.totals.balanceDue).toBe(534);
  });

  it("throws overpayment when the batch exceeds the total", () => {
    expect(() =>
      recordPayments(baseInvoice(), [{ amount: 2000 }, { amount: 1000 }]),
    ).toThrow(InvoiceError);
    try {
      recordPayments(baseInvoice(), [{ amount: 3000 }]);
    } catch (e) {
      expect((e as InvoiceError).code).toBe("overpayment");
    }
  });

  it("carries a payment's `at` into the injectable clock meta", () => {
    const done = recordPayments(baseInvoice(), [{ amount: 100, at: 42 }]);
    expect((done.meta as Record<string, unknown>).lastPaymentAt).toBe(42);
  });
});

describe("settlement", () => {
  it("reports amounts and derives overdue with an injected clock", () => {
    const inv = { ...baseInvoice(), dueAt: 1000, status: "issued" as const };
    const part = recordPayments(inv, [{ amount: 500 }]);
    const s = settlement(part, 2000);
    expect(s.amountPaid).toBe(500);
    expect(s.amountDue).toBe(2034);
    expect(s.status).toBe("overdue");
  });

  it("reports paid once settled", () => {
    const done = recordPayments(baseInvoice(), [{ amount: 2534 }]);
    expect(settlement(done, 0).status).toBe("paid");
    expect(isSettled(done)).toBe(true);
    expect(isSettled(baseInvoice())).toBe(false);
  });
});
