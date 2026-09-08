import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chat,
  stream,
  AiError,
  system,
  user,
  assistant,
  toolResult,
  image,
  imageBytes,
  withRetry,
  withTimeout,
  isRetryableError,
  estimateCost,
  sumUsage,
  UsageTracker,
  extractJson,
  parseJson,
  textStream,
  type ChatChunk,
  type Message,
} from "./index.js";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    text: async () => chunks.join(""),
  } as unknown as Response;
}

const noSleep = async () => {};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Message builders
 * ------------------------------------------------------------------ */

describe("message builders", () => {
  it("build system/user/assistant/tool messages", () => {
    expect(system("Be terse.")).toEqual({ role: "system", content: "Be terse." });
    expect(user("Hi")).toEqual({ role: "user", content: "Hi" });
    expect(assistant("Ok")).toEqual({ role: "assistant", content: "Ok" });
    expect(toolResult("call_1", "72F", "get_weather")).toEqual({
      role: "tool",
      content: "72F",
      toolCallId: "call_1",
      name: "get_weather",
    });
  });

  it("assistant carries toolCalls + name when given", () => {
    const tc = [{ id: "c1", name: "f", args: {}, argsRaw: "{}" }];
    const m = assistant("", { toolCalls: tc, name: "bot" });
    expect(m.toolCalls).toBe(tc);
    expect(m.name).toBe("bot");
  });

  it("image parts match the Part shape", () => {
    expect(image("https://x/y.png")).toEqual({ type: "image", url: "https://x/y.png" });
    expect(imageBytes("AAAA", "image/png")).toEqual({
      type: "image",
      data: "AAAA",
      mimeType: "image/png",
    });
  });

  it("builders compose into a working chat() request", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    await chat({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "k",
      messages: [system("Be terse."), user("Hi")],
      fetchImpl: fetchMock as any,
    });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[0]).toEqual({ role: "system", content: "Be terse." });
    expect(body.messages[1]).toEqual({ role: "user", content: "Hi" });
  });
});

/* ------------------------------------------------------------------ *
 * fetchImpl injection
 * ------------------------------------------------------------------ */

describe("injectable fetchImpl", () => {
  it("chat() uses fetchImpl instead of global fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("global fetch used");
      }),
    );
    const fake = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "yo" }, finish_reason: "stop" }] }),
    );
    const res = await chat({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "k",
      messages: [user("Hi")],
      fetchImpl: fake as any,
    });
    expect(res.text).toBe("yo");
    expect(fake).toHaveBeenCalledTimes(1);
  });

  it("stream() uses fetchImpl instead of global fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("global fetch used");
      }),
    );
    const fake = vi.fn(async () =>
      sseResponse([
        'data: {"choices":[{"delta":{"content":"hey"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const out: string[] = [];
    for await (const t of textStream(
      stream({
        provider: "openai",
        model: "gpt-4o",
        apiKey: "k",
        messages: [user("Hi")],
        fetchImpl: fake as any,
      }),
    )) {
      out.push(t);
    }
    expect(out.join("")).toBe("hey");
    expect(fake).toHaveBeenCalledTimes(1);
  });
});

/* ------------------------------------------------------------------ *
 * Retry / timeout
 * ------------------------------------------------------------------ */

describe("withRetry", () => {
  it("returns immediately on success (no retries)", async () => {
    let n = 0;
    const res = await withRetry(async () => {
      n++;
      return "ok";
    }, { sleep: noSleep });
    expect(res).toBe("ok");
    expect(n).toBe(1);
  });

  it("retries a transient AiError then succeeds", async () => {
    let n = 0;
    const res = await withRetry(
      async () => {
        n++;
        if (n < 3) throw new AiError("boom", { provider: "openai", status: 503 });
        return "ok";
      },
      { sleep: noSleep, minDelayMs: 1 },
    );
    expect(res).toBe("ok");
    expect(n).toBe(3);
  });

  it("does not retry a non-retryable error (4xx)", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new AiError("bad request", { provider: "openai", status: 400 });
        },
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(n).toBe(1);
  });

  it("gives up after `retries` attempts and rethrows the last error", async () => {
    let n = 0;
    await expect(
      withRetry(
        async () => {
          n++;
          throw new AiError("rate", { provider: "openai", status: 429 });
        },
        { retries: 2, sleep: noSleep },
      ),
    ).rejects.toBeInstanceOf(AiError);
    expect(n).toBe(3); // first try + 2 retries
  });

  it("invokes onRetry and honours a custom retryOn", async () => {
    const seen: number[] = [];
    let n = 0;
    const res = await withRetry(
      async () => {
        n++;
        if (n < 2) throw new Error("plain");
        return 42;
      },
      {
        sleep: noSleep,
        retryOn: (err) => err instanceof Error,
        onRetry: (_e, attempt) => seen.push(attempt),
      },
    );
    expect(res).toBe(42);
    expect(seen).toEqual([1]);
  });

  it("isRetryableError classifies statuses", () => {
    expect(isRetryableError(new AiError("x", { provider: "openai", status: 0 }))).toBe(true);
    expect(isRetryableError(new AiError("x", { provider: "openai", status: 429 }))).toBe(true);
    expect(isRetryableError(new AiError("x", { provider: "openai", status: 500 }))).toBe(true);
    expect(isRetryableError(new AiError("x", { provider: "openai", status: 404 }))).toBe(false);
    expect(isRetryableError(new Error("plain"))).toBe(false);
  });
});

