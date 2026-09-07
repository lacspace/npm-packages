import { test, expect } from "vitest";
import { sign, verify, signUrl, verifyUrl } from "./index";
import {
  signSecure,
  verifySecure,
  signSecureUrl,
  verifySecureUrl,
  generateNonce,
  consumeNonce,
} from "./secure";

const SECRET_A = "secret-a";
const SECRET_B = "secret-b";

/* -------------------------- key rotation -------------------------- */

test("rotation: sign with key A, verify against a set containing A", async () => {
  const token = await signSecure({ userId: 7 }, { keys: { "2025": SECRET_A }, keyId: "2025" });
  const r = await verifySecure<{ userId: number }>(token, { keys: { "2024": SECRET_B, "2025": SECRET_A } });
  expect(r.valid).toBe(true);
  expect(r.data?.userId).toBe(7);
  expect(r.keyId).toBe("2025");
});

test("rotation: wrong key set fails with unknown-key", async () => {
  const token = await signSecure({ userId: 7 }, { keys: { "2025": SECRET_A }, keyId: "2025" });
  const r = await verifySecure(token, { keys: { "2024": SECRET_B } });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("unknown-key");
});

test("rotation: same key id but different secret fails signature", async () => {
  const token = await signSecure({ a: 1 }, { keys: { k1: SECRET_A }, keyId: "k1" });
  const r = await verifySecure(token, { keys: { k1: SECRET_B } });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("bad-signature");
});

test("rotation: defaults to first key when keyId omitted", async () => {
  const token = await signSecure({ a: 1 }, { keys: { only: SECRET_A } });
  const r = await verifySecure(token, { keys: { only: SECRET_A } });
  expect(r.valid).toBe(true);
  expect(r.keyId).toBe("only");
});

/* -------------------------- binding -------------------------- */

test("binding: method match passes, mismatch fails", async () => {
  const token = await signSecure({ a: 1 }, { secret: SECRET_A, bind: { method: "POST" } });
  expect((await verifySecure(token, { secret: SECRET_A, context: { method: "post" } })).valid).toBe(true);
  const bad = await verifySecure(token, { secret: SECRET_A, context: { method: "GET" } });
  expect(bad.valid).toBe(false);
  expect(bad.reason).toBe("binding");
});

test("binding: client IP match passes, mismatch fails", async () => {
  const token = await signSecure({ a: 1 }, { secret: SECRET_A, bind: { ip: "203.0.113.7" } });
  expect((await verifySecure(token, { secret: SECRET_A, context: { ip: "203.0.113.7" } })).valid).toBe(true);
  expect((await verifySecure(token, { secret: SECRET_A, context: { ip: "10.0.0.1" } })).reason).toBe("binding");
});

test("binding: required path prefix match passes, mismatch fails", async () => {
  const token = await signSecure({ a: 1 }, { secret: SECRET_A, bind: { pathPrefix: "/admin/" } });
  expect((await verifySecure(token, { secret: SECRET_A, context: { path: "/admin/users" } })).valid).toBe(true);
  expect((await verifySecure(token, { secret: SECRET_A, context: { path: "/public/x" } })).reason).toBe("binding");
});

test("binding: missing context when constraint set fails", async () => {
  const token = await signSecure({ a: 1 }, { secret: SECRET_A, bind: { method: "PUT" } });
  expect((await verifySecure(token, { secret: SECRET_A })).reason).toBe("binding");
});

/* -------------------------- nonce -------------------------- */

test("nonce: present in token and returned by verify", async () => {
  const token = await signSecure({ a: 1 }, { secret: SECRET_A, nonce: true });
  const r = await verifySecure(token, { secret: SECRET_A });
  expect(r.valid).toBe(true);
  expect(typeof r.nonce).toBe("string");
  expect(r.nonce!.length).toBe(32); // 16 bytes → 32 hex chars
});

test("nonce: consumeNonce enforces single-use", () => {
  const first = consumeNonce(undefined);
  expect(first.ok).toBe(true);
  expect(first.uses).toBe(1);
  expect(first.remaining).toBe(0);
  const second = consumeNonce(first.uses);
  expect(second.ok).toBe(false);
  expect(second.uses).toBe(1);
});

test("nonce: consumeNonce enforces max-N-use", () => {
  let uses: number | undefined;
  for (let i = 0; i < 3; i++) {
    const c = consumeNonce(uses, { maxUses: 3 });
    expect(c.ok).toBe(true);
    uses = c.uses;
  }
  const over = consumeNonce(uses, { maxUses: 3 });
  expect(over.ok).toBe(false);
  expect(over.remaining).toBe(0);
});

test("generateNonce returns hex of requested length", () => {
  expect(generateNonce(8).length).toBe(16);
  expect(generateNonce().length).toBe(32);
});

/* -------------------------- clock tolerance -------------------------- */

