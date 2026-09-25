import { describe, test, expect } from "vitest";
import { createHmac } from "node:crypto";
import { deliver, signStandardWebhook, standardWebhookHeaders, verifyStandardWebhook, verify, isPrivateAddress } from "./index";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";

describe("Standard Webhooks", () => {
  // Published example from the Standard Webhooks spec repository.
  test("matches the spec's signature vector", async () => {
    const sig = await signStandardWebhook('{"test": 2432232314}', { secret: SECRET, id: "msg_p5jXN8AQM9LWM0D4loKWxJek", timestamp: 1614265330 });
    expect(sig).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  test("verifies with any header casing, a Headers object, and rotated secrets", async () => {
    const body = '{"a":1}';
    const h = await standardWebhookHeaders(body, { secret: SECRET, id: "msg_1", timestamp: 1_700_000_000 });
    const now = 1_700_000_010;
    expect((await verifyStandardWebhook(body, h, { secret: SECRET, now })).valid).toBe(true);
    const upper = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toUpperCase(), v]));
    expect((await verifyStandardWebhook(body, upper, { secret: SECRET, now })).valid).toBe(true);
    expect((await verifyStandardWebhook(body, new Headers(h), { secret: SECRET, now })).valid).toBe(true);
    const rotated = { ...h, "webhook-signature": `v1,AAAA${"A".repeat(40)} ${h["webhook-signature"]}` };
    expect((await verifyStandardWebhook(body, rotated, { secret: SECRET, now })).valid).toBe(true);
  });

  test("rejects tampering, a changed id, a stale timestamp and missing headers", async () => {
    const body = '{"a":1}';
    const h = await standardWebhookHeaders(body, { secret: SECRET, id: "msg_1", timestamp: 1_700_000_000 });
    const now = 1_700_000_000;
    expect((await verifyStandardWebhook('{"a":2}', h, { secret: SECRET, now })).reason).toBe("bad-signature");
    expect((await verifyStandardWebhook(body, { ...h, "webhook-id": "msg_2" }, { secret: SECRET, now })).reason).toBe("bad-signature");
    expect((await verifyStandardWebhook(body, h, { secret: SECRET, now: now + 301 })).reason).toBe("timestamp-out-of-tolerance");
    expect((await verifyStandardWebhook(body, h, { secret: SECRET, now: now - 301 })).reason).toBe("timestamp-out-of-tolerance");
    expect((await verifyStandardWebhook(body, { "webhook-id": "x" }, { secret: SECRET, now })).reason).toBe("no-signature");
    expect((await verifyStandardWebhook(body, { ...h, "webhook-signature": "v2,abc" }, { secret: SECRET, now })).reason).toBe("bad-format");
  });

  test("deliver() can sign per the spec; the default stays the legacy t=/v1= form", async () => {
    let sent: { headers: Record<string, string>; body: string } | undefined;
    const fetchImpl = async (_u: string, init: { headers: Record<string, string>; body: string }) => ((sent = init), { ok: true, status: 200 });
    await deliver("https://example.com/h", { x: 1 }, { secret: SECRET, id: "msg_9", scheme: "standard-webhooks", fetchImpl });
    const r = await verifyStandardWebhook(sent!.body, sent!.headers, { secret: SECRET });
    expect(r.valid).toBe(true);
    await deliver("https://example.com/h", { x: 1 }, { secret: "s", fetchImpl });
    expect(sent!.headers["webhook-signature"]).toMatch(/^t=\d+,v1=[0-9a-f]{64}$/);
  });
});

describe("legacy t=/v1= scheme", () => {
  // Computed independently with node:crypto — the Stripe-style construction.
  test("verify() accepts a signature computed by node:crypto", async () => {
    const t = 1_700_000_000;
    const body = '{"id":"evt_1"}';
    const mac = createHmac("sha256", "whsec_test").update(`${t}.${body}`).digest("hex");
    expect((await verify(body, `t=${t},v1=${mac}`, { secret: "whsec_test", now: t })).valid).toBe(true);
  });
});

describe("SSRF guard", () => {
  const ok = async () => ({ ok: true, status: 200 });

  test("cloud metadata endpoints are always refused", async () => {
    for (const url of ["http://169.254.169.254/latest/meta-data/", "http://[::ffff:169.254.169.254]/", "http://metadata.google.internal/computeMetadata/v1/", "http://100.100.100.200/", "http://[fd00:ec2::254]/"]) {
      const r = await deliver(url, {}, { fetchImpl: ok, retries: 0 });
      expect([url, r.ok, r.attempts]).toEqual([url, false, 0]);
      expect(r.error).toMatch(/metadata/);
    }
  });

  test("blockPrivateNetworks refuses internal targets however they are spelled", async () => {
    for (const url of ["http://localhost:3000/", "http://127.0.0.1/", "http://2130706433/", "http://0x7f.1/", "http://10.1.2.3/", "http://172.20.0.1/", "http://192.168.1.1/", "http://[::1]/", "http://[fd12::1]/", "http://[fe80::1]/", "http://db.internal/"]) {
      const r = await deliver(url, {}, { fetchImpl: ok, retries: 0, blockPrivateNetworks: true });
      expect([url, r.ok]).toEqual([url, false]);
    }
    expect((await deliver("https://hooks.example.com/", {}, { fetchImpl: ok, blockPrivateNetworks: true })).ok).toBe(true);
  });

  test("a public name that resolves inside is refused", async () => {
    const r = await deliver("https://rebind.example/", {}, { fetchImpl: ok, blockPrivateNetworks: true, resolveHost: async () => ["203.0.113.9", "10.0.0.7"] });
    expect(r.error).toMatch(/resolves to private address 10\.0\.0\.7/);
  });

  test("with blockPrivateNetworks, redirects are not followed", async () => {
    let redirect: string | undefined;
    await deliver("https://hooks.example.com/", {}, { blockPrivateNetworks: true, fetchImpl: async (_u, init) => ((redirect = init.redirect), { ok: true, status: 200 }) });
    expect(redirect).toBe("manual");
  });

  test("private-address classification", () => {
    expect(["8.8.8.8", "93.184.216.34", "2606:4700::1111", "example.com"].map(isPrivateAddress)).toEqual([false, false, false, false]);
    expect(["100.64.0.1", "0.0.0.0", "224.0.0.1", "198.18.0.1"].map(isPrivateAddress)).toEqual([true, true, true, true]);
  });

  test("local development still works by default", async () => {
    expect((await deliver("http://localhost:3000/hook", {}, { fetchImpl: ok })).ok).toBe(true);
  });
});
