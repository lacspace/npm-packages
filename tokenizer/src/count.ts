/**
 * Heuristic token estimator.
 *
 * This is **not** a real BPE tokenizer — it is a fast, dependency-free
 * approximation tuned to land within roughly ±10–15% of the real GPT / Claude /
 * Gemini tokenizers on ordinary English and source code. Use it for budgeting,
 * cost previews and chunking; use the provider's usage response for exact
 * billing.
 */

import { type ModelFamily, modelFamily } from "./models.js";

/** A chat message in the common OpenAI/Anthropic shape. */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool" | (string & {});
  content: string;
  /** Optional participant name (adds a little overhead). */
  name?: string;
}

/**
 * Per-family multiplier applied to the raw structural estimate.
 * The raw heuristic is calibrated against the OpenAI o200k/cl100k tokenizers
 * (`gpt`), so other families scale relative to it.
 */
const FAMILY_SCALE: Record<ModelFamily, number> = {
  gpt: 1.0,
  claude: 1.15, // Claude's tokenizer tends to emit a few % more tokens.
  gemini: 1.05,
};

// Split text into typed runs: words, digit runs, whitespace, everything else.
const CHUNK_RE = /([A-Za-z]+(?:['’][A-Za-z]+)*)|([0-9]+)|(\s+)|([^\sA-Za-z0-9]+)/g;

/**
 * Estimate the number of subword tokens in a single alphabetic word.
 * Short words are one token; longer words split roughly every ~4 chars, which
 * mirrors how BPE merges common prefixes/suffixes.
 */
function wordTokens(len: number): number {
  // Most common English words up to ~6 chars are a single token; longer words
  // split into subwords roughly every ~5 chars.
  if (len <= 6) return 1;
  return 1 + Math.round((len - 6) / 5);
}

/** Tokens for a run of digits (models group digits, roughly 3 at a time). */
function digitTokens(len: number): number {
  return Math.max(1, Math.ceil(len / 3));
}

/** Tokens for a run of punctuation/symbols (mostly one each, runs merge a bit). */
function punctTokens(run: string): number {
  // Non-ASCII symbols (emoji, CJK, etc.) are token-dense: count them heavier.
  let ascii = 0;
  let wide = 0;
  for (const ch of run) {
    if (ch.charCodeAt(0) < 128) ascii++;
    else wide++;
  }
  const asciiT = ascii === 0 ? 0 : Math.max(1, Math.round(ascii / 2));
  const wideT = wide; // ~1 token per non-ASCII symbol/char as a rough floor
  return asciiT + wideT;
}

/** Tokens contributed by a whitespace run. */
function whitespaceTokens(run: string): number {
  let newlines = 0;
  let spaces = 0;
  let tabs = 0;
  for (const ch of run) {
    if (ch === "\n") newlines++;
    else if (ch === "\t") tabs++;
    else spaces++;
  }
  // A lone space between words is absorbed into the next token (leading-space
  // merge), so it costs nothing. Indentation and blank lines do cost.
  return newlines + tabs + Math.floor(spaces / 4);
}

/**
 * Estimate how many tokens `text` uses for the given model.
 * Returns 0 for empty input. Never throws.
 *
 * @param text  the string to measure
 * @param model canonical id, alias, or dated variant (defaults to gpt-4o)
 */
export function countTokens(text: string, model?: string): number {
  if (!text) return 0;

  let raw = 0;
  CHUNK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHUNK_RE.exec(text)) !== null) {
    if (m[1] !== undefined) raw += wordTokens(m[1].length);
    else if (m[2] !== undefined) raw += digitTokens(m[2].length);
    else if (m[3] !== undefined) raw += whitespaceTokens(m[3]);
    else if (m[4] !== undefined) raw += punctTokens(m[4]);
  }

  const scale = FAMILY_SCALE[modelFamily(model)];
  return Math.max(1, Math.round(raw * scale));
}

/**
 * Estimate tokens for a list of chat messages, including the per-message
 * role/format overhead that OpenAI-style chat APIs add (`<|start|>role
 * <|message|> … <|end|>`) plus the ~3 tokens that prime the reply.
 *
 * Roughly: 3 (reply priming) + Σ (4 per message + content + name?).
 */
export function countMessageTokens(messages: ChatMessage[], model?: string): number {
  let total = 3; // every reply is primed with ~3 tokens
  for (const msg of messages) {
    total += 4; // ~3 per-message wrapper + ~1 for the role token
    total += countTokens(msg.content ?? "", model);
    if (msg.name) total += countTokens(msg.name, model) + 1;
  }
  return total;
}
