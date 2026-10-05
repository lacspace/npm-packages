import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createBudget, dailyLimitFrom, dayOf } from "./budget.js";
import { AiChainError, createAiChain, memoryStore } from "./chain.js";

const at = (iso: string) => () => Date.parse(iso);

describe("budget lanes (1.4.0)", () => {
  const mk = (now = at("2026-10-05T10:00:00Z")) =>
    createBudget({
      store: memoryStore(now),
      now,
      families: { "gemini-tts": { match: { provider: "gemini", models: [/tts/] }, limitPerPair: 10, pairs: 2 } }, // 20/day
      lanes: { pulse: { priority: 1, reserve: 5 }, video: { priority: 3 }, promo: { priority: 3, cap: 2 } },
    });

  it("a low-priority lane stops where the reserve begins", async () => {
    const b = mk();
    let ok = 0;
    for (let i = 0; i < 30; i++) if ((await b.acquire("video")).ok) ok++;
    expect(ok).toBe(15);
    expect(await b.acquire("video")).toMatchObject({ ok: false, reason: "reserved" });
    for (let i = 0; i < 5; i++) expect((await b.acquire("pulse")).ok).toBe(true);
    expect(await b.acquire("pulse")).toMatchObject({ ok: false, reason: "exhausted" });
  });

  it("the important lane can also use the shared pool", async () => {
    const b = mk();
    let ok = 0;
    for (let i = 0; i < 30; i++) if ((await b.acquire("pulse")).ok) ok++;
    expect(ok).toBe(20);
  });

  it("as the important lane uses its reserve, the hold shrinks", async () => {
    const b = mk();
    for (let i = 0; i < 3; i++) await b.acquire("pulse");
    const r = await b.remaining("video");
    expect(r).toMatchObject({ capacity: 20, used: 3, heldForHigher: 2, available: 15 });
  });

  it("lane caps", async () => {
    const b = mk();
    expect((await b.acquire("promo")).ok).toBe(true);
    expect((await b.acquire("promo")).ok).toBe(true);
    expect(await b.acquire("promo")).toMatchObject({ ok: false, reason: "lane-cap" });
  });

  it("refund gives a call back", async () => {
    const b = mk();
    await b.acquire("video");
    await b.refund("video");
    expect((await b.remaining("video")).used).toBe(0);
  });

  it("resets at midnight Pacific, not UTC", async () => {
    let t = Date.parse("2026-10-05T06:30:00Z"); // 23:30 PDT on the 4th
    const now = () => t;
    const b = createBudget({ store: memoryStore(now), now, families: { f: { limit: 1 } } });
    expect((await b.acquire("x")).ok).toBe(true);
    expect((await b.acquire("x")).ok).toBe(false);
    t = Date.parse("2026-10-05T07:01:00Z"); // 00:01 PDT on the 5th
    expect((await b.acquire("x")).ok).toBe(true);
    expect(dayOf("npt", Date.parse("2026-10-04T18:30:00Z"))).toBe("2026-10-05");
  });

  it("learns the per-pair limit from a 429 body", async () => {
    const now = at("2026-10-05T10:00:00Z");
    const b = createBudget({ store: memoryStore(now), now, families: { g: { pairs: 3 } } });
    expect((await b.remaining("x")).capacity).toBeNull();
    const body = `{"error":{"code":429,"message":"Quota exceeded for metric: generativelanguage.googleapis.com/generate_requests_per_model_per_day, limit: 10","details":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel","quotaValue":"10"}]}}`;
    expect(await b.learn("g", body)).toBe(10);
    expect((await b.remaining("x")).capacity).toBe(30);
    expect(dailyLimitFrom("Rate limit reached on tokens per minute (TPM): Limit 6000")).toBeNull();
  });

  it("exhaust() closes the pool for the day", async () => {
    const b = mk();
    await b.exhaust("gemini-tts");
    expect(await b.acquire("pulse")).toMatchObject({ ok: false, reason: "exhausted" });
  });

  it("familyOf matches provider and model", () => {
    const b = mk();
    expect(b.familyOf("gemini", "gemini-2.5-flash-preview-tts")).toBe("gemini-tts");
    expect(b.familyOf("gemini", "gemini-3.1-flash-lite")).toBeUndefined();
  });
});

