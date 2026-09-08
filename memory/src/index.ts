/**
 * @lacspace/memory
 *
 * Keyless, zero-dependency conversation memory for LLM chat apps — track
 * message history, keep it inside a token/message budget with a sliding window,
 * and optionally summarize old turns via an injected summarizer. Isomorphic and
 * fully typed. Uses the same {@link Message} shape as the rest of the Lacspace
 * LLM kit (`@lacspace/ai`, `@lacspace/agent`, `@lacspace/prompt`).
 */

export { createMemory } from "./memory";
export {
  trimToTokenBudget,
  estimateMessageTokens,
  windowMessages,
  defaultCountTokens,
  DEFAULT_CHARS_PER_TOKEN,
  DEFAULT_MESSAGE_OVERHEAD,
} from "./helpers";
export type { TrimOptions } from "./helpers";
export type {
  Message,
  Role,
  Memory,
  MemoryOptions,
  MemorySnapshot,
  CountTokens,
  Summarize,
} from "./types";
