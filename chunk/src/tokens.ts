import type { LengthFn } from "./types";

/**
 * Count words (whitespace-delimited runs). Handy as a {@link LengthFn} when you
 * want word-budgeted chunks rather than character- or token-budgeted ones.
 *
 * @example
 * splitText(doc, { chunkSize: 200, lengthFn: wordLength }); // ~200-word chunks
 */
export const wordLength: LengthFn = (text) => {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
};

/**
 * A **dependency-free, approximate** token counter usable as a {@link LengthFn}.
 *
 * It estimates the number of subword tokens a typical BPE tokenizer (GPT-style)
 * would emit, by counting word fragments, standalone punctuation, whitespace
 * runs and CJK characters, then blending that with a characters-per-token
 * heuristic. It is **not** exact and never matches a specific tokenizer — for
 * exact budgets, pass your real tokenizer's `encode(t).length` as `lengthFn`.
 * Use this when "close enough, no dependency" is the right trade-off.
 *
 * @example
 * splitText(doc, { chunkSize: 512, lengthFn: approxTokenLength }); // ~512 tokens
 */
export const approxTokenLength: LengthFn = (text) => {
  if (!text) return 0;

  let tokens = 0;
  // Word pieces: split long words into ~4-char subword tokens (rough BPE-ish).
  const words = text.match(/[A-Za-z0-9]+/g) ?? [];
  for (const w of words) {
    tokens += Math.max(1, Math.ceil(w.length / 4));
  }
  // Punctuation / symbols usually tokenize ~1 token each.
  const punct = text.match(/[^\sA-Za-z0-9一-鿿぀-ヿ]/g) ?? [];
  tokens += punct.length;
  // CJK characters are roughly one token apiece.
  const cjk = text.match(/[一-鿿぀-ヿ]/g) ?? [];
  tokens += cjk.length;

  // Blend with the classic ~4-chars-per-token rule so pathological inputs
  // (e.g. one enormous whitespace-free string) still get a sane estimate.
  const charEstimate = Math.ceil(text.length / 4);
  return Math.max(1, Math.round((tokens + charEstimate) / 2));
};
