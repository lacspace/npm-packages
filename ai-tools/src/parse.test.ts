import { test, expect } from "vitest";
import { parseToolCalls, hasToolCalls, toolbox, defineTool, jsonSchema } from "./index";

test("parses OpenAI Chat Completions tool_calls", () => {
  const response = {
    choices: [
      {
        message: {
          tool_calls: [
            { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"Kathmandu"}' } },
            { id: "call_2", type: "function", function: { name: "add", arguments: '{"x":1,"y":2}' } },
          ],
        },
      },
    ],
  };
  const calls = parseToolCalls(response);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toMatchObject({ id: "call_1", name: "get_weather", arguments: '{"city":"Kathmandu"}' });
  expect(calls[1]!.name).toBe("add");
});

test("parses Anthropic tool_use content blocks (ignoring text blocks)", () => {
  const message = {
    role: "assistant",
    content: [
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "toolu_1", name: "get_weather", input: { city: "Pokhara" } },
    ],
  };
  const calls = parseToolCalls(message);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ id: "toolu_1", name: "get_weather", input: { city: "Pokhara" } });
});

test("parses Google Gemini functionCall parts", () => {
  const response = {
    candidates: [
      { content: { parts: [{ functionCall: { name: "get_weather", args: { city: "Lalitpur" } } }] } },
    ],
  };
  const calls = parseToolCalls(response);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ name: "get_weather", args: { city: "Lalitpur" } });
});

test("parses the OpenAI Responses API function_call items", () => {
  const response = {
    output: [
      { type: "message", content: [] },
      { type: "function_call", call_id: "fc_1", name: "add", arguments: '{"x":2,"y":2}' },
    ],
  };
  const calls = parseToolCalls(response);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ id: "fc_1", name: "add" });
});

test("parses a legacy single function_call", () => {
  const calls = parseToolCalls({ function_call: { name: "get_weather", arguments: '{"city":"X"}' } });
  expect(calls).toEqual([{ name: "get_weather", arguments: '{"city":"X"}' }]);
});

test("parses an array of messages and a bare normalized call", () => {
  const fromArray = parseToolCalls([
    { content: [{ type: "tool_use", id: "a", name: "one", input: {} }] },
    { content: [{ type: "tool_use", id: "b", name: "two", input: {} }] },
  ]);
  expect(fromArray.map((c) => c.name)).toEqual(["one", "two"]);

  const bare = parseToolCalls({ name: "solo", arguments: { a: 1 } });
  expect(bare).toHaveLength(1);
  expect(bare[0]!.name).toBe("solo");
});

test("returns [] and hasToolCalls=false when there are no tool calls", () => {
  expect(parseToolCalls({ choices: [{ message: { content: "hi" } }] })).toEqual([]);
  expect(parseToolCalls(null)).toEqual([]);
  expect(parseToolCalls("nope")).toEqual([]);
  expect(hasToolCalls({ choices: [{ message: { content: "hi" } }] })).toBe(false);
  expect(hasToolCalls({ content: [{ type: "tool_use", id: "x", name: "t", input: {} }] })).toBe(true);
});

test("parseToolCalls output dispatches through a toolbox end-to-end", async () => {
  const kit = toolbox([
    defineTool({
      name: "add",
      description: "Add.",
      parameters: jsonSchema.object({ x: jsonSchema.number(), y: jsonSchema.number() }),
      handler: ({ x, y }) => x + y,
    }),
  ]);
  const response = {
    choices: [{ message: { tool_calls: [{ id: "c1", function: { name: "add", arguments: '{"x":4,"y":6}' } }] } }],
  };
  const results = await kit.dispatchAll(parseToolCalls(response));
  expect(results[0]).toEqual({ name: "add", id: "c1", result: 10 });
});
