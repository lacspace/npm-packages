import { describe, it, expect } from "vitest";
import { signPayment, buildForm, ESEWA_TEST_SECRET, ESEWA_TEST_PRODUCT_CODE } from "./index";

/**
 * LOCK: these assert the EXISTING signature output is byte-for-byte unchanged
 * for known inputs. If any of these fail, the signing has drifted and REAL
 * eSewa payments would break — do not "fix" them by updating the expected value.
 */
describe("signature lock (byte-for-byte, live-payment critical)", () => {
  it("signPayment matches the known-good HMAC for total=100/tx-1/EPAYTEST", async () => {
    const sig = await signPayment(
      { total_amount: 100, transaction_uuid: "tx-1", product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    expect(sig).toBe("h1gv5ajLXWiLn5V1UyNeQQKQvZfAjMfrpRNyZ8VMD+4=");
  });

  it("signPayment matches the known-good HMAC for total=120/240-tx/EPAYTEST", async () => {
    const sig = await signPayment(
      { total_amount: 120, transaction_uuid: "240-tx", product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    expect(sig).toBe("TsIxjHyMMva2RB6d45NvKsi6tk4o26UlgZ3XoljSAAM=");
  });

  it("string and numeric total_amount produce the identical signature", async () => {
    const a = await signPayment(
      { total_amount: 100, transaction_uuid: "tx-1", product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    const b = await signPayment(
      { total_amount: "100", transaction_uuid: "tx-1", product_code: ESEWA_TEST_PRODUCT_CODE },
      ESEWA_TEST_SECRET,
    );
    expect(a).toBe(b);
    expect(a).toBe("h1gv5ajLXWiLn5V1UyNeQQKQvZfAjMfrpRNyZ8VMD+4=");
  });

  it("buildForm embeds the locked signature for the same signed fields", async () => {
    const form = await buildForm(
      {
        amount: 100,
        transactionUuid: "tx-1",
        productCode: ESEWA_TEST_PRODUCT_CODE,
        successUrl: "https://me/ok",
        failureUrl: "https://me/fail",
      },
      { secret: ESEWA_TEST_SECRET, env: "test" },
    );
    expect(form.fields.total_amount).toBe("100");
    expect(form.fields.signature).toBe("h1gv5ajLXWiLn5V1UyNeQQKQvZfAjMfrpRNyZ8VMD+4=");
  });
});
