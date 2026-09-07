import { describe, it, expect } from "vitest";
import {
  KHALTI_SANDBOX_BASE_URL,
  KHALTI_PRODUCTION_BASE_URL,
  KHALTI_BASE_URLS,
  buildAuthHeader,
  baseUrlFor,
  buildInitiateBody,
  buildLookupBody,
  KHALTI_MIN_AMOUNT_PAISA,
  validateAmount,
  parseCallbackParams,
  verifyCallback,
  generateOrderId,
} from "./index";

describe("config presets", () => {
  it("sandbox/production constants match KHALTI_BASE_URLS byte-for-byte", () => {
    expect(KHALTI_SANDBOX_BASE_URL).toBe(KHALTI_BASE_URLS.test);
    expect(KHALTI_PRODUCTION_BASE_URL).toBe(KHALTI_BASE_URLS.prod);
    expect(KHALTI_SANDBOX_BASE_URL).toBe("https://a.khalti.com/api/v2");
    expect(KHALTI_PRODUCTION_BASE_URL).toBe("https://khalti.com/api/v2");
  });

  it("buildAuthHeader produces the exact Key header", () => {
    expect(buildAuthHeader("secret-123")).toEqual({ Authorization: "Key secret-123" });
  });

  it("baseUrlFor resolves aliases", () => {
    expect(baseUrlFor("sandbox")).toBe(KHALTI_SANDBOX_BASE_URL);
    expect(baseUrlFor("test")).toBe(KHALTI_SANDBOX_BASE_URL);
    expect(baseUrlFor("production")).toBe(KHALTI_PRODUCTION_BASE_URL);
    expect(baseUrlFor("prod")).toBe(KHALTI_PRODUCTION_BASE_URL);
  });
});

describe("buildInitiateBody", () => {
  it("produces the exact minimal body with required fields", () => {
    const body = buildInitiateBody({
      return_url: "https://me/return",
      website_url: "https://me",
      amount: 1000,
      purchase_order_id: "order-42",
      purchase_order_name: "Test order",
    });
    expect(body).toEqual({
      return_url: "https://me/return",
      website_url: "https://me",
      amount: 1000,
      purchase_order_id: "order-42",
      purchase_order_name: "Test order",
    });
  });

  it("omits undefined optionals but keeps provided ones", () => {
    const body = buildInitiateBody({
      return_url: "https://me/return",
      website_url: "https://me",
      amount: 2000,
      purchase_order_id: "o1",
      purchase_order_name: "n",
      customer_info: { name: "Ram", phone: "9800000000" },
      amount_breakdown: [{ label: "Item", amount: 2000 }],
    });
    expect(body.customer_info).toEqual({ name: "Ram", phone: "9800000000" });
    expect(body.amount_breakdown).toEqual([{ label: "Item", amount: 2000 }]);
    expect("product_details" in body).toBe(false);
  });
});

describe("buildLookupBody", () => {
  it("produces { pidx }", () => {
    expect(buildLookupBody("abc123")).toEqual({ pidx: "abc123" });
  });
});

describe("validateAmount", () => {
  it("passes for a valid integer paisa amount at the minimum", () => {
    expect(validateAmount(KHALTI_MIN_AMOUNT_PAISA)).toEqual({ valid: true, errors: [] });
    expect(KHALTI_MIN_AMOUNT_PAISA).toBe(1000);
  });

  it("fails below the minimum", () => {
    const r = validateAmount(999);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/below the minimum/);
  });

  it("fails on non-integer amounts", () => {
    const r = validateAmount(1000.5);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /integer/.test(e))).toBe(true);
  });

  it("fails on non-finite amounts", () => {
    expect(validateAmount(Number.NaN).valid).toBe(false);
    expect(validateAmount(Infinity).valid).toBe(false);
  });

  it("honours a custom min and max", () => {
    expect(validateAmount(500, { min: 500 }).valid).toBe(true);
    expect(validateAmount(6000, { max: 5000 }).valid).toBe(false);
  });

  it("passes when the breakdown sums to the amount", () => {
    const r = validateAmount(1000, {
      breakdown: [
        { label: "Item", amount: 600 },
        { label: "Tax", amount: 400 },
      ],
    });
    expect(r).toEqual({ valid: true, errors: [] });
  });

  it("fails when the breakdown does not sum to the amount", () => {
    const r = validateAmount(1000, {
      breakdown: [
        { label: "Item", amount: 600 },
        { label: "Tax", amount: 300 },
      ],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /sums to 900/.test(e))).toBe(true);
  });
});

