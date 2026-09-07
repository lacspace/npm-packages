import type { Chunk, LengthFn } from "./types";

/** A half-open character range `[start, end)` into the source string. */
export type Range = [number, number];

/** Default recursive-split separators, highest priority first. */
export const DEFAULT_SEPARATORS: readonly string[] = ["\n\n", "\n", ". ", " ", ""];
export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_OVERLAP = 100;

/** Default length measurement: number of characters. */
export const charLength: LengthFn = (t) => t.length;

/**
 * Split a range on a separator, keeping the separator attached to the **end**
 * of the preceding piece. This makes the produced ranges contiguous (no gaps)
 * and avoids losing separator characters like `". "` between sentences.
 */
export function splitOnSeparator(text: string, start: number, end: number, sep: string): Range[] {
  const out: Range[] = [];
  let segStart = start;
  let i = start;
  while (i < end) {
    const idx = text.indexOf(sep, i);
    if (idx === -1 || idx >= end) break;
    const sepEnd = Math.min(idx + sep.length, end);
    out.push([segStart, sepEnd]);
    segStart = sepEnd;
    i = sepEnd;
  }
  if (end > segStart) out.push([segStart, end]);
  return out;
}

/**
 * Last-resort split: cut a range into pieces that each fit the budget, using a
 * binary search over character offsets. Assumes `lengthFn` is non-decreasing
 * with string length (true for character and typical token counters).
 */
export function hardSplit(
  text: string,
  start: number,
  end: number,
  chunkSize: number,
  lengthFn: LengthFn,
): Range[] {
  const out: Range[] = [];
  let i = start;
  while (i < end) {
    let lo = i + 1;
    let hi = end;
    let best = i + 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lengthFn(text.slice(i, mid)) <= chunkSize) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    out.push([i, best]);
    i = best;
  }
  return out;
}

/**
 * Recursively split `[start, end)` so every returned range fits `chunkSize`.
 * Walks down the separator list, preferring the highest-level separator that
 * still keeps pieces under budget. Returns contiguous ranges.
 */
export function recursiveSplit(
  text: string,
  start: number,
  end: number,
  separators: readonly string[],
  chunkSize: number,
  lengthFn: LengthFn,
): Range[] {
  if (end <= start) return [];
  if (lengthFn(text.slice(start, end)) <= chunkSize) return [[start, end]];

  // Pick the first separator present in the slice (or "" = character level).
  let chosen: string | null = null;
  let chosenIdx = -1;
  for (let i = 0; i < separators.length; i++) {
    const s = separators[i]!;
    if (s === "") {
      chosen = "";
      chosenIdx = i;
      break;
    }
    if (text.slice(start, end).includes(s)) {
      chosen = s;
      chosenIdx = i;
      break;
    }
  }

  if (chosen === null || chosen === "") {
    return hardSplit(text, start, end, chunkSize, lengthFn);
  }

  const rest = separators.slice(chosenIdx + 1);
  const segs = splitOnSeparator(text, start, end, chosen);
  const out: Range[] = [];
  for (const [ss, se] of segs) {
    if (se <= ss) continue;
    if (lengthFn(text.slice(ss, se)) <= chunkSize) {
      out.push([ss, se]);
    } else if (rest.length > 0) {
      out.push(...recursiveSplit(text, ss, se, rest, chunkSize, lengthFn));
    } else {
      out.push(...hardSplit(text, ss, se, chunkSize, lengthFn));
    }
  }
  return out;
}

/**
 * Merge adjacent ranges into chunks up to `chunkSize`, then keep the trailing
 * ranges of each emitted chunk so the next chunk overlaps by ~`chunkOverlap`.
 * Because chunks span the original text, in-between separators are preserved.
 */
export function mergeRanges(
  text: string,
  ranges: Range[],
  chunkSize: number,
  chunkOverlap: number,
  lengthFn: LengthFn,
): Range[] {
  const out: Range[] = [];
  let cur: Range[] = [];
  const spanLen = (from: number, to: number) => lengthFn(text.slice(from, to));

  for (const r of ranges) {
    if (cur.length > 0) {
      const combined = spanLen(cur[0]![0], r[1]);
      if (combined > chunkSize) {
        out.push([cur[0]![0], cur[cur.length - 1]![1]]);
        // Drop from the front to build the overlap window for the next chunk.
        while (cur.length > 0) {
          const curLen = spanLen(cur[0]![0], cur[cur.length - 1]![1]);
          const wouldBe = spanLen(cur[0]![0], r[1]);
          if (curLen > chunkOverlap || (wouldBe > chunkSize && curLen > 0)) {
            cur.shift();
          } else {
            break;
          }
        }
      }
    }
    cur.push(r);
  }
  if (cur.length > 0) out.push([cur[0]![0], cur[cur.length - 1]![1]]);
  return out;
}

const WS = /\s/;

/**
 * Trim whitespace-only edges of each range (keeping offsets exact), drop empty
 * and duplicate ranges, and materialize {@link Chunk} objects.
 */
export function finalizeChunks(text: string, ranges: Range[]): Chunk[] {
  const out: Chunk[] = [];
  let lastS = -1;
  let lastE = -1;
  for (const [rs, re] of ranges) {
    let s = rs;
    let e = re;
    while (s < e && WS.test(text[s]!)) s++;
    while (e > s && WS.test(text[e - 1]!)) e--;
    if (e <= s) continue;
    if (s === lastS && e === lastE) continue;
    out.push({ text: text.slice(s, e), index: out.length, start: s, end: e });
    lastS = s;
    lastE = e;
  }
  return out;
}

/** Character offset at the start of each line (index 0 = first line). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") starts.push(i + 1);
  }
  return starts;
}
