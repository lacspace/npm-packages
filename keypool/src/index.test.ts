import { beforeEach, describe, expect, it } from "vitest";
import { createKeypool, kvStore, type KeypoolOptions } from "./index.js";

function clock(start = 1_000_000_000) {
  let t = start;
  return { now: () => t, adv: (ms: number) => (t += ms) };
}

const keys = [
  { id: "g1", provider: "gemini", secret: "s1" },
  { id: "g2", provider: "gemini", secret: "s2" },
  { id: "g3", provider: "gemini", secret: "s3" },
  { id: "q1", provider: "groq", secret: "qs1" },
];

describe("keypool pick/rotate", () => {
  it("rotates round-robin so three picks spread across three equal keys", async () => {
    const c = clock();
    const pool = createKeypool({ keys, now: c.now });
    const got: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = await pool.pick("gemini");
      got.push(p!.id);
      c.adv(10);
    }
    expect(got.sort()).toEqual(["g1", "g2", "g3"]); // each used once, load spread
  });

  it("prefers a higher-priority key while it is healthy", async () => {
    const c = clock();
    const pool = createKeypool({ keys: [{ id: "hi", provider: "p", secret: "x", priority: 5 }, { id: "lo", provider: "p", secret: "y" }], now: c.now });
    expect((await pool.pick("p"))!.id).toBe("hi");
    c.adv(10);
    expect((await pool.pick("p"))!.id).toBe("hi"); // priority beats round-robin
  });

  it("returns the secret and only keys for the asked provider", async () => {
    const pool = createKeypool({ keys, now: clock().now });
    const q = await pool.pick("groq");
    expect(q).toMatchObject({ id: "q1", secret: "qs1", provider: "groq" });
    expect(await pool.available("groq")).toBe(1);
  });
});

describe("rate limits", () => {
  it("respects rpm and frees the key after the minute rolls", async () => {
    const c = clock();
    const pool = createKeypool({ keys: [{ id: "k", provider: "p", secret: "x" }], providerLimits: { p: { rpm: 2 } }, now: c.now });
    expect(await pool.pick("p")).not.toBeNull();
    expect(await pool.pick("p")).not.toBeNull();
    expect(await pool.pick("p")).toBeNull(); // rpm hit
    c.adv(60_001);
    expect(await pool.pick("p")).not.toBeNull(); // minute rolled
  });

  it("respects tpd across model buckets independently (Groq per-model TPD)", async () => {
    const c = clock();
    const pool = createKeypool({
      keys: [{ id: "k", provider: "groq", secret: "x" }],
      modelLimits: { "groq:big": { tpd: 1000 }, "groq:small": { tpd: 1000 } },
      now: c.now,
    });
    const p = await pool.pick("groq", "big", 600);
    await pool.report(p!.id, { ok: true, tokens: 0, model: "big" }); // reserved 600 at pick
    expect(await pool.pick("groq", "big", 600)).toBeNull(); // 600+600 > 1000
    expect(await pool.pick("groq", "small", 600)).not.toBeNull(); // different bucket
  });
});

describe("429 + invalid handling", () => {
  it("cools down on 429 using retry-after, then recovers", async () => {
    const c = clock();
    const pool = createKeypool({ keys: [{ id: "k", provider: "p", secret: "x" }], now: c.now });
    const p = await pool.pick("p");
    await pool.report(p!.id, { ok: false, status: 429, headers: { "retry-after": "30" } });
    expect(await pool.pick("p")).toBeNull();
    c.adv(30_001);
    expect(await pool.pick("p")).not.toBeNull();
  });

  it("quarantines an invalid key (401) until reinstated", async () => {
    const pool = createKeypool({ keys: [{ id: "k", provider: "p", secret: "x" }], now: clock().now });
    const p = await pool.pick("p");
    await pool.report(p!.id, { ok: false, status: 401 });
    expect(await pool.pick("p")).toBeNull();
    await pool.reinstate("k", "new-secret");
    const p2 = await pool.pick("p");
    expect(p2).toMatchObject({ id: "k", secret: "new-secret" });
  });

  it("reads retry-after as an HTTP date", async () => {
    const c = clock(0);
    const pool = createKeypool({ keys: [{ id: "k", provider: "p", secret: "x" }], now: c.now });
    const p = await pool.pick("p");
    await pool.report(p!.id, { ok: false, status: 429, headers: { get: (n: string) => (n === "retry-after" ? new Date(20_000).toUTCString() : null) } });
    // 20s in the future
    expect(await pool.pick("p")).toBeNull();
    c.adv(21_000);
    expect(await pool.pick("p")).not.toBeNull();
  });
});

describe("persistence", () => {
  it("shares state across instances via a kv store", async () => {
    const backing = new Map<string, string>();
    const store = kvStore({ get: (k) => backing.get(k) ?? null, set: (k, v) => void backing.set(k, v) });
    const opts: KeypoolOptions = { keys: [{ id: "k", provider: "p", secret: "x" }], providerLimits: { p: { rpd: 1 } }, store, now: clock().now };
    const a = createKeypool(opts);
    expect(await a.pick("p")).not.toBeNull(); // uses the 1 daily request
    const b = createKeypool(opts); // second process
    expect(await b.pick("p")).toBeNull(); // sees the shared count
  });
});
