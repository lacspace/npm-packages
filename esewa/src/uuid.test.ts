import { describe, it, expect } from "vitest";
import { generateTransactionUuid, isValidTransactionUuid, signPayment, verifyResponse, ESEWA_TEST_SECRET, ESEWA_TEST_PRODUCT_CODE, ESEWA_SIGNED_FIELD_NAMES } from "./index";

describe("isValidTransactionUuid", () => {
  it("accepts safe charset ids", () => {
    expect(isValidTransactionUuid("tx-1")).toBe(true);
    expect(isValidTransactionUuid("240-Xq7Rt")).toBe(true);
    expect(isValidTransactionUuid("abcDEF123")).toBe(true);
  });

  it("rejects unsafe / malformed ids", () => {
    expect(isValidTransactionUuid("")).toBe(false);
    expect(isValidTransactionUuid("-lead")).toBe(false);
    expect(isValidTransactionUuid("trail-")).toBe(false);
    expect(isValidTransactionUuid("double--hyphen")).toBe(false);
    expect(isValidTransactionUuid("has space")).toBe(false);
    expect(isValidTransactionUuid("under_score")).toBe(false);
    expect(isValidTransactionUuid("a".repeat(65))).toBe(false);
  });
});

describe("generateTransactionUuid", () => {
  it("produces a valid id by default", () => {
    const id = generateTransactionUuid();
    expect(isValidTransactionUuid(id)).toBe(true);
    expect(id.length).toBe(20);
  });

  it("honours a custom length", () => {
    expect(generateTransactionUuid({ length: 8 }).length).toBe(8);
  });

  it("applies a sanitised prefix and stays within the 64-char cap", () => {
    const id = generateTransactionUuid({ prefix: "ord/24#1", length: 60 });
    expect(id.startsWith("ord241-")).toBe(true);
    expect(isValidTransactionUuid(id)).toBe(true);
    expect(id.length).toBeLessThanOrEqual(64);
  });

  it("is unique across many calls (CSPRNG)", () => {
    const set = new Set(Array.from({ length: 200 }, () => generateTransactionUuid()));
    expect(set.size).toBe(200);
  });

  it("a generated uuid signs and round-trips through verifyResponse", async () => {
    const transaction_uuid = generateTransactionUuid({ prefix: "240" });
    const signature = await signPayment(
      { total_amount: "100", transaction_uuid, product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    const payload = {
      status: "COMPLETE",
      total_amount: "100",
      transaction_uuid,
      product_code: ESEWA_TEST_PRODUCT_CODE,
      signed_field_names: ESEWA_SIGNED_FIELD_NAMES,
      signature,
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString("base64");
    const r = await verifyResponse(b64, ESEWA_TEST_SECRET);
    expect(r.valid).toBe(true);
  });
});
