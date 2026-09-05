import { describe, it, expect } from "vitest";
import {
  signPayment,
  buildForm,
  verifyResponse,
  checkStatus,
  ESEWA_TEST_SECRET,
  ESEWA_TEST_PRODUCT_CODE,
  ESEWA_SIGNED_FIELD_NAMES,
  ESEWA_STATUS_URLS,
} from "./index";

/** Encode an object to the base64 JSON payload eSewa returns as `data`. */
function encodeData(obj: Record<string, unknown>): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(JSON.stringify(obj))
      : Buffer.from(JSON.stringify(obj)).toString("base64");
  return b64;
}

describe("signPayment", () => {
  it("produces a stable, non-empty base64 HMAC", async () => {
    const sig = await signPayment(
      { total_amount: 100, transaction_uuid: "tx-1", product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    expect(sig).toMatch(/^[A-Za-z0-9+/]+=*$/);
    const again = await signPayment(
      { total_amount: 100, transaction_uuid: "tx-1", product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    expect(sig).toBe(again);
  });
});

describe("verifyResponse", () => {
  it("round-trips a signature produced by signPayment", async () => {
    const fields = {
      transaction_code: "000AWEO",
      status: "COMPLETE",
      total_amount: "100",
      transaction_uuid: "tx-42",
      product_code: ESEWA_TEST_PRODUCT_CODE,
    };
    // eSewa signs total_amount,transaction_uuid,product_code by default.
    const signature = await signPayment(
      {
        total_amount: fields.total_amount,
        transaction_uuid: fields.transaction_uuid,
        product_code: fields.product_code,
      },
      ESEWA_TEST_SECRET,
    );
    const payload = { ...fields, signed_field_names: ESEWA_SIGNED_FIELD_NAMES, signature };
    const r = await verifyResponse(encodeData(payload), ESEWA_TEST_SECRET);
    expect(r.valid).toBe(true);
    expect(r.data.transaction_uuid).toBe("tx-42");
  });

  it("verifies a payload whose signed_field_names lists extra fields", async () => {
    const names = "transaction_code,status,total_amount,transaction_uuid,product_code,signed_field_names";
    const data: Record<string, string> = {
      transaction_code: "000AWEO",
      status: "COMPLETE",
      total_amount: "100.0",
      transaction_uuid: "tx-9",
      product_code: ESEWA_TEST_PRODUCT_CODE,
      signed_field_names: names,
    };
    const message = names.split(",").map((n) => `${n}=${data[n]}`).join(",");
    // Sign the exact message verifyResponse will recompute.
    const good = await signMessage(message, ESEWA_TEST_SECRET);
    const r = await verifyResponse(encodeData({ ...data, signature: good }), ESEWA_TEST_SECRET);
    expect(r.valid).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const payload = {
      status: "COMPLETE",
      total_amount: "100",
      transaction_uuid: "tx-42",
      product_code: ESEWA_TEST_PRODUCT_CODE,
      signed_field_names: ESEWA_SIGNED_FIELD_NAMES,
      signature: "not-a-real-signature==",
    };
    const r = await verifyResponse(encodeData(payload), ESEWA_TEST_SECRET);
    expect(r.valid).toBe(false);
    expect(r.data.transaction_uuid).toBe("tx-42");
  });

  it("rejects malformed base64/JSON without throwing", async () => {
    const r = await verifyResponse("###not base64###", ESEWA_TEST_SECRET);
    expect(r.valid).toBe(false);
  });
});

describe("buildForm", () => {
  it("computes total_amount and sets signed_field_names + signature", async () => {
    const form = await buildForm(
      {
        amount: 100,
        taxAmount: 10,
        productServiceCharge: 5,
        productDeliveryCharge: 5,
        transactionUuid: "tx-77",
        productCode: ESEWA_TEST_PRODUCT_CODE,
        successUrl: "https://me/ok",
        failureUrl: "https://me/fail",
      },
      { secret: ESEWA_TEST_SECRET, env: "test" },
    );

    expect(form.method).toBe("POST");
    expect(form.action).toContain("rc-epay.esewa.com.np");
    expect(form.fields.total_amount).toBe("120"); // 100 + 10 + 5 + 5
    expect(form.fields.signed_field_names).toBe(ESEWA_SIGNED_FIELD_NAMES);

    // The signature must verify against the built fields.
    const r = await verifyResponse(encodeData(form.fields), ESEWA_TEST_SECRET);
    expect(r.valid).toBe(true);
  });

  it("honours an explicit totalAmount override", async () => {
    const form = await buildForm(
      {
        amount: 100,
        totalAmount: 999,
        transactionUuid: "tx-1",
        productCode: ESEWA_TEST_PRODUCT_CODE,
        successUrl: "https://me/ok",
        failureUrl: "https://me/fail",
      },
      { secret: ESEWA_TEST_SECRET },
    );
    expect(form.fields.total_amount).toBe("999");
  });
});

describe("checkStatus", () => {
  it("builds the correct status URL and query params", async () => {
    let captured = "";
    const fakeFetch = (async (url: string) => {
      captured = url;
      return { json: async () => ({ status: "COMPLETE" }) };
    }) as unknown as typeof fetch;

    const out = await checkStatus(
      { product_code: ESEWA_TEST_PRODUCT_CODE, total_amount: 100, transaction_uuid: "tx-5" },
      { env: "test", fetch: fakeFetch },
    );

    expect(captured.startsWith(ESEWA_STATUS_URLS.test)).toBe(true);
    expect(captured).toContain("product_code=EPAYTEST");
    expect(captured).toContain("total_amount=100");
    expect(captured).toContain("transaction_uuid=tx-5");
    expect(out).toEqual({ status: "COMPLETE" });
  });

  it("uses the prod endpoint when env=prod", async () => {
    let captured = "";
    const fakeFetch = (async (url: string) => {
      captured = url;
      return { json: async () => ({}) };
    }) as unknown as typeof fetch;
    await checkStatus(
      { product_code: "X", total_amount: "1", transaction_uuid: "y" },
      { env: "prod", fetch: fakeFetch },
    );
    expect(captured.startsWith(ESEWA_STATUS_URLS.prod)).toBe(true);
  });
});

/** Test helper mirroring verifyResponse's HMAC (via the public signer over a raw message). */
async function signMessage(message: string, secret: string): Promise<string> {
  // signPayment builds "total_amount=..,transaction_uuid=..,product_code=..";
  // to sign an arbitrary message we import the internal path indirectly by
  // constructing fields so the joined message equals `message`. Instead we use
  // Web Crypto directly here to keep the test independent.
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}
