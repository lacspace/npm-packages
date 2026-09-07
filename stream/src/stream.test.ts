import { test, expect } from "vitest";
import {
  parseSSE,
  streamChat,
  accumulate,
  readableFromString,
  toAsyncIterable,
  type SSEEvent,
  type ChatChunk,
} from "./index";

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

/* ------------------------------------------------------------------ *
 * parseSSE — framing
 * ------------------------------------------------------------------ */

test("parseSSE parses simple data records", async () => {
  const sse = "data: hello\n\ndata: world\n\n";
  const events = await collect(parseSSE(readableFromString(sse)));
  expect(events.map((e) => e.data)).toEqual(["hello", "world"]);
});

test("parseSSE strips exactly one leading space after the colon", async () => {
  const sse = "data:  two-spaces\n\n"; // one space is field sep, one is data
  const ev = (await collect(parseSSE(readableFromString(sse))))[0]!;
  expect(ev.data).toBe(" two-spaces");
});

test("parseSSE joins multi-line data with newlines", async () => {
  const sse = "data: line1\ndata: line2\ndata: line3\n\n";
  const ev = (await collect(parseSSE(readableFromString(sse))))[0]!;
  expect(ev.data).toBe("line1\nline2\nline3");
});

test("parseSSE captures event and id fields, and skips comments", async () => {
  const sse = ": this is a comment\nevent: ping\nid: 42\ndata: {\"ok\":true}\n\n";
  const ev = (await collect(parseSSE(readableFromString(sse))))[0]!;
  expect(ev.event).toBe("ping");
  expect(ev.id).toBe("42");
  expect(ev.data).toBe('{"ok":true}');
});

test("parseSSE buffers correctly across arbitrary chunk boundaries", async () => {
  const sse = "event: greet\ndata: hi there\n\ndata: second\n\n";
  // Force 1-byte chunks so every field/record spans many boundaries.
  const events = await collect(parseSSE(readableFromString(sse, 1)));
  expect(events).toEqual<SSEEvent[]>([
    { event: "greet", data: "hi there" },
    { data: "second" },
  ]);
});

test("parseSSE treats data: [DONE] as end of stream", async () => {
  const sse = "data: a\n\ndata: b\n\ndata: [DONE]\n\ndata: after\n\n";
  const events = await collect(parseSSE(readableFromString(sse)));
  expect(events.map((e) => e.data)).toEqual(["a", "b"]); // "after" never emitted
});

test("parseSSE dispatches a trailing record with no final blank line", async () => {
  const sse = "data: tail"; // no newline at all
  const events = await collect(parseSSE(readableFromString(sse)));
  expect(events.map((e) => e.data)).toEqual(["tail"]);
});

test("parseSSE accepts a raw string and an async iterable of strings", async () => {
  const fromString = await collect(parseSSE("data: x\n\n"));
  expect(fromString.map((e) => e.data)).toEqual(["x"]);

  async function* gen() {
    yield "data: a\n";
    yield "\ndata: b\n\n";
  }
  const fromIter = await collect(parseSSE(gen()));
  expect(fromIter.map((e) => e.data)).toEqual(["a", "b"]);
});

test("parseSSE decodes multi-byte UTF-8 split across chunk boundaries", async () => {
  // "😀" is 4 bytes; 1-byte chunks split it mid-character.
  const sse = "data: 😀€\n\n";
  const ev = (await collect(parseSSE(readableFromString(sse, 1))))[0]!;
  expect(ev.data).toBe("😀€");
});

/* ------------------------------------------------------------------ *
 * streamChat — OpenAI
 * ------------------------------------------------------------------ */

const OPENAI_SSE = [
  'data: {"choices":[{"delta":{"role":"assistant","content":""}}]}',
  'data: {"choices":[{"delta":{"content":"Hello"}}]}',
  'data: {"choices":[{"delta":{"content":", world"}}]}',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":"{\\"loc"}}]}}]}',
  'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ation\\":\\"Paris\\"}"}}]}}]}',
  'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}',
  "data: [DONE]",
].join("\n\n") + "\n\n";

test("streamChat normalizes an OpenAI stream into text + tool_call + done", async () => {
  const chunks = await collect(
    streamChat(readableFromString(OPENAI_SSE, 7), { provider: "openai" }),
  );
  const texts = chunks.filter((c) => c.type === "text").map((c) => (c as any).delta);
  expect(texts).toEqual(["Hello", ", world"]);

  const tools = chunks.filter((c) => c.type === "tool_call");
  expect(tools.length).toBe(2);
  expect((tools[0] as any).id).toBe("call_1");
  expect((tools[0] as any).name).toBe("get_weather");

  const done = chunks.find((c) => c.type === "done") as any;
  expect(done.finishReason).toBe("tool_calls");
});

