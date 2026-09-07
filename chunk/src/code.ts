import type { Chunk, SplitCodeOptions } from "./types";
import {
  DEFAULT_CHUNK_SIZE,
  type Range,
  charLength,
  finalizeChunks,
  lineStarts,
  mergeRanges,
  recursiveSplit,
} from "./core";

// Languages whose top-level structure is governed by indentation.
const INDENT_LANGS = new Set([
  "python",
  "py",
  "yaml",
  "yml",
  "ruby",
  "rb",
  "coffee",
  "coffeescript",
  "haskell",
  "hs",
]);

const CODE_SEPARATORS = ["\n\n", "\n", " ", ""];

/**
 * Best-effort code splitter. Splits on **top-level boundaries** — blank lines
 * that sit at brace depth 0 (for C-like languages) or that precede a
 * column-0 line (for indentation languages) — so functions and classes stay
 * whole, then merges blocks up to the budget.
 *
 * This is heuristic, not a real parser: it uses a lightweight brace/string
 * scanner and works well for common languages (js/ts, go, java, c/c++, rust,
 * python, …). It never guarantees syntactically complete chunks.
 */
export function splitCode(code: string, opts: SplitCodeOptions): Chunk[] {
  if (!code) return [];
  const lang = (opts.language ?? "").toLowerCase();
  const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.chunkOverlap ?? 0;
  const lengthFn = opts.lengthFn ?? charLength;

  const lines = code.split("\n");
  const starts = lineStarts(code);
  const useIndent = INDENT_LANGS.has(lang);
  const depths = useIndent ? [] : scanDepths(code, lines.length);

  // A boundary is a blank line that separates top-level constructs.
  const boundary: boolean[] = new Array(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== "") continue;
    if (useIndent) {
      let j = i + 1;
      while (j < lines.length && lines[j]!.trim() === "") j++;
      if (j < lines.length && leadingSpaces(lines[j]!) === 0) boundary[i] = true;
    } else if ((depths[i] ?? 0) === 0) {
      boundary[i] = true;
    }
  }

  // Group runs of lines between boundary blanks into units.
  const units: Range[] = [];
  let unitStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (boundary[i]) {
      if (unitStart >= 0) {
        units.push([starts[unitStart]!, starts[i]!]);
        unitStart = -1;
      }
      continue;
    }
    if (unitStart < 0) unitStart = i;
  }
  if (unitStart >= 0) units.push([starts[unitStart]!, code.length]);

  // Split any unit that is larger than the budget, then merge.
  const pieces: Range[] = [];
  for (const [s, e] of units) {
    if (lengthFn(code.slice(s, e)) <= chunkSize) {
      pieces.push([s, e]);
    } else {
      pieces.push(...recursiveSplit(code, s, e, CODE_SEPARATORS, chunkSize, lengthFn));
    }
  }

  const merged = mergeRanges(code, pieces, chunkSize, overlap, lengthFn);
  return finalizeChunks(code, merged);
}

function leadingSpaces(line: string): number {
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === " " || ch === "\t") n++;
    else break;
  }
  return n;
}

/**
 * Bracket depth at the start of each line, ignoring string/char literals and
 * comments. Best-effort; template-literal interpolation and regex literals are
 * not tracked.
 */
function scanDepths(code: string, lineCount: number): number[] {
  const depthAt = new Array<number>(lineCount).fill(0);
  let depth = 0;
  let line = 0;
  let inStr = "";
  let inLine = false;
  let inBlock = false;
  for (let k = 0; k < code.length; k++) {
    const ch = code[k]!;
    if (ch === "\n") {
      line++;
      if (line < lineCount) depthAt[line] = depth;
      inLine = false;
      continue;
    }
    if (inLine) continue;
    if (inBlock) {
      if (ch === "*" && code[k + 1] === "/") {
        inBlock = false;
        k++;
      }
      continue;
    }
    if (inStr) {
      if (ch === "\\") {
        k++;
      } else if (ch === inStr) {
        inStr = "";
      }
      continue;
    }
    if (ch === "/" && code[k + 1] === "/") {
      inLine = true;
      k++;
      continue;
    }
    if (ch === "/" && code[k + 1] === "*") {
      inBlock = true;
      k++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      inStr = ch;
      continue;
    }
    if (ch === "{" || ch === "(" || ch === "[") depth++;
    else if (ch === "}" || ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
  }
  return depthAt;
}
