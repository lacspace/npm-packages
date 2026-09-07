/**
 * Context-budget management: fit text or messages into a token budget.
 */

import { type ChatMessage, countMessageTokens, countTokens } from "./count.js";
import { modelInfo } from "./models.js";

/** Where to cut when truncating overlong text. */
export type TruncateStrategy = "end" | "start" | "middle";

const ELLIPSIS = "…";

export interface FitToBudgetOptions {
  /** Which part of the text to keep. Defaults to "end" (keep the beginning). */
  strategy?: TruncateStrategy;
  /** Model id / alias for the token estimate. */
  model?: string;
}

export interface FitToBudgetResult {
  /** The (possibly truncated) text, with an ellipsis marker if cut. */
  text: string;
  /** Estimated tokens of the returned text. */
  tokens: number;
  /** Whether any content was removed. */
  truncated: boolean;
}

/**
 * Truncate `text` so its estimated token count fits within `maxTokens`.
 *
 * - `"end"` keeps the start and cuts the end (`"foo …"`).
 * - `"start"` keeps the end and cuts the start (`"… bar"`).
 * - `"middle"` keeps both ends and cuts the middle (`"foo … bar"`).
 *
 * If the text already fits, it is returned unchanged with `truncated: false`.
 */
export function fitToBudget(
  text: string,
  maxTokens: number,
  options: FitToBudgetOptions = {},
): FitToBudgetResult {
  const model = options.model;
  const strategy = options.strategy ?? "end";

  const total = countTokens(text, model);
  if (maxTokens <= 0) {
    return { text: "", tokens: 0, truncated: text.length > 0 };
  }
  if (total <= maxTokens) {
    return { text, tokens: total, truncated: false };
  }

  const build = (keepChars: number): string => {
    if (keepChars <= 0) return ELLIPSIS;
    if (strategy === "start") {
      return ELLIPSIS + " " + text.slice(text.length - keepChars);
    }
    if (strategy === "middle") {
      const head = Math.ceil(keepChars / 2);
      const tail = keepChars - head;
      return text.slice(0, head) + " " + ELLIPSIS + " " + text.slice(text.length - tail);
    }
    // "end"
    return text.slice(0, keepChars) + " " + ELLIPSIS;
  };

  // Binary-search the largest keepChars whose candidate fits the budget.
  let lo = 0;
  let hi = text.length;
  let best = build(0);
  let bestTokens = countTokens(best, model);
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = build(mid);
    const t = countTokens(candidate, model);
    if (t <= maxTokens) {
      best = candidate;
      bestTokens = t;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { text: best, tokens: bestTokens, truncated: true };
}

export interface BudgetMessagesOptions {
  /** Model id / alias for the token estimate. */
  model?: string;
  /** Always keep `system` messages (default true). */
  keepSystem?: boolean;
  /** Tokens to hold back (e.g. for the reply) — subtracted from `maxTokens`. */
  reserve?: number;
}

/**
 * Drop the oldest non-system messages until the conversation fits within
 * `maxTokens` (minus `reserve`). System messages (when `keepSystem`) and the
 * most recent messages are preserved. Original ordering is kept.
 *
 * Note: if the retained system messages alone exceed the budget they are still
 * returned — the function will not drop a system message.
 */
export function budgetMessages(
  messages: ChatMessage[],
  maxTokens: number,
  options: BudgetMessagesOptions = {},
): ChatMessage[] {
  const { model, keepSystem = true, reserve = 0 } = options;
  const limit = maxTokens - reserve;

  // Indices of droppable (non-system, or all if !keepSystem) messages, oldest first.
  const droppable: number[] = [];
  messages.forEach((m, i) => {
    if (!(keepSystem && m.role === "system")) droppable.push(i);
  });

  const dropped = new Set<number>();
  const current = (): ChatMessage[] =>
    messages.filter((_, i) => !dropped.has(i));

  // Drop from the oldest droppable message forward until it fits (or none left).
  let di = 0;
  while (
    countMessageTokens(current(), model) > limit &&
    di < droppable.length
  ) {
    dropped.add(droppable[di]!);
    di++;
  }

  return current();
}

/**
 * True if `input` (a string or a message list) fits inside the model's context
 * window. For messages, the per-message overhead is included.
 */
export function willFit(input: string | ChatMessage[], model?: string): boolean {
  const { contextWindow } = modelInfo(model);
  const tokens = Array.isArray(input)
    ? countMessageTokens(input, model)
    : countTokens(input, model);
  return tokens <= contextWindow;
}

/**
 * Split `text` into chunks that each fit within `maxTokensPerChunk` estimated
 * tokens, optionally repeating `overlap` tokens' worth of words between
 * consecutive chunks. This is a basic word-boundary splitter — for structure-
 * aware chunking (markdown, code, sentences) use a dedicated splitter package.
 */
export function splitByTokens(
  text: string,
  maxTokensPerChunk: number,
  overlap = 0,
  model?: string,
): string[] {
  if (maxTokensPerChunk <= 0) {
    throw new RangeError("maxTokensPerChunk must be a positive number");
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const costs = words.map((w) => countTokens(w, model));
  const chunks: string[] = [];

  const ov = Math.max(0, Math.min(overlap, maxTokensPerChunk - 1));

  let start = 0;
  while (start < words.length) {
    let end = start;
    let sum = 0;
    // Grow the chunk while it fits; always take at least one word.
    while (end < words.length) {
      const next = sum + costs[end]!;
      if (next > maxTokensPerChunk && end > start) break;
      sum = next;
      end++;
    }

    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) break;

    // Compute the next start, backing up by ~`ov` tokens of overlap.
    let nextStart = end;
    if (ov > 0) {
      let back = 0;
      let idx = end;
      while (idx > start + 1 && back < ov) {
        idx--;
        back += costs[idx]!;
      }
      nextStart = idx;
    }
    // Guarantee forward progress.
    start = nextStart > start ? nextStart : end;
  }

  return chunks;
}
