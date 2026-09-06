import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifySignature, detectScheme } from "./verify.js";

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
  it("tolerates a sha256= prefix in the generic header", () => {
    const r = verifySignature("hmac-sha256", { rawBody: body, secret, headers: { "x-signature": "sha256=" + hmacSig(body) } });
    expect(r.ok).toBe(true);
  });
});

describe("verifySignature — shopify (base64)", () => {
  const shopifySig = (b: string, key = secret): string => createHmac("sha256", key).update(b).digest("base64");
  it("accepts a correct base64 HMAC", () => {
    const r = verifySignature("shopify", { rawBody: body, secret, headers: { "x-shopify-hmac-sha256": shopifySig(body) } });
    expect(r.ok).toBe(true);
    expect(r.scheme).toBe("shopify");
  });
  it("rejects a tampered body", () => {
    const r = verifySignature("shopify", { rawBody: body + "!", secret, headers: { "x-shopify-hmac-sha256": shopifySig(body) } });
    expect(r.ok).toBe(false);
  });
  it("reports a missing header", () => {
    const r = verifySignature("shopify", { rawBody: body, secret, headers: {} });
    expect(r.reason).toMatch(/missing/i);
  });
});

describe("verifySignature — slack (v0)", () => {
  const ts = "1710000000";
  const slackSig = (t: string, b: string, key = secret): string =>
    "v0=" + createHmac("sha256", key).update(`v0:${t}:${b}`).digest("hex");
  it("accepts a correct v0 signature", () => {
    const r = verifySignature("slack", { rawBody: body, secret, headers: { "x-slack-signature": slackSig(ts, body), "x-slack-request-timestamp": ts } });
    expect(r.ok).toBe(true);
  });
  it("rejects when the timestamp differs (replay protection surface)", () => {
    const r = verifySignature("slack", { rawBody: body, secret, headers: { "x-slack-signature": slackSig(ts, body), "x-slack-request-timestamp": "9999999999" } });
    expect(r.ok).toBe(false);
  });
  it("reports a missing timestamp header", () => {
    const r = verifySignature("slack", { rawBody: body, secret, headers: { "x-slack-signature": slackSig(ts, body) } });
    expect(r.reason).toMatch(/timestamp/i);
  });
});

describe("verifySignature — svix", () => {
  const svixSecret = "whsec_" + Buffer.from("supersecretkeybytes!!").toString("base64");
  const id = "msg_2abc";
  const ts = "1710000000";
  const svixSig = (b: string): string => {
    const key = Buffer.from(svixSecret.slice("whsec_".length), "base64");
    return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${b}`).digest("base64");
  };
  it("accepts a correct base64 signature over id.ts.body", () => {
    const r = verifySignature("svix", { rawBody: body, secret: svixSecret, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": svixSig(body) } });
    expect(r.ok).toBe(true);
    expect(r.scheme).toBe("svix");
  });
  it("accepts one of several space-separated signatures", () => {
    const r = verifySignature("svix", { rawBody: body, secret: svixSecret, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": "v1,bogus " + svixSig(body) } });
    expect(r.ok).toBe(true);
  });
  it("rejects a tampered body", () => {
    const r = verifySignature("svix", { rawBody: body + "z", secret: svixSecret, headers: { "svix-id": id, "svix-timestamp": ts, "svix-signature": svixSig(body) } });
    expect(r.ok).toBe(false);
  });
});

describe("verifySignature — sha1 (legacy)", () => {
  const sha1Sig = (b: string, key = secret): string => "sha1=" + createHmac("sha1", key).update(b).digest("hex");
  it("accepts a correct sha1 signature (default X-Hub-Signature)", () => {
    const r = verifySignature("sha1", { rawBody: body, secret, headers: { "x-hub-signature": sha1Sig(body) } });
    expect(r.ok).toBe(true);
  });
  it("supports a custom header without the sha1= prefix", () => {
    const bare = createHmac("sha1", secret).update(body).digest("hex");
    const r = verifySignature("sha1", { rawBody: body, secret, headers: { "x-sig": bare }, header: "X-Sig" });
    expect(r.ok).toBe(true);
  });
});

describe("verifySignature — paypal", () => {
  it("reports that offline verification is not possible", () => {
    const r = verifySignature("paypal", { rawBody: body, secret, headers: { "paypal-transmission-sig": "x" } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/certificate/i);
  });
});

describe("detectScheme + verify auto", () => {
  it("detects each scheme from its header", () => {
    expect(detectScheme({ "x-hub-signature-256": "sha256=x" })).toBe("github");
    expect(detectScheme({ "stripe-signature": "t=1,v1=x" })).toBe("stripe");
    expect(detectScheme({ "x-shopify-hmac-sha256": "x" })).toBe("shopify");
    expect(detectScheme({ "x-slack-signature": "v0=x" })).toBe("slack");
    expect(detectScheme({ "svix-signature": "v1,x" })).toBe("svix");
    expect(detectScheme({ "x-hub-signature": "sha1=x" })).toBe("sha1");
    expect(detectScheme({ "x-signature": "x" })).toBe("hmac-sha256");
    expect(detectScheme({})).toBeUndefined();
  });
  it("auto resolves and verifies a github request", () => {
    const r = verifySignature("auto", { rawBody: body, secret, headers: { "x-hub-signature-256": githubSig(body) } });
    expect(r.ok).toBe(true);
    expect(r.scheme).toBe("github");
  });
  it("auto reports when no known header is present", () => {
    const r = verifySignature("auto", { rawBody: body, secret, headers: {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/detect/i);
  });
});
