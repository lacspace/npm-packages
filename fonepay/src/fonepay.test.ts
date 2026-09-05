import { test, expect } from "vitest";
import { signRequest, buildRedirect, verifyResponse, GATEWAY_URL } from "./index";

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

test("signRequest is deterministic and 128-char lowercase hex", async () => {
  const a = await signRequest(params, secret);
  const b = await signRequest(params, secret);
  expect(a).toBe(b);
  expect(a).toMatch(/^[0-9a-f]{128}$/);
});

test("signRequest applies MD='P' and CRN='NPR' defaults", async () => {
  const withDefaults = await signRequest(params, secret);
  const explicit = await signRequest({ ...params, MD: "P", CRN: "NPR" }, secret);
  expect(withDefaults).toBe(explicit);
  // A different MD produces a different signature.
  const other = await signRequest({ ...params, MD: "X" }, secret);
  expect(other).not.toBe(withDefaults);
});

test("buildRedirect includes DV in the URL and params", async () => {
  const { url, params: fields, dv } = await buildRedirect(params, { secret, env: "prod" });
  expect(url.startsWith(GATEWAY_URL.prod + "?")).toBe(true);
  expect(fields.DV).toBe(dv);
  const u = new URL(url);
  expect(u.searchParams.get("DV")).toBe(dv);
  expect(u.searchParams.get("PID")).toBe("MERCHANT");
  expect(u.searchParams.get("AMT")).toBe("1000");
  expect(u.searchParams.get("MD")).toBe("P");
  expect(u.searchParams.get("CRN")).toBe("NPR");
});

test("buildRedirect defaults to the dev (test) gateway", async () => {
  const { url } = await buildRedirect(params, { secret });
  expect(url.startsWith(GATEWAY_URL.test + "?")).toBe(true);
});

test("verifyResponse accepts a self-signed response and rejects a tampered one", async () => {
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
  };

  // Compute a valid DV the same way the gateway would.
  const { hmacDv } = await selfSign(resp, secret);
  const good = await verifyResponse({ ...resp, DV: hmacDv }, secret);
  expect(good.valid).toBe(true);

  // Tamper the amount → DV no longer matches.
  const bad = await verifyResponse({ ...resp, R_AMT: 5000, DV: hmacDv }, secret);
  expect(bad.valid).toBe(false);

  // Wrong DV entirely.
  const wrong = await verifyResponse({ ...resp, DV: "deadbeef" }, secret);
  expect(wrong.valid).toBe(false);
});

/** Helper: sign the response the way Fonepay would, to build a valid DV. */
async function selfSign(
  resp: { PRN: string; PID: string; PS: string; RC: string; UID: string; BC: string; INI: string; P_AMT: number; R_AMT: number },
  secret: string,
): Promise<{ hmacDv: string }> {
  const message = [resp.PRN, resp.PID, resp.PS, resp.RC, resp.UID, resp.BC, resp.INI, resp.P_AMT, resp.R_AMT].join(",");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  let hex = "";
  for (let i = 0; i < sig.length; i++) hex += sig[i]!.toString(16).padStart(2, "0");
  return { hmacDv: hex };
}
