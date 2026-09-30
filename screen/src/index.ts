/**
 * @lacspace/screen — a cheap lexical pre-screen that decides whether text even
 * needs an expensive model. You supply weighted term lexicons per dimension
 * (multi-language), optional negation patterns and a named-entity gazetteer;
 * `screen(text)` returns per-dimension scores, the matched terms, and a
 * clear / review / block decision. Deterministic and zero-dependency.
 */

export interface DimensionSpec {
  /** Terms/phrases that signal this dimension. Latin matched case-insensitively on word boundaries; non-Latin (e.g. Devanagari) matched as substrings. */
  terms: string[];
  /** Score added per matched term. Default 1. */
  weight?: number;
  /** If any single hit on this dimension appears, the decision is at least "review" (never "clear"). Good for minor / election-sensitive. */
  forceReview?: boolean;
  /** If any single (non-negated) hit appears, the decision is "block". Use sparingly. */
  forceBlock?: boolean;
}

export interface ScreenConfig {
  dimensions: Record<string, DimensionSpec>;
  /**
   * Words/patterns that flip a nearby hit to "negated" (not counted toward the score).
   * Latin words match whole; a pattern ending in "*" is a prefix, and a value beginning
   * with "-" is a SUFFIX pattern (for languages like Nepali where negation is a verb
   * suffix, e.g. "-न", "-नन्").
   */
  negations?: string[];
  /** How many tokens on each side of a hit are scanned for a negation. Default 4. */
  contextWindow?: number;
  /** Named entities (people/places) — a hit near one adds `gazetteerBoost` to every active dimension. */
  gazetteer?: string[];
  /** Score added to a dimension when the text also contains a gazetteer entity. Default 0.5. */
  gazetteerBoost?: number;
  /** Total-score thresholds. `clear`: at or below → clear. `review`: at or above (and below block) → review. */
  thresholds?: { clear?: number; review?: number; block?: number };
}

export type Decision = "clear" | "review" | "block";

export interface ScreenHit {
  dim: string;
  term: string;
  /** Token position of the hit. */
  pos: number;
  weight: number;
  negated: boolean;
}

export interface ScreenResult {
  decision: Decision;
  /** Total score across dimensions (negated and gazetteer-only hits excluded from term totals). */
  score: number;
  /** Per-dimension score (non-negated hits × weight, plus gazetteer boost when present). */
  scores: Record<string, number>;
  hits: ScreenHit[];
  /** Whether a gazetteer entity was present. */
  entity: boolean;
  /** Human-readable "held because" reasons for an audit log. */
  reasons: string[];
}

interface Token {
  raw: string;
  norm: string; // lowercased
  start: number;
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{M}\p{N}‌‍]*/gu;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) out.push({ raw: m[0], norm: m[0].toLowerCase(), start: m.index });
  return out;
}

function termWords(term: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(term)) !== null) out.push(m[0].toLowerCase());
  return out;
}

function isLatin(s: string): boolean {
  return !/[^\u0000-ɏ]/.test(s);
}

interface NegRule {
  kind: "word" | "prefix" | "suffix";
  value: string;
}

function parseNegations(neg: string[]): NegRule[] {
  return neg.map((n) => {
    if (n.startsWith("-")) return { kind: "suffix" as const, value: n.slice(1).toLowerCase() };
    if (n.endsWith("*")) return { kind: "prefix" as const, value: n.slice(0, -1).toLowerCase() };
    return { kind: "word" as const, value: n.toLowerCase() };
  });
}

function tokenMatchesNeg(tok: Token, rules: NegRule[]): boolean {
  for (const r of rules) {
    if (r.kind === "word" && tok.norm === r.value) return true;
    if (r.kind === "prefix" && tok.norm.startsWith(r.value)) return true;
    if (r.kind === "suffix" && tok.norm.endsWith(r.value) && tok.norm.length > r.value.length) return true;
  }
  return false;
}

export interface Screen {
  (text: string): ScreenResult;
  readonly config: ScreenConfig;
}

