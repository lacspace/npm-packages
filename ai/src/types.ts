/**
 * Shared types for @lacspace/ai — a provider-agnostic chat client.
 */

/** Which upstream API to talk to. */
export type Provider = "openai" | "anthropic" | "google" | "openai-compatible";

/** Role of a message in a conversation. */
export type Role = "system" | "user" | "assistant" | "tool";

/** A single content part (for multimodal / mixed content). */
export type Part =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "image"; data: string; mimeType: string };

/**
 * A tool/function call requested by the model.
 * `args` is the parsed JSON arguments object; `argsRaw` is the original
 * JSON string (useful when the model produced invalid JSON).
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  argsRaw: string;
}

/** One message in a chat conversation. */
export interface Message {
  role: Role;
  /** Plain string, or an array of parts for multimodal content. */
  content: string | Part[];
  /** For assistant messages that requested tool calls. */
  toolCalls?: ToolCall[];
  /** For `role: "tool"` messages — which call this result answers. */
  toolCallId?: string;
  /** Optional name (tool name for tool results, or speaker name). */
  name?: string;
}

/** A tool the model may call, described with a JSON Schema. */
export interface Tool {
  name: string;
  description?: string;
  /** JSON Schema object describing the tool's parameters. */
  parameters?: Record<string, unknown>;
}

/** Token accounting, when the provider returns it. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** Why the model stopped generating. Normalized across providers. */
export type FinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | "error"
  | "other"
  | null;

/** Options accepted by {@link chat} and {@link stream}. */
export interface ChatOptions {
  provider: Provider;
  model: string;
  apiKey?: string;
  messages: Message[];
  tools?: Tool[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** One or more stop sequences. */
  stop?: string | string[];
  /** Override the base URL (required for `openai-compatible`, e.g. Ollama). */
  baseUrl?: string;
  /** Extra headers merged into the request. */
  headers?: Record<string, string>;
  /** Abort signal forwarded to `fetch`. */
  signal?: AbortSignal;
}

/** The normalized, provider-independent result of a non-streaming call. */
export interface ChatResponse {
  /** The assistant's text (concatenated across text parts). */
  text: string;
  /** Any tool calls the model requested (empty array if none). */
  toolCalls: ToolCall[];
  finishReason: FinishReason;
  usage?: Usage;
  model: string;
  /** The raw, un-normalized provider response body. */
  raw: unknown;
}

/** A unified streaming chunk. */
export type ChatChunk =
  | { type: "text"; delta: string }
  | {
      type: "tool_call";
      index: number;
      id?: string;
      name?: string;
      argsDelta?: string;
    }
  | { type: "done"; finishReason?: FinishReason; usage?: Usage };

/** Config bound by {@link createClient}. */
export interface ClientConfig {
  provider: Provider;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  headers?: Record<string, string>;
}

/**
 * Per-call options for a bound client. `provider` is fixed by the client;
 * `model` falls back to `defaultModel`; `apiKey`/`baseUrl`/`headers` may be
 * overridden per call but otherwise inherit from the client config.
 */
export type ClientCallOptions = Omit<ChatOptions, "provider" | "model"> & {
  /** Optional — falls back to the client's `defaultModel`. */
  model?: string;
};