test("clockTolerance: boundary allows within leeway, rejects beyond", async () => {
  const token = await signSecure({ a: 1 }, { secret: SECRET_A, expiresAt: 1000 });
  // 30s past expiry, 30s leeway → still valid (now === exp + tolerance)
  expect((await verifySecure(token, { secret: SECRET_A, now: 1030, clockTolerance: 30 })).valid).toBe(true);
  // 31s past expiry, 30s leeway → expired
  const late = await verifySecure(token, { secret: SECRET_A, now: 1031, clockTolerance: 30 });
  expect(late.valid).toBe(false);
  expect(late.reason).toBe("expired");
});

/* -------------------------- signed claims -------------------------- */

test("claims: round-trip returns attached metadata", async () => {
  const token = await signSecure({ userId: 5 }, { secret: SECRET_A, claims: { role: "owner", tier: 3 } });
  const r = await verifySecure(token, { secret: SECRET_A });
  expect(r.valid).toBe(true);
  expect(r.claims).toEqual({ role: "owner", tier: 3 });
});

test("claims: tampering the signed claims breaks the signature", async () => {
  const token = await signSecure({ userId: 5 }, { secret: SECRET_A, claims: { role: "viewer" } });
  const [payload, sig] = token.split(".");
  // Re-sign the payload's claims to "admin" but keep the original signature.
  const obj = JSON.parse(Buffer.from(payload!, "base64url").toString());
  obj.c.role = "admin";
  const forged = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const r = await verifySecure(`${forged}.${sig}`, { secret: SECRET_A });
  expect(r.valid).toBe(false);
  expect(r.reason).toBe("bad-signature");
});

/* -------------------------- secure URLs -------------------------- */

test("secure URL: rotation + binding + claims round-trip", async () => {
  const link = await signSecureUrl("https://cdn.me/files/report.pdf?uid=42", {
    keys: { "2025": SECRET_A },
    keyId: "2025",
    bind: { method: "GET", pathPrefix: "/files/" },
    claims: { uid: 42 },
    expiresAt: 5000,
  });
  const ok = await verifySecureUrl(link, {
    keys: { "2025": SECRET_A },
    context: { method: "GET", path: "/files/report.pdf" },
    now: 1000,
  });
  expect(ok.valid).toBe(true);
  expect(ok.keyId).toBe("2025");
  expect(ok.claims).toEqual({ uid: 42 });

  // Wrong method → binding failure.
  const badMethod = await verifySecureUrl(link, {
    keys: { "2025": SECRET_A },
    context: { method: "POST", path: "/files/report.pdf" },
    now: 1000,
  });
  expect(badMethod.reason).toBe("binding");
});

test("secure URL: tampering a claim param breaks the signature", async () => {
  const link = await signSecureUrl("https://cdn.me/x?a=1", { secret: SECRET_A, claims: { role: "admin" } });
  // Swap the encoded claims param for a different value.
  const tampered = link.replace(/cl=[^&]+/, "cl=eyJyb2xlIjoiaGFja2VkIn0");
  expect((await verifySecureUrl(tampered, { secret: SECRET_A })).valid).toBe(false);
});

test("secure URL: expiry respects clockTolerance", async () => {
  const link = await signSecureUrl("https://cdn.me/x?a=1", { secret: SECRET_A, expiresAt: 1000 });
  expect((await verifySecureUrl(link, { secret: SECRET_A, now: 1010, clockTolerance: 10 })).valid).toBe(true);
  expect((await verifySecureUrl(link, { secret: SECRET_A, now: 1011, clockTolerance: 10 })).reason).toBe("expired");
});

/* -------------------------- backward compatibility -------------------------- */

test("secure sign with no new options behaves like classic sign", async () => {
  // signSecure with only a secret must be verifiable by the classic verify().
  const token = await signSecure({ userId: 1 }, { secret: SECRET_A });
  const classic = await verify<{ userId: number }>(token, { secret: SECRET_A });
  expect(classic.valid).toBe(true);
  expect(classic.data?.userId).toBe(1);

  // And a classic sign() token verifies with verifySecure().
  const legacy = await sign({ userId: 2 }, { secret: SECRET_A });
  const r = await verifySecure<{ userId: number }>(legacy, { secret: SECRET_A });
  expect(r.valid).toBe(true);
  expect(r.data?.userId).toBe(2);
  expect(r.keyId).toBeUndefined();
});

test("secure URL with no new options interops with classic verifyUrl", async () => {
  const link = await signSecureUrl("https://cdn.me/x?a=1&b=2", { secret: SECRET_A, expiresAt: 5000 });
  expect((await verifyUrl(link, { secret: SECRET_A, now: 1000 })).valid).toBe(true);
  const classicLink = await signUrl("https://cdn.me/x?a=1", { secret: SECRET_A });
  expect((await verifySecureUrl(classicLink, { secret: SECRET_A })).valid).toBe(true);
});
