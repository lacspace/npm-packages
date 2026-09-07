import { test, expect } from "vitest";
import {
  buildValidationRequest,
  validationTokenMessage,
  verifyToken,
  ENDPOINTS,
  LOGIN_URL,
  VALIDATE_URL,
} from "./index";

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

const vparams = { merchantId: "123", appId: "APP123", referenceId: "REF001", txnAmt: 100000 } as const;

test("buildValidationRequest → prod url, correct body, token verifies against canonical message", async () => {
  const { privateKeyPem, publicKeyPem } = await makeKeys();
  const req = await buildValidationRequest(vparams, { privateKeyPem, env: "prod" });

  expect(req.url).toBe(VALIDATE_URL.prod);
  expect(req.method).toBe("POST");
  expect(req.body.merchantId).toBe("123");
  expect(req.body.appId).toBe("APP123");
  expect(req.body.referenceId).toBe("REF001");
  expect(req.body.txnAmt).toBe(100000);
  expect(req.body.token).toBe(req.token);

  const msg = validationTokenMessage(vparams);
  expect(await verifyToken(msg, req.token, publicKeyPem)).toBe(true);
});

test("buildValidationRequest defaults to UAT and omits Authorization without creds", async () => {
  const { privateKeyPem } = await makeKeys();
  const req = await buildValidationRequest(vparams, { privateKeyPem });
  expect(req.url).toBe(VALIDATE_URL.test);
  expect(req.headers["Content-Type"]).toBe("application/json");
  expect(req.headers.Authorization).toBeUndefined();
});

test("buildValidationRequest adds Basic auth when user+password given", async () => {
  const { privateKeyPem } = await makeKeys();
  const req = await buildValidationRequest(vparams, {
    privateKeyPem,
    user: "apiuser",
    password: "secret",
  });
  expect(req.headers.Authorization).toBe(`Basic ${btoa("apiuser:secret")}`);
});

test("ENDPOINTS preset mirrors LOGIN_URL / VALIDATE_URL", () => {
  expect(ENDPOINTS.test.login).toBe(LOGIN_URL.test);
  expect(ENDPOINTS.test.validate).toBe(VALIDATE_URL.test);
  expect(ENDPOINTS.prod.login).toBe(LOGIN_URL.prod);
  expect(ENDPOINTS.prod.validate).toBe(VALIDATE_URL.prod);
});
