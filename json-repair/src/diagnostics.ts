/**
 * Explain *what was wrong* with a malformed JSON string, and repair it while
 * reporting the fixes.
 *
 * {@link repairJson} silently turns almost-JSON into valid JSON. Sometimes you
 * want to know **why** it had to — for logging, for surfacing a warning in a UI,
 * or for deciding whether a model response is trustworthy. {@link diagnoseJson}
 * inspects the input with a single string-aware pass and returns a list of the
 * problems it detected; {@link repairJsonWithDiagnostics} runs the real repair
 * and hands you the fixed text alongside those diagnostics.
 *
 * Detection is intentionally conservative — it reports the categories it can
 * identify reliably (it never invents a problem for valid JSON) and does not try
 * to pinpoint every possible deviation.
 */

import { repairJson } from "./repair.js";
import { extractJson } from "./scanner.js";

/** A category of malformation that {@link diagnoseJson} can detect. */
export type JsonIssueKind =
  | "wrapped-in-text" // JSON is surrounded by prose and/or a ``` code fence
  | "trailing-comma" // a comma just before `}` or `]`
  | "single-quotes" // strings delimited by `'` or `` ` `` instead of `"`
  | "unquoted-keys" // object keys written as bare identifiers
  | "comments" // `//` line or `/* */` block comments
  | "python-literals" // `True` / `False` / `None`
  | "non-finite" // `NaN` / `Infinity` / `-Infinity`
  | "unterminated-string" // a string with no closing quote (truncated)
  | "unclosed-structure"; // an object/array with no matching close (truncated)

/** A single problem found in the input. */
export interface JsonIssue {
  /** The category of the problem. */
  kind: JsonIssueKind;
  /** A short human-readable explanation. */
  message: string;
}

const MESSAGES: Record<JsonIssueKind, string> = {
  "wrapped-in-text": "JSON is wrapped in prose or a code fence",
  "trailing-comma": "trailing comma before a closing bracket",
  "single-quotes": "strings use single quotes or backticks instead of double quotes",
  "unquoted-keys": "object keys are unquoted",
  comments: "contains // or /* */ comments",
  "python-literals": "contains Python literals (True/False/None)",
  "non-finite": "contains non-finite numbers (NaN/Infinity)",
  "unterminated-string": "a string is not closed (truncated output)",
  "unclosed-structure": "an object or array is not closed (truncated output)",
};

const WS = new Set([" ", "\t", "\n", "\r", "\f", "\v"]);
const PY_TRUE = new Set(["True", "TRUE", "False", "FALSE", "None", "none", "Null", "NULL"]);
const NON_FINITE = new Set([
  "NaN",
  "nan",
  "Infinity",
  "infinity",
  "+Infinity",
  "-Infinity",
]);

function isWordChar(c: string): boolean {
  return /[A-Za-z0-9_+.\-]/.test(c);
}

/**
 * Inspect a JSON-ish string and return the malformations detected in it. Returns
 * an empty array for input that is already valid JSON.
 *
 * ```ts
 * diagnoseJson("{ name: 'Ada', active: True, }");
 * // → issues for: single-quotes, unquoted-keys, python-literals, trailing-comma
 * ```
 */
export function diagnoseJson(input: string): JsonIssue[] {
  if (typeof input !== "string" || input.length === 0) return [];

  // Already valid JSON → nothing to report.
  try {
    JSON.parse(input);
    return [];
  } catch {
    /* continue with detection */
  }

  const found = new Set<JsonIssueKind>();

  // Is the JSON embedded in surrounding text or a fence?
  const extracted = extractJson(input);
  if (extracted !== undefined && extracted.trim() !== input.trim()) {
    found.add("wrapped-in-text");
  }

  // Scan the extracted payload (so surrounding prose can't create false positives).
  const s = extracted ?? input;
  const n = s.length;
  let depth = 0;
  let inStr = false;
  let quote = "";
  let escaped = false;
  let prevSig = ""; // last significant char, outside strings/comments

  for (let i = 0; i < n; i++) {
    const c = s[i]!;

    if (inStr) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === quote) {
        inStr = false;
        prevSig = '"';
      }
      continue;
    }

    // Comments.
    if (c === "/" && s[i + 1] === "/") {
      found.add("comments");
      i += 2;
      while (i < n && s[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      found.add("comments");
      i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i += 1; // land on the '*' of '*/'; loop's i++ skips the '/'
      continue;
    }

    // String openers.
    if (c === '"' || c === "'" || c === "`") {
      if (c !== '"') found.add("single-quotes");
      inStr = true;
      quote = c;
      continue;
    }

    if (WS.has(c)) continue;

    if (c === "{" || c === "[") {
      depth++;
      prevSig = c;
      continue;
    }
    if (c === "}" || c === "]") {
      if (prevSig === ",") found.add("trailing-comma");
      if (depth > 0) depth--;
      prevSig = c;
      continue;
    }
    if (c === "," || c === ":") {
      prevSig = c;
      continue;
    }

    // A bareword (unquoted literal, number, key, or value).
    if (isWordChar(c)) {
      const start = i;
      while (i < n && isWordChar(s[i]!)) i++;
      const word = s.slice(start, i);
      i--; // reposition; the for-loop increments back onto the delimiter

      if (PY_TRUE.has(word)) found.add("python-literals");
      if (NON_FINITE.has(word)) found.add("non-finite");

      // If a `:` follows (past whitespace) this bareword was an object key.
      let j = i + 1;
      while (j < n && WS.has(s[j]!)) j++;
      const isLowerKeyword =
        word === "true" || word === "false" || word === "null";
      const looksNumeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(word);
      if (s[j] === ":" && !isLowerKeyword && !looksNumeric) {
        found.add("unquoted-keys");
      }
      prevSig = word.slice(-1);
      continue;
    }

    prevSig = c;
  }

  // Truncation: still inside a string, or brackets left open at end of input.
  if (inStr) found.add("unterminated-string");
  if (depth > 0) found.add("unclosed-structure");

  return [...found].map((kind) => ({ kind, message: MESSAGES[kind] }));
}

/** The result of {@link repairJsonWithDiagnostics}. */
export interface RepairDiagnostics {
  /** The repaired JSON text — identical to what {@link repairJson} returns. */
  output: string;
  /** The original input, unchanged. */
  input: string;
  /** `true` when the input was already valid JSON (no repair was needed). */
  valid: boolean;
  /** `true` when `output` differs from `input`. */
  changed: boolean;
  /** The malformations detected in the input (see {@link diagnoseJson}). */
  issues: JsonIssue[];
}

/**
 * Repair a malformed JSON string **and** report what was wrong with it. The
 * `output` is byte-for-byte what {@link repairJson} would return, so this is a
 * drop-in when you also want an explanation.
 *
 * ```ts
 * const r = repairJsonWithDiagnostics("{ name: 'Ada', }");
 * r.output;                    // → '{"name":"Ada"}'
 * r.changed;                   // → true
 * r.issues.map(i => i.kind);   // → ["single-quotes", "unquoted-keys", "trailing-comma"]
 * ```
 */
export function repairJsonWithDiagnostics(input: string): RepairDiagnostics {
  const text = typeof input === "string" ? input : String(input);
  let valid = false;
  try {
    JSON.parse(text);
    valid = true;
  } catch {
    valid = false;
  }
  const output = repairJson(text);
  return {
    output,
    input: text,
    valid,
    changed: output !== text,
    issues: valid ? [] : diagnoseJson(text),
  };
}
