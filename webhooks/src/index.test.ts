import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  sign,
  signHeaders,
  verify,
  isValid,
  verifyStripe,
  verifyGitHub,
  verifyShopify,
  deliver,
  newId,
  isDuplicate,
  MemoryIdempotencyStore,
  createEvent,
  isWebhookEvent,
  processOnce,
  matchesEventType,
  endpointSubscribes,
  routeEvent,
  EndpointRegistry,
  type AttemptResult,
} from "./index";

const SECRET = "whsec_test_secret";
const hex = (secret: string, data: string): string => createHmac("sha256", secret).update(data).digest("hex");
const b64 = (secret: string, data: string): string => createHmac("sha256", secret).update(data).digest("base64");

/* ---------------- signing & verification ---------------- */

describe("sign / verify", () => {
  it("round-trips: a freshly signed payload verifies", async () => {
    const body = JSON.stringify({ hello: "world" });
    const header = await sign(body, { secret: SECRET, timestamp: 1_700_000_000 });
    expect(header).toMatch(/^t=1700000000,v1=[0-9a-f]+$/);
    const r = await verify(body, header, { secret: SECRET, now: 1_700_000_000 });
    expect(r.valid).toBe(true);
    expect(r.timestamp).toBe(1_700_000_000);
  });

  it("uses the Stripe construction (HMAC over `t.payload`)", async () => {
    const body = "payload-body";
    const t = 1_700_000_500;
    const header = await sign(body, { secret: SECRET, timestamp: t });
    expect(header).toBe(`t=${t},v1=${hex(SECRET, `${t}.${body}`)}`);
  });

  it("rejects a replayed signature past the tolerance window", async () => {
    const body = "{}";
    const header = await sign(body, { secret: SECRET, timestamp: 1_000 });
    const r = await verify(body, header, { secret: SECRET, toleranceSec: 300, now: 1_000 + 301 });
    expect(r.valid).toBe(false);
    expect(r.reason).toBe("timestamp-out-of-tolerance");
    expect(r.timestamp).toBe(1_000);
  });

  it("accepts a signature just inside the tolerance window", async () => {
    const body = "{}";
    const header = await sign(body, { secret: SECRET, timestamp: 1_000 });
    const r = await verify(body, header, { secret: SECRET, toleranceSec: 300, now: 1_000 + 300 });
    expect(r.valid).toBe(true);
  });

  it("reports no-signature / bad-format / bad-signature", async () => {
    const body = "{}";
    expect((await verify(body, null, { secret: SECRET })).reason).toBe("no-signature");
    expect((await verify(body, "garbage", { secret: SECRET })).reason).toBe("bad-format");
    const header = await sign(body, { secret: SECRET, timestamp: 2_000 });
    const bad = await verify(body, header, { secret: "wrong", now: 2_000 });
    expect(bad.valid).toBe(false);
    expect(bad.reason).toBe("bad-signature");
  });

  it("isValid mirrors verify().valid", async () => {
    const body = "{}";
    const header = await sign(body, { secret: SECRET, timestamp: 3_000 });
    expect(await isValid(body, header, { secret: SECRET, now: 3_000 })).toBe(true);
    expect(await isValid(body, header, { secret: "x", now: 3_000 })).toBe(false);
  });

  it("signHeaders emits signature/timestamp/id headers", async () => {
    const h = await signHeaders("{}", { secret: SECRET, timestamp: 4_000, id: "evt_fixed" });
    expect(h["webhook-signature"]).toBe(await sign("{}", { secret: SECRET, timestamp: 4_000 }));
    expect(h["webhook-timestamp"]).toBe("4000");
    expect(h["webhook-id"]).toBe("evt_fixed");
    expect(h["content-type"]).toBe("application/json");
  });
});

/* ---------------- provider presets (known vectors) ---------------- */

