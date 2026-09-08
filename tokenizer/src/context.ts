/**
 * Context-window usage & remaining-budget helpers (added in 1.1.0).
 *
 * These build on the same heuristic estimator, so the numbers are approximate —
 * use them for guardrails and pre-flight checks, not exact accounting.
 */

import { type ChatMessage, countMessageTokens, countTokens } from "./count.js";
import { modelInfo } from "./models.js";

/** Count a string or a chat-message list, matching {@link willFit}'s behaviour. */
function countInput(input: string | ChatMessage[], model?: string): number {
  return Array.isArray(input)
    ? countMessageTokens(input, model)
    : countTokens(input, model);
}

export interface ContextUsage {
  /** Estimated tokens used by `input`. */
  used: number;
  /** The model's maximum context window in tokens. */
  window: number;
  /** Tokens still free (`window - used`). Negative when `input` overflows. */
  remaining: number;
  /** `used / window` (0 → empty, 1 → full, >1 → over budget). */
  fraction: number;
  /** Whether `input` fits inside the window. */
  fits: boolean;
}

/**
 * Report how much of a model's context window `input` uses. `input` may be a
 * string or a chat-message list (per-message overhead is included for lists).
 * `remaining` can be negative to signal overflow; `fits` is the clean boolean.
 */
export function contextUsage(
  input: string | ChatMessage[],
  model?: string,
): ContextUsage {
  const window = modelInfo(model).contextWindow;
  const used = countInput(input, model);
  const remaining = window - used;
  return {
    used,
    window,
    remaining,
    fraction: window > 0 ? used / window : 0,
    fits: used <= window,
  };
}

/**
 * Tokens still free in the model's context window after `input`, clamped to 0
 * (never negative). Handy for sizing how much reply/room is left.
 */
export function remainingContext(
  input: string | ChatMessage[],
  model?: string,
): number {
  return Math.max(0, contextUsage(input, model).remaining);
}

/**
 * True if `input` plus a reply of about `replyTokens` tokens still fits inside
 * the model's context window. Negative `replyTokens` is treated as 0.
 */
export function willReplyFit(
  input: string | ChatMessage[],
  replyTokens: number,
  model?: string,
): boolean {
  const window = modelInfo(model).contextWindow;
  const used = countInput(input, model);
  return used + Math.max(0, replyTokens || 0) <= window;
}
