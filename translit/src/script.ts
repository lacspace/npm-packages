import { isDevanagari } from "./devanagari.js";

export interface ScriptRatio {
  devanagari: number;
  latin: number;
  digit: number;
  other: number;
  /** Total counted characters (letters/digits only; whitespace and punctuation excluded). */
  total: number;
  ratios: { devanagari: number; latin: number; digit: number; other: number };
}

/** Count characters by script. Whitespace and punctuation are not counted. */
export function scriptRatio(text: string): ScriptRatio {
  let deva = 0;
  let latin = 0;
  let digit = 0;
  let other = 0;
  for (const ch of text) {
    if (/\s/.test(ch) || /[!-/:-@[-`{-~ -⁯।॥]/.test(ch)) continue;
    if (isDevanagari(ch)) {
      if (ch >= "०" && ch <= "९") digit++;
      else deva++;
    } else if (/[A-Za-z]/.test(ch)) latin++;
    else if (/[0-9]/.test(ch)) digit++;
    else other++;
  }
  const total = deva + latin + digit + other;
  const r = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 1000) / 1000);
  return {
    devanagari: deva,
    latin,
    digit,
    other,
    total,
    ratios: { devanagari: r(deva), latin: r(latin), digit: r(digit), other: r(other) },
  };
}

export interface DominantScriptOptions {
  /** Proper nouns / names (any script) to exclude from the ratio. */
  gazetteer?: string[];
  /** Exclude quoted spans ("...", "...", '...'). Default true. */
  ignoreQuotes?: boolean;
  /** Exclude runs that look like proper nouns even if not in the gazetteer. Default true. */
  ignoreNames?: boolean;
}

export interface DominantScriptResult {
  script: "devanagari" | "latin" | "mixed";
  /** Raw Devanagari share of the whole text. */
  ratio: number;
  /** Devanagari share AFTER removing quotes and proper nouns — the fair number for a language-mix rule. */
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
    stripped = stripped.replace(/"[^"]*"|“[^”]*”|‘[^’]*’|'[^']*'/g, " ");
  }
  for (const g of options.gazetteer ?? []) {
    if (g) stripped = stripped.split(g).join(" ");
  }
  if (ignoreNames) {
    // Drop standalone Devanagari tokens that are likely proper nouns embedded in
    // otherwise-Latin text: a short Devanagari run (1–3 words) surrounded by Latin.
    if (raw.ratios.latin >= raw.ratios.devanagari) {
      stripped = stripped.replace(/[ऀ-ॿ]+(?:\s+[ऀ-ॿ]+){0,2}/g, " ");
    }
  }
  const adjusted = scriptRatio(stripped);
  const ratio = raw.ratios.devanagari;
  const adjustedRatio = adjusted.ratios.devanagari;
  const dom = adjustedRatio > 0.6 ? "devanagari" : adjusted.ratios.latin > 0.6 ? "latin" : "mixed";
  return { script: dom, ratio, adjustedRatio, raw, adjusted };
}
