import type { Chunk, SplitTextOptions } from "./types";
import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_OVERLAP,
  DEFAULT_SEPARATORS,
  charLength,
  finalizeChunks,
  mergeRanges,
  recursiveSplit,
} from "./core";

/**
 * Recursive character text splitter — the core primitive for RAG pipelines.
 *
 * Splits `text` on the highest-level separator that keeps pieces under
 * `chunkSize`, then merges adjacent pieces up to the budget and adds
 * `chunkOverlap` between neighbours. Pass a `lengthFn` (e.g. a token counter)
 * to make it token-aware without a hard dependency.
 *
 * @returns Chunks with correct source character offsets (`start`/`end`).
 */
export function splitText(text: string, opts: SplitTextOptions = {}): Chunk[] {
  if (!text) return [];
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = opts.chunkOverlap ?? DEFAULT_OVERLAP;
  const separators = opts.separators ?? [...DEFAULT_SEPARATORS];
  const lengthFn = opts.lengthFn ?? charLength;

  if (chunkSize <= 0) throw new RangeError("chunkSize must be greater than 0");
  if (chunkOverlap < 0) throw new RangeError("chunkOverlap must be >= 0");
  if (chunkOverlap >= chunkSize) {
    throw new RangeError("chunkOverlap must be smaller than chunkSize");
  }

  const pieces = recursiveSplit(text, 0, text.length, separators, chunkSize, lengthFn);
  const merged = mergeRanges(text, pieces, chunkSize, chunkOverlap, lengthFn);
  return finalizeChunks(text, merged);
}

/**
 * Convenience wrapper over {@link splitText} that returns plain strings.
 */
export function chunks(text: string, opts?: SplitTextOptions): string[] {
  return splitText(text, opts).map((c) => c.text);
}
