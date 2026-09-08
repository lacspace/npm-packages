/**
 * Pure, deterministic budget helpers — no state, no IO, no dependencies.
 *
 * They power {@link createMemory} but are exported on their own so you can trim
 * any `Message[]` to fit a model's context window without holding a `Memory`.
 */

import type { CountTokens, Message } from "./types";

/** Default characters-per-token heuristic (≈ English text with a BPE tokenizer). */
export const DEFAULT_CHARS_PER_TOKEN = 4;

/** Per-message overhead (role marker + separators) added to every estimate. */
export const DEFAULT_MESSAGE_OVERHEAD = 4;

/** The built-in chars ÷ 4 token estimator used when no `countTokens` is injected. */
export function defaultCountTokens(text: string): number {
  return Math.ceil(text.length / DEFAULT_CHARS_PER_TOKEN);
}

/** Estimate the tokens for a single message (content + name + role overhead). */
export function estimateOne(m: Message, count: CountTokens): number {
  const name = m.name ? m.name.length : 0;
  return count(m.content) + Math.ceil(name / DEFAULT_CHARS_PER_TOKEN) + DEFAULT_MESSAGE_OVERHEAD;
}

/**
 * Estimate the total token cost of a `Message[]`. Pass a real tokenizer as
 * `countTokens` for exact numbers; otherwise a chars ÷ 4 heuristic is used.
 *
 * ```ts
 * estimateMessageTokens(history);                 // heuristic
 * estimateMessageTokens(history, t => enc.encode(t).length); // exact
 * ```
 */
export function estimateMessageTokens(
  messages: Message[],
  countTokens?: CountTokens,
): number {
  const count = countTokens ?? defaultCountTokens;
  let total = 0;
  for (const m of messages) total += estimateOne(m, count);
  return total;
}

/** Options for {@link windowMessages}. */
export type { CountTokens };

/**
 * Keep at most `maxMessages` messages, dropping the **oldest** first and
 * preserving order. When `keepSystem` is true (default) every `system` message
 * is retained and does not count against `maxMessages`. Returns a new array;
 * the input is never mutated.
 *
 * ```ts
 * windowMessages(history, 20);        // last 20 turns + all system prompts
 * ```
 */
export function windowMessages(
  messages: Message[],
  maxMessages: number,
  keepSystem = true,
): Message[] {
  if (maxMessages < 0) maxMessages = 0;
  const systems: Message[] = [];
  const rest: Message[] = [];
  for (const m of messages) {
    if (keepSystem && m.role === "system") systems.push(m);
    else rest.push(m);
  }
  const kept = rest.slice(Math.max(0, rest.length - maxMessages));
  // Re-interleave: preserve original relative order.
  if (systems.length === 0) return kept.map((m) => ({ ...m }));
  const keptSet = new Set<Message>(kept);
  const out: Message[] = [];
  for (const m of messages) {
    if (keepSystem && m.role === "system") out.push({ ...m });
    else if (keptSet.has(m)) out.push({ ...m });
  }
  return out;
}

/** Options for {@link trimToTokenBudget}. */
export interface TrimOptions {
  /** Maximum token budget for the whole array. */
  maxTokens?: number;
  /** Maximum number of messages (system prompts excluded when `keepSystem`). */
  maxMessages?: number;
  /** Token counter (default: chars ÷ 4). */
  countTokens?: CountTokens;
  /** Always keep `system` messages (default `true`). */
  keepSystem?: boolean;
  /** Always retain at least this many newest messages (default `0`). */
  keepLast?: number;
}

/**
 * Drop the **oldest** non-system messages until the array fits both a token and
 * a message budget, always preserving order. `system` messages are kept by
 * default, and the newest `keepLast` messages are never dropped. Pure — returns
 * a new array and never mutates the input.
 *
 * ```ts
 * const window = trimToTokenBudget(history, { maxTokens: 3000, keepLast: 2 });
 * ```
 */
export function trimToTokenBudget(
  messages: Message[],
  opts: TrimOptions = {},
): Message[] {
  const count = opts.countTokens ?? defaultCountTokens;
  const keepSystem = opts.keepSystem ?? true;
  const keepLast = Math.max(0, opts.keepLast ?? 0);

  let kept = messages.map((m) => ({ ...m }));

  // First enforce the message-count budget (cheap).
  if (opts.maxMessages != null) {
    kept = windowMessages(kept, opts.maxMessages, keepSystem);
  }

  if (opts.maxTokens == null) return kept;

  const isProtected = (idx: number): boolean => {
    if (keepSystem && kept[idx]!.role === "system") return true;
    if (idx >= kept.length - keepLast) return true;
    return false;
  };

  while (estimateMessageTokens(kept, count) > opts.maxTokens) {
    const idx = kept.findIndex((_, i) => !isProtected(i));
    if (idx === -1) break; // nothing droppable left
    kept.splice(idx, 1);
  }
  return kept;
}
