import { describe, it, expect } from "vitest";
import {
  createInvoice,
  recordPayment,
  markVoid,
  canTransition,
  transition,
  deriveStatus,
  withDerivedStatus,
  INVOICE_TRANSITIONS,
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
    lines: [{ description: "Widget", qty: 1, unitPrice: 1000, taxRate: 0 }],
  });
}

describe("canTransition", () => {
  it("allows draft→issued and issued→paid, rejects paid→issued", () => {
    expect(canTransition("draft", "issued")).toBe(true);
    expect(canTransition("issued", "paid")).toBe(true);
    expect(canTransition("paid", "issued")).toBe(false);
    expect(canTransition("void", "paid")).toBe(false);
  });

  it("treats a no-op transition as allowed", () => {
    expect(canTransition("paid", "paid")).toBe(true);
  });

  it("paid and void are terminal", () => {
    expect(INVOICE_TRANSITIONS.paid).toEqual([]);
    expect(INVOICE_TRANSITIONS.void).toEqual([]);
  });
});

describe("transition", () => {
  it("moves status immutably", () => {
    const inv = baseInvoice();
    const issued = transition(inv, "issued");
    expect(issued.status).toBe("issued");
    expect(inv.status).toBe("draft");
  });

  it("throws invalid_transition on an illegal move", () => {
    const paid = recordPayment(baseInvoice(), 1000);
    expect(() => transition(paid, "issued")).toThrow(InvoiceError);
    try {
      transition(paid, "issued");
    } catch (e) {
      expect((e as InvoiceError).code).toBe("invalid_transition");
    }
  });

  it("returns the same reference for a no-op", () => {
    const inv = transition(baseInvoice(), "issued");
    expect(transition(inv, "issued")).toBe(inv);
  });
});

describe("deriveStatus", () => {
  it("keeps draft and void untouched", () => {
    expect(deriveStatus(baseInvoice())).toBe("draft");
    expect(deriveStatus(markVoid(baseInvoice()))).toBe("void");
  });

  it("derives overdue with an injected clock", () => {
    const issued = { ...transition(baseInvoice(), "issued"), dueAt: 1000 };
    expect(deriveStatus(issued, 2000)).toBe("overdue");
    expect(deriveStatus(issued, 500)).toBe("issued");
  });

  it("derives partial then paid across payments", () => {
    const issued = transition(baseInvoice(), "issued");
    const part = recordPayment(issued, 400);
    expect(deriveStatus(part, 0)).toBe("partial");
    const paid = recordPayment(part, 600);
    expect(deriveStatus(paid, 9e9)).toBe("paid");
  });
});

describe("withDerivedStatus", () => {
  it("stamps the derived status immutably", () => {
    const issued = { ...transition(baseInvoice(), "issued"), dueAt: 1000 };
    const od = withDerivedStatus(issued, 2000);
    expect(od.status).toBe("overdue");
    expect(issued.status).toBe("issued");
  });

  it("returns the same reference when unchanged", () => {
    const issued = transition(baseInvoice(), "issued");
    expect(withDerivedStatus(issued, 0)).toBe(issued);
  });
});