describe("parseCallbackParams", () => {
  it("parses a URLSearchParams and coerces amounts to numbers", () => {
    const q = new URLSearchParams({
      pidx: "abc123",
      status: "Completed",
      transaction_id: "txn-9",
      amount: "1000",
      total_amount: "1000",
      purchase_order_id: "order-42",
    });
    const p = parseCallbackParams(q);
    expect(p.pidx).toBe("abc123");
    expect(p.status).toBe("Completed");
    expect(p.amount).toBe(1000);
    expect(p.total_amount).toBe(1000);
    expect(p.purchase_order_id).toBe("order-42");
  });

  it("parses a plain object (req.query) incl. string[] values", () => {
    const p = parseCallbackParams({
      pidx: "p1",
      status: ["Pending"],
      amount: "2000",
    });
    expect(p.pidx).toBe("p1");
    expect(p.status).toBe("Pending");
    expect(p.amount).toBe(2000);
  });
});

describe("verifyCallback", () => {
  it("matches when pidx present and amount/order agree, and marks completed", () => {
    const p = parseCallbackParams(
      new URLSearchParams({
        pidx: "abc123",
        status: "Completed",
        transaction_id: "txn-9",
        total_amount: "1000",
        purchase_order_id: "order-42",
      }),
    );
    const v = verifyCallback(p, { amount: 1000, purchase_order_id: "order-42" });
    expect(v.matches).toBe(true);
    expect(v.completed).toBe(true);
    expect(v.mismatches).toEqual([]);
    expect(v.shouldLookup).toBe(true);
    expect(v.pidx).toBe("abc123");
    expect(v.transaction_id).toBe("txn-9");
  });

  it("flags an amount mismatch", () => {
    const p = parseCallbackParams(
      new URLSearchParams({ pidx: "x", status: "Completed", total_amount: "500" }),
    );
    const v = verifyCallback(p, { amount: 1000 });
    expect(v.matches).toBe(false);
    expect(v.mismatches.some((m) => /amount mismatch/.test(m))).toBe(true);
    expect(v.shouldLookup).toBe(true);
  });

  it("flags a purchase_order_id mismatch and a missing pidx", () => {
    const v = verifyCallback(
      { status: "Completed", purchase_order_id: "wrong" },
      { purchase_order_id: "order-42" },
    );
    expect(v.matches).toBe(false);
    expect(v.mismatches.some((m) => /missing pidx/.test(m))).toBe(true);
    expect(v.mismatches.some((m) => /purchase_order_id mismatch/.test(m))).toBe(true);
  });

  it("does not mark completed for a non-success status", () => {
    const v = verifyCallback({ pidx: "x", status: "User canceled" });
    expect(v.completed).toBe(false);
    expect(v.matches).toBe(true); // no expectations violated
  });
});

describe("generateOrderId", () => {
  it("has the default prefix and is unique across calls", () => {
    const a = generateOrderId();
    const b = generateOrderId();
    expect(a.startsWith("order-")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("respects prefix and can omit the timestamp segment", () => {
    const id = generateOrderId({ prefix: "inv", timestamp: false, bytes: 4 });
    expect(id.startsWith("inv-")).toBe(true);
    // prefix + 8 hex chars → "inv-xxxxxxxx"
    expect(id).toMatch(/^inv-[0-9a-f]{8}$/);
  });
});
