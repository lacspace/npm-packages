import { test, expect } from "vitest";
import { signToken, buildForm, validateTxn, verifyToken, VALIDATE_URL, LOGIN_URL } from "./index";

/* --------------------------------------------------------------- *
 * Test key material — generate a real RSASSA-PKCS1-v1_5 keypair and
 * export it as PKCS#8 (private) + SPKI (public) PEM, so the crypto
 * paths are exercised end-to-end, not mocked.
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

const tokenMessage =
  "MERCHANTID=123,APPID=APP123,APPNAME=lacspace-shop,TXNID=TXN001,TXNDATE=05-09-2026," +
  "TXNCRNCY=NPR,TXNAMT=100000,REFERENCEID=REF001,REMARKS=order-1,PARTICULARS=order-1,TOKEN=TOKEN";

test("signToken → verifyToken round-trips true", async () => {
  const { privateKeyPem, publicKeyPem } = await makeKeys();
  const sig = await signToken(params, privateKeyPem);
  expect(typeof sig).toBe("string");
  expect(sig.length).toBeGreaterThan(0);
  expect(await verifyToken(tokenMessage, sig, publicKeyPem)).toBe(true);
});

test("tampered message verifies false", async () => {
  const { privateKeyPem, publicKeyPem } = await makeKeys();
  const sig = await signToken(params, privateKeyPem);
  const tampered = tokenMessage.replace("TXNAMT=100000", "TXNAMT=1");
  expect(await verifyToken(tampered, sig, publicKeyPem)).toBe(false);
});

test("buildForm returns the login action + signed TOKEN field", async () => {
  const { privateKeyPem } = await makeKeys();
  const form = await buildForm(params, { privateKeyPem, env: "prod" });
  expect(form.action).toBe(LOGIN_URL.prod);
  expect(form.method).toBe("POST");
  expect(form.fields.MERCHANTID).toBe("123");
  expect(form.fields.TXNAMT).toBe("100000");
  expect(typeof form.fields.TOKEN).toBe("string");
  expect(form.fields.TOKEN.length).toBeGreaterThan(0);
});

test("buildForm defaults to the UAT (test) gateway", async () => {
  const { privateKeyPem } = await makeKeys();
  const form = await buildForm(params, { privateKeyPem });
  expect(form.action).toBe(LOGIN_URL.test);
});

test("validateTxn calls the correct URL with Basic auth + token", async () => {
  const { privateKeyPem, publicKeyPem } = await makeKeys();

  let calledUrl = "";
  let calledInit: RequestInit | undefined;
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    calledUrl = String(url);
    calledInit = init;
    return new Response(JSON.stringify({ status: "SUCCESS" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;

  const result = (await validateTxn(
    { merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 },
    { user: "apiuser", password: "secret", privateKeyPem, env: "prod", fetch: fakeFetch },
  )) as { status: string };

  expect(result.status).toBe("SUCCESS");
  expect(calledUrl).toBe(VALIDATE_URL.prod);

  const headers = calledInit?.headers as Record<string, string>;
  const expectedBasic = `Basic ${btoa("apiuser:secret")}`;
  expect(headers.Authorization).toBe(expectedBasic);
  expect(headers["Content-Type"]).toBe("application/json");

  const body = JSON.parse(String(calledInit?.body));
  expect(body.merchantId).toBe("123");
  expect(body.appId).toBe("APP123");
  expect(body.referenceId).toBe("REF001");
  expect(body.txnAmt).toBe(100000);
  expect(typeof body.token).toBe("string");

  // The validation token must verify against the canonical validation message.
  const validationMessage = "MERCHANTID=123,APPID=APP123,REFERENCEID=REF001,TXNAMT=100000";
  expect(await verifyToken(validationMessage, body.token, publicKeyPem)).toBe(true);
});
