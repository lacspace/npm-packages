/**
 * A transport-agnostic MCP server: hand it decoded JSON-RPC messages and it
 * returns the responses to send (or nothing, for notifications). Supports the
 * `tools` capability. Spec: https://modelcontextprotocol.io/specification
 */
import {
  INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR, RpcError,
  failure, isNotification, isRequest, isResponse, success,
  type JsonRpcId, type JsonRpcResponse,
} from "./jsonrpc";
import { applyDefaults, validate, type JsonSchema } from "./schema";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL = PROTOCOL_VERSIONS[0];

/** What a tool hands back; the server turns it into an MCP `CallToolResult`. */
export interface ToolOutput {
  /** Text for the model. */
  text: string;
  /** Machine-readable form, returned as `structuredContent`. */
  data?: Record<string, unknown>;
  /** Marks a failed call (the text explains why). */
  isError?: boolean;
}

export interface ToolContext {
  /** Server-wide policy the tool should honour. */
  policy: Policy;
  /** Fires when the client cancels the request. */
  signal: AbortSignal;
}

export interface ToolDefinition<A = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  run(args: A, ctx: ToolContext): Promise<ToolOutput> | ToolOutput;
}

export interface Policy {
  /** Local directories `extract_document` may read from (resolved, real paths). */
  allowedPaths: string[];
  /** Refuse fetching private/loopback/link-local targets and cloud metadata. */
  blockPrivate: boolean;
  /** Default per-request timeout for network tools, ms. */
  timeoutMs: number;
}

export interface ServerOptions {
  name: string;
  version: string;
  title?: string;
  instructions?: string;
  tools: ToolDefinition[];
  policy?: Partial<Policy>;
  /** Where diagnostics go (never stdout on the stdio transport). */
  log?: (message: string) => void;
}

export const DEFAULT_POLICY: Policy = { allowedPaths: [process.cwd()], blockPrivate: false, timeoutMs: 30_000 };

export class McpServer {
  readonly name: string;
  readonly version: string;
  readonly title: string;
  readonly instructions: string | undefined;
  readonly policy: Policy;
  readonly tools = new Map<string, ToolDefinition>();
  private readonly log: (message: string) => void;
  private readonly inFlight = new Map<string, AbortController>();
  protocolVersion: string = LATEST_PROTOCOL;
  initialized = false;
  clientInfo: { name?: string; version?: string } | undefined;

  constructor(opts: ServerOptions) {
    this.name = opts.name;
    this.version = opts.version;
    this.title = opts.title ?? opts.name;
    this.instructions = opts.instructions;
    this.policy = { ...DEFAULT_POLICY, ...opts.policy };
    this.log = opts.log ?? (() => {});
    for (const t of opts.tools) {
      if (this.tools.has(t.name)) throw new Error(`duplicate tool name: ${t.name}`);
      this.tools.set(t.name, t);
    }
  }

