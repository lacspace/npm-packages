import type { ChatChunk, ChatOptions, ChatResponse } from "../types.js";
import type { SseEvent } from "../sse.js";

/** The pieces needed to issue a single `fetch`. */
export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A provider adapter: build a request, and normalize responses/streams. */
export interface ProviderAdapter {
  buildRequest(opts: ChatOptions, stream: boolean): BuiltRequest;
  parseResponse(json: unknown, model: string): ChatResponse;
  /**
   * Returns a stateful decoder that turns each SSE event into zero or more
   * unified {@link ChatChunk}s. Statefulness lets providers accumulate
   * tool-call metadata across events.
   */
  createStreamDecoder(): (event: SseEvent) => ChatChunk[];
}

/** Strip undefined values so request bodies stay clean and comparable. */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Normalize `stop` (string | string[]) to a string array, or undefined. */
export function toStopArray(
  stop: string | string[] | undefined,
): string[] | undefined {
  if (stop === undefined) return undefined;
  return Array.isArray(stop) ? stop : [stop];
}

/** Parse a tool-call arguments JSON string into `{ args, argsRaw }`. */
export function parseArgs(raw: string | undefined): {
  args: Record<string, unknown>;
  argsRaw: string;
} {
  const argsRaw = raw ?? "";
  if (!argsRaw.trim()) return { args: {}, argsRaw };
  try {
    const parsed = JSON.parse(argsRaw);
    return {
      args: parsed && typeof parsed === "object" ? parsed : {},
      argsRaw,
    };
  } catch {
    return { args: {}, argsRaw };
  }
}

/** Extract a plain-text string from a message's `content` field. */
export function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === "object" && "text" in p
          ? String((p as { text: unknown }).text)
          : "",
      )
      .join("");
  }
  return "";
}

/** Try to JSON-parse an SSE data payload; return null on `[DONE]`/garbage. */
export function safeJson(data: string): unknown | null {
  const trimmed = data.trim();
  if (!trimmed || trimmed === "[DONE]") return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/** Re-export for adapter files that build chunks. */
export type { ChatChunk, SseEvent };
