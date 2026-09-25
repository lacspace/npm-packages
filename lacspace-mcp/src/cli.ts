import { resolve } from "node:path";
import { createServer, INSTRUCTIONS, TOOL_NAMES, VERSION } from "./lib";
import { serveStdio } from "./stdio";
import { RpcError } from "./jsonrpc";

const HELP = `lacspace-mcp ${VERSION} — the Lacspace tools as an MCP server

Usage
  lacspace-mcp [options]                 serve MCP over stdio (what AI clients run)
  lacspace-mcp list                      list the tools and their inputs
  lacspace-mcp call <tool> [json-args]   run one tool from the terminal
  lacspace-mcp config <client>           print the config snippet for a client
                                         (claude-code, claude-desktop, cursor, vscode, windsurf)

Options
  --allow-path <dir>     let extract_document read files under <dir> (repeatable; default: cwd)
  --block-private        refuse fetching private/loopback/link-local and cloud-metadata addresses
  --only <a,b>           expose only these tools
  --disable <a,b>        hide these tools
  --timeout <ms>         default network timeout (30000)
  --verbose              log each request to stderr
  -h, --help             this help
  -v, --version          print the version

Environment: LACSPACE_MCP_ALLOW_PATH (colon-separated), LACSPACE_MCP_BLOCK_PRIVATE=1

Add to Claude Code:   claude mcp add lacspace -- npx -y lacspace-mcp
Docs: https://developer.lacspace.com/tools/mcp
`;

interface Args { cmd?: string; rest: string[]; allow: string[]; blockPrivate: boolean; only?: string[]; disable?: string[]; timeout?: number; verbose: boolean; help: boolean; version: boolean }

function parseArgs(argv: string[]): Args {
  const a: Args = { rest: [], allow: [], blockPrivate: false, verbose: false, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i]!;
    const next = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${x} needs a value`); return v; };
    if (x === "-h" || x === "--help") a.help = true;
    else if (x === "-v" || x === "--version") a.version = true;
    else if (x === "--allow-path") a.allow.push(next());
    else if (x === "--block-private") a.blockPrivate = true;
    else if (x === "--only") a.only = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (x === "--disable") a.disable = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (x === "--timeout") a.timeout = Number(next());
    else if (x === "--verbose") a.verbose = true;
    else if (x.startsWith("-")) throw new Error(`unknown option ${x}`);
    else if (!a.cmd) a.cmd = x;
    else a.rest.push(x);
  }
  return a;
}

function configFor(client: string, extra: string[]): string {
  const args = ["-y", "lacspace-mcp", ...extra];
  const json = { mcpServers: { lacspace: { command: "npx", args } } };
  switch (client) {
    case "claude-code":
    case "claude":
      return `claude mcp add lacspace -- npx ${args.join(" ")}\n`;
    case "claude-desktop":
      return `Add to claude_desktop_config.json (Settings → Developer → Edit Config):\n\n${JSON.stringify(json, null, 2)}\n`;
    case "cursor":
      return `Add to .cursor/mcp.json (project) or ~/.cursor/mcp.json (global):\n\n${JSON.stringify(json, null, 2)}\n`;
    case "vscode":
      return `Add to .vscode/mcp.json:\n\n${JSON.stringify({ servers: { lacspace: { type: "stdio", command: "npx", args } } }, null, 2)}\n`;
    case "windsurf":
      return `Add to ~/.codeium/windsurf/mcp_config.json:\n\n${JSON.stringify(json, null, 2)}\n`;
    default:
      throw new Error(`unknown client "${client}" — use claude-code, claude-desktop, cursor, vscode or windsurf`);
  }
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { process.stdout.write(HELP); return 0; }
  if (args.version) { process.stdout.write(VERSION + "\n"); return 0; }

  const envAllow = (process.env.LACSPACE_MCP_ALLOW_PATH ?? "").split(":").filter(Boolean);
  const allowedPaths = [...new Set([process.cwd(), ...envAllow, ...args.allow].map((p) => resolve(p)))];
  const blockPrivate = args.blockPrivate || /^(1|true|yes)$/i.test(process.env.LACSPACE_MCP_BLOCK_PRIVATE ?? "");
  const log = args.verbose ? (m: string) => process.stderr.write(`lacspace-mcp: ${m}\n`) : undefined;
  const server = createServer({ only: args.only, disable: args.disable, log, policy: { allowedPaths, blockPrivate, ...(args.timeout ? { timeoutMs: args.timeout } : {}) } });

  switch (args.cmd) {
    case undefined:
    case "serve": {
      process.stderr.write(`lacspace-mcp ${VERSION} ready on stdio (${server.tools.size} tools)${blockPrivate ? ", private networks blocked" : ""}\n`);
      await serveStdio(server);
      return 0;
    }
    case "list": {
      for (const t of server.tools.values()) {
        const props = t.inputSchema.properties ?? {};
        const req = new Set(t.inputSchema.required ?? []);
        process.stdout.write(`${t.name} — ${t.title ?? ""}\n  ${t.description}\n`);
        for (const [k, s] of Object.entries(props)) process.stdout.write(`    ${k}${req.has(k) ? "*" : ""}: ${s.type}${s.default !== undefined ? ` = ${JSON.stringify(s.default)}` : ""}${s.description ? ` — ${s.description}` : ""}\n`);
        process.stdout.write("\n");
      }
      return 0;
    }
    case "call": {
      const [name, json] = args.rest;
      if (!name) throw new Error("call needs a tool name; see: lacspace-mcp list");
      let toolArgs: Record<string, unknown> = {};
      if (json) {
        try { toolArgs = JSON.parse(json) as Record<string, unknown>; } catch { throw new Error("arguments must be a JSON object, e.g. '{\"url\":\"https://example.com\"}'"); }
      }
      const out = await server.invoke(name, toolArgs);
      process.stdout.write(out.text + "\n");
      if (out.data && process.stdout.isTTY === false) process.stdout.write("\n" + JSON.stringify(out.data) + "\n");
      return out.isError ? 1 : 0;
    }
    case "config": {
      const client = args.rest[0];
      if (!client) throw new Error("config needs a client: claude-code, claude-desktop, cursor, vscode, windsurf");
      const extra = [...args.allow.flatMap((p) => ["--allow-path", p]), ...(blockPrivate ? ["--block-private"] : [])];
      process.stdout.write(configFor(client, extra));
      return 0;
    }
    case "instructions":
      process.stdout.write(INSTRUCTIONS + "\n");
      return 0;
    default:
      throw new Error(`unknown command "${args.cmd}". Tools: ${TOOL_NAMES.join(", ")}\n\n${HELP}`);
  }
}

// `lacspace-mcp list | head` closes the pipe early; that is not an error.
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0);
  throw err;
});

main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    const message = err instanceof RpcError ? `${err.message}${err.data ? " " + JSON.stringify(err.data) : ""}` : err instanceof Error ? err.message : String(err);
    process.stderr.write(`lacspace-mcp: ${message}\n`);
    process.exitCode = 2;
  },
);
