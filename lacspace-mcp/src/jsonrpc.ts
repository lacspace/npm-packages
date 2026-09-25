/**
 * JSON-RPC 2.0 framing for MCP's stdio transport: one JSON message per line,
 * UTF-8, no embedded newlines. Pure functions, no I/O.
 */

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

export function isRequest(m: unknown): m is JsonRpcRequest {
  return (
    typeof m === "object" && m !== null && (m as JsonRpcRequest).jsonrpc === "2.0" &&
    typeof (m as JsonRpcRequest).method === "string" && "id" in m && (m as JsonRpcRequest).id !== undefined
  );
}

export function isNotification(m: unknown): m is JsonRpcNotification {
  return (
    typeof m === "object" && m !== null && (m as JsonRpcNotification).jsonrpc === "2.0" &&
    typeof (m as JsonRpcNotification).method === "string" && !("id" in m)
  );
}

export function isResponse(m: unknown): m is JsonRpcResponse {
  return (
    typeof m === "object" && m !== null && (m as JsonRpcResponse).jsonrpc === "2.0" &&
    "id" in m && ("result" in m || "error" in m) && !("method" in m)
  );
}

export function success(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

export function failure(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

/** Serialise one message for the wire: a single line, newline-terminated. */
export function encode(message: unknown): string {
  return JSON.stringify(message) + "\n";
}

/**
 * Incremental line decoder. Feed it chunks as they arrive; it yields complete
 * lines (without the newline) and keeps any partial trailing line for later.
 */
export class LineDecoder {
  private buffer = "";

  push(chunk: string): string[] {
    this.buffer += chunk;
    const lines: string[] = [];
    let at: number;
    while ((at = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, at).replace(/\r$/, "");
      this.buffer = this.buffer.slice(at + 1);
      if (line.trim()) lines.push(line);
    }
    return lines;
  }

  /** Whatever remains without a trailing newline (used at end of stream). */
  flush(): string | undefined {
    const rest = this.buffer.trim();
    this.buffer = "";
    return rest || undefined;
  }
}
