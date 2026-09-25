/**
 * Interoperability: the official MCP SDK client talks to the built server over
 * stdio, exactly as Claude Code / Cursor / Claude Desktop do.
 */
import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema, ListRootsRequestSchema, McpError } from "@modelcontextprotocol/sdk/types.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { startFixture } from "./fixture";

// Absolute paths, so the test also works when the monorepo runner starts it from the repo root.
const PKG = dirname(dirname(fileURLToPath(import.meta.url)));
const CLI = join(PKG, "dist", "cli.js");

let base = "";
let close: () => Promise<void>;
let client: Client;
let rootDir = "";
const elicitations: string[] = [];

beforeAll(async () => {
  if (!existsSync(CLI)) execFileSync("npx", ["tsup"], { stdio: "inherit", cwd: PKG });
  ({ base, close } = await startFixture());
  rootDir = await mkdtemp(join(tmpdir(), "mcp-root-"));
  await writeFile(join(rootDir, "brief.md"), "# Brief\n\nShip it.\n");
  client = new Client({ name: "e2e-test", version: "1.0.0" }, { capabilities: { roots: { listChanged: true }, elicitation: {} } });
  client.setRequestHandler(ListRootsRequestSchema, async () => ({ roots: [{ uri: pathToFileURL(rootDir).href, name: "root" }] }));
  client.setRequestHandler(ElicitRequestSchema, async (req) => { elicitations.push(req.params.message); return { action: "accept", content: { confirm: true } }; });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [CLI, "--allow-path", PKG], cwd: PKG, stderr: "pipe" }));
}, 60_000);
afterAll(async () => { await client.close(); await close(); await rm(rootDir, { recursive: true, force: true }); });

describe("official SDK client ↔ lacspace-mcp", () => {
  test("initialize negotiated; server info and instructions present", () => {
    expect(client.getServerVersion()).toMatchObject({ name: "lacspace-mcp" });
    expect(client.getServerCapabilities()).toMatchObject({ tools: {} });
    expect(client.getInstructions()).toMatch(/fetch_page/);
  });

  test("lists all ten tools with JSON Schema inputs", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(["fetch_page", "scrape", "crawl_site", "screenshot_page", "extract_document", "audit_page", "enrich_domain", "check_site", "validate_email", "find_leads"]);
    expect(tools.find((t) => t.name === "check_site")!.outputSchema).toMatchObject({ type: "object" });
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect((t.description ?? "").length).toBeGreaterThan(40);
    }
  });

  test("calls fetch_page and gets text + structuredContent", async () => {
    const r = await client.callTool({ name: "fetch_page", arguments: { url: base + "/" } });
    expect(r.isError).toBeFalsy();
    expect((r.content as { type: string; text: string }[])[0]!.text).toContain("Acme Widgets");
    expect(r.structuredContent).toMatchObject({ title: "Acme Widgets", status: 200 });
  });

  test("calls scrape, check_site and validate_email", async () => {
    const s = await client.callTool({ name: "scrape", arguments: { url: base + "/", item: ".product", schema: { name: "h3" } } });
    expect(s.structuredContent).toMatchObject({ count: 2 });
    const c = await client.callTool({ name: "check_site", arguments: { url: base + "/" } });
    expect(c.structuredContent).toMatchObject({ up: true, status: 200 });
    const v = await client.callTool({ name: "validate_email", arguments: { email: "a@mailinator.com", checkMx: false } });
    expect(v.structuredContent).toMatchObject({ disposable: true });
  });

  test("ping works; unknown tool and bad arguments are protocol errors (-32602)", async () => {
    await expect(client.ping()).resolves.toBeDefined();
    await expect(client.callTool({ name: "nope", arguments: {} })).rejects.toThrow(McpError);
    await expect(client.callTool({ name: "fetch_page", arguments: { url: 42 } })).rejects.toMatchObject({ code: -32602 });
  });

  test("a failing call is an isError result the model can read", async () => {
    const r = await client.callTool({ name: "fetch_page", arguments: { url: base + "/missing" } });
    expect(r.isError).toBe(true);
    expect((r.content as { text: string }[])[0]!.text).toContain("HTTP 404");
  });

  test("reads a file under the client's workspace root, which is not under cwd", async () => {
    const r = await client.callTool({ name: "extract_document", arguments: { source: join(rootDir, "brief.md") } });
    expect(r.isError).toBeFalsy();
    expect((r.content as { text: string }[])[0]!.text).toContain("Ship it");
  });

  test("streams progress during a crawl when the client asks for it", async () => {
    const seen: number[] = [];
    const r = await client.callTool({ name: "crawl_site", arguments: { url: base + "/", depth: 1, limit: 10 } }, undefined, { onprogress: (p) => seen.push(p.progress) });
    expect(r.isError).toBeFalsy();
    expect(seen.length).toBeGreaterThanOrEqual(3);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
  });

  test("asks the user before a large crawl (elicitation), then proceeds on accept", async () => {
    const r = await client.callTool({ name: "crawl_site", arguments: { url: base + "/", depth: 0, limit: 60 } });
    expect(r.isError).toBeFalsy();
    expect(elicitations.some((m) => /60 pages/.test(m))).toBe(true);
  });
});
