import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chat,
  stream,
  accumulate,
  createClient,
  AiError,
  type ChatChunk,
  type Message,
  type Tool,
} from "./index.js";

/* ------------------------------------------------------------------ *
 * Test helpers
 * ------------------------------------------------------------------ */

/** Build a JSON Response mock. */
function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** Build a plain-text (error) Response mock. */
function textResponse(text: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
  } as unknown as Response;
}

/** Turn SSE lines into a streaming Response with a ReadableStream body. */
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

/** Stub globalThis.fetch, returning the captured call args. */
function stubFetch(response: Response | (() => Response | Promise<Response>)) {
  const fn = vi.fn(async (_url: string, _init: RequestInit): Promise<Response> =>
    typeof response === "function" ? response() : response,
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

const messages: Message[] = [
  { role: "system", content: "You are terse." },
  { role: "user", content: "Hi" },
];

const weatherTool: Tool = {
  name: "get_weather",
  description: "Get the weather",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------ *
 * Request building — OpenAI
 * ------------------------------------------------------------------ */

describe("request building", () => {
  it("builds an OpenAI request: URL, bearer header, body", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    await chat({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "sk-test",
      messages,
      temperature: 0.5,
      maxTokens: 100,
      tools: [weatherTool],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    expect(headers["content-type"]).toBe("application/json");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.temperature).toBe(0.5);
    expect(body.max_tokens).toBe(100);
    // system stays a role message for OpenAI
    expect(body.messages[0]).toEqual({ role: "system", content: "You are terse." });
    expect(body.tools[0]).toEqual({
      type: "function",
      function: {
        name: "get_weather",
        description: "Get the weather",
        parameters: weatherTool.parameters,
      },
    });
    // no streaming keys on a non-stream call
    expect(body.stream).toBeUndefined();
  });

  it("builds an Anthropic request: x-api-key, version, top-level system", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn" }),
    );
    await chat({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKey: "ant-test",
      messages,
      stop: "STOP",
      tools: [weatherTool],
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe("ant-test");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse((init as RequestInit).body as string);
    // system pulled out to top level, not in messages
    expect(body.system).toBe("You are terse.");
    expect(body.messages).toEqual([{ role: "user", content: "Hi" }]);
    // max_tokens is required → defaulted
    expect(body.max_tokens).toBe(1024);
    expect(body.stop_sequences).toEqual(["STOP"]);
    // tool schema uses input_schema
    expect(body.tools[0]).toEqual({
      name: "get_weather",
      description: "Get the weather",
      input_schema: weatherTool.parameters,
    });
  });

  it("builds a Google request: ?key=, systemInstruction + contents", async () => {
    const fetchMock = stubFetch(
      jsonResponse({
        candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }],
      }),
    );
    await chat({
      provider: "google",
      model: "gemini-1.5-flash",
      apiKey: "goog-test",
      messages,
      temperature: 0.2,
      maxTokens: 50,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=goog-test",
    );
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.systemInstruction).toEqual({ parts: [{ text: "You are terse." }] });
    expect(body.contents).toEqual([{ role: "user", parts: [{ text: "Hi" }] }]);
    expect(body.generationConfig).toEqual({ temperature: 0.2, maxOutputTokens: 50 });
  });

  it("builds an openai-compatible request against a custom baseUrl", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    await chat({
      provider: "openai-compatible",
      model: "llama3",
      apiKey: "ollama",
      baseUrl: "http://localhost:11434/v1",
      messages,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://localhost:11434/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ollama");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("llama3");
  });

  it("merges custom headers into the request", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    await chat({
      provider: "openai-compatible",
      model: "x",
      apiKey: "k",
      baseUrl: "https://openrouter.ai/api/v1",
      messages,
      headers: { "HTTP-Referer": "https://lacspace.com", "X-Title": "Lac" },
    });
    const headers = (fetchMock.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers["HTTP-Referer"]).toBe("https://lacspace.com");
    expect(headers["X-Title"]).toBe("Lac");
  });

  it("serializes tool-call and tool-result messages for OpenAI round-trips", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ choices: [{ message: { content: "done" }, finish_reason: "stop" }] }),
    );
    const convo: Message[] = [
      { role: "user", content: "weather?" },
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "call_1", name: "get_weather", args: { city: "NYC" }, argsRaw: '{"city":"NYC"}' },
        ],
      },
      { role: "tool", toolCallId: "call_1", content: "72F" },
    ];
    await chat({ provider: "openai", model: "gpt-4o", apiKey: "k", messages: convo });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.messages[1].tool_calls[0]).toEqual({
      id: "call_1",
      type: "function",
      function: { name: "get_weather", arguments: '{"city":"NYC"}' },
    });
    expect(body.messages[2]).toEqual({ role: "tool", tool_call_id: "call_1", content: "72F" });
  });
});

