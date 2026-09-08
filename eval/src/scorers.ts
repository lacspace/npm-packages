/**
 * Deterministic, pure scorers. Each returns a {@link Score} with a `0..1`
 * `score` and a boolean `passed`. None of them touch the network.
 */
import type { EmbedFn, JsonSchema, Score } from "./types";
import {
  clamp01,
  deepEqual,
  getPath,
  levenshtein,
  tokenOverlapCosine,
  tryParseJson,
  validateSchema,
  vectorCosine,
} from "./internal";

/** Common options accepted by the string scorers. */
export interface StringScorerOptions {
  /** Compare case-insensitively. Default `false`. */
  caseInsensitive?: boolean;
  /** Override the produced score's `name`. */
  name?: string;
}

function norm(s: string, ci?: boolean): string {
  return ci ? s.toLowerCase() : s;
}

/** True when `output` contains `substr`. `score` is `1`/`0`. */
export function contains(output: string, substr: string, opts: StringScorerOptions = {}): Score {
  const found = norm(output, opts.caseInsensitive).includes(norm(substr, opts.caseInsensitive));
  return {
    name: opts.name ?? "contains",
    score: found ? 1 : 0,
    passed: found,
    details: { substr, found },
  };
}

/** True when `output` does **not** contain `substr`. `score` is `1`/`0`. */
export function notContains(output: string, substr: string, opts: StringScorerOptions = {}): Score {
  const found = norm(output, opts.caseInsensitive).includes(norm(substr, opts.caseInsensitive));
  return {
    name: opts.name ?? "notContains",
    score: found ? 0 : 1,
    passed: !found,
    details: { substr, found },
  };
}

/** True when `output` matches the regular expression `re` (string or `RegExp`). */
export function matchesRegex(output: string, re: RegExp | string, opts: { name?: string } = {}): Score {
  const rx = typeof re === "string" ? new RegExp(re) : re;
  // Reset lastIndex so a reused /g regex behaves deterministically.
  if (rx.global) rx.lastIndex = 0;
  const passed = rx.test(output);
  return {
    name: opts.name ?? "matchesRegex",
    score: passed ? 1 : 0,
    passed,
    details: { pattern: rx.source },
  };
}

/** Options for {@link exactMatch}. */
export interface ExactMatchOptions extends StringScorerOptions {
  /** Trim both strings before comparing. Default `false`. */
  trim?: boolean;
}

/** True when `output` equals `expected` (optionally trimmed / case-folded). */
export function exactMatch(output: string, expected: string, opts: ExactMatchOptions = {}): Score {
  let a = output;
  let b = expected;
  if (opts.trim) {
    a = a.trim();
    b = b.trim();
  }
  if (opts.caseInsensitive) {
    a = a.toLowerCase();
    b = b.toLowerCase();
  }
  const passed = a === b;
  return { name: opts.name ?? "exactMatch", score: passed ? 1 : 0, passed };
}

/** True when `output` is syntactically valid JSON. */
export function jsonValid(output: string, opts: { name?: string } = {}): Score {
  const { ok } = tryParseJson(output);
  return { name: opts.name ?? "jsonValid", score: ok ? 1 : 0, passed: ok };
}

/**
 * Parse `output` as JSON and validate it against a small {@link JsonSchema}.
 * Fails (score 0) if the string is not valid JSON. Otherwise `score` is the
 * fraction of schema checks that passed and `passed` requires zero errors.
 */
export function matchesSchema(output: string, schema: JsonSchema, opts: { name?: string } = {}): Score {
  const name = opts.name ?? "matchesSchema";
  const parsed = tryParseJson(output);
  if (!parsed.ok) {
    return { name, score: 0, passed: false, details: { errors: ["output is not valid JSON"] } };
  }
  const errors = validateSchema(parsed.value, schema);
  const passed = errors.length === 0;
  // Graceful partial score: 1 when clean, decaying with the number of errors.
  const score = passed ? 1 : clamp01(1 / (1 + errors.length));
  return { name, score, passed, details: passed ? undefined : { errors } };
}

/** Options for {@link levenshteinSimilarity}. */
export interface SimilarityOptions {
  /** Pass threshold on the `0..1` similarity. Default `0.8`. */
  threshold?: number;
  /** Override the produced score's `name`. */
  name?: string;
}

/**
 * Normalised Levenshtein similarity `1 - distance / maxLen` in `[0, 1]`.
 * Two empty strings score `1`.
 */
export function levenshteinSimilarity(a: string, b: string, opts: SimilarityOptions = {}): Score {
  const threshold = opts.threshold ?? 0.8;
  const maxLen = Math.max(a.length, b.length);
  const sim = maxLen === 0 ? 1 : 1 - levenshtein(a, b) / maxLen;
  const score = clamp01(sim);
  return {
    name: opts.name ?? "levenshtein",
    score,
    passed: score >= threshold,
    details: { threshold },
  };
}

/** Options for {@link cosineSimilarityScore}. */
export interface CosineOptions {
  /** Pass threshold on the `0..1` similarity. Default `0.75`. */
  threshold?: number;
  /** Override the produced score's `name`. */
  name?: string;
}

