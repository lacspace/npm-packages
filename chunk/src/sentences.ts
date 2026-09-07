import type { Chunk, SplitUnitOptions } from "./types";
import { type Range, charLength, finalizeChunks, mergeRanges } from "./core";

/** Split text into sentence ranges (best-effort, punctuation-based). */
function sentenceRanges(text: string): Range[] {
  const out: Range[] = [];
  // A sentence ends at .!? (repeated), optional closing quote/bracket, then
  // whitespace or end of string.
  const re = /[.!?]+[)"'”’\]]*(?=\s|$)/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index + m[0].length;
    if (end > start) out.push([start, end]);
    start = end;
  }
  if (start < text.length) out.push([start, text.length]);
  return out;
}

/** Split text into paragraph ranges, separated by one or more blank lines. */
function paragraphRanges(text: string): Range[] {
  const out: Range[] = [];
  const re = /\n[ \t]*\n/g;
  let start = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const end = m.index;
    if (end > start) out.push([start, end]);
    start = m.index + m[0].length;
  }
  if (start < text.length) out.push([start, text.length]);
  return out;
}

function assemble(text: string, ranges: Range[], opts?: SplitUnitOptions): Chunk[] {
  const chunkSize = opts?.chunkSize;
  if (!chunkSize || chunkSize <= 0) {
    // One unit per chunk.
    return finalizeChunks(text, ranges);
  }
  const lengthFn = opts?.lengthFn ?? charLength;
  const overlap = opts?.chunkOverlap ?? 0;
  const merged = mergeRanges(text, ranges, chunkSize, overlap, lengthFn);
  return finalizeChunks(text, merged);
}

/**
 * Split text into sentences. By default each sentence is its own chunk; pass
 * `opts.chunkSize` to pack sentences into larger chunks up to that budget.
 */
export function splitBySentences(text: string, opts?: SplitUnitOptions): Chunk[] {
  if (!text) return [];
  return assemble(text, sentenceRanges(text), opts);
}

/**
 * Split text into paragraphs (blocks separated by blank lines). By default each
 * paragraph is its own chunk; pass `opts.chunkSize` to pack them together.
 */
export function splitByParagraphs(text: string, opts?: SplitUnitOptions): Chunk[] {
  if (!text) return [];
  return assemble(text, paragraphRanges(text), opts);
}