describe("provider presets", () => {
  it("verifies a Stripe signature against an independent HMAC oracle", async () => {
    const body = '{"id":"evt_1","object":"event"}';
    const t = 1_700_000_000;
    const v1 = hex(SECRET, `${t}.${body}`);
    const r = await verifyStripe(body, `t=${t},v1=${v1}`, { secret: SECRET, now: t });
    expect(r.valid).toBe(true);
  });

  it("rejects a Stripe signature that is too old", async () => {
    const body = "{}";
    const t = 1_700_000_000;
    const v1 = hex(SECRET, `${t}.${body}`);
    const r = await verifyStripe(body, `t=${t},v1=${v1}`, { secret: SECRET, toleranceSec: 60, now: t + 61 });
    expect(r.reason).toBe("timestamp-out-of-tolerance");
  });

  it("verifies GitHub's canonical documentation vector", async () => {
    // From GitHub docs: secret "It's a Secret to Everybody", body "Hello, World!"
    const secret = "It's a Secret to Everybody";
    const body = "Hello, World!";
    const known = "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17";
    expect(`sha256=${hex(secret, body)}`).toBe(known); // sanity: our oracle matches GitHub's published value
    const r = await verifyGitHub(body, known, { secret });
    expect(r.valid).toBe(true);
  });

  it("rejects a GitHub signature with a wrong hash or bad format", async () => {
    const body = "Hello, World!";
    expect((await verifyGitHub(body, "sha256=deadbeef", { secret: "It's a Secret to Everybody" })).reason).toBe("bad-signature");
    expect((await verifyGitHub(body, "not-a-header", { secret: "s" })).reason).toBe("bad-format");
    expect((await verifyGitHub(body, null, { secret: "s" })).reason).toBe("no-signature");
  });

  it("verifies a Shopify base64 HMAC", async () => {
    const body = '{"order":1}';
    const r = await verifyShopify(body, b64(SECRET, body), { secret: SECRET });
    expect(r.valid).toBe(true);
    expect((await verifyShopify(body, b64("wrong", body), { secret: SECRET })).reason).toBe("bad-signature");
  });
});

/* ---------------- delivery with retry (injected fetch + sleep) ---------------- */

describe("deliver", () => {
  const noSleep = vi.fn(async (_ms: number) => {});

  it("retries a 500 then succeeds, never touching a real timer", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const r = await deliver("https://x.test/hook", { a: 1 }, {
      secret: SECRET,
      retries: 5,
      fetchImpl,
      sleepImpl: async (ms) => { sleeps.push(ms); },
    });

    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(r.attempts).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2); // slept before attempts 2 and 3 only
    expect(r.log).toHaveLength(3);
    expect(r.log?.map((a) => a.status)).toEqual([500, 503, 200]);
  });

  it("retries a thrown network error then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true, status: 200 });
    const r = await deliver("https://x.test/hook", "body", { retries: 3, fetchImpl, sleepImpl: noSleep });
    expect(r.ok).toBe(true);
    expect(r.attempts).toBe(2);
    expect(r.log?.[0]?.error).toContain("ECONNRESET");
  });

  it("does not retry a 4xx and returns after one attempt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    const r = await deliver("https://x.test/hook", "b", { retries: 5, fetchImpl, sleepImpl: noSleep });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(r.attempts).toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(r.log?.[0]?.retryable).toBe(false);
  });

  it("gives up after exhausting retries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const r = await deliver("https://x.test/hook", "b", { retries: 2, fetchImpl, sleepImpl: noSleep });
    expect(r.ok).toBe(false);
    expect(r.attempts).toBe(3); // 1 + 2 retries
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("attaches a signature the receiver can verify", async () => {
    let captured = "";
    const fetchImpl = vi.fn(async (_url: string, init: { headers: Record<string, string> }) => {
      captured = init.headers["webhook-signature"]!;
      return { ok: true, status: 200 };
    });
    const body = JSON.stringify({ hi: 1 });
    await deliver("https://x.test/hook", body, { secret: SECRET, fetchImpl, sleepImpl: noSleep });
    const check = await verify(body, captured, { secret: SECRET, toleranceSec: 1e9 });
    expect(check.valid).toBe(true);
  });

  it("fires onAttempt once per attempt", async () => {
    const attempts: AttemptResult[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    await deliver("https://x.test/hook", "b", {
      retries: 3,
      fetchImpl,
      sleepImpl: noSleep,
      onAttempt: (a) => attempts.push(a),
    });
    expect(attempts).toHaveLength(2);
    expect(attempts[0]?.retryable).toBe(true);
    expect(attempts[1]?.ok).toBe(true);
  });
});

/* ---------------- ids & idempotency ---------------- */

