import { isDevanagari } from "./devanagari.js";

export interface ScriptRatio {
  /** Devanagari code points, including combining vowel signs (matras) and marks. */
  devanagari: number;
  latin: number;
  digit: number;
  other: number;
  /** Devanagari combining marks (matras, virama, anusvara…) — a subset of `devanagari`. */
  mark: number;
  /** Total counted characters (letters/digits/marks; whitespace and punctuation excluded). */
  total: number;
  /** Letters only (Devanagari base letters + Latin letters) — no digits, no marks. */
  letters: number;
  ratios: { devanagari: number; latin: number; digit: number; other: number };
  /**
   * Letters-only shares — Devanagari BASE letters vs Latin letters, ignoring digits
   * and combining marks. This is the number comparable across scripts; use it, not
   * `ratios.devanagari`, for a language-mix decision.
   */
  lettersRatio: { devanagari: number; latin: number };
}

const MARK_RE = /\p{M}/u;

/** Count characters by script. Whitespace and punctuation are not counted. */
export function scriptRatio(text: string): ScriptRatio {
  let deva = 0;
  let devaLetters = 0;
  let mark = 0;
  let latin = 0;
  let digit = 0;
  let other = 0;
  for (const ch of text) {
    if (/\s/.test(ch) || /[!-/:-@[-`{-~ -⁯।॥]/.test(ch)) continue;
    if (isDevanagari(ch)) {
      if (ch >= "०" && ch <= "९") digit++;
      else {
        deva++;
        if (MARK_RE.test(ch)) mark++;
        else devaLetters++;
      }
    } else if (/[A-Za-z]/.test(ch)) latin++;
    else if (/[0-9]/.test(ch)) digit++;
    else other++;
  }
  const total = deva + latin + digit + other;
  const letters = devaLetters + latin;
  const r = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 1000);
  const lr = (n: number) => (letters === 0 ? 0 : Math.round((n / letters) * 1000) / 1000);
  return {
    devanagari: deva,
    latin,
    digit,
    other,
    mark,
    total,
    letters,
    ratios: { devanagari: r(deva), latin: r(latin), digit: r(digit), other: r(other) },
    lettersRatio: { devanagari: lr(devaLetters), latin: lr(latin) },
  };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DominantScriptOptions {
  /** Proper nouns / names (any script) to exclude from the ratio. Matched on word boundaries. */
  gazetteer?: string[];
  /** Exclude quoted spans ("…", “…”, ‘…’). Straight apostrophes are NOT treated as quotes. Default true. */
  ignoreQuotes?: boolean;
  /**
   * Exclude names from the ratio. Only removes the entries you pass in `gazetteer`
   * (on word boundaries) — it never strips arbitrary Devanagari runs, which used to
   * zero out genuine Nepali prose. Default true.
   */
  ignoreNames?: boolean;
}

export interface DominantScriptResult {
  script: "devanagari" | "latin" | "mixed";
  /** Devanagari letters-only share of the whole text (base letters vs Latin letters). */
  ratio: number;
  /** Letters-only Devanagari share AFTER removing quotes and gazetteer names — the fair number for a language-mix rule. */
  adjustedRatio: number;
  raw: ScriptRatio;
  adjusted: ScriptRatio;
}

/**
 * Decide a text's dominant script and its Devanagari share, with an ADJUSTED
 * share that ignores quoted spans and proper nouns — so an English article that
 * merely names a few Nepali people/places is not misjudged as Nepali.
 */
export function dominantScript(text: string, options: DominantScriptOptions = {}): DominantScriptResult {
  const ignoreQuotes = options.ignoreQuotes ?? true;
  const ignoreNames = options.ignoreNames ?? true;
  const raw = scriptRatio(text);

  let stripped = text;
  if (ignoreQuotes) {
    // Real quotation marks only — a straight ' is an apostrophe (Nepal's, didn't),
    // never a quote, so it must not swallow the words between two apostrophes.
    stripped = stripped.replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, " ");
  }
  if (ignoreNames) {
    // Remove only the names you provided, on word boundaries, so a short entry
    // (रु) can't cut into an ordinary word (रुपैयाँ).
    for (const g of options.gazetteer ?? []) {
      if (!g) continue;
      const re = new RegExp(`(?<![\\p{L}\\p{M}])${escapeRe(g)}(?![\\p{L}\\p{M}])`, "gu");
      stripped = stripped.replace(re, " ");
    }
  }
  const adjusted = scriptRatio(stripped);
  // Compare LETTERS ONLY (base letters, no digits, no combining marks) — the fair,
  // cross-script number for a language-mix rule.
  const ratio = raw.lettersRatio.devanagari;
  const adjustedRatio = adjusted.lettersRatio.devanagari;
  const dom = adjustedRatio > 0.6 ? "devanagari" : adjusted.lettersRatio.latin > 0.6 ? "latin" : "mixed";
  return { script: dom, ratio, adjustedRatio, raw, adjusted };
}
