/**
 * A transport-agnostic MCP server: hand it decoded JSON-RPC messages and it
 * returns the responses to send (or nothing, for notifications). Supports the
 * `tools` capability. Spec: https://modelcontextprotocol.io/specification
 */
import { fileURLToPath } from "node:url";
import {
  INTERNAL_ERROR, INVALID_PARAMS, INVALID_REQUEST, METHOD_NOT_FOUND, PARSE_ERROR, RpcError,
  failure, isNotification, isRequest, isResponse, success,
  type JsonRpcId, type JsonRpcResponse,
} from "./jsonrpc";
import { applyDefaults, validate, type JsonSchema } from "./schema";

export const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const LATEST_PROTOCOL = PROTOCOL_VERSIONS[0];

/** What a tool hands back; the server turns it into an MCP `CallToolResult`. */
export interface ToolImage {
  /** Base64-encoded bytes. */
  data: string;
  mimeType: string;
}

export interface ToolOutput {
  /** Text for the model. */
  text: string;
  /** Machine-readable form, returned as `structuredContent`. */
  data?: Record<string, unknown>;
  /** Images the model can look at (screenshots, QR codes). */
  images?: ToolImage[];
  /** Marks a failed call (the text explains why). */
  isError?: boolean;
}

export interface ToolContext {
  /** Server-wide policy the tool should honour. */
  policy: Policy;
  /** Fires when the client cancels the request. */
  signal: AbortSignal;
  /**
   * Report progress. Sent to the client only when it asked for it (a
   * `progressToken` on the request); otherwise a no-op.
   */
  progress(current: number, total?: number, message?: string): void;
  /**
   * Ask the user to confirm before expensive work. Resolves `true` when the
   * client cannot ask (no elicitation support), so tools never block on it.
   */
  confirm(message: string): Promise<boolean>;
}