describe("chain + budget", () => {
  it("chat({ lane: true }) refuses without contacting a provider", async () => {
    const now = at("2026-10-05T10:00:00Z");
    const store = memoryStore(now);
    const budget = createBudget({ store, now, families: { text: { limit: 1 } }, lanes: { writer: { priority: 1, reserve: 1 }, explainer: { priority: 4 } } });
    let calls = 0;
    const chain = createAiChain({
      keys: [{ id: "k1", provider: "groq", apiKey: "x" }],
      route: [{ provider: "groq", model: "m" }],
      store, budget, now,
      chat: async () => { calls++; return { text: "ok", raw: {} } as never; },
    });
    const err = await chain.chat({ purpose: "explainer", lane: true, messages: [{ role: "user", content: "hi" }], maxTokens: 10 }).catch((e) => e);
    expect(err).toBeInstanceOf(AiChainError);
    expect(err.reason).toBe("reserved");
    expect(calls).toBe(0);
    expect((await chain.chat({ purpose: "writer", lane: true, messages: [{ role: "user", content: "hi" }], maxTokens: 10 })).text).toBe("ok");
  });

  it("reportError() teaches the budget from a TTS 429", async () => {
    const now = at("2026-10-05T10:00:00Z");
    const store = memoryStore(now);
    const budget = createBudget({ store, now, families: { "gemini-tts": { match: { provider: "gemini", models: [/tts/] }, pairs: 20 } } });
    const chain = createAiChain({ keys: [], route: [], store, budget, now });
    await chain.reportError("gemini", "gemini-2.5-flash-preview-tts", '429 generate_requests_per_model_per_day, limit: 10');
    expect((await chain.remaining("pulse")).capacity).toBe(200);
  });
});

// WeNepal's 7-day TTS ledger (private; gitignored). Replays the day's demand through lanes.
const FILE = new URL("./fixtures/tts-ledger-7d-5oct2026.jsonl", import.meta.url);
const ROWS: { t: string; status: number | null; stage?: string }[] = existsSync(FILE) ? readFileSync(FILE, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
describe.skipIf(!ROWS.length)("WeNepal TTS ledger replay", () => {
  it("Pulse is served in full; video stops at the reserve instead of burning 429s", async () => {
    const now = at("2026-10-05T12:00:00Z");
    const b = createBudget({
      store: memoryStore(now), now,
      families: { "gemini-tts": { limitPerPair: 10, pairs: 20 } }, // 4 models × 5 projects × 10
      lanes: { pulse: { priority: 1, reserve: 40 }, video: { priority: 3 } },
    });
    const real = { pulseOk: 0, pulse429: 0 };
    const sim = { pulse: 0, pulseRefused: 0, video: 0, videoRefused: 0 };
    for (const r of [...ROWS].sort((a, b) => a.t.localeCompare(b.t))) {
      const lane = r.stage === "pulse" ? "pulse" : "video";
      if (lane === "pulse") { if (r.status === 200) real.pulseOk++; if (r.status === 429) real.pulse429++; }
      const a = await b.acquire(lane);
      if (lane === "pulse") a.ok ? sim.pulse++ : sim.pulseRefused++;
      else a.ok ? sim.video++ : sim.videoRefused++;
    }
    // what actually happened: Pulse lost most of its calls to quota
    expect(real.pulse429).toBeGreaterThan(real.pulseOk);
    // with lanes: every Pulse request fits in its reserve, video never passes 160
    expect(sim.pulseRefused).toBe(0);
    expect(sim.video).toBeLessThanOrEqual(160);
    expect(sim.video + sim.pulse).toBeLessThanOrEqual(200);
  });
});