describe("withTimeout", () => {
  it("resolves a fast function", async () => {
    const res = await withTimeout(async () => "fast", 1000);
    expect(res).toBe("fast");
  });

  it("rejects and aborts a function that overruns", async () => {
    let aborted = false;
    await expect(
      withTimeout((signal) => {
        return new Promise<never>((_, reject) => {
          signal.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("aborted"));
          });
        });
      }, 10),
    ).rejects.toThrow(/timed out|aborted/);
    expect(aborted).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Cost / usage accounting
 * ------------------------------------------------------------------ */

describe("cost accounting", () => {
  it("estimateCost computes per-1M pricing", () => {
    const cost = estimateCost(
      { inputTokens: 1_000_000, outputTokens: 500_000 },
      { inputPer1M: 0.15, outputPer1M: 0.6 },
    );
    expect(cost).toBeCloseTo(0.15 + 0.3, 6);
    expect(estimateCost(undefined, { inputPer1M: 1, outputPer1M: 1 })).toBe(0);
  });

  it("sumUsage adds usages and skips undefined", () => {
    expect(
      sumUsage({ inputTokens: 10, outputTokens: 2 }, undefined, { inputTokens: 5, outputTokens: 3 }),
    ).toEqual({ inputTokens: 15, outputTokens: 5 });
  });

  it("UsageTracker accumulates, costs and resets", () => {
    const t = new UsageTracker();
    t.add({ inputTokens: 100, outputTokens: 20 }).add({ inputTokens: 50, outputTokens: 10 });
    t.add(undefined);
    expect(t.total).toEqual({ inputTokens: 150, outputTokens: 30 });
    expect(t.calls).toBe(3);
    expect(t.cost({ inputPer1M: 1_000_000, outputPer1M: 1_000_000 })).toBeCloseTo(180, 6);
    t.reset();
    expect(t.total).toEqual({ inputTokens: 0, outputTokens: 0 });
    expect(t.calls).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 * JSON extraction
 * ------------------------------------------------------------------ */

describe("structured-output parsing", () => {
  it("extracts JSON from a ```json code fence", () => {
    const text = 'Here you go:\n```json\n{ "city": "NYC", "temp": 72 }\n```\nEnjoy!';
    expect(extractJson(text)).toEqual({ city: "NYC", temp: 72 });
  });

  it("extracts the first balanced object embedded in prose", () => {
    const text = 'The answer is {"ok": true, "nested": {"a": [1, 2, 3]}} — done.';
    expect(extractJson(text)).toEqual({ ok: true, nested: { a: [1, 2, 3] } });
  });

  it("is not fooled by braces inside string literals", () => {
    const text = 'reply: {"note": "use } and { carefully", "n": 1}';
    expect(extractJson(text)).toEqual({ note: "use } and { carefully", n: 1 });
  });

  it("extracts a top-level array", () => {
    expect(extractJson("values: [1, 2, 3] end")).toEqual([1, 2, 3]);
  });

  it("parseJson returns the typed value, or undefined on garbage", () => {
    const v = parseJson<{ n: number }>('{"n": 7}');
    expect(v?.n).toBe(7);
    expect(parseJson("no json here at all")).toBeUndefined();
    expect(extractJson("")).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 * textStream
 * ------------------------------------------------------------------ */

describe("textStream", () => {
  it("filters a chunk stream down to text deltas", async () => {
    const chunks: ChatChunk[] = [
      { type: "text", delta: "Hel" },
      { type: "tool_call", index: 0, name: "f" },
      { type: "text", delta: "lo" },
      { type: "text", delta: "" },
      { type: "done", finishReason: "stop" },
    ];
    const out: string[] = [];
    for await (const t of textStream(chunks)) out.push(t);
    expect(out.join("")).toBe("Hello");
  });
});

/* ------------------------------------------------------------------ *
 * Backward-compat sanity: existing exports still present
 * ------------------------------------------------------------------ */

describe("backward compatibility", () => {
  it("keeps the original message shape usable without builders", async () => {
    const convo: Message[] = [{ role: "user", content: "Hi" }];
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    const res = await chat({
      provider: "openai",
      model: "gpt-4o",
      apiKey: "k",
      messages: convo,
      fetchImpl: fetchMock as any,
    });
    expect(res.text).toBe("hi");
  });
});
