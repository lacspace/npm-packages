import { describe, test, expect } from "vitest";
import { PassThrough } from "node:stream";
import { McpServer, LATEST_PROTOCOL, type ToolDefinition } from "./server";
import { serveStdio } from "./stdio";
import type { JsonRpcResponse } from "./jsonrpc";

const echo: ToolDefinition<{ text: string; shout: boolean }> = {
  name: "echo",
  description: "returns its input",
  inputSchema: { type: "object", properties: { text: { type: "string" }, shout: { type: "boolean", default: false } }, required: ["text"], additionalProperties: false },
  run: ({ text, shout }) => ({ text: shout ? text.toUpperCase() : text, data: { text } }),
};
const boom: ToolDefinition = { name: "boom", description: "throws", inputSchema: { type: "object" }, run: () => { throw new Error("kaboom"); } };
const slow: ToolDefinition = {
  name: "slow", description: "waits for cancel", inputSchema: { type: "object" },
  run: (_a, ctx) => new Promise((resolve) => { ctx.signal.addEventListener("abort", () => resolve({ text: "cancelled", isError: true })); }),
};
const make = () => new McpServer({ name: "t", version: "0.0.0", tools: [echo, boom, slow] });
const req = (id: number | string, method: string, params?: unknown) => ({ jsonrpc: "2.0", id, method, params });

describe("protocol", () => {
  test("initialize negotiates the version: echo a supported one, else offer the latest", async () => {
    const s = make();
    const r1 = (await s.handleMessage(req(1, "initialize", { protocolVersion: "2024-11-05", clientInfo: { name: "c" } }))) as JsonRpcResponse;
    expect((r1.result as { protocolVersion: string }).protocolVersion).toBe("2024-11-05");
    const r2 = (await s.handleMessage(req(2, "initialize", { protocolVersion: "1999-01-01" }))) as JsonRpcResponse;
    expect((r2.result as { protocolVersion: string }).protocolVersion).toBe(LATEST_PROTOCOL);
    expect(r2.result).toMatchObject({ capabilities: { tools: { listChanged: false } }, serverInfo: { name: "t", version: "0.0.0" } });
  });

  test("notifications get no reply; initialized flips the flag", async () => {
    const s = make();
    expect(await s.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeUndefined();
    expect(s.initialized).toBe(true);
  });

  test("ping, tools/list, unknown method", async () => {
    const s = make();
    expect(((await s.handleMessage(req(1, "ping"))) as JsonRpcResponse).result).toEqual({});
    const list = (await s.handleMessage(req(2, "tools/list"))) as JsonRpcResponse;
    expect((list.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toEqual(["echo", "boom", "slow"]);
    const bad = (await s.handleMessage(req(3, "nope/method"))) as JsonRpcResponse;
    expect(bad.error).toMatchObject({ code: -32601 });
  });

  test("tools/call: defaults applied, bad args → -32602, unknown tool → -32602, throw → isError result", async () => {
    const s = make();
    const ok = (await s.handleMessage(req(1, "tools/call", { name: "echo", arguments: { text: "hi" } }))) as JsonRpcResponse;
    expect(ok.result).toEqual({ content: [{ type: "text", text: "hi" }], structuredContent: { text: "hi" } });
    const shout = (await s.handleMessage(req(2, "tools/call", { name: "echo", arguments: { text: "hi", shout: true } }))) as JsonRpcResponse;
    expect((shout.result as { content: { text: string }[] }).content[0]!.text).toBe("HI");
    const bad = (await s.handleMessage(req(3, "tools/call", { name: "echo", arguments: { text: 5 } }))) as JsonRpcResponse;
    expect(bad.error).toMatchObject({ code: -32602, data: { problems: ["arguments.text must be string, got integer"] } });
    const unknown = (await s.handleMessage(req(4, "tools/call", { name: "nope" }))) as JsonRpcResponse;
    expect(unknown.error).toMatchObject({ code: -32602, message: "Unknown tool: nope" });
    const thrown = (await s.handleMessage(req(5, "tools/call", { name: "boom" }))) as JsonRpcResponse;
    expect(thrown.result).toMatchObject({ isError: true, content: [{ type: "text", text: "boom failed: kaboom" }] });
  });

  test("parse error → id null; invalid request; empty batch; batch answered as batch", async () => {
    const s = make();
    expect(await s.handleLine("{not json")).toMatchObject({ id: null, error: { code: -32700 } });
    expect(await s.handleMessage({ jsonrpc: "2.0", id: 7 })).toMatchObject({ id: 7, error: { code: -32600 } });
    expect(await s.handleMessage([])).toMatchObject({ id: null, error: { code: -32600 } });
    const batch = (await s.handleMessage([req(1, "ping"), { jsonrpc: "2.0", method: "notifications/initialized" }, req(2, "ping")])) as JsonRpcResponse[];
    expect(batch.map((r) => r.id)).toEqual([1, 2]);
  });

  test("notifications/cancelled aborts the in-flight call", async () => {
    const s = make();
    const pending = s.handleMessage(req("x", "tools/call", { name: "slow" }));
    await s.handleMessage({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: "x" } });
    expect((await pending) as JsonRpcResponse).toMatchObject({ result: { isError: true } });
  });
});

describe("stdio transport", () => {
  test("answers each line, ignores blanks and notifications, keeps stdout protocol-only", async () => {
    const s = make();
    const input = new PassThrough();
    const output = new PassThrough();
    let out = "";
    output.on("data", (c: Buffer) => { out += c.toString(); });
    const done = serveStdio(s, { input, output });
    input.write('{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n');
    input.write('{"jsonrpc":"2.0","method":"notifications/initialized"}\n\n');
    input.write('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"echo","arguments":{"text":"a\\nb"}}}\n');
    input.write('garbage\n');
    input.end();
    await done;
    const lines = out.trim().split("\n").map((l) => JSON.parse(l) as JsonRpcResponse);
    // Responses may arrive in any order (a tool call is async); every request gets exactly one.
    expect(lines.map((l) => l.id).sort()).toEqual([1, 2, null].sort());
    expect(lines).toHaveLength(3);
    expect(lines.find((l) => l.id === null)!.error?.code).toBe(-32700);
    expect((lines.find((l) => l.id === 2)!.result as { content: { text: string }[] }).content[0]!.text).toBe("a\nb");
  });
});
