import { describe, expect, it } from "vitest";
import { AiError, classifyError, createFallbackClient, FallbackError, user } from "./index.js";
import type { FetchLike } from "./types.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const GEMINI_BAD_KEY = { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } };
const geminiOk = (text: string) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 } });
const groqOk = (text: string) => ({ model: "openai/gpt-oss-120b", choices: [{ message: { content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 3 } });
const groqReasoningOnly = { model: "openai/gpt-oss-120b", choices: [{ message: { content: "", reasoning: "Let me think about RSI..." }, finish_reason: "length" }], usage: { prompt_tokens: 20, completion_tokens: 60, completion_tokens_details: { reasoning_tokens: 60 } } };

const GEMINI = { provider: "google" as const, model: "gemini-3.1-flash-lite", apiKey: "bad" };
const GROQ = { provider: "openai-compatible" as const, model: "openai/gpt-oss-120b", apiKey: "k", baseUrl: "https://api.groq.com/openai/v1" };
const msgs = [user("hi")];

describe("classifyError", () => {
  const e = (status: number, message: string, raw?: unknown) => new AiError(message, { status, provider: "google", raw });
  it("treats Gemini's 400 'API key not valid' as auth", () => {
    expect(classifyError(e(400, "API key not valid. Please pass a valid API key.", GEMINI_BAD_KEY))).toBe("auth");
  });
  it("separates quota/billing from plain rate limits", () => {
    expect(classifyError(e(429, "Resource has been exhausted (e.g. check quota).", { error: { status: "RESOURCE_EXHAUSTED" } }))).toBe("quota");
    expect(classifyError(e(429, "You exceeded your current quota, please check your plan and billing details."))).toBe("quota");
    expect(classifyError(e(429, "Rate limit reached for model on tokens per minute (TPM)"))).toBe("rate_limit");
    expect(classifyError(e(429, "Rate limit reached for model in organization on tokens per day (TPD)"))).toBe("quota");
    expect(classifyError(e(401, "Invalid API Key"))).toBe("auth");
    expect(classifyError(e(503, "overloaded"))).toBe("transient");
    expect(classifyError(e(0, "network"))).toBe("transient");
    expect(classifyError(e(400, "Invalid value at 'contents'"))).toBe("bad_request");
  });
});

describe("createFallbackClient (1.2.0)", () => {
  it("fixture: Gemini bad key (400) → moves to Groq, rests Gemini 6 h", async () => {
    let t = 1_000_000;
    const fetchImpl: FetchLike = async (url) => (url.includes("googleapis") ? json(400, GEMINI_BAD_KEY) : json(200, groqOk("Hello")));
    const ai = createFallbackClient([GEMINI, GROQ], { fetchImpl, now: () => t });
    const r = await ai.chat({ messages: msgs });
    expect(r.text).toBe("Hello");
    expect(r.target).toBe("openai-compatible:openai/gpt-oss-120b");
    expect(r.attempts).toEqual([{ target: "google:gemini-3.1-flash-lite", kind: "auth", error: "API key not valid. Please pass a valid API key." }]);
    const g = ai.status()[0]!;
    expect(g.resting).toBe(true);
    expect(g.restUntil - t).toBe(6 * 60 * 60_000);
  });

  it("skips resting targets, then brings them back after the cooldown", async () => {
    let t = 0;
    const calls: string[] = [];
    let geminiQuota = true;
    const fetchImpl: FetchLike = async (url) => {
      const g = url.includes("googleapis");
      calls.push(g ? "g" : "q");
      if (g) return geminiQuota ? json(429, { error: { message: "Quota exceeded for metric", status: "RESOURCE_EXHAUSTED" } }) : json(200, geminiOk("from gemini"));
      return json(200, groqOk("from groq"));
    };
    const ai = createFallbackClient([GEMINI, GROQ], { fetchImpl, now: () => t });
    expect((await ai.chat({ messages: msgs })).text).toBe("from groq");
    expect((await ai.chat({ messages: msgs })).text).toBe("from groq");
    expect(calls).toEqual(["g", "q", "q"]); // gemini resting on the 2nd call
    geminiQuota = false;
    t += 60 * 60_000; // quota cooldown 1 h
    expect((await ai.chat({ messages: msgs })).text).toBe("from gemini");
  });

  it("when everything is resting, tries all once anyway (soonest first)", async () => {
    let t = 0, fail = true;
    const fetchImpl: FetchLike = async (url) => (fail ? json(503, { error: { message: "down" } }) : json(200, url.includes("googleapis") ? geminiOk("g") : groqOk("q")));
    const ai = createFallbackClient([GEMINI, GROQ], { fetchImpl, now: () => t });
    await expect(ai.chat({ messages: msgs })).rejects.toBeInstanceOf(FallbackError);
    expect(ai.status().every((s) => s.resting)).toBe(true);
    fail = false;
    t += 1000;
    expect((await ai.chat({ messages: msgs })).text).toBe("g");
  });

  it("gpt-oss empty reply (budget spent on reasoning) → finishReason length + reasoningTokens, retried bigger", async () => {
    const budgets: number[] = [];
    const fetchImpl: FetchLike = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      budgets.push(body.max_tokens);
      return json(200, body.max_tokens <= 60 ? groqReasoningOnly : groqOk("RSI measures momentum."));
    };
    const ai = createFallbackClient([GROQ], { fetchImpl });
    const r = await ai.chat({ messages: msgs, maxTokens: 60 });
    expect(r.text).toBe("RSI measures momentum.");
    expect(budgets).toEqual([60, 256]);
  });

  it("plain chat() reports reasoning usage so callers can decide themselves", async () => {
    const { chat } = await import("./index.js");
    const r = await chat({ ...GROQ, messages: msgs, maxTokens: 60, fetchImpl: async () => json(200, groqReasoningOnly) });
    expect(r.text).toBe("");
    expect(r.finishReason).toBe("length");
    expect(r.usage).toEqual({ inputTokens: 20, outputTokens: 60, reasoningTokens: 60 });
    expect(r.reasoning).toContain("RSI");
  });

  it("still-empty replies fall through to the next target", async () => {
    const fetchImpl: FetchLike = async (url) => (url.includes("groq") ? json(200, groqReasoningOnly) : json(200, geminiOk("gemini answer")));
    const ai = createFallbackClient([GROQ, { ...GEMINI, apiKey: "good" }], { fetchImpl, growOnEmpty: false });
    const r = await ai.chat({ messages: msgs, maxTokens: 60 });
    expect(r.text).toBe("gemini answer");
    expect(r.attempts[0]!.kind).toBe("empty");
  });

  it("stream falls back before the first chunk", async () => {
    const sse = (s: string) => new Response(s, { status: 200, headers: { "content-type": "text/event-stream" } });
    const fetchImpl: FetchLike = async (url) =>
      url.includes("googleapis") ? json(400, GEMINI_BAD_KEY)
      : sse('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    const ai = createFallbackClient([GEMINI, GROQ], { fetchImpl });
    let text = "", target = "";
    for await (const c of ai.stream({ messages: msgs })) { if (c.type === "text") { text += c.delta; target = c.target!; } }
    expect(text).toBe("Hi");
    expect(target).toBe("openai-compatible:openai/gpt-oss-120b");
  });
});
