import { AiError, type ChatOptions, type ChatResponse } from "@lacspace/ai";
import { describe, expect, it } from "vitest";
import { createAiChain, memoryStore, msToPacificMidnight, retryAfterMs, type CallRow, type ChainKey } from "./index.js";

const KEYS: ChainKey[] = [
  { id: "g1", provider: "gemini", apiKey: "G1" },
  { id: "g2", provider: "gemini", apiKey: "G2" },
  { id: "q1", provider: "groq", apiKey: "Q1" },
];
const ROUTE = [{ provider: "gemini", model: "gemini-3.1-flash-lite" }, { provider: "groq", model: "openai/gpt-oss-120b" }];
const ok = (text: string, extra: Partial<ChatResponse> = {}): ChatResponse => ({ text, toolCalls: [], finishReason: "stop", model: "m", raw: {}, ...extra });
const err = (status: number, message: string, raw?: unknown) => new AiError(message, { status, provider: "google", raw: raw ?? { error: { message } } });
const msgs = [{ role: "user" as const, content: "hi" }];

/** A scripted chat: each key id maps to a queue of outcomes. */
function scripted(plan: Record<string, Array<ChatResponse | Error>>, seen: string[] = [], bodies: Record<string, unknown>[] = []) {
  return async (o: ChatOptions) => {
    seen.push(`${o.apiKey}/${o.model}/${o.maxTokens}`);
    // Run the tweaked fetch once to capture the request body shaping.
    if (o.fetchImpl) await o.fetchImpl("https://x", { method: "POST", body: JSON.stringify({ max_tokens: o.maxTokens }) }).catch(() => {});
    const q = plan[o.apiKey!] ?? [];
    const next = q.shift();
    if (!next) throw err(500, "no script");
    if (next instanceof Error) throw next;
    return next;
  };
}

function setup(plan: Record<string, Array<ChatResponse | Error>>, extra: Partial<Parameters<typeof createAiChain>[0]> = {}) {
  let t = 1_000_000;
  const seen: string[] = [], rows: CallRow[] = [], bodies: Record<string, unknown>[] = [];
  const store = memoryStore(() => t);
  const chain = createAiChain({
    keys: KEYS, route: ROUTE, store, now: () => t, sleep: async () => {},
    chat: scripted(plan, seen, bodies),
    fetchImpl: async (_u, init) => { bodies.push(JSON.parse(String(init.body))); return new Response("{}"); },
    onCall: (r) => rows.push(r),
    ...extra,
  });
  return { chain, seen, rows, bodies, advance: (ms: number) => (t += ms), store };
}