  /** Decode one line from the wire and answer it. `undefined` means nothing to send. */
  async handleLine(line: string): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return failure(null, PARSE_ERROR, "Parse error: message is not valid JSON");
    }
    return this.handleMessage(parsed);
  }

  /** Answer an already-decoded message (or a JSON-RPC batch). */
  async handleMessage(message: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
    if (Array.isArray(message)) {
      if (message.length === 0) return failure(null, INVALID_REQUEST, "Invalid Request: empty batch");
      const answers = await Promise.all(message.map((m) => this.handleOne(m)));
      const out = answers.filter((a): a is JsonRpcResponse => a !== undefined);
      return out.length ? out : undefined;
    }
    return this.handleOne(message);
  }

  private async handleOne(message: unknown): Promise<JsonRpcResponse | undefined> {
    if (isResponse(message)) return undefined; // we never send requests, so nothing to match
    if (isNotification(message)) {
      this.onNotification(message.method, message.params);
      return undefined;
    }
    if (!isRequest(message)) {
      const id = (typeof message === "object" && message !== null && "id" in message ? (message as { id: JsonRpcId }).id : null) ?? null;
      return failure(id, INVALID_REQUEST, "Invalid Request: expected a JSON-RPC 2.0 request");
    }
    const { id, method, params } = message;
    try {
      const result = await this.dispatch(method, params, id);
      return success(id, result);
    } catch (err) {
      if (err instanceof RpcError) return failure(id, err.code, err.message, err.data);
      this.log(`internal error in ${method}: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
      return failure(id, INTERNAL_ERROR, err instanceof Error ? err.message : "Internal error");
    }
  }

  private onNotification(method: string, params: unknown): void {
    if (method === "notifications/initialized") this.initialized = true;
    else if (method === "notifications/cancelled") {
      const p = params as { requestId?: JsonRpcId } | undefined;
      const key = String(p?.requestId);
      this.inFlight.get(key)?.abort();
    }
    // Other notifications (progress, roots changed) are acknowledged by ignoring them.
  }

  private async dispatch(method: string, params: unknown, id: JsonRpcId): Promise<unknown> {
    switch (method) {
      case "initialize":
        return this.initialize(params);
      case "ping":
        return {};
      case "tools/list":
        return { tools: this.listTools() };
      case "tools/call":
        return this.callTool(params, id);
      case "resources/list":
        return { resources: [] };
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "prompts/list":
        return { prompts: [] };
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
  }

  private initialize(params: unknown): unknown {
    const p = (params ?? {}) as { protocolVersion?: unknown; clientInfo?: { name?: string; version?: string } };
    const requested = typeof p.protocolVersion === "string" ? p.protocolVersion : undefined;
    this.protocolVersion = requested && (PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LATEST_PROTOCOL;
    this.clientInfo = p.clientInfo;
    this.log(`initialize from ${p.clientInfo?.name ?? "unknown client"} (${requested ?? "no version"}) → ${this.protocolVersion}`);
    const result: Record<string, unknown> = {
      protocolVersion: this.protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: this.name, version: this.version, title: this.title },
    };
    if (this.instructions) result.instructions = this.instructions;
    return result;
  }

  listTools(): Array<Record<string, unknown>> {
    return [...this.tools.values()].map((t) => {
      const entry: Record<string, unknown> = { name: t.name, description: t.description, inputSchema: t.inputSchema };
      if (t.title) entry.title = t.title;
      if (t.annotations) entry.annotations = t.annotations;
      return entry;
    });
  }

  private async callTool(params: unknown, id: JsonRpcId): Promise<unknown> {
    const p = (params ?? {}) as { name?: unknown; arguments?: unknown };
    if (typeof p.name !== "string") throw new RpcError(INVALID_PARAMS, "tools/call needs a string `name`");
    const tool = this.tools.get(p.name);
    if (!tool) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${p.name}`);
    const rawArgs = p.arguments === undefined ? {} : p.arguments;
    const problems = validate(tool.inputSchema, rawArgs);
    if (problems.length) throw new RpcError(INVALID_PARAMS, `Invalid arguments for ${p.name}: ${problems.join("; ")}`, { problems });
    const args = applyDefaults(tool.inputSchema, rawArgs as Record<string, unknown>);
    const ac = new AbortController();
    const key = String(id);
    this.inFlight.set(key, ac);
    const started = Date.now();
    try {
      const out = await tool.run(args, { policy: this.policy, signal: ac.signal });
      this.log(`${p.name} ${out.isError ? "failed" : "ok"} in ${Date.now() - started}ms`);
      return toCallResult(out);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.log(`${p.name} threw after ${Date.now() - started}ms: ${message}`);
      return toCallResult({ text: `${p.name} failed: ${message}`, isError: true });
    } finally {
      this.inFlight.delete(key);
    }
  }

  /** Run a tool directly (used by the CLI's `call` command and by tests). */
  async invoke(name: string, args: Record<string, unknown> = {}): Promise<ToolOutput> {
    const tool = this.tools.get(name);
    if (!tool) throw new RpcError(INVALID_PARAMS, `Unknown tool: ${name}`);
    const problems = validate(tool.inputSchema, args);
    if (problems.length) throw new RpcError(INVALID_PARAMS, `Invalid arguments for ${name}: ${problems.join("; ")}`, { problems });
    return tool.run(applyDefaults(tool.inputSchema, args), { policy: this.policy, signal: new AbortController().signal });
  }
}

function toCallResult(out: ToolOutput): Record<string, unknown> {
  const result: Record<string, unknown> = { content: [{ type: "text", text: out.text }] };
  if (out.data !== undefined) result.structuredContent = out.data;
  if (out.isError) result.isError = true;
  return result;
}