describe("idempotency", () => {
  it("newId is unique and prefixed", () => {
    expect(newId()).toMatch(/^evt_[0-9a-f]{32}$/);
    expect(newId("idem")).toMatch(/^idem_/);
    expect(newId()).not.toBe(newId());
  });

  it("isDuplicate returns false first, true on redelivery", async () => {
    const store = new MemoryIdempotencyStore();
    expect(await isDuplicate("evt_1", store)).toBe(false);
    expect(await isDuplicate("evt_1", store)).toBe(true);
    expect(await isDuplicate("evt_2", store)).toBe(false);
  });

  it("MemoryIdempotencyStore forgets after its TTL window", async () => {
    const store = new MemoryIdempotencyStore(0); // zero window
    await store.add("k");
    // any elapsed time is past a 0ms window
    await new Promise((r) => setTimeout(r, 1));
    expect(store.has("k")).toBe(false);
  });

  it("processOnce runs the handler once and skips redelivery", async () => {
    const store = new MemoryIdempotencyStore();
    const event = createEvent("invoice.paid", { amount: 100 });
    const handler = vi.fn(async () => "done");

    const first = await processOnce(event, store, handler);
    expect(first.processed).toBe(true);
    expect(first.result).toBe("done");

    const second = await processOnce(event, store, handler);
    expect(second.processed).toBe(false);
    expect(second.result).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

/* ---------------- event envelope ---------------- */

describe("createEvent / isWebhookEvent", () => {
  it("builds a typed envelope with id, type, created and data", () => {
    const e = createEvent("user.created", { userId: "u_1" }, { created: 123, id: "evt_fixed" });
    expect(e).toEqual({ id: "evt_fixed", type: "user.created", created: 123, data: { userId: "u_1" } });
    expect(isWebhookEvent(e)).toBe(true);
  });

  it("generates an id + timestamp when omitted", () => {
    const e = createEvent("ping", null);
    expect(e.id).toMatch(/^evt_/);
    expect(typeof e.created).toBe("number");
  });

  it("isWebhookEvent rejects non-envelopes", () => {
    expect(isWebhookEvent(null)).toBe(false);
    expect(isWebhookEvent({ id: "x", type: "t" })).toBe(false); // no created/data
    expect(isWebhookEvent("nope")).toBe(false);
  });
});

/* ---------------- endpoint registry / routing ---------------- */

describe("endpoint routing", () => {
  it("matchesEventType handles exact, wildcard and prefix", () => {
    expect(matchesEventType("invoice.paid", "invoice.paid")).toBe(true);
    expect(matchesEventType("invoice.paid", "invoice.failed")).toBe(false);
    expect(matchesEventType("*", "anything")).toBe(true);
    expect(matchesEventType("invoice.*", "invoice.paid")).toBe(true);
    expect(matchesEventType("invoice.*", "user.created")).toBe(false);
  });

  it("endpointSubscribes: no filter = all, disabled = none", () => {
    expect(endpointSubscribes({ id: "a", url: "u" }, "any.event")).toBe(true);
    expect(endpointSubscribes({ id: "a", url: "u", disabled: true }, "any.event")).toBe(false);
    expect(endpointSubscribes({ id: "a", url: "u", events: ["user.*"] }, "user.created")).toBe(true);
    expect(endpointSubscribes({ id: "a", url: "u", events: ["user.*"] }, "invoice.paid")).toBe(false);
  });

  it("routeEvent returns only subscribed endpoints, preserving order", () => {
    const endpoints = [
      { id: "all", url: "u1" },
      { id: "invoices", url: "u2", events: ["invoice.*"] },
      { id: "users", url: "u3", events: ["user.created"] },
      { id: "off", url: "u4", events: ["*"], disabled: true },
    ];
    const targets = routeEvent(endpoints, "invoice.paid");
    expect(targets.map((e) => e.id)).toEqual(["all", "invoices"]);
  });

  it("EndpointRegistry subscribes, routes by envelope type, and removes", () => {
    const reg = new EndpointRegistry();
    reg.subscribe("e1", "https://a.test", ["invoice.*"], "sec_a");
    reg.subscribe("e2", "https://b.test", ["user.created"]);
    reg.add({ id: "e3", url: "https://c.test" }); // all events

    const event = createEvent("invoice.paid", {});
    const hit = reg.endpointsFor(event);
    expect(hit.map((e) => e.id).sort()).toEqual(["e1", "e3"]);
    expect(reg.get("e1")?.secret).toBe("sec_a");

    expect(reg.remove("e1")).toBe(true);
    expect(reg.route("invoice.paid").map((e) => e.id)).toEqual(["e3"]);
    expect(reg.list()).toHaveLength(2);
  });
});