test("accumulate reconstructs OpenAI text + full tool-call JSON", async () => {
  const result = await accumulate(
    streamChat(readableFromString(OPENAI_SSE), { provider: "openai" }),
  );
  expect(result.text).toBe("Hello, world");
  expect(result.finishReason).toBe("tool_calls");
  expect(result.toolCalls.length).toBe(1);
  const tc = result.toolCalls[0]!;
  expect(tc.id).toBe("call_1");
  expect(tc.name).toBe("get_weather");
  expect(JSON.parse(tc.arguments)).toEqual({ location: "Paris" });
});

/* ------------------------------------------------------------------ *
 * streamChat — Anthropic
 * ------------------------------------------------------------------ */

function anthropicEvent(type: string, obj: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...obj })}\n\n`;
}

const ANTHROPIC_SSE =
  anthropicEvent("message_start", { message: { id: "msg_1", role: "assistant" } }) +
  anthropicEvent("content_block_start", { index: 0, content_block: { type: "text", text: "" } }) +
  anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Hi " } }) +
  anthropicEvent("content_block_delta", { index: 0, delta: { type: "text_delta", text: "there" } }) +
  anthropicEvent("content_block_stop", { index: 0 }) +
  anthropicEvent("content_block_start", {
    index: 1,
    content_block: { type: "tool_use", id: "toolu_1", name: "lookup", input: {} },
  }) +
  anthropicEvent("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"q":"' } }) +
  anthropicEvent("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: 'weather"}' } }) +
  anthropicEvent("content_block_stop", { index: 1 }) +
  anthropicEvent("message_delta", { delta: { stop_reason: "tool_use" }, usage: { output_tokens: 10 } }) +
  anthropicEvent("message_stop", {});

test("streamChat normalizes an Anthropic event sequence", async () => {
  const chunks = await collect(
    streamChat(readableFromString(ANTHROPIC_SSE, 9), { provider: "anthropic" }),
  );
  const texts = chunks.filter((c) => c.type === "text").map((c) => (c as any).delta);
  expect(texts).toEqual(["Hi ", "there"]);

  const tools = chunks.filter((c) => c.type === "tool_call");
  // start (id+name) + two arg deltas
  expect((tools[0] as any).index).toBe(1);
  expect((tools[0] as any).id).toBe("toolu_1");
  expect((tools[0] as any).name).toBe("lookup");

  const done = chunks.find((c) => c.type === "done") as any;
  expect(done.finishReason).toBe("tool_use");
});

test("accumulate reconstructs Anthropic text + full tool-call JSON", async () => {
  const result = await accumulate(
    streamChat(readableFromString(ANTHROPIC_SSE), { provider: "anthropic" }),
  );
  expect(result.text).toBe("Hi there");
  expect(result.finishReason).toBe("tool_use");
  expect(result.toolCalls.length).toBe(1);
  const tc = result.toolCalls[0]!;
  expect(tc.index).toBe(1);
  expect(tc.id).toBe("toolu_1");
  expect(tc.name).toBe("lookup");
  expect(JSON.parse(tc.arguments)).toEqual({ q: "weather" });
});

/* ------------------------------------------------------------------ *
 * streamChat — source flexibility
 * ------------------------------------------------------------------ */

test("streamChat accepts an already-parsed SSE iterable", async () => {
  async function* events(): AsyncIterable<SSEEvent> {
    yield { data: '{"choices":[{"delta":{"content":"pre-parsed"}}]}' };
    yield { data: '{"choices":[{"delta":{},"finish_reason":"stop"}]}' };
  }
  const result = await accumulate(streamChat(events(), { provider: "openai" }));
  expect(result.text).toBe("pre-parsed");
  expect(result.finishReason).toBe("stop");
});

test("streamChat unwraps a Response-like object via its .body", async () => {
  const responseLike = { body: readableFromString(OPENAI_SSE) };
  const result = await accumulate(
    streamChat(responseLike, { provider: "openai" }),
  );
  expect(result.text).toBe("Hello, world");
});

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

test("readableFromString + toAsyncIterable round-trip the bytes", async () => {
  const stream = readableFromString("abc", 1);
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of toAsyncIterable<Uint8Array>(stream)) {
    out += decoder.decode(chunk, { stream: true });
  }
  out += decoder.decode();
  expect(out).toBe("abc");
});

test("accumulate keeps multiple parallel tool calls separate by index", async () => {
  async function* chunks(): AsyncIterable<ChatChunk> {
    yield { type: "tool_call", index: 0, id: "a", name: "one", argsDelta: '{"x":' };
    yield { type: "tool_call", index: 1, id: "b", name: "two", argsDelta: '{"y":' };
    yield { type: "tool_call", index: 0, argsDelta: "1}" };
    yield { type: "tool_call", index: 1, argsDelta: "2}" };
    yield { type: "done", finishReason: "tool_calls" };
  }
  const result = await accumulate(chunks());
  expect(result.toolCalls.map((t) => t.name)).toEqual(["one", "two"]);
  expect(JSON.parse(result.toolCalls[0]!.arguments)).toEqual({ x: 1 });
  expect(JSON.parse(result.toolCalls[1]!.arguments)).toEqual({ y: 2 });
});