export interface ToolDefinition<A = Record<string, unknown>> {
  name: string;
  title?: string;
  description: string;
  inputSchema: JsonSchema;
  /** Shape of `structuredContent`, for clients that validate or render it. */
  outputSchema?: JsonSchema;
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
  /** Directories the client reported as its workspace roots (`roots/list`); allowed too. */
  rootPaths: string[];
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

export const DEFAULT_POLICY: Policy = { allowedPaths: [process.cwd()], rootPaths: [], blockPrivate: false, timeoutMs: 30_000 };

interface ClientCapabilities {
  roots?: { listChanged?: boolean };
  elicitation?: Record<string, unknown>;
  sampling?: Record<string, unknown>;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class McpServer {
  readonly name: string;
  readonly version: string;
  readonly title: string;
  readonly instructions: string | undefined;
  readonly policy: Policy;
  readonly tools = new Map<string, ToolDefinition>();
  private readonly log: (message: string) => void;
  private readonly inFlight = new Map<string, AbortController>();
  private sender: ((message: unknown) => void) | undefined;
  private readonly pendingOut = new Map<number, Pending>();
  private nextOutId = 1;
  protocolVersion: string = LATEST_PROTOCOL;
  initialized = false;
  clientInfo: { name?: string; version?: string } | undefined;
  clientCapabilities: ClientCapabilities = {};

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

  /** Give the server a way to send its own requests and notifications (set by the transport). */
  attach(send: (message: unknown) => void): void {
    this.sender = send;
  }

  /** Send a request to the client and await its result (roots/list, elicitation/create, …). */
  request(method: string, params?: unknown, timeoutMs = 120_000): Promise<unknown> {
    if (!this.sender) return Promise.reject(new Error("no transport attached"));
    const id = this.nextOutId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingOut.delete(id);
        reject(new Error(`${method}: the client did not answer within ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingOut.set(id, { resolve, reject, timer });
      this.sender!({ jsonrpc: "2.0", id, method, params });
    });
  }

  /** Send a notification to the client. */
  notify(method: string, params?: unknown): void {
    this.sender?.({ jsonrpc: "2.0", method, params });
  }

  /** Does the connected client support asking the user a question? */
  get canElicit(): boolean {
    return this.clientCapabilities.elicitation !== undefined;
  }

  /** Fetch the client's workspace roots and make them readable. */
  async refreshRoots(): Promise<string[]> {
    if (!this.clientCapabilities.roots) return [];
    try {
      const result = (await this.request("roots/list", {}, 15_000)) as { roots?: { uri: string; name?: string }[] };
      const paths: string[] = [];
      for (const r of result.roots ?? []) {
        if (typeof r.uri === "string" && r.uri.startsWith("file:")) {
          try { paths.push(fileURLToPath(r.uri)); } catch { /* not a local path */ }
        }
      }
      this.policy.rootPaths = paths;
      this.log(`roots: ${paths.length ? paths.join(", ") : "(none)"}`);
      return paths;
    } catch (err) {
      this.log(`roots/list failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
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
    if (isResponse(message)) {
      // An answer to one of our own requests (roots/list, elicitation/create).
      const pending = typeof message.id === "number" ? this.pendingOut.get(message.id) : undefined;
      if (pending) {
        this.pendingOut.delete(message.id as number);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      }
      return undefined;
    }
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
    if (method === "notifications/initialized") {
      this.initialized = true;
      void this.refreshRoots();
    } else if (method === "notifications/roots/list_changed") {
      void this.refreshRoots();
    } else if (method === "notifications/cancelled") {
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
    const p = (params ?? {}) as { protocolVersion?: unknown; clientInfo?: { name?: string; version?: string }; capabilities?: ClientCapabilities };
    const requested = typeof p.protocolVersion === "string" ? p.protocolVersion : undefined;
    this.protocolVersion = requested && (PROTOCOL_VERSIONS as readonly string[]).includes(requested) ? requested : LATEST_PROTOCOL;
    this.clientInfo = p.clientInfo;
    this.clientCapabilities = p.capabilities ?? {};
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
      if (t.outputSchema) entry.outputSchema = t.outputSchema;
      if (t.annotations) entry.annotations = t.annotations;
      return entry;
    });
  }

  private async callTool(params: unknown, id: JsonRpcId): Promise<unknown> {
    const p = (params ?? {}) as { name?: unknown; arguments?: unknown; _meta?: { progressToken?: string | number } };
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
      const out = await tool.run(args, this.context(ac.signal, p._meta?.progressToken));
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
    return tool.run(applyDefaults(tool.inputSchema, args), this.context(new AbortController().signal));
  }

  private context(signal: AbortSignal, progressToken?: string | number): ToolContext {
    return {
      policy: this.policy,
      signal,
      progress: (current, total, message) => {
        if (progressToken === undefined) return;
        const params: Record<string, unknown> = { progressToken, progress: current };
        if (total !== undefined) params.total = total;
        if (message !== undefined) params.message = message;
        this.notify("notifications/progress", params);
      },
      confirm: async (message) => {
        if (!this.canElicit) return true;
        try {
          const r = (await this.request("elicitation/create", {
            message,
            requestedSchema: {
              type: "object",
              properties: { confirm: { type: "boolean", title: "Continue?", description: message } },
              required: ["confirm"],
            },
          })) as { action?: string; content?: { confirm?: boolean } };
          return r.action === "accept" && r.content?.confirm !== false;
        } catch (err) {
          this.log(`elicitation failed, proceeding: ${err instanceof Error ? err.message : String(err)}`);
          return true;
        }
      },
    };
  }
}

function toCallResult(out: ToolOutput): Record<string, unknown> {
  const content: Record<string, unknown>[] = [{ type: "text", text: out.text }];
  for (const img of out.images ?? []) content.push({ type: "image", data: img.data, mimeType: img.mimeType });
  const result: Record<string, unknown> = { content };
  if (out.data !== undefined) result.structuredContent = out.data;
  if (out.isError) result.isError = true;
  return result;
}
