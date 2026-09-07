import { test, expect } from "vitest";
import { paymentTokenMessage, validationTokenMessage, signToken, verifyToken } from "./index";

/* --------------------------------------------------------------- *
 * These tests LOCK the canonical message strings. The exported
 * builders must reproduce the internal signing message byte-for-byte,
 * so a regression here would mean a broken (rejected) payment.
 * --------------------------------------------------------------- */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
function wrapPem(label: string, der: ArrayBuffer): string {
  const b64 = bytesToBase64(new Uint8Array(der));
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}
async function makeKeys(): Promise<{ privateKeyPem: string; publicKeyPem: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  return { privateKeyPem: wrapPem("PRIVATE KEY", pkcs8), publicKeyPem: wrapPem("PUBLIC KEY", spki) };
}

const params = {
  MERCHANTID: "123",
  APPID: "APP123",
  APPNAME: "lacspace-shop",
  TXNID: "TXN001",
  TXNDATE: "05-09-2026",
  TXNCRNCY: "NPR",
  TXNAMT: 100000,
  REFERENCEID: "REF001",
  REMARKS: "order-1",
  PARTICULARS: "order-1",
} as const;

const EXPECTED_PAYMENT_MESSAGE =
  "MERCHANTID=123,APPID=APP123,APPNAME=lacspace-shop,TXNID=TXN001,TXNDATE=05-09-2026," +
  "TXNCRNCY=NPR,TXNAMT=100000,REFERENCEID=REF001,REMARKS=order-1,PARTICULARS=order-1,TOKEN=TOKEN";

const EXPECTED_VALIDATION_MESSAGE = "MERCHANTID=123,APPID=APP123,REFERENCEID=REF001,TXNAMT=100000";

test("paymentTokenMessage is locked to the exact canonical string", () => {
  expect(paymentTokenMessage(params)).toBe(EXPECTED_PAYMENT_MESSAGE);
});

test("validationTokenMessage is locked to the exact canonical string", () => {
  expect(
    validationTokenMessage({ merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 }),
  ).toBe(EXPECTED_VALIDATION_MESSAGE);
});

test("signToken signs EXACTLY paymentTokenMessage (cryptographic lock)", async () => {
  const { privateKeyPem, publicKeyPem } = await makeKeys();
  const sig = await signToken(params, privateKeyPem);
  // The real signer's output must verify against the exported builder's string.
  expect(await verifyToken(paymentTokenMessage(params), sig, publicKeyPem)).toBe(true);
});

test("paymentTokenMessage keeps the 11-field order ending in TOKEN=TOKEN", () => {
  const parts = paymentTokenMessage(params).split(",");
  expect(parts.length).toBe(11);
  expect(parts[0]!.startsWith("MERCHANTID=")).toBe(true);
  expect(parts[parts.length - 1]).toBe("TOKEN=TOKEN");
});

test("validationTokenMessage has the 4 fields in order", () => {
  const parts = validationTokenMessage({ merchantId: "m", appId: "a", referenceId: "r", txnAmt: 5 }).split(",");
  expect(parts).toEqual(["MERCHANTID=m", "APPID=a", "REFERENCEID=r", "TXNAMT=5"]);
});
