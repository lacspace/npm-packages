import { test, expect } from "vitest";
import { toToolMessages, type DispatchResult } from "./index";

const ok: DispatchResult = { name: "get_weather", id: "call_1", result: { city: "Kathmandu", tempC: 21 } };
const strOk: DispatchResult = { name: "echo", id: "call_2", result: "pong" };
const failed: DispatchResult = { name: "get_weather", id: "call_3", error: "city is required", isError: true };

test("openai: one tool message per result, JSON-stringified content", () => {
  const msgs = toToolMessages("openai", [ok, strOk]) as any[];
  expect(msgs).toHaveLength(2);
  expect(msgs[0]).toEqual({
    role: "tool",
    tool_call_id: "call_1",
    content: JSON.stringify({ city: "Kathmandu", tempC: 21 }),
  });
  // a string result is passed through verbatim
  expect(msgs[1].content).toBe("pong");
});

test("anthropic: a single user message wrapping tool_result blocks", () => {
  const msgs = toToolMessages("anthropic", [ok, failed]) as any[];
  expect(msgs).toHaveLength(1);
  expect(msgs[0].role).toBe("user");
  expect(msgs[0].content).toHaveLength(2);
  expect(msgs[0].content[0]).toEqual({
    type: "tool_result",
    tool_use_id: "call_1",
    content: JSON.stringify({ city: "Kathmandu", tempC: 21 }),
  });
  // errors get is_error: true and the error text
  expect(msgs[0].content[1]).toEqual({
    type: "tool_result",
    tool_use_id: "call_3",
    content: "city is required",
    is_error: true,
  });
});

test("google: a single user message with functionResponse parts", () => {
  const msgs = toToolMessages("google", ok) as any[];
  expect(msgs).toHaveLength(1);
  expect(msgs[0].parts[0]).toEqual({
    functionResponse: { name: "get_weather", response: { city: "Kathmandu", tempC: 21 } },
  });
});

test("google: non-object results are wrapped as { result }, errors as { error }", () => {
  const msgs = toToolMessages("google", [strOk, failed]) as any[];
  expect(msgs[0].parts[0].functionResponse.response).toEqual({ result: "pong" });
  expect(msgs[0].parts[1].functionResponse.response).toEqual({ error: "city is required" });
});

test("accepts a single result (not an array) too", () => {
  const msgs = toToolMessages("openai", ok) as any[];
  expect(msgs).toHaveLength(1);
  expect(msgs[0].tool_call_id).toBe("call_1");
});

test("throws on an unknown provider", () => {
  expect(() => toToolMessages("cohere" as any, ok)).toThrow(/Unknown provider/);
});