describe("createAiChain", () => {
  it("Gemini 400 'API key not valid' → key quarantined, next key answers", async () => {
    const invalid: string[] = [];
    const s = setup({ G1: [err(400, "API key not valid. Please pass a valid API key.")], G2: [ok("hello")] }, { onInvalid: (k) => void invalid.push(k.id) });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 100 });
    expect([r.text, r.keyId]).toEqual(["hello", "g2"]);
    expect(invalid).toEqual(["g1"]);
    expect(await s.chain.isInvalid("g1")).toBe(true);
    expect(s.rows.map((x) => [x.keyId, x.ok, x.kind])).toEqual([["g1", false, "auth"], ["g2", true, undefined]]);
  });

  it("Gemini per-day quota rests that key+model until Pacific midnight; per-minute uses retryDelay", async () => {
    const s = setup({
      G1: [err(429, "Quota exceeded for metric: generate_content_free_tier_requests, limit: 250, model: gemini-3.1-flash-lite GenerateRequestsPerDayPerProjectPerModel-FreeTier")],
      G2: [err(429, "Resource has been exhausted", { error: { status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "23s" }] } })],
      Q1: [ok("from groq")],
    });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 100 });
    expect(r.keyId).toBe("q1");
    const rests = await s.chain.rests();
    expect(rests.g1![0]).toMatchObject({ model: "gemini-3.1-flash-lite", kind: "daily quota" });
    expect(rests.g1![0]!.until - 1_000_000).toBe(msToPacificMidnight(new Date(1_000_000)));
    expect(rests.g2![0]).toMatchObject({ kind: "rate limit" });
    expect(rests.g2![0]!.until - 1_000_000).toBe(23_000);
  });

  it("a resting pair is skipped; when everything rests, the soonest pair is tried once", async () => {
    const s = setup({ G1: [err(429, "rate limit, try again in 30s"), ok("back")], G2: [], Q1: [] }, { keys: [KEYS[0]!], route: [ROUTE[0]!] });
    await expect(s.chain.chat({ messages: msgs, maxTokens: 100 })).rejects.toThrow(/Every AI key failed/);
    const r = await s.chain.chat({ messages: msgs, maxTokens: 100 });
    expect(r.text).toBe("back");
  });

  it("transient: one retry, then N failures in a row rest the key 10 min; success resets", async () => {
    const e = () => err(500, "Internal Server Error");
    const s = setup({ G1: [e(), e(), e(), e(), e(), e()], Q1: [ok("a"), ok("b"), ok("c")] }, { keys: [KEYS[0]!, KEYS[2]!] });
    for (let i = 0; i < 3; i++) await s.chain.chat({ messages: msgs, maxTokens: 100 });
    expect((await s.chain.rests()).g1).toEqual([expect.objectContaining({ model: "*", kind: "failing" })]);
    expect(s.seen.filter((x) => x.startsWith("G1")).length).toBe(6); // 2 attempts × 3 calls
  });

  it("an overloaded model skips the step's other keys", async () => {
    const s = setup({ G1: [err(503, "The model is overloaded. Please try again later.")], G2: [ok("never")], Q1: [ok("groq")] });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 100 });
    expect(r.keyId).toBe("q1");
    expect(s.seen.some((x) => x.startsWith("G2"))).toBe(false);
  });

  it("Groq 413 / TPM shrinks max_tokens to fit and retries once", async () => {
    const s = setup({ Q1: [err(413, "Request too large for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Requested 9500"), ok("fits")] }, { keys: [KEYS[2]!], route: [ROUTE[1]!] });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 3000 });
    expect(r.text).toBe("fits");
    expect(s.seen).toEqual(["Q1/openai/gpt-oss-120b/3000", "Q1/openai/gpt-oss-120b/1300"]);
  });

  it("gpt-oss empty reply → once with a bigger budget; minTokens floor applied", async () => {
    const s = setup({ Q1: [ok("", { finishReason: "length", usage: { inputTokens: 1, outputTokens: 1600, reasoningTokens: 1600 } }), ok("answer")] }, { keys: [KEYS[2]!], route: [ROUTE[1]!] });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 200 });
    expect(r.text).toBe("answer");
    expect(s.seen).toEqual(["Q1/openai/gpt-oss-120b/1600", "Q1/openai/gpt-oss-120b/4000"]);
  });

  it("request tweaks: gpt-oss reasoning_effort low; JSON mode adds response_format and parses fenced JSON", async () => {
    const s = setup({ Q1: [ok('```json\n{"a": 1,}\n```')] }, { keys: [KEYS[2]!], route: [ROUTE[1]!] });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 100, json: true });
    expect(r.json).toEqual({ a: 1 });
    expect(s.bodies[0]).toMatchObject({ reasoning_effort: "low", response_format: { type: "json_object" } });
  });

  it("Groq json_validate_failed → retried without response_format", async () => {
    const s = setup({ Q1: [err(400, "Failed to generate JSON. Please adjust your prompt.", { error: { code: "json_validate_failed" } }), ok('{"ok":true}')] }, { keys: [KEYS[2]!], route: [ROUTE[1]!] });
    const r = await s.chain.chat({ messages: msgs, maxTokens: 100, json: true });
    expect(r.json).toEqual({ ok: true });
    expect(s.bodies[1]).not.toHaveProperty("response_format");
  });

  it("per-purpose routes and daily caps", async () => {
    const s = setup({ Q1: [ok("wrap")] }, { routes: { wrap: [ROUTE[1]!] }, purposeCaps: { wrap: 2 } });
    expect((await s.chain.chat({ purpose: "wrap", messages: msgs, maxTokens: 100 })).keyId).toBe("q1");
    expect([await s.chain.takePurpose("wrap"), await s.chain.takePurpose("wrap"), await s.chain.takePurpose("wrap")]).toEqual([true, true, false]);
    expect(await s.chain.takePurpose("other")).toBe(true);
  });

  it("clearRests re-enables an invalid key", async () => {
    const s = setup({ G1: [err(401, "Unauthorized"), ok("again")], G2: [ok("x")] });
    await s.chain.chat({ messages: msgs, maxTokens: 100 });
    await s.chain.clearRests("g1");
    expect(await s.chain.isInvalid("g1")).toBe(false);
    expect((await s.chain.chat({ messages: msgs, maxTokens: 100 })).keyId).toBe("g1");
  });
});

describe("helpers", () => {
  it("retryAfterMs", () => {
    expect(retryAfterMs('{"retryDelay": "35s"}')).toBe(35_000);
    expect(retryAfterMs("Please try again in 2m3.5s.")).toBe(123_500);
    expect(retryAfterMs("try again in 450ms")).toBe(450);
    expect(retryAfterMs("nothing")).toBeNull();
  });
  it("msToPacificMidnight", () => {
    // 2026-10-04 23:00 PDT = 2026-10-05 06:00Z → 1 h + 30 s
    expect(msToPacificMidnight(new Date("2026-10-05T06:00:00Z"))).toBe(3_600_000 + 30_000);
  });
});
