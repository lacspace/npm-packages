import { isCommonWord, transliterate } from "@lacspace/translit";
import { ABBREVIATIONS, ACRONYMS, LETTERS_NE, Spoken, SYMBOLS } from "./lexicon.js";
import { Lang } from "./rules.js";

export interface WordOptions {
  lang: Lang;
  /** Per-word/phrase overrides: { "Lamichhane": { ne: "लामिछाने", en: "Lah-mi-chha-nay" } }. Keys match case-insensitively. */
  pronunciations?: Record<string, Partial<Spoken> | string>;
  /** Extra acronyms (merged over the built-in table). */
  acronyms?: Record<string, Partial<Spoken> | string>;
  /** What to do with words in the other script. Default "transliterate" (names read natively). */
  foreignWords?: "transliterate" | "keep";
}

const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN = /[A-Za-z]/;

function spokenFor(v: Partial<Spoken> | string | undefined, lang: Lang): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v === "string") return v;
  return v[lang] ?? v[lang === "ne" ? "en" : "ne"];
}

function spellOut(word: string, lang: Lang): string {
  const letters = [...word.toUpperCase()].filter((c) => /[A-Z]/.test(c));
  return lang === "ne" ? letters.map((c) => LETTERS_NE[c]).join(" ") : letters.join(" ");
}

/** Latin acronym heuristic: ≤4 letters, or all-consonant, or mixed like "NS"/"KTM" → spell; else keep as a word. */
export function isAcronym(word: string): boolean {
  return /^[A-Z][A-Z0-9.&]{1,7}$/.test(word.replace(/s$/, "")) || /^[A-Z](\.[A-Z])+\.?$/.test(word);
}

/** Devanagari letter-by-letter initialisms like "एनएस", "केपी" (two or more two-letter syllables ए/बी/सी…). */
const NE_LETTER_SYLLABLES = Object.values(LETTERS_NE).sort((a, b) => b.length - a.length);
export function spaceNeInitialism(word: string): string | undefined {
  let rest = word, out: string[] = [];
  while (rest.length) {
    const hit = NE_LETTER_SYLLABLES.find((s) => rest.startsWith(s));
    if (!hit) return undefined;
    out.push(hit);
    rest = rest.slice(hit.length);
  }
  return out.length >= 2 ? out.join(" ") : undefined;
}

/**
 * Spoken form of one word (no digits — numbers are handled by the rule scanner).
 * Order: user pronunciation → abbreviation → acronym table → acronym heuristic → cross-script → as-is.
 */
export function sayWord(word: string, o: WordOptions): string {
  const bare = word.replace(/[.,!?;:"'“”‘’()\[\]]+$/g, "");
  const trailing = word.slice(bare.length);
  const lower = bare.toLowerCase();

  const user = o.pronunciations && (o.pronunciations[bare] ?? o.pronunciations[lower] ?? Object.entries(o.pronunciations).find(([k]) => k.toLowerCase() === lower)?.[1]);
  const userSpoken = spokenFor(user, o.lang);
  if (userSpoken) return userSpoken + trailing;

  const abbr = ABBREVIATIONS[word] ?? ABBREVIATIONS[bare] ?? ABBREVIATIONS[bare + "."];
  if (abbr) return (o.lang === "ne" ? abbr.ne : abbr.en) + (ABBREVIATIONS[word] ? "" : trailing);

  const acr = (o.acronyms && spokenFor(o.acronyms[bare.toUpperCase()] ?? o.acronyms[bare], o.lang)) ?? (ACRONYMS[bare.toUpperCase().replace(/\./g, "")] && (o.lang === "ne" ? ACRONYMS[bare.toUpperCase().replace(/\./g, "")]!.ne : ACRONYMS[bare.toUpperCase().replace(/\./g, "")]!.en));
  if (acr && (isAcronym(bare) || bare === bare.toUpperCase())) return acr + trailing;
  if (isAcronym(bare)) {
    // Pronounceable 5+ letter all-caps words (NEPSE handled above; e.g. "UNESCO") are read as words.
    const letters = bare.replace(/[^A-Z]/g, "");
    if (letters.length >= 5 && /[AEIOU]/.test(letters) && !/[BCDFGHJKLMNPQRSTVWXZ]{4}/.test(letters)) return (o.lang === "ne" ? transliterate(letters.toLowerCase(), { from: "en", to: "ne" }) : bare) + trailing;
    return spellOut(bare, o.lang) + trailing;
  }

  if (SYMBOLS[bare]) return (o.lang === "ne" ? SYMBOLS[bare]!.ne : SYMBOLS[bare]!.en) + trailing;

  if (o.lang === "ne" && DEVANAGARI.test(bare)) {
    const init = spaceNeInitialism(bare);
    if (init) return init + trailing;
  }

  if ((o.foreignWords ?? "transliterate") === "transliterate") {
    if (o.lang === "ne" && LATIN.test(bare) && !DEVANAGARI.test(bare)) {
      // Names and brand words read natively; plain English words too (Nepali voices mangle Latin anyway).
      return transliterate(bare, { from: "en", to: "ne" }) + trailing;
    }
    if (o.lang === "en" && DEVANAGARI.test(bare)) {
      return capitalise(transliterate(bare, { from: "ne", to: "en" })) + trailing;
    }
  }
  return word;
}

function capitalise(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** True when a Latin token is an ordinary English word (so a caller may choose to keep it). */
export function isEnglishWord(word: string): boolean {
  return isCommonWord(word, { lang: "en" });
}