/* ------------------------------------------------------------------ *
 * Response normalization
 * ------------------------------------------------------------------ */

describe("response normalization", () => {
  it("normalizes an OpenAI response (text + usage + tool_calls)", async () => {
    stubFetch(
      jsonResponse({
        model: "gpt-4o-mini",
        choices: [
          {
            message: {
              content: "Sunny.",
              tool_calls: [
                {
                  id: "call_9",
                  type: "function",
                  function: { name: "get_weather", arguments: '{"city":"NYC"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 5 },
      }),
    );
    const res = await chat({ provider: "openai", model: "gpt-4o-mini", apiKey: "k", messages });
    expect(res.text).toBe("Sunny.");
    expect(res.finishReason).toBe("tool_calls");
    expect(res.usage).toEqual({ inputTokens: 12, outputTokens: 5 });
    expect(res.model).toBe("gpt-4o-mini");
    expect(res.toolCalls).toEqual([
      { id: "call_9", name: "get_weather", args: { city: "NYC" }, argsRaw: '{"city":"NYC"}' },
    ]);
  });

  it("normalizes an Anthropic response (text + usage + tool_use)", async () => {
    stubFetch(
      jsonResponse({
        model: "claude-3-5-sonnet-latest",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "NYC" } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 20, output_tokens: 8 },
      }),
    );
    const res = await chat({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKey: "k",
      messages,
    });
    expect(res.text).toBe("Let me check.");
    expect(res.finishReason).toBe("tool_calls");
    expect(res.usage).toEqual({ inputTokens: 20, outputTokens: 8 });
    expect(res.toolCalls).toEqual([
      { id: "toolu_1", name: "get_weather", args: { city: "NYC" }, argsRaw: '{"city":"NYC"}' },
    ]);
  });

  it("normalizes a Google response (text + functionCall + usage)", async () => {
    stubFetch(
      jsonResponse({
        modelVersion: "gemini-1.5-flash",
        candidates: [
          {
            content: {
              parts: [
                { text: "Checking." },
                { functionCall: { name: "get_weather", args: { city: "NYC" } } },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 6 },
      }),
    );
    const res = await chat({ provider: "google", model: "gemini-1.5-flash", apiKey: "k", messages });
    expect(res.text).toBe("Checking.");
    expect(res.usage).toEqual({ inputTokens: 15, outputTokens: 6 });
    expect(res.toolCalls[0]!.name).toBe("get_weather");
    expect(res.toolCalls[0]!.args).toEqual({ city: "NYC" });
  });
});

/* ------------------------------------------------------------------ *
 * Error path
 * ------------------------------------------------------------------ */

describe("error handling", () => {
  it("throws AiError with the provider message on a 429", async () => {
    stubFetch(
      jsonResponse(
        { error: { message: "Rate limit exceeded", type: "rate_limit_error" } },
        { status: 429 },
      ),
    );
    await expect(
      chat({ provider: "openai", model: "gpt-4o", apiKey: "k", messages }),
    ).rejects.toMatchObject({ name: "AiError", status: 429, message: "Rate limit exceeded" });
  });

  it("throws AiError on a 500 (plain-text body)", async () => {
    stubFetch(textResponse("Internal Server Error", 500));
    const err = await chat({
      provider: "anthropic",
      model: "claude-3-5-sonnet-latest",
      apiKey: "k",
      messages,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.status).toBe(500);
    expect(err.provider).toBe("anthropic");
    expect(err.message).toBe("Internal Server Error");
  });

  it("wraps a network failure as an AiError with status 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const err = await chat({
      provider: "google",
      model: "gemini-1.5-flash",
      apiKey: "k",
      messages,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.status).toBe(0);
    expect(err.message).toContain("fetch failed");
  });
});

/* ------------------------------------------------------------------ *
 * createClient
 * ------------------------------------------------------------------ */

describe("createClient", () => {
  it("applies provider, apiKey and defaultModel", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    const ai = createClient({
      provider: "openai",
      apiKey: "sk-bound",
      defaultModel: "gpt-4o-mini",
    });
    await ai.chat({ messages: [{ role: "user", content: "Hi" }] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-bound");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o-mini");
  });

  it("lets a per-call model override the default", async () => {
    const fetchMock = stubFetch(
      jsonResponse({ choices: [{ message: { content: "hi" }, finish_reason: "stop" }] }),
    );
    const ai = createClient({ provider: "openai", apiKey: "k", defaultModel: "gpt-4o-mini" });
    await ai.chat({ model: "gpt-4o", messages: [{ role: "user", content: "Hi" }] });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.model).toBe("gpt-4o");
  });

  it("throws when no model is available", () => {
    const ai = createClient({ provider: "openai", apiKey: "k" });
    expect(() => ai.chat({ messages: [{ role: "user", content: "Hi" }] })).toThrow(/model/);
  });
});

/* ------------------------------------------------------------------ *
 * Streaming + accumulate
 * ------------------------------------------------------------------ */

describe("streaming", () => {
  it("parses an OpenAI SSE stream into unified chunks and accumulates", async () => {
    stubFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const chunks: ChatChunk[] = [];
    for await (const c of stream({
      provider: "openai",
      model: "gpt-4o-mini",
      apiKey: "k",
      messages,
    })) {
      chunks.push(c);
    }
    const text = chunks.filter((c) => c.type === "text").map((c: any) => c.delta).join("");
    expect(text).toBe("Hello");
    expect(chunks.some((c) => c.type === "done")).toBe(true);

    const final = await accumulate(chunks);
    expect(final.text).toBe("Hello");
    expect(final.finishReason).toBe("stop");
  });

  it("reconstructs streamed OpenAI tool calls via accumulate", async () => {
    stubFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\"ci"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ty\\":\\"NYC\\"}"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const final = await accumulate(
      stream({ provider: "openai", model: "gpt-4o", apiKey: "k", messages }),
    );
    expect(final.toolCalls).toEqual([
      { id: "call_1", name: "get_weather", args: { city: "NYC" }, argsRaw: '{"city":"NYC"}' },
    ]);
    expect(final.finishReason).toBe("tool_calls");
  });

  it("parses an Anthropic SSE stream (message_start → deltas → message_delta)", async () => {
    stubFetch(
      sseResponse([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":10}}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"there"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":4}}\n\n',
      ]),
    );
    const final = await accumulate(
      stream({
        provider: "anthropic",
        model: "claude-3-5-sonnet-latest",
        apiKey: "k",
        messages,
      }),
    );
    expect(final.text).toBe("Hi there");
    expect(final.finishReason).toBe("stop");
    expect(final.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });

  it("parses a Google SSE stream into text + usage", async () => {
    stubFetch(
      sseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"Hi "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"world"}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n',
      ]),
    );
    const final = await accumulate(
      stream({ provider: "google", model: "gemini-1.5-flash", apiKey: "k", messages }),
    );
    expect(final.text).toBe("Hi world");
    expect(final.finishReason).toBe("stop");
    expect(final.usage).toEqual({ inputTokens: 3, outputTokens: 2 });
  });

  it("handles SSE events split across stream chunks", async () => {
    // One logical event delivered in two byte-fragments.
    stubFetch(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"split ',
        'works"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );
    const final = await accumulate(
      stream({ provider: "openai", model: "gpt-4o", apiKey: "k", messages }),
    );
    expect(final.text).toBe("split works");
  });

  it("throws AiError before streaming when the response is non-2xx", async () => {
    stubFetch(jsonResponse({ error: { message: "bad key" } }, { status: 401 }));
    const iter = stream({ provider: "openai", model: "gpt-4o", apiKey: "bad", messages });
    await expect(iter.next()).rejects.toMatchObject({ name: "AiError", status: 401 });
  });
});
