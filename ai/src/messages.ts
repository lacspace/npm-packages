/**
 * Tiny, typed message + content builders.
 *
 * These are pure helpers that return the same {@link Message} / {@link Part}
 * shapes `chat()` and `stream()` already accept — no network, no state — so you
 * can compose conversations with less boilerplate and full type-safety.
 *
 * ```ts
 * import { chat, system, user } from "@lacspace/ai";
 * await chat({ provider, model, apiKey, messages: [system("Be terse."), user("Hi")] });
 * ```
 */

import type { Message, Part, ToolCall } from "./types.js";

/** A `system` instruction message. */
export function system(content: string): Message {
  return { role: "system", content };
}

/** A `user` message (plain text or multimodal parts). */
export function user(content: string | Part[]): Message {
  return { role: "user", content };
}

/**
 * An `assistant` message. Pass `toolCalls` when replaying a turn where the model
 * requested tools, and/or a speaker `name`.
 */
export function assistant(
  content: string | Part[],
  opts: { toolCalls?: ToolCall[]; name?: string } = {},
): Message {
  const m: Message = { role: "assistant", content };
  if (opts.toolCalls) m.toolCalls = opts.toolCalls;
  if (opts.name) m.name = opts.name;
  return m;
}

/**
 * A `tool` result message answering a specific tool call. `content` is the
 * stringified result; `name` is the tool's name (used by some providers).
 */
export function toolResult(
  toolCallId: string,
  content: string,
  name?: string,
): Message {
  const m: Message = { role: "tool", content, toolCallId };
  if (name) m.name = name;
  return m;
}

/** An image content {@link Part} referenced by URL. */
export function image(url: string): Part {
  return { type: "image", url };
}

/** An inline (base64) image content {@link Part}. */
export function imageBytes(data: string, mimeType: string): Part {
  return { type: "image", data, mimeType };
}
