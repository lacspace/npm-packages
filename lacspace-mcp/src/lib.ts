/**
 * lacspace-mcp — the Lacspace tools as an MCP server.
 *
 * Embed it, or add your own tools next to ours:
 *
 *   import { createServer, serveStdio } from "lacspace-mcp";
 *   const server = createServer({ policy: { blockPrivate: true } });
 *   await serveStdio(server);
 */
import { createRequire } from "node:module";
import { McpServer, type Policy, type ServerOptions, type ToolDefinition, type ToolOutput, type ToolContext } from "./server";
import { createTools, TOOL_NAMES, type ToolDeps } from "./tools/index";

export { McpServer, DEFAULT_POLICY, PROTOCOL_VERSIONS, LATEST_PROTOCOL } from "./server";
export type { Policy, ServerOptions, ToolDefinition, ToolOutput, ToolContext } from "./server";
export { serveStdio } from "./stdio";
export { createTools, TOOL_NAMES } from "./tools/index";
export { validate as validateSchema, type JsonSchema } from "./schema";
export { LineDecoder, RpcError, encode } from "./jsonrpc";
export { checkUrl, checkPath } from "./guard";

const require = createRequire(import.meta.url);
export const VERSION: string = (require("../package.json") as { version: string }).version;

export const INSTRUCTIONS =
  "Lacspace tools for reading the web and documents. fetch_page reads one page; crawl_site reads a few linked pages; scrape pulls exact fields with CSS selectors; extract_document reads PDF/DOCX/PPTX/EPUB/HTML/CSV/XLSX files or URLs; audit_page grades SEO/social/structured-data/security with fixes; enrich_domain profiles a company from its domain; check_site reports status, redirects and TLS expiry; validate_email checks an address; find_leads searches Google Maps (needs a local Chromium, slow). All tools are read-only and need no API keys.";

export interface CreateServerOptions {
  policy?: Partial<Policy>;
  /** Restrict to these tool names. */
  only?: string[];
  /** Hide these tool names. */
  disable?: string[];
  /** Extra tools to expose alongside ours. */
  extraTools?: ToolDefinition[];
  deps?: ToolDeps;
  log?: ServerOptions["log"];
}

export function createServer(opts: CreateServerOptions = {}): McpServer {
  let tools = createTools(opts.deps);
  if (opts.only?.length) {
    const unknown = opts.only.filter((n) => !TOOL_NAMES.includes(n));
    if (unknown.length) throw new Error(`unknown tool(s): ${unknown.join(", ")}. Available: ${TOOL_NAMES.join(", ")}`);
    tools = tools.filter((t) => opts.only!.includes(t.name));
  }
  if (opts.disable?.length) tools = tools.filter((t) => !opts.disable!.includes(t.name));
  return new McpServer({
    name: "lacspace-mcp",
    title: "Lacspace Tools",
    version: VERSION,
    instructions: INSTRUCTIONS,
    tools: [...tools, ...(opts.extraTools ?? [])],
    policy: opts.policy,
    log: opts.log,
  });
}
