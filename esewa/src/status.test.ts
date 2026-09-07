import { describe, it, expect } from "vitest";
import {
  buildStatusRequest,
  parseStatusResponse,
  isEsewaStatus,
  ESEWA_STATUS_URLS,
  ESEWA_TEST_PRODUCT_CODE,
} from "./index";

describe("buildStatusRequest", () => {
  it("builds the test status URL with the right params and no I/O", () => {
    const req = buildStatusRequest(
      { product_code: ESEWA_TEST_PRODUCT_CODE, total_amount: 100, transaction_uuid: "tx-1" },
      { env: "test" },
    );
    expect(req.method).toBe("GET");
    expect(req.url.startsWith(ESEWA_STATUS_URLS.test)).toBe(true);
    expect(req.url).toContain("product_code=EPAYTEST");
    expect(req.url).toContain("total_amount=100");
    expect(req.url).toContain("transaction_uuid=tx-1");
    expect(req.params).toEqual({
      product_code: "EPAYTEST",
      total_amount: "100",
      transaction_uuid: "tx-1",
    });
  });

  it("defaults to the test env and switches to prod", () => {
    expect(buildStatusRequest({ product_code: "X", total_amount: 1, transaction_uuid: "y" }).url).toContain(
      "rc.esewa.com.np",
    );
    const prod = buildStatusRequest(
      { product_code: "X", total_amount: 1, transaction_uuid: "y" },
      { env: "prod" },
    );
    expect(prod.url.startsWith(ESEWA_STATUS_URLS.prod)).toBe(true);
  });
});

describe("isEsewaStatus", () => {
  it("recognises documented statuses", () => {
    expect(isEsewaStatus("COMPLETE")).toBe(true);
    expect(isEsewaStatus("PENDING")).toBe(true);
    expect(isEsewaStatus("NOT_FOUND")).toBe(true);
    expect(isEsewaStatus("nope")).toBe(false);
    expect(isEsewaStatus(42)).toBe(false);
  });
});

describe("parseStatusResponse", () => {
  it("narrows a COMPLETE response and coerces total_amount", () => {
    const parsed = parseStatusResponse({
      product_code: "EPAYTEST",
      transaction_uuid: "tx-1",
      total_amount: 100,
      status: "COMPLETE",
      ref_id: "0007GO7",
    });
    expect(parsed.status).toBe("COMPLETE");
    expect(parsed.total_amount).toBe(100);
    expect(parsed.ref_id).toBe("0007GO7");
    expect(parsed.transaction_uuid).toBe("tx-1");
  });

  it("coerces a string/comma total_amount to a number", () => {
    expect(parseStatusResponse({ status: "COMPLETE", total_amount: "1,000.50" }).total_amount).toBe(1000.5);
  });

  it("falls back to ERROR for missing/invalid status and keeps raw", () => {
    const parsed = parseStatusResponse({ foo: "bar" });
    expect(parsed.status).toBe("ERROR");
    expect(parsed.raw).toEqual({ foo: "bar" });
  });

  it("passes through an unknown string status verbatim", () => {
    expect(parseStatusResponse({ status: "WEIRD" }).status).toBe("WEIRD");
  });

  it("tolerates non-object input without throwing", () => {
    expect(parseStatusResponse(null).status).toBe("ERROR");
    expect(parseStatusResponse("nope").status).toBe("ERROR");
  });
});
