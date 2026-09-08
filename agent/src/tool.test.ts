import { test, expect } from "vitest";
import {
  defineTool,
  dispatchTool,
  toolMap,
  stringifyResult,
  type ToolCall,
} from "./index";

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
  id: `id-${name}`,
  name,
  arguments: args,
});

test("defineTool returns a plain AgentTool shape", () => {
  const t = defineTool("greet", {
    description: "say hi",
    parameters: { type: "object" },
    handler: () => "hi",
  });
  expect(t.name).toBe("greet");
  expect(t.description).toBe("say hi");
  expect(t.parameters).toEqual({ type: "object" });
  expect(typeof t.handler).toBe("function");
});

test("defineTool throws without a name", () => {
  expect(() => defineTool("", { handler: () => 1 })).toThrow(/name/);
});

test("defineTool throws without a handler", () => {
  // @ts-expect-error missing handler
  expect(() => defineTool("x", {})).toThrow(/handler/);
});

test("dispatchTool runs the matching handler with the call arguments", async () => {
  const map = toolMap([defineTool("mul", { handler: ({ a, b }) => (a as number) * (b as number) })]);
  const out = await dispatchTool(call("mul", { a: 4, b: 5 }), map);
  expect(out.result).toBe(20);
  expect(out.error).toBeUndefined();
});

test("dispatchTool captures a thrown handler error", async () => {
  const map = toolMap([
    defineTool("fail", {
      handler: () => {
        throw new Error("nope");
      },
    }),
  ]);
  const out = await dispatchTool(call("fail"), map);
  expect(out.error).toBe("nope");
  expect(out.result).toEqual({ error: "nope" });
});

test("dispatchTool reports an unknown tool without throwing", async () => {
  const out = await dispatchTool(call("missing"), toolMap([]));
  expect(out.error).toContain("Unknown tool");
});

test("dispatchTool coerces non-Error throws to a string", async () => {
  const map = toolMap([
    defineTool("throwStr", {
      handler: () => {
        throw "just a string";
      },
    }),
  ]);
  const out = await dispatchTool(call("throwStr"), map);
  expect(out.error).toBe("just a string");
});

test("stringifyResult passes strings through and JSON-encodes objects", () => {
  expect(stringifyResult("hello")).toBe("hello");
  expect(stringifyResult({ a: 1 })).toBe('{"a":1}');
  expect(stringifyResult(undefined)).toBe("");
  expect(stringifyResult(42)).toBe("42");
});

test("stringifyResult falls back to String() on circular refs", () => {
  const obj: Record<string, unknown> = {};
  obj.self = obj;
  expect(typeof stringifyResult(obj)).toBe("string");
});

test("toolMap indexes by name, last wins on duplicates", () => {
  const map = toolMap([
    defineTool("dup", { handler: () => "first" }),
    defineTool("dup", { handler: () => "second" }),
  ]);
  expect(map.size).toBe(1);
  expect(map.get("dup")!.handler({})).toBe("second");
});
