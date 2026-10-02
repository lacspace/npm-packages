import { detectScript } from "@lacspace/translit";
import { RULES, RuleContext, Lang } from "./rules.js";
import { sayWord, WordOptions } from "./words.js";
import { PacingOptions, Segment, segment, Token, toSsml } from "./segment.js";

export * from "./numbers.js";
export * from "./lexicon.js";
export * from "./segment.js";
export * from "./align.js";
export { sayWord, isAcronym, spaceNeInitialism, isEnglishWord } from "./words.js";
export { RULES } from "./rules.js";
export type { Lang, RuleContext, Rule } from "./rules.js";
export type { WordOptions } from "./words.js";

const VERSION = "1.0.1";

export interface SpeakableOptions extends PacingOptions, Omit<WordOptions, "lang"> {
  /** Output language for the voice. "auto" picks by dominant script (default). */
  lang?: Lang | "auto";
  dateSystem?: RuleContext["dateSystem"];
  grouping?: RuleContext["grouping"];
  dateStyle?: RuleContext["dateStyle"];
  /** Engine voice name for the SSML <voice> wrapper (e.g. "ne-NP-HemkalaNeural"). */
  voice?: string;
  /** Base rate multiplier for SSML prosody (1 = engine default). */
  baseRate?: number;
}

export interface SpeakableResult {
  lang: Lang;
  /** Spoken text, plain (pauses as punctuation/paragraphs) — for engines without SSML. */
  text: string;
  /** SSML with <s>, <break> and <prosody> (edge-tts / Azure dialect). */
  ssml: string;
  tokens: Token[];
  segments: Segment[];
  /** Estimated total duration incl. pauses, ms. */
  estimatedDurationMs: number;
  warnings: string[];
}

const WORD = /[\p{L}\p{M}\p{N}'’.&+@#%$€£₹~→-]+/uy;

/**
 * Rewrite text into its spoken form for a TTS engine: numbers, BS/AD dates, times, currency,
 * percentages, phone numbers, plates, units, ordinals, acronyms, abbreviations and cross-script
 * names — then segment it with pauses/rate and an original↔spoken token map.
 */
export function speakable(input: string, o: SpeakableOptions = {}): SpeakableResult {
  const lang: Lang = !o.lang || o.lang === "auto" ? (detectScript(input) === "ne" ? "ne" : "en") : o.lang;
  const indianContext = /लाख|करोड|अर्ब|खर्ब|रु\.?|रुपैयाँ|NPR|Rs\.?|lakh|crore/i.test(input);
  const ctx: RuleContext = { lang, dateSystem: o.dateSystem ?? "auto", grouping: o.grouping ?? "auto", dateStyle: o.dateStyle ?? "british", indianContext };
  const wordOpts: WordOptions = { lang, pronunciations: o.pronunciations, acronyms: o.acronyms, foreignWords: o.foreignWords };
  const warnings: string[] = [];
  const tokens: Token[] = [];
  const text = input.replace(/\r\n?/g, "\n");
  let i = 0;
  const push = (orig: string, spoken: string, rule: string, numeric: boolean) => {
    tokens.push({ orig, start: i, end: i + orig.length, spoken, numeric, rule });
    i += orig.length;
  };
  while (i < text.length) {
    // paragraph break
    const para = /\n[ \t]*\n+/y; para.lastIndex = i;
    const pm = para.exec(text);
    if (pm) { push(pm[0], "\n\n", "para", false); continue; }
    const ws = /\s+/y; ws.lastIndex = i;
    const wm = ws.exec(text);
    if (wm) { push(wm[0], " ", "space", false); continue; }
    // rules at this position
    let matched = false;
    for (const rule of RULES) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(text);
      if (!m || !m[0]) continue;
      // don't start a number rule in the middle of a word/number
      if (i > 0 && /[\p{L}\p{N}]/u.test(text[i - 1]!) && /[\p{N}]/u.test(m[0][0]!)) continue;
      let spoken: string | null;
      try { spoken = rule.say(m, ctx); } catch (e) { warnings.push(`${rule.name}: ${(e as Error).message}`); spoken = null; }
      if (spoken === null) continue;
      push(m[0], spoken, rule.name, rule.numeric ?? true);
      matched = true;
      break;
    }
    if (matched) continue;
    WORD.lastIndex = i;
    const w = WORD.exec(text);
    if (w && w[0]) {
      // Devanagari-attached suffixes on numbers were consumed by rules; here we have a word.
      push(w[0], sayWord(w[0], wordOpts), "word", false);
      continue;
    }
    const ch = text[i]!;
    push(ch, lang === "en" && ch === "।" ? "." : ch, "punct", false);
  }
  // Nepali engines read "।" as a stop; English voices want "." — normalise sentence enders per language.
  const segments = segment(tokens, lang, o);
  const plain = toSsml(segments, lang, { plain: true });
  const ssml = toSsml(segments, lang, { voice: o.voice, baseRate: o.baseRate });
  const estimatedDurationMs = segments.reduce((a, s) => a + s.durationMs + s.pauseAfter, 0);
  return { lang, text: plain, ssml, tokens, segments, estimatedDurationMs, warnings };
}

/** Spoken form only (no segmentation) — handy for tests and quick captions-to-speech. */
export function spokenText(input: string, o: SpeakableOptions = {}): string {
  return speakable(input, o).tokens.map((t) => t.spoken).join("").replace(/[ \t]+/g, " ").trim();
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/speakable",
    version: VERSION,
    summary: "Engine-agnostic spoken-form normaliser for Nepali and English TTS: numbers (Indian scales, fraction idioms), BS/AD dates, times, currency, percent, phones/plates digit-by-digit, units, ordinals, acronyms, abbreviations, cross-script names with overrides; sentence segmentation with pauses/rate, SSML for edge-tts, estimated word timings and engine WordBoundary alignment mapped back to the original text for captions.",
    commands: [
      { name: "speakable", input: { type: "object", properties: { text: { type: "string" }, lang: { enum: ["ne", "en", "auto"] }, voice: { type: "string" }, pronunciations: { type: "object" }, acronyms: { type: "object" }, dateSystem: { enum: ["auto", "bs", "ad"] }, grouping: { enum: ["auto", "indian", "western"] }, wpm: { type: "number" }, baseRate: { type: "number" } }, required: ["text"] }, output: "{ lang, text, ssml, tokens, segments, estimatedDurationMs, warnings }" },
      { name: "spokenText", input: { type: "object", properties: { text: { type: "string" }, lang: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "alignWordBoundaries", input: { type: "object", properties: { tokens: { type: "array" }, segments: { type: "array" }, boundaries: { type: "array", description: "[{text, offsetMs, durationMs}] from the engine" } }, required: ["tokens", "segments", "boundaries"] }, output: "AlignedSegment[] (original spans with ms timings)" },
      { name: "numberToWordsNe", input: { type: "object", properties: { n: { type: "number" } }, required: ["n"] }, output: "string" },
      { name: "numberToWordsEn", input: { type: "object", properties: { n: { type: "number" }, grouping: { type: "string" }, year: { type: "boolean" } }, required: ["n"] }, output: "string" },
    ],
  };
}
