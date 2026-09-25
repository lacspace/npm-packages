/** Roots, elicitation, progress, images and output schemas, with a scripted client. */
import { describe, test, expect } from "vitest";
import { pathToFileURL } from "node:url";
import { McpServer, type ToolDefinition } from "./server";
import type { JsonRpcResponse } from "./jsonrpc";

const askTool: ToolDefinition<{ big: boolean }> = {
  name: "ask", description: "confirms before big work",
  inputSchema: { type: "object", properties: { big: { type: "boolean", default: true } } },
  run: async (args, ctx) => ((await ctx.confirm("Do the big thing?")) ? { text: "did it" } : { text: "cancelled", isError: true }),
};
const stepsTool: ToolDefinition = {
  name: "steps", description: "reports progress", inputSchema: { type: "object" },
  run: (_a, ctx) => { ctx.progress(1, 3, "one"); ctx.progress(2, 3); ctx.progress(3, 3, "done"); return { text: "ok" }; },
};
const picTool: ToolDefinition = {
  name: "pic", description: "returns an image", inputSchema: { type: "object" },
  outputSchema: { type: "object", properties: { w: { type: "integer" } }, required: ["w"] },
  run: () => ({ text: "here", data: { w: 1 }, images: [{ data: "iVBORw0KGgo=", mimeType: "image/png" }] }),
};

/** A server wired to a fake transport that records outbound messages and lets the test answer them. */
function harness(clientCapabilities: Record<string, unknown> = {}) {
  const server = new McpServer({ name: "t", version: "0", tools: [askTool, stepsTool, picTool] });
  const outbound: Array<Record<string, unknown>> = [];
  server.attach((m) => outbound.push(m as Record<string, unknown>));
  const init = async () => {
    await server.handleMessage({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: clientCapabilities, clientInfo: { name: "fake" } } });
    await server.handleMessage({ jsonrpc: "2.0", method: "notifications/initialized" });
  };
  /** Wait until the server has sent a request with this method, then answer it. */
  const answer = async (method: string, result: unknown) => {
    for (let i = 0; i < 50 && !outbound.some((m) => m.method === method); i++) await new Promise((r) => setTimeout(r, 5));
    const req = outbound.find((m) => m.method === method)!;
    expect(req, `server should have sent ${method}`).toBeDefined();
    await server.handleMessage({ jsonrpc: "2.0", id: req.id, result });
  };
  return { server, outbound, init, answer };
}

describe("roots", () => {
  test("after initialized, a roots-capable client is asked for roots and they become readable paths", async () => {
    const h = harness({ roots: { listChanged: true } });
    await h.init();
    await h.answer("roots/list", { roots: [{ uri: pathToFileURL("/tmp/proj").href, name: "proj" }, { uri: "https://not-a-file" }] });
    expect(h.server.policy.rootPaths).toEqual(["/tmp/proj"]);
    // and again when the client says they changed
    h.outbound.length = 0;
    await h.server.handleMessage({ jsonrpc: "2.0", method: "notifications/roots/list_changed" });
    await h.answer("roots/list", { roots: [{ uri: pathToFileURL("/tmp/other").href }] });
    expect(h.server.policy.rootPaths).toEqual(["/tmp/other"]);
  });

  test("a client without the roots capability is never asked", async () => {
    const h = harness({});
    await h.init();
    await new Promise((r) => setTimeout(r, 20));
    expect(h.outbound.filter((m) => m.method === "roots/list")).toHaveLength(0);
  });
});

describe("elicitation", () => {
  test("confirm asks the user and honours accept / decline / cancel", async () => {
    const h = harness({ elicitation: {} });
    await h.init();
    const call = (id: number) => h.server.handleMessage({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "ask", arguments: {} } }) as Promise<JsonRpcResponse>;
    let p = call(1);
    await h.answer("elicitation/create", { action: "accept", content: { confirm: true } });
    expect((await p).result).toMatchObject({ content: [{ text: "did it" }] });
    const sent = h.outbound.find((m) => m.method === "elicitation/create")!;
    expect(sent.params).toMatchObject({ message: "Do the big thing?", requestedSchema: { type: "object", required: ["confirm"] } });

    h.outbound.length = 0;
    p = call(2);
    await h.answer("elicitation/create", { action: "decline" });
    expect((await p).result).toMatchObject({ isError: true });

    h.outbound.length = 0;
    p = call(3);
    await h.answer("elicitation/create", { action: "accept", content: { confirm: false } });
    expect((await p).result).toMatchObject({ isError: true });
  });

  test("without elicitation support, confirm proceeds", async () => {
    const h = harness({});
    await h.init();
    const r = (await h.server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "ask", arguments: {} } })) as JsonRpcResponse;
    expect(r.result).toMatchObject({ content: [{ text: "did it" }] });
    expect(h.outbound.filter((m) => m.method === "elicitation/create")).toHaveLength(0);
  });
});

describe("progress", () => {
  test("sent only when the request carries a progressToken", async () => {
    const h = harness();
    await h.init();
    await h.server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "steps", arguments: {}, _meta: { progressToken: "tok-1" } } });
    const notes = h.outbound.filter((m) => m.method === "notifications/progress").map((m) => m.params);
    expect(notes).toEqual([
      { progressToken: "tok-1", progress: 1, total: 3, message: "one" },
      { progressToken: "tok-1", progress: 2, total: 3 },
      { progressToken: "tok-1", progress: 3, total: 3, message: "done" },
    ]);
    h.outbound.length = 0;
    await h.server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "steps", arguments: {} } });
    expect(h.outbound.filter((m) => m.method === "notifications/progress")).toHaveLength(0);
  });
});

describe("images and output schemas", () => {
  test("image content is emitted after the text; outputSchema is listed", async () => {
    const h = harness();
    await h.init();
    const r = (await h.server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "pic" } })) as JsonRpcResponse;
    expect(r.result).toEqual({ content: [{ type: "text", text: "here" }, { type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" }], structuredContent: { w: 1 } });
    const list = (await h.server.handleMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" })) as JsonRpcResponse;
    const pic = (list.result as { tools: { name: string; outputSchema?: unknown }[] }).tools.find((t) => t.name === "pic")!;
    expect(pic.outputSchema).toMatchObject({ required: ["w"] });
  });
});
