/**
 * Token-budget-aware helpers — pure, deterministic, and provider-neutral.
 *
 * A model context window is finite, so these functions give you a fast,
 * dependency-free *estimate* of how many tokens a string or a message array
 * costs, and let you trim text or drop old messages to fit a budget. The
 * estimate is a heuristic (characters ÷ `charsPerToken`, default 4 ≈ English
 * with a real tokenizer); tune `charsPerToken` if you have measured your model.
 * For exact counts, pair with `@lacspace/tokenizer`.
 */

import { isPrompt, type Renderable } from "./render.js";
import type { Message } from "./messages.js";

/** Default characters-per-token heuristic (≈ English text with a BPE tokenizer). */
export const DEFAULT_CHARS_PER_TOKEN = 4;

/** Shared knob for every estimate. */
export interface EstimateOptions {
  /** Average characters per token (default {@link DEFAULT_CHARS_PER_TOKEN}). */
  charsPerToken?: number;
  /**
   * Per-message overhead (role markers, separators) added when estimating a
   * `Message[]` (default `4`). Ignored for plain strings.
   */
  perMessageOverhead?: number;
}

function charsPerToken(opts?: EstimateOptions): number {
  const c = opts?.charsPerToken ?? DEFAULT_CHARS_PER_TOKEN;
  return c > 0 ? c : DEFAULT_CHARS_PER_TOKEN;
}

function textOf(x: Renderable): string {
  return isPrompt(x) ? x.render() : x;
}

/**
 * Estimate the token cost of a string, a {@link Renderable}, or a `Message[]`.
 *
 * ```ts
 * estimateTokens("hello world");          // ~3
 * estimateTokens(messages().user("hi").build());
 * ```
 */
export function estimateTokens(
  input: Renderable | Message[],
  opts?: EstimateOptions,
): number {
  const cpt = charsPerToken(opts);
  if (Array.isArray(input)) {
    const overhead = opts?.perMessageOverhead ?? 4;
    let total = 0;
    for (const m of input) {
      total += Math.ceil((m.role.length + m.content.length) / cpt) + overhead;
    }
    return total;
  }
  const s = textOf(input);
  return Math.ceil(s.length / cpt);
}

/** Where {@link fitText} removes characters when a string is over budget. */
export type TrimStrategy = "end" | "start" | "middle";

/** Options for {@link fitText}. */
export interface FitTextOptions extends EstimateOptions {
  /** Maximum token budget. */
  maxTokens: number;
  /** Which part to cut when over budget (default `"end"`). */
  strategy?: TrimStrategy;
  /** Marker inserted where text was cut (default `"…"`). */
  ellipsis?: string;
}

/**
 * Trim a string so its {@link estimateTokens estimate} fits `maxTokens`,
 * cutting from the end (default), the start, or the middle. Returns the string
 * unchanged when it already fits.
 *
 * ```ts
 * fitText(longText, { maxTokens: 1000 });
 * fitText(longText, { maxTokens: 1000, strategy: "middle" });
 * ```
 */
export function fitText(text: string, opts: FitTextOptions): string {
  const cpt = charsPerToken(opts);
  const ellipsis = opts.ellipsis ?? "…";
  const strategy = opts.strategy ?? "end";
  if (opts.maxTokens <= 0) return "";
  if (estimateTokens(text, opts) <= opts.maxTokens) return text;

  const budgetChars = opts.maxTokens * cpt;
  const keep = budgetChars - ellipsis.length;
  if (keep <= 0) return ellipsis.slice(0, Math.max(0, budgetChars));

  if (strategy === "start") return ellipsis + text.slice(text.length - keep);
  if (strategy === "middle") {
    const head = Math.ceil(keep / 2);
    const tail = keep - head;
    return text.slice(0, head) + ellipsis + text.slice(text.length - tail);
  }
  return text.slice(0, keep) + ellipsis;
}

/** Options for {@link trimMessages}. */
export interface TrimMessagesOptions extends EstimateOptions {
  /** Maximum token budget for the whole conversation. */
  maxTokens: number;
  /** Always keep `system` messages, even when over budget (default `true`). */
  keepSystem?: boolean;
}

/**
 * Drop the *oldest* non-system messages until the conversation's estimated cost
 * fits `maxTokens`, always preserving order and (by default) every `system`
 * message. Returns a new array — the input is never mutated. Useful for a
 * sliding chat window.
 *
 * ```ts
 * const recent = trimMessages(history, { maxTokens: 3000 });
 * ```
 */
export function trimMessages(msgs: Message[], opts: TrimMessagesOptions): Message[] {
  const keepSystem = opts.keepSystem ?? true;
  const kept = msgs.slice();
  const isSystem = (m: Message) => m.role === "system";

  while (estimateTokens(kept, opts) > opts.maxTokens) {
    // find the oldest droppable (non-system) message
    const idx = kept.findIndex((m) => !(keepSystem && isSystem(m)));
    if (idx === -1) break; // nothing left to drop (only protected messages)
    kept.splice(idx, 1);
  }
  return kept.map((m) => ({ ...m }));
}
