import { stripHonorifics } from "./names.js";
import { EN_COMMON, NE_COMMON, NE_NAMES } from "./lexicon.js";

function latinKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "");
}
function devKey(s: string): string {
  return s.normalize("NFC").replace(/[^ऀ-ॿ]/g, "");
}

export interface IsCommonWordOptions {
  /** Which list(s) to check. Default: both en + ne. */
  lang?: "en" | "ne" | "auto";
  /** Extra words to treat as common (Latin or Devanagari). */
  extraCommonWords?: string[];
}

/**
 * Is this an ordinary, non-name word (so a newsroom search should NOT try to
 * transliterate/match it as a person)? Checks bundled English + Nepali common-word
 * lists; extend with `extraCommonWords`. Deterministic, zero-network.
 */
export function isCommonWord(word: string, options: IsCommonWordOptions = {}): boolean {
  const raw = (word ?? "").trim();
  if (!raw) return false;
  const lang = options.lang ?? "auto";
  const lk = latinKey(raw);
  const dk = devKey(raw);

  if (options.extraCommonWords) {
    for (const w of options.extraCommonWords) {
      if (lk && latinKey(w) === lk) return true;
      if (dk && devKey(w) === dk) return true;
    }
  }
  if (lang !== "en") {
    if (dk && NE_COMMON.has(dk)) return true;
    if (lk && NE_COMMON.has(lk)) return true;
  }
  if (lang !== "ne") {
    if (lk && EN_COMMON.has(lk)) return true;
  }
  return false;
}

export interface LooksLikeNameOptions {
  /** Authoritative names to recognize (any script). Takes precedence over bundled. */
  knownNames?: string[];
  /** Use the bundled Nepali name gazetteer. Default true. */
  bundled?: boolean;
  /** Extra words to treat as common (never a name). */
  extraCommonWords?: string[];
}

export interface LooksLikeNameResult {
  /** Best guess: is this a person's name rather than ordinary text? */
  isName: boolean;
  /** Confidence 0–1. */
  score: number;
  /** Human-readable evidence, one line per token. */
  reasons: string[];
}

/**
 * Cheap, deterministic guess at whether a string is a PERSON'S NAME rather than
 * ordinary words. Built for a newsroom search box so "india west indies" or
 * "breaking news" is not transliterated/matched as a name, while "Ram Sharma" or
 * "रामचन्द्र पौडेल" is. Combines a known/bundled name gazetteer (positive signal),
 * common-word lists (negative signal), capitalization, and script. Pass your own
 * authoritative `knownNames` for best results.
 */
export function looksLikeName(s: string, options: LooksLikeNameOptions = {}): LooksLikeNameResult {
  const bundled = options.bundled ?? true;
  const stripped = stripHonorifics((s ?? "").trim());
  const tokens = stripped.split(/[\s.,/]+/).filter(Boolean);
  if (!tokens.length) return { isName: false, score: 0, reasons: ["empty"] };

  const known = new Set<string>();
  for (const n of options.knownNames ?? []) {
    for (const t of n.split(/[\s.,/]+/)) {
      const lk = latinKey(t);
      const dk = devKey(t);
      if (lk) known.add(lk);
      if (dk) known.add(dk);
    }
  }

  let strong = 0; // known/gazetteer name hits
  let weak = 0; // capitalized Latin or non-common Devanagari
  let common = 0;
  const reasons: string[] = [];

  for (const tok of tokens) {
    const lk = latinKey(tok);
    const dk = devKey(tok);
    const inKnown = (lk && known.has(lk)) || (dk && known.has(dk));
    const inGaz = bundled && ((lk && NE_NAMES.has(lk)) || (dk && NE_NAMES.has(dk)));
    const isCommon = isCommonWord(tok, { extraCommonWords: options.extraCommonWords });

    if (inKnown) {
      strong++;
      reasons.push(`${tok}: known name`);
    } else if (inGaz) {
      strong++;
      reasons.push(`${tok}: bundled name`);
    } else if (isCommon) {
      common++;
      reasons.push(`${tok}: common word`);
    } else if (dk) {
      // A non-common Devanagari token in a news context is usually a proper noun.
      weak++;
      reasons.push(`${tok}: devanagari proper-noun`);
    } else if (lk && lk.length >= 2 && /^[A-Z]/.test(tok) && tok !== tok.toUpperCase()) {
      // Capitalized Latin word (not an ALL-CAPS acronym).
      weak++;
      reasons.push(`${tok}: capitalized`);
    } else {
      reasons.push(`${tok}: neutral`);
    }
  }

  const n = tokens.length;
  const nameEvidence = strong + 0.5 * weak;
  let score = nameEvidence / n - 0.3 * (common / n);
  score = Math.max(0, Math.min(1, score));

  let isName: boolean;
  if (strong > 0 && common === 0) {
    isName = true;
    score = Math.max(score, 0.7);
  } else {
    isName = score >= 0.5 && common / n < 0.5;
  }

  return { isName, score: Math.round(score * 1000) / 1000, reasons };
}
