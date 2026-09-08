import type { Tokenizer } from "./types";

/**
 * The default tokenizer: lowercase, then split on any run of non-alphanumeric
 * characters (Unicode-aware), dropping empties.
 *
 * Deterministic and dependency-free. Handles ASCII words and digits; scripts
 * without spaces (e.g. CJK) are better served by an injected tokenizer.
 */
export const defaultTokenize: Tokenizer = (text) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 0);

/** Build a `{ term: count }` map from a token list. */
export function termFreqs(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}
