import type { Splitter } from "./types";

/** Options for the built-in {@link simpleSplit}. */
export interface SimpleSplitOptions {
  /** Maximum length (characters) of a chunk. Default `1000`. */
  chunkSize?: number;
  /** How much adjacent hard-split windows overlap. Default `0`. */
  chunkOverlap?: number;
  /** Separator used to break the text into packable units. Default `"\n\n"`. */
  separator?: string;
}

/**
 * A tiny, dependency-free fallback splitter used when no `split` is injected
 * into {@link createRag}.
 *
 * It breaks the text on `separator` (paragraphs by default), greedily packs
 * those units up to `chunkSize`, and hard-windows any single unit that is
 * larger than `chunkSize` (respecting `chunkOverlap`). Deterministic and
 * offset-free — for offset-tracking, Markdown/code/sentence strategies and
 * token-aware budgets, inject `@lacspace/chunk`'s `splitText` instead.
 */
export function simpleSplit(text: string, opts: SimpleSplitOptions = {}): string[] {
  const size = opts.chunkSize ?? 1000;
  const overlap = opts.chunkOverlap ?? 0;
  const sep = opts.separator ?? "\n\n";

  if (size <= 0) throw new RangeError("chunkSize must be greater than 0");
  if (overlap < 0) throw new RangeError("chunkOverlap must be >= 0");
  if (overlap >= size) throw new RangeError("chunkOverlap must be smaller than chunkSize");

  if (!text || !text.trim()) return [];
  if (text.length <= size) return [text.trim()];

  const units = text
    .split(sep)
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

  const out: string[] = [];
  let buf = "";

  const flush = () => {
    if (buf) {
      out.push(buf);
      buf = "";
    }
  };

  for (const unit of units) {
    if (unit.length > size) {
      flush();
      const step = Math.max(1, size - overlap);
      for (let start = 0; start < unit.length; start += step) {
        out.push(unit.slice(start, start + size));
      }
      continue;
    }
    if (buf && buf.length + sep.length + unit.length > size) {
      flush();
      buf = unit;
    } else {
      buf = buf ? buf + sep + unit : unit;
    }
  }
  flush();

  return out;
}

/** The built-in splitter exposed as a {@link Splitter} for direct injection. */
export const defaultSplitter: Splitter = (text, opts) =>
  simpleSplit(text, (opts ?? {}) as SimpleSplitOptions);

/** Normalize any splitter's `string[] | { text }[]` output to plain strings. */
export function normalizeSplitOutput(out: string[] | { text: string }[]): string[] {
  return out.map((piece) => (typeof piece === "string" ? piece : piece.text));
}
