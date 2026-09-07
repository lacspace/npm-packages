import { test, expect } from "vitest";
import {
  signRequest,
  verifyResponse,
  dvHash,
  verifyResponseResult,
  buildFormPost,
  buildQrRequest,
  GATEWAY_URL,
} from "./index";

const secret = "fonepay-merchant-secret";

const params = {
  PID: "MERCHANT",
  PRN: "prn-0001",
  AMT: 1000,
  DT: "09/05/2026",
  R1: "test-r1",
  R2: "test-r2",
  RU: "https://shop.me/return",
} as const;

/* ------------------------------------------------------------------ *
 * BYTE-FOR-BYTE LOCKS — these MUST NOT change. A change here means a
 * change to live DV/hash output and would break real payments.
 * ------------------------------------------------------------------ */

test("LOCK: signRequest DV for a known input is byte-for-byte stable", async () => {
  const dv = await signRequest(params, secret);
  expect(dv).toBe(
    "a4864524ffc5a2b33fb751af1d73a04bd8605c7362abc26b656bd05ce621cd62" +
      "a3e777f8b2c36ab09dc532ea19fc0c7cf1351282aa70a08380f85eec3b3fd957",
  );
});

test("LOCK: response DV for a known input is byte-for-byte stable", async () => {
  const respMessage = "prn-0001,MERCHANT,true,successful,UID123,BANK,init,1000,1000";
  const expected =
    "538e0e2a5c4f9c6ed64e5388211bb0f0fdd1b7798a3c9402bbfee7a4bd841551" +
    "be6479193a05777b60b6077564fb8887747988b7343dce0e5b80531cb34bd706";
  expect(await dvHash(secret, respMessage)).toBe(expected);

  const good = await verifyResponse(
    {
      PRN: "prn-0001",
      PID: "MERCHANT",
      PS: "true",
      RC: "successful",
      UID: "UID123",
      BC: "BANK",
      INI: "init",
      P_AMT: 1000,
      R_AMT: 1000,
      DV: expected,
    },
    secret,
  );
  expect(good.valid).toBe(true);
});

/* ------------------------------------------------------------------ *
 * dvHash primitive
 * ------------------------------------------------------------------ */

test("dvHash is the exact primitive behind signRequest", async () => {
  const reqMessage = "MERCHANT,P,prn-0001,1000,NPR,09/05/2026,test-r1,test-r2,https://shop.me/return";
  expect(await dvHash(secret, reqMessage)).toBe(await signRequest(params, secret));
});

test("dvHash is deterministic 128-char lowercase hex", async () => {
  const a = await dvHash(secret, "anything");
  const b = await dvHash(secret, "anything");
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{128}$/);
});

/* ------------------------------------------------------------------ *
 * verifyResponseResult
 * ------------------------------------------------------------------ */

const resp = {
  PRN: "prn-0001",
  PID: "MERCHANT",
  PS: "true",
  RC: "successful",
  UID: "UID123",
  BC: "BANK",
  INI: "init",
  P_AMT: 1000,
  R_AMT: 1000,
} as const;

test("verifyResponseResult returns ok for a valid response", async () => {
  const message = "prn-0001,MERCHANT,true,successful,UID123,BANK,init,1000,1000";
  const dv = await dvHash(secret, message);
  const r = await verifyResponseResult({ ...resp, DV: dv }, secret);
  expect(r).toEqual({ ok: true });
});

test("verifyResponseResult reports signature-mismatch on tamper", async () => {
  const message = "prn-0001,MERCHANT,true,successful,UID123,BANK,init,1000,1000";
  const dv = await dvHash(secret, message);
  const r = await verifyResponseResult({ ...resp, R_AMT: 5000, DV: dv }, secret);
  expect(r).toEqual({ ok: false, reason: "signature-mismatch" });
});

test("verifyResponseResult reports missing-dv when DV is empty", async () => {
  const r = await verifyResponseResult({ ...resp, DV: "" }, secret);
  expect(r).toEqual({ ok: false, reason: "missing-dv" });
});

/* ------------------------------------------------------------------ *
 * buildFormPost
 * ------------------------------------------------------------------ */

test("buildFormPost gives the gateway action and DV-bearing fields", async () => {
  const { action, fields, dv } = await buildFormPost(params, { secret, env: "prod" });
  expect(action).toBe(GATEWAY_URL.prod);
  expect(fields.DV).toBe(dv);
  expect(dv).toBe(await signRequest(params, secret));
  expect(fields.PID).toBe("MERCHANT");
  expect(fields.MD).toBe("P");
  expect(fields.CRN).toBe("NPR");
});

test("buildFormPost defaults to the dev (test) gateway", async () => {
  const { action } = await buildFormPost(params, { secret });
  expect(action).toBe(GATEWAY_URL.test);
});

/* ------------------------------------------------------------------ *
 * buildQrRequest
 * ------------------------------------------------------------------ */

test("buildQrRequest DV is deterministic 128-hex and locked byte-for-byte", async () => {
  const { params: qp, dv } = await buildQrRequest(
    { merchantCode: "MERCHANT", amount: 1000, prn: "prn-0001", remarks1: "note1", remarks2: "note2" },
    secret,
  );
  expect(dv).toMatch(/^[0-9a-f]{128}$/);
  expect(qp.dataValidation).toBe(dv);
  expect(dv).toBe(
    "9c7a954ca0dbbb866d40a9c6a971fbc4d55a5396d100d9bbad069e7752654e3c" +
      "eaf1b48f9f6dd84ee42139bda3d7d4d3bfc3adb0b0c51339c1867dd08aea336d",
  );
});

test("buildQrRequest DV changes with the amount and defaults remarks to ''", async () => {
  const a = await buildQrRequest({ merchantCode: "M", amount: 100, prn: "p1" }, secret);
  const b = await buildQrRequest({ merchantCode: "M", amount: 200, prn: "p1" }, secret);
  expect(a.dv).not.toBe(b.dv);
  expect(a.params.remarks1).toBe("");
  expect(a.params.remarks2).toBe("");
});
