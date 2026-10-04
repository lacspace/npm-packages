import { describe, expect, it } from "vitest";
import { createAiChain, mongoStore, type MongoLikeCollection } from "./index.js";
import { AiError, type ChatOptions, type ChatResponse } from "@lacspace/ai";

/** A tiny in-memory stand-in with MongoDB driver semantics for the calls mongoStore makes. */
function fakeCollection(): MongoLikeCollection & { docs: Map<string, Record<string, any>> } {
  const docs = new Map<string, Record<string, any>>();
  const match = (d: Record<string, any>, f: Record<string, any>): boolean =>
    Object.entries(f).every(([k, c]) => {
      if (k === "$or") return (c as Record<string, any>[]).some((x) => match(d, x));
      const v = d[k];
      if (c && typeof c === "object" && !(c instanceof Date)) {
        if ("$in" in c) return c.$in.includes(v);
        if ("$regex" in c) return new RegExp(c.$regex).test(String(v));
        if ("$lte" in c) return v != null && v <= c.$lte;
        if ("$gt" in c) return v != null && v > c.$gt;
      }
      if (c === null) return v == null;
      return v === c;
    });
  const apply = (d: Record<string, any>, u: Record<string, any>, inserted: boolean) => {
    for (const [k, v] of Object.entries(u.$set ?? {})) d[k] = v;
    for (const k of Object.keys(u.$unset ?? {})) delete d[k];
    for (const [k, v] of Object.entries(u.$inc ?? {})) d[k] = (d[k] ?? 0) + (v as number);
    if (inserted) for (const [k, v] of Object.entries(u.$setOnInsert ?? {})) d[k] = v;
  };
  return {
    docs,
    async findOne(f) { return [...docs.values()].find((d) => match(d, f)) ?? null; },
    async updateOne(f, u, o) {
      let d = [...docs.values()].find((x) => match(x, f));
      const ins = !d && !!o?.upsert;
      if (ins) { d = { _id: f._id }; docs.set(String(f._id), d); }
      if (d) apply(d, u, ins);
    },
    async deleteOne(f) { const d = [...docs.values()].find((x) => match(x, f)); if (d) docs.delete(d._id); },
    async deleteMany(f) { for (const d of [...docs.values()]) if (match(d, f)) docs.delete(d._id); },
    async findOneAndUpdate(f, u, o) {
      let d = [...docs.values()].find((x) => match(x, f));
      const ins = !d && !!o.upsert;
      if (ins) { d = { _id: f._id }; docs.set(String(f._id), d); }
      if (d) apply(d, u, ins);
      return d ? { ...d } : null; // driver v6 shape
    },
    find(f) { return { toArray: async () => [...docs.values()].filter((d) => match(d, f)).map((d) => ({ _id: d._id })) }; },
    async createIndex() { return "keypool_ttl"; },
  };
}

describe("mongoStore (1.3.0)", () => {
  it("get/set with TTL, checked on read before Mongo's sweep", async () => {
    let t = 1_000_000;
    const c = fakeCollection();
    const s = mongoStore(c, { prefix: "kp:", now: () => t });
    await s.set("a", "1", 5000);
    await s.set("b", "2");
    expect([await s.get("a"), await s.get("b")]).toEqual(["1", "2"]);
    expect(c.docs.get("kp:a")!.expiresAt).toEqual(new Date(1_005_000));
    t += 5001;
    expect(await s.get("a")).toBeNull(); // expired, still in the collection
    expect(await s.keys("")).toEqual(["b"]);
  });

  it("incr is atomic-upsert, sets expiry only on insert, restarts after expiry", async () => {
    let t = 0;
    const s = mongoStore(fakeCollection(), { now: () => t });
    expect([await s.incr("f", 1000), await s.incr("f", 1000), await s.incr("f", 1000)]).toEqual([1, 2, 3]);
    t += 999;
    expect(await s.incr("f", 1000)).toBe(4); // expiry not pushed out by later incs
    t += 2;
    expect(await s.incr("f", 1000)).toBe(1);
  });

  it("del and prefix listing; accepts driver v4/v5 { value } results", async () => {
    const c = fakeCollection();
    const fo = c.findOneAndUpdate.bind(c);
    c.findOneAndUpdate = async (f, u, o) => ({ value: await fo(f, u, o), ok: 1 });
    const s = mongoStore(c, "p:");
    await s.set("ai:rest:g1:m", "x", 60_000);
    await s.set("ai:rest:g2:*", "y", 60_000);
    await s.set("other", "z");
    expect((await s.keys("ai:rest:")).sort()).toEqual(["ai:rest:g1:m", "ai:rest:g2:*"]);
    expect(await s.incr("n", 1000)).toBe(1);
    await s.del("ai:rest:g1:m", "other");
    expect(await s.keys("")).toEqual(["ai:rest:g2:*", "n"]);
  });

  it("two chains (two processes) share rests through one collection", async () => {
    const c = fakeCollection();
    const chat = (fail: boolean) => async (o: ChatOptions): Promise<ChatResponse> => {
      if (fail && o.apiKey === "G1") throw new AiError("try again in 60s", { status: 429, provider: "google" });
      return { text: `ok ${o.apiKey}`, toolCalls: [], finishReason: "stop", model: o.model, raw: {} };
    };
    const opts = { keys: [{ id: "g1", provider: "gemini", apiKey: "G1" }, { id: "g2", provider: "gemini", apiKey: "G2" }], route: [{ provider: "gemini", model: "gemini-3.1-flash-lite" }] };
    const api = createAiChain({ ...opts, store: mongoStore(c), chat: chat(true) });
    const worker = createAiChain({ ...opts, store: mongoStore(c), chat: chat(false) });
    expect((await api.chat({ messages: [{ role: "user", content: "x" }], maxTokens: 50 })).keyId).toBe("g2");
    expect((await worker.chat({ messages: [{ role: "user", content: "x" }], maxTokens: 50 })).keyId).toBe("g2"); // g1 rest seen
  });
});
