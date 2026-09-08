/**
 * @lacspace/ai
 * A tiny, zero-dependency, provider-agnostic LLM chat client over `fetch`.
 *
 * One `chat()` / `stream()` API for OpenAI, Anthropic, Google Gemini and any
 * OpenAI-compatible endpoint (Groq, Together, OpenRouter, Ollama, LocalAI).
 * Bring your own key — no SDK, no lock-in, isomorphic (Node 18+, browser, edge).
 *
 * ```ts
 * import { chat, stream, accumulate, createClient } from "@lacspace/ai";
 *
 * const res = await chat({
 *   provider: "openai",
 *   model: "gpt-4o-mini",
 *   apiKey: process.env.OPENAI_API_KEY,
 *   messages: [{ role: "user", content: "Say hi in one word." }],
 * });
 * console.log(res.text);
 *
 * // Streaming
 * for await (const chunk of stream({ provider: "anthropic", model: "claude-3-5-sonnet-latest", apiKey, messages })) {
 *   if (chunk.type === "text") process.stdout.write(chunk.delta);
 * }
 * ```
 *
 * This is a thin, honest HTTP client — not a full agent framework. It builds
 * the right request per provider, normalizes the response, and gets out of
 * your way. Zero dependencies · isomorphic · fully typed.
 */

export { chat } from "./chat.js";
export { stream, accumulate } from "./stream.js";
export { createClient, type AiClient } from "./client.js";
export { AiError } from "./errors.js";

// New in 1.1.0 — additive, keyless, provider-agnostic building blocks.
export {
  system,
  user,
  assistant,
  toolResult,
  image,
  imageBytes,
} from "./messages.js";
export {
  withRetry,
  withTimeout,
  isRetryableError,
  type RetryOptions,
} from "./retry.js";
export {
  estimateCost,
  sumUsage,
  UsageTracker,
  type Pricing,
} from "./cost.js";
export { extractJson, parseJson } from "./json.js";
export { textStream } from "./text.js";

export type {
  Provider,
  FetchLike,
  Role,
  Part,
  Message,
  Tool,
  ToolCall,
  Usage,
  FinishReason,
  ChatOptions,
  ChatResponse,
  ChatChunk,
  ClientConfig,
  ClientCallOptions,
} from "./types.js";