/**
 * Cosine similarity between two texts.
 *
 * With no `embed` function it uses a dependency-free bag-of-words term-frequency
 * vector (synchronous). Pass an injected {@link EmbedFn} — e.g. from
 * `@lacspace/embeddings` or a provider SDK — to score real semantic similarity
 * (asynchronous). No model is bundled and nothing is called unless you inject it.
 */
export function cosineSimilarityScore(a: string, b: string, opts?: CosineOptions): Score;
export function cosineSimilarityScore(
  a: string,
  b: string,
  embed: EmbedFn,
  opts?: CosineOptions,
): Promise<Score>;
export function cosineSimilarityScore(
  a: string,
  b: string,
  embedOrOpts?: EmbedFn | CosineOptions,
  maybeOpts?: CosineOptions,
): Score | Promise<Score> {
  const embed = typeof embedOrOpts === "function" ? embedOrOpts : undefined;
  const opts = (typeof embedOrOpts === "function" ? maybeOpts : embedOrOpts) ?? {};
  const threshold = opts.threshold ?? 0.75;
  const name = opts.name ?? "cosine";

  if (!embed) {
    const sim = tokenOverlapCosine(a, b);
    return { name, score: sim, passed: sim >= threshold, details: { threshold, mode: "token-overlap" } };
  }

  return embed([a, b]).then((vecs) => {
    const va = vecs[0];
    const vb = vecs[1];
    if (!va || !vb) {
      return { name, score: 0, passed: false, details: { threshold, error: "embed returned too few vectors" } };
    }
    const sim = vectorCosine(va, vb);
    return { name, score: sim, passed: sim >= threshold, details: { threshold, mode: "embedding" } };
  });
}

/** Options for {@link keywordCoverage}. */
export interface KeywordCoverageOptions {
  /** Compare case-insensitively. Default `true`. */
  caseInsensitive?: boolean;
  /** Fraction of keywords that must be present to pass. Default `1` (all). */
  threshold?: number;
  /** Override the produced score's `name`. */
  name?: string;
}

/**
 * Fraction of `keywords` that appear in `output`. `score` is that fraction and
 * `passed` requires it to reach `threshold` (default: every keyword present).
 */
export function keywordCoverage(
  output: string,
  keywords: string[],
  opts: KeywordCoverageOptions = {},
): Score {
  const ci = opts.caseInsensitive ?? true;
  const threshold = opts.threshold ?? 1;
  const hay = norm(output, ci);
  const missing: string[] = [];
  let hits = 0;
  for (const kw of keywords) {
    if (hay.includes(norm(kw, ci))) hits++;
    else missing.push(kw);
  }
  const score = keywords.length === 0 ? 1 : hits / keywords.length;
  return {
    name: opts.name ?? "keywordCoverage",
    score: clamp01(score),
    passed: score >= threshold,
    details: { matched: hits, total: keywords.length, missing },
  };
}

/** Bounds for {@link lengthWithin}. */
export interface LengthWithinOptions {
  /** Minimum length (inclusive). */
  min?: number;
  /** Maximum length (inclusive). */
  max?: number;
  /** Measure `"chars"` (default) or whitespace-separated `"words"`. */
  unit?: "chars" | "words";
  /** Override the produced score's `name`. */
  name?: string;
}

/** True when `output`'s length (chars or words) lies within `[min, max]`. */
export function lengthWithin(output: string, opts: LengthWithinOptions = {}): Score {
  const unit = opts.unit ?? "chars";
  const len = unit === "words" ? (output.trim() === "" ? 0 : output.trim().split(/\s+/).length) : output.length;
  const okMin = opts.min === undefined || len >= opts.min;
  const okMax = opts.max === undefined || len <= opts.max;
  const passed = okMin && okMax;
  return {
    name: opts.name ?? "lengthWithin",
    score: passed ? 1 : 0,
    passed,
    details: { length: len, unit, min: opts.min, max: opts.max },
  };
}

/**
 * Parse `output` as JSON (or accept an already-parsed object/array) and check
 * that the value at `path` deep-equals `value`. Supports dot and bracket paths
 * (`"a.b.0.c"`, `"a[0].b"`, `"$.a"`).
 */
export function jsonPathEquals(
  output: string | unknown,
  path: string,
  value: unknown,
  opts: { name?: string } = {},
): Score {
  const name = opts.name ?? "jsonPathEquals";
  let root: unknown = output;
  if (typeof output === "string") {
    const parsed = tryParseJson(output);
    if (!parsed.ok) {
      return { name, score: 0, passed: false, details: { error: "output is not valid JSON" } };
    }
    root = parsed.value;
  }
  const { found, value: actual } = getPath(root, path);
  if (!found) {
    return { name, score: 0, passed: false, details: { path, found: false } };
  }
  const passed = deepEqual(actual, value);
  return { name, score: passed ? 1 : 0, passed, details: { path, expected: value, actual } };
}