/** Build a reusable screener from a config. Compiles term matchers once. */
export function createScreen(config: ScreenConfig): Screen {
  const window = config.contextWindow ?? 4;
  const negRules = parseNegations(config.negations ?? []);
  const gaz = (config.gazetteer ?? []).filter(Boolean);
  const gazLatin = gaz.filter(isLatin).map((g) => g.toLowerCase());
  const gazOther = gaz.filter((g) => !isLatin(g));
  const gazBoost = config.gazetteerBoost ?? 0.5;
  const th = { clear: 0, review: 1, block: Infinity, ...(config.thresholds ?? {}) };

  // Pre-split each dimension's terms into latin (token match) and substring (non-latin).
  const dims = Object.entries(config.dimensions).map(([name, spec]) => ({
    name,
    weight: spec.weight ?? 1,
    forceReview: spec.forceReview ?? false,
    forceBlock: spec.forceBlock ?? false,
    latin: spec.terms.filter(isLatin).map((t) => ({ term: t, words: termWords(t) })),
    other: spec.terms.filter((t) => !isLatin(t)),
  }));

  const screen = ((text: string): ScreenResult => {
    const toks = tokenize(text);
    const lower = text.toLowerCase();
    const hits: ScreenHit[] = [];
    const scores: Record<string, number> = {};
    for (const d of dims) scores[d.name] = 0;

    const entity =
      gazLatin.some((g) => new RegExp(`(?:^|[^a-z0-9])${escapeRe(g)}(?:[^a-z0-9]|$)`).test(lower)) ||
      gazOther.some((g) => text.includes(g));

    const negatedNear = (pos: number): boolean => {
      const from = Math.max(0, pos - window);
      const to = Math.min(toks.length - 1, pos + window);
      for (let i = from; i <= to; i++) if (i !== pos && tokenMatchesNeg(toks[i]!, negRules)) return true;
      return false;
    };

    const activeByDim = new Map<string, boolean>();
    const hitByDim = new Map<string, boolean>();
    for (const d of dims) {
      let anyActive = false;
      let anyHit = false;
      // Latin multi-word phrase matching over the token stream.
      for (const { term, words } of d.latin) {
        if (words.length === 0) continue;
        for (let i = 0; i + words.length <= toks.length; i++) {
          let ok = true;
          for (let j = 0; j < words.length; j++) if (toks[i + j]!.norm !== words[j]) { ok = false; break; }
          if (!ok) continue;
          const neg = negatedNear(i) || negatedNear(i + words.length - 1);
          hits.push({ dim: d.name, term, pos: i, weight: d.weight, negated: neg });
          anyHit = true;
          if (!neg) {
            scores[d.name]! += d.weight;
            anyActive = true;
          }
        }
      }
      // Non-Latin substring matching (Devanagari etc.), position by nearest token.
      for (const term of d.other) {
        let idx = text.indexOf(term);
        while (idx !== -1) {
          const pos = nearestToken(toks, idx);
          const neg = pos >= 0 ? negatedNear(pos) : false;
          hits.push({ dim: d.name, term, pos, weight: d.weight, negated: neg });
          anyHit = true;
          if (!neg) {
            scores[d.name]! += d.weight;
            anyActive = true;
          }
          idx = text.indexOf(term, idx + term.length);
        }
      }
      if (anyActive && entity) scores[d.name]! += gazBoost;
      activeByDim.set(d.name, anyActive);
      hitByDim.set(d.name, anyHit);
    }

    let total = 0;
    for (const d of dims) total += scores[d.name]!;

    // Decision.
    const reasons: string[] = [];
    let decision: Decision = "clear";
    for (const d of dims) {
      if (d.forceBlock && activeByDim.get(d.name)) {
        decision = "block";
        reasons.push(`${d.name}: force-block hit`);
      }
    }
    if (decision !== "block") {
      if (total >= th.block) {
        decision = "block";
        reasons.push(`total score ${round(total)} ≥ block ${th.block}`);
      } else if (total >= th.review || total > th.clear) {
        // `review` is the entry boundary; `clear` is the ceiling — a score above
        // the clear ceiling can never be "clear", even below the review number.
        decision = "review";
        reasons.push(
          total >= th.review
            ? `total score ${round(total)} ≥ review ${th.review}`
            : `total score ${round(total)} > clear ceiling ${th.clear}`,
        );
      }
      // Force-review dimensions (minors, elections) trip on ANY mention, even a
      // negated one — a "no minors were involved" line still deserves a look.
      for (const d of dims) {
        if (d.forceReview && hitByDim.get(d.name) && decision === "clear") {
          decision = "review";
          reasons.push(`${d.name}: force-review hit`);
        }
      }
    }
    if (decision === "clear") reasons.push(`total score ${round(total)} ≤ clear ${th.clear}`);

    // Order hits deterministically.
    hits.sort((a, b) => a.pos - b.pos || a.dim.localeCompare(b.dim) || a.term.localeCompare(b.term));

    return { decision, score: round(total), scores: roundAll(scores), hits, entity, reasons };
  }) as Screen;

  Object.defineProperty(screen, "config", { value: config, enumerable: true });
  return screen;
}

/** One-shot convenience: build and run in a single call. */
export function screenText(text: string, config: ScreenConfig): ScreenResult {
  return createScreen(config)(text);
}

function nearestToken(toks: Token[], charPos: number): number {
  // binary-ish: find the token whose start is closest to charPos
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < toks.length; i++) {
    const d = Math.abs(toks[i]!.start - charPos);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
function roundAll(o: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(o)) out[k] = round(o[k]!);
  return out;
}
