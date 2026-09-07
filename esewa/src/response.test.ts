import { describe, it, expect } from "vitest";
import {
  decodeResponse,
  verifyDecodedResponse,
  signPayment,
  ESEWA_TEST_SECRET,
  ESEWA_TEST_PRODUCT_CODE,
  ESEWA_SIGNED_FIELD_NAMES,
} from "./index";

function encodeData(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

describe("decodeResponse", () => {
  it("decodes the base64 payload into a typed object (no verification)", () => {
    const data = decodeResponse(
      encodeData({ status: "COMPLETE", transaction_uuid: "tx-1", product_code: "EPAYTEST" }),
    );
    expect(data?.status).toBe("COMPLETE");
    expect(data?.transaction_uuid).toBe("tx-1");
  });

  it("returns null for malformed base64/JSON", () => {
    expect(decodeResponse("###not base64###")).toBeNull();
    expect(decodeResponse(Buffer.from("[]").toString("base64"))).toBeNull();
  });
});

describe("verifyDecodedResponse", () => {
  it("composes verifyResponse and returns typed data on a valid payload", async () => {
    const transaction_uuid = "tx-99";
    const signature = await signPayment(
      { total_amount: "100", transaction_uuid, product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    const b64 = encodeData({
      status: "COMPLETE",
      total_amount: "100",
      transaction_uuid,
      product_code: ESEWA_TEST_PRODUCT_CODE,
      signed_field_names: ESEWA_SIGNED_FIELD_NAMES,
      signature,
    });
    const { valid, data } = await verifyDecodedResponse(b64, ESEWA_TEST_SECRET);
    expect(valid).toBe(true);
    expect(data.status).toBe("COMPLETE");
    expect(data.transaction_uuid).toBe("tx-99");
  });

  it("reports invalid for a tampered signature but still exposes data", async () => {
    const b64 = encodeData({
      status: "COMPLETE",
      total_amount: "100",
      transaction_uuid: "tx-1",
      product_code: ESEWA_TEST_PRODUCT_CODE,
      signed_field_names: ESEWA_SIGNED_FIELD_NAMES,
      signature: "bogus==",
    });
    const { valid, data } = await verifyDecodedResponse(b64, ESEWA_TEST_SECRET);
    expect(valid).toBe(false);
    expect(data.transaction_uuid).toBe("tx-1");
  });
});
