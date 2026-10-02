import { devanagariToLatin, isDevanagari, latinToDevanagari } from "./devanagari.js";
import { detectScript } from "./names.js";

export { devanagariToLatin, latinToDevanagari, isDevanagari } from "./devanagari.js";
export {
  stripHonorifics, nameVariants, matchName, normalizeName, detectScript, phoneticKey,
} from "./names.js";
export type { Lang, NameVariantsOptions, MatchNameOptions, MatchNameResult } from "./names.js";
export { scriptRatio, dominantScript } from "./script.js";
export type { ScriptRatio, DominantScriptOptions, DominantScriptResult } from "./script.js";
export { looksLikeName, isCommonWord } from "./classify.js";
export type {
  LooksLikeNameOptions, LooksLikeNameResult, IsCommonWordOptions,
} from "./classify.js";
export { EN_COMMON, NE_COMMON, NE_NAMES } from "./lexicon.js";

export interface TransliterateOptions {
  /** Source script. Default: auto-detected. */
  from?: "ne" | "en" | "auto";
  /** Target script. Default: the opposite of `from`. */
  to?: "ne" | "en";
}

/**
 * Transliterate between Devanagari (ne) and Latin (en). Devanagari→Latin is a
 * solid phonetic romanization; Latin→Devanagari is best-effort/approximate.
 */
export function transliterate(text: string, options: TransliterateOptions = {}): string {
  const from = !options.from || options.from === "auto" ? detectScript(text) : options.from;
  const to = options.to ?? (from === "ne" ? "en" : "ne");
  if (from === to) return text;
  return to === "en" ? devanagariToLatin(text) : latinToDevanagari(text);
}
export { scriptPurity } from "./purity.js";
export type { PurityResult, PurityIssue, IndicScript } from "./purity.js";
