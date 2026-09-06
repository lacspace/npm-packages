import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature } from "./verify.js";

const secret = "s3cr3t";
const body = JSON.stringify({ hello: "world", n: 42 });

function githubSig(b: string, key = secret): string {
  return "sha256=" + createHmac("sha256", key).update(b).digest("hex");
}
function hmacSig(b: string, key = secret): string {
  return createHmac("sha256", key).update(b).digest("hex");
}

describe("verifySignature — github", () => {
  it("accepts a correct signature", () => {
    const r = verifySignature("github", { rawBody: body, secret, headers: { "x-hub-signature-256": githubSig(body) } });
    expect(r.ok).toBe(true);
  });
  it("rejects a tampered body", () => {
    const r = verifySignature("github", { rawBody: body + "!", secret, headers: { "x-hub-signature-256": githubSig(body) } });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signature mismatch");
  });
  it("rejects a wrong secret", () => {
    const r = verifySignature("github", { rawBody: body, secret: "other", headers: { "x-hub-signature-256": githubSig(body) } });
    expect(r.ok).toBe(false);
  });
  it("reports a missing header", () => {
    const r = verifySignature("github", { rawBody: body, secret, headers: {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/missing/i);
  });
  it("is case-insensitive on the header name", () => {
    const r = verifySignature("github", { rawBody: body, secret, headers: { "X-Hub-Signature-256": githubSig(body) } });
    expect(r.ok).toBe(true);
  });
});

describe("verifySignature — stripe", () => {
  function stripeHeader(t: string, b: string, key = secret): string {
    const sig = createHmac("sha256", key).update(`${t}.${b}`).digest("hex");
    return `t=${t},v1=${sig}`;
  }
  it("accepts a correct signature over `t.body`", () => {
    const t = "1710000000";
    const r = verifySignature("stripe", { rawBody: body, secret, headers: { "stripe-signature": stripeHeader(t, body) } });
    expect(r.ok).toBe(true);
  });
  it("rejects a tampered body", () => {
    const t = "1710000000";
    const r = verifySignature("stripe", { rawBody: body + "x", secret, headers: { "stripe-signature": stripeHeader(t, body) } });
    expect(r.ok).toBe(false);
  });
  it("reports a missing timestamp", () => {
    const sig = createHmac("sha256", secret).update(`t.${body}`).digest("hex");
    const r = verifySignature("stripe", { rawBody: body, secret, headers: { "stripe-signature": `v1=${sig}` } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/timestamp/i);
  });
});

describe("verifySignature — hmac-sha256", () => {
  it("accepts a correct signature in the default header", () => {
    const r = verifySignature("hmac-sha256", { rawBody: body, secret, headers: { "x-signature": hmacSig(body) } });
    expect(r.ok).toBe(true);
  });
  it("supports a custom header name", () => {
    const r = verifySignature("hmac-sha256", { rawBody: body, secret, headers: { "x-webhook-sig": hmacSig(body) }, header: "X-Webhook-Sig" });
    expect(r.ok).toBe(true);
  });
  it("rejects a tampered signature", () => {
    const r = verifySignature("hmac-sha256", { rawBody: body, secret, headers: { "x-signature": "deadbeef" } });
    expect(r.ok).toBe(false);
  });
  it("does not throw on a length mismatch (timing-safe path)", () => {
    expect(() =>
      verifySignature("hmac-sha256", { rawBody: body, secret, headers: { "x-signature": "abc" } }),
    ).not.toThrow();
  });
  it("works with a Buffer body", () => {
    const r = verifySignature("hmac-sha256", { rawBody: Buffer.from(body), secret, headers: { "x-signature": hmacSig(body) } });
    expect(r.ok).toBe(true);
  });
  it("fails when no secret is given", () => {
    const r = verifySignature("hmac-sha256", { rawBody: body, secret: "", headers: { "x-signature": hmacSig(body) } });
    expect(r.ok).toBe(false);
  });
});
