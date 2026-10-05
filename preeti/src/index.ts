/**
 * Preeti ↔ Unicode conversion (pure, on-device). Started from the WeNepal app's implementation.
 *
 * Preeti is the legacy ASCII-hack Devanagari font: each Latin key draws a Devanagari glyph, so text typed in Preeti is
 * stored as ASCII ("g]kfn" draws नेपाल). Two ordering rules differ from Unicode:
 *   - short i (ि, key `l`) is typed BEFORE its consonant cluster; Unicode stores it after.
 *   - reph (र्, key `{`) is typed AFTER its syllable (cluster + vowel signs); Unicode stores it before.
 * Half letters are capitals (K = प्, G = न्, S = क्, : = स् …); a half letter + `f` (the ा bar) makes the full letter
 * (If = क्ष, 0f = ण), so the converter drops "्ा".
 *
 * Unknown characters pass through unchanged. Mappings where Preeti fonts in the wild differ, or where we are less sure,
 * are marked "(less common)" and only used in the Preeti → Unicode direction unless noted.
 */

import { ENGLISH } from "./english.js";

const VERSION = "1.1.0";

/** Single Preeti keys → Unicode. */
const SINGLE: Record<string, string> = {
  // Lower row letters
  a: "ब", b: "द", c: "अ", d: "म", e: "भ", f: "ा", g: "न", h: "ज", i: "ष्", j: "व", k: "प", l: "ि",
  n: "ल", o: "य", p: "उ", q: "त्र", r: "च", s: "क", t: "त", u: "ग", v: "ख", w: "ध", x: "ह", y: "थ", z: "श",
  // Shifted letters: mostly half forms
  A: "ब्", B: "द्य", C: "ऋ", D: "म्", E: "भ्", F: "ँ", G: "न्", H: "ज्", I: "क्ष्", J: "व्", K: "प्", L: "ी",
  M: "ः", N: "ल्", O: "इ", P: "ए", Q: "त्त", R: "च्", S: "क्", T: "त्", U: "ग्", V: "ख्", W: "ध्", X: "ह्",
  Y: "थ्", Z: "श्",
  // Number row: plain digits are letters, shifted digits are Devanagari numerals
  "1": "ज्ञ", "2": "द्द", "3": "घ", "4": "द्ध", "5": "छ", "6": "ट", "7": "ठ", "8": "ड", "9": "ढ", "0": "ण्",
  "!": "१", "@": "२", "#": "३", "$": "४", "%": "५", "^": "६", "&": "७", "*": "८", "(": "९", ")": "०",
  "-": "(", _: ")", "=": ".", "+": "ं",
  // Punctuation keys
  "/": "र", ";": "स", ":": "स्", "'": "ु", '"': "ू", "[": "ृ", "\\": "्", "]": "े", "}": "ै", "|": "्र",
  ".": "।", "?": "रु", "<": "?", ">": "श्र",
  // Extended (Alt) glyphs
  "¿": "रू", "«": "्र", "`": "ञ", "~": "ञ्", "ª": "ङ", "ç": "ॐ", "÷": "/",
  // Latin-1 / Windows-1252 glyph slots (1.1.0). Cross-checked against the open-source Preeti tables in
  // nepali-bhasa/ttf-to-unicode, Shuvayatra/preeti and casualsnek/npttf2utf (all three agree unless noted).
  "Ë": "ङ्ग", "Í": "ङ्क", "Î": "ङ्ख", "‹": "ङ्घ", "å": "द्व", "ß": "द्म", "¢": "द्घ", "›": "द्र", "„": "ध्र",
  "§": "ट्ट", "Ý": "ट्ठ", "¶": "ठ्ठ", "•": "ड्ड", "Ì": "न्न", "Å": "हृ", "Ø": "्य",
  "¡": "ज्ञ्", "£": "घ्", "¤": "झ्", "‰": "झ्", "´": "झ", "ˆ": "फ्",
  "¥": "र्\u200d", // eyelash ra र्‍ (npttf2utf reads it as ्र; the other two tables as र्‍)
  "°": "ड्ढ", // the three tables say ङ्ढ, a cluster Nepali never uses; cimplesid/unicode-preeti-js reads ड्ढ (बुड्ढो)
  "‘": "ॅ", "˜": "ऽ",
  // Punctuation that Preeti draws from high slots
  "Ö": "=", "Ù": ";", "Ú": "’", "Û": "!", "Ü": "%", "±": "+", "×": "×", "…": "‘", "æ": "“", "Æ": "”",
};

/** Windows-1252 slots 0x80–0x9F can come out of a PDF as raw C1 control codes instead; read those the same way. */
const CP1252_C1: [number, string][] = [[0x84, "„"], [0x85, "…"], [0x88, "ˆ"], [0x89, "‰"], [0x8b, "‹"], [0x91, "‘"], [0x95, "•"], [0x98, "˜"], [0x9b, "›"]];
for (const [cp, ch] of CP1252_C1) SINGLE[String.fromCharCode(cp)] = SINGLE[ch] as string;

/** Multi-key Preeti sequences, matched longest first. `m` is the tail glyph that turns प→फ, भ→झ, उ→ऊ. */
const MULTI: Record<string, string> = {
  "k|m": "फ्र",
  "cf}": "औ", "cf]": "ओ", cf: "आ", "O{": "ई", "P]": "ऐ", pm: "ऊ", km: "फ", em: "झ",
  qm: "क्र", Qm: "क्त", // (less common) ligature glyphs; Unicode → Preeti writes s| and St instead
  "8Þ": "\u0921\u093C", "9Þ": "\u0922\u093C", // (less common) Þ is the nukta glyph; only read after ड/ढ (cimplesid/unicode-preeti-js)
};
const MULTI_MAX = 3;

/** Private-use placeholder (U+E000) for a reph while reordering. Built from the code point so no transport can strip it. */
const REPH = String.fromCharCode(0xe000);
const CONS = "[\\u0915-\\u0939\\u0958-\\u095F]\\u093C?";
const CLUSTER = `(?:${CONS}\\u094D)*${CONS}(?:\\u094D\\u0930)?`;
const SIGNS = "[\\u093E-\\u094C\\u0901\\u0902]";

const P2U_I = new RegExp(`\\u093F(${CLUSTER})`, "g");
const P2U_REPH = new RegExp(`(${CLUSTER}${SIGNS}*)${REPH}`, "g");
const U2P_REPH = new RegExp(`\\u0930\\u094D(${CLUSTER}${SIGNS}*)`, "g");
const U2P_I = new RegExp(`(${CLUSTER})\\u093F`, "g");
const REPH_ALL = new RegExp(REPH, "g");

const VOWEL_FIX: [RegExp, string][] = [
  [/अा/g, "आ"], [/आे/g, "ओ"], [/आै/g, "औ"], [/एे/g, "ऐ"], [/ाे|ेा/g, "ो"], [/ाै|ैा/g, "ौ"],
];

export interface PreetiOptions {
  /** Leave real English words, acronyms, numbers, URLs and emails alone (see convertMixed). Default false. */
  keepEnglish?: boolean;
}

/** Convert Preeti-encoded ASCII text to Unicode Devanagari. With `{ keepEnglish: true }` it behaves like convertMixed(). */
export function preetiToUnicode(input: string, opts?: PreetiOptions): string {
  if (opts?.keepEnglish) return convertMixed(input);
  return convertAll(input);
}

function convertAll(input: string): string {
  let out = "";
  let i = 0;
  while (i < input.length) {
    let hit = false;
    for (let len = MULTI_MAX; len >= 2; len--) {
      const seq = input.substr(i, len);
      if (seq.length === len && MULTI[seq] !== undefined) {
        out += MULTI[seq];
        i += len;
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const ch = input.charAt(i);
    out += ch === "{" ? REPH : SINGLE[ch] ?? ch;
    i += 1;
  }
  out = out.replace(/्ा/g, ""); // half letter + ा bar = full letter
  out = out.replace(P2U_I, "$1ि");
  out = out.replace(P2U_REPH, "र्$1").replace(REPH_ALL, "र्");
  for (const [re, to] of VOWEL_FIX) out = out.replace(re, to);
  return out;
}

// ---- Unicode → Preeti -----------------------------------------------------------------------------------------------

/** Consonant → [full glyph, half glyph | null]. Without a half glyph the half form is full + `\` (halant). */
const CONSONANTS: Record<string, [string, string | null]> = {
  क: ["s", "S"], ख: ["v", "V"], ग: ["u", "U"], घ: ["3", null], ङ: ["ª", null], च: ["r", "R"], छ: ["5", null],
  ज: ["h", "H"], झ: ["em", null], ञ: ["`", "~"], ट: ["6", null], ठ: ["7", null], ड: ["8", null], ढ: ["9", null],
  ण: ["0f", "0"], त: ["t", "T"], थ: ["y", "Y"], द: ["b", null], ध: ["w", "W"], न: ["g", "G"], प: ["k", "K"],
  फ: ["km", null], ब: ["a", "A"], भ: ["e", "E"], म: ["d", "D"], य: ["o", null], र: ["/", null], ल: ["n", "N"],
  व: ["j", "J"], श: ["z", "Z"], ष: ["if", "i"], स: [";", ":"], ह: ["x", "X"],
};
/** Round-bottomed letters take the « ra-kaar (ट्र = 6«); the rest take |. */
const ROUND_RA = new Set(["ट", "ठ", "ड", "ढ"]);

/** Fixed conjuncts with their own Preeti key, longest first. 'क्ष्' only applies before another consonant. */
const CONJUNCTS: [string, string][] = [
  ["क्ष्", "I"], ["फ्र", "k|m"], ["क्ष", "If"], ["ज्ञ", "1"], ["त्र", "q"], ["त्त", "Q"], ["द्य", "B"], ["द्द", "2"],
  ["द्ध", "4"], ["श्र", ">"], ["रु", "?"], ["रू", "¿"],
];

const OTHERS: Record<string, string> = {
  अ: "c", आ: "cf", इ: "O", ई: "O{", उ: "p", ऊ: "pm", ऋ: "C", ए: "P", ऐ: "P]", ओ: "cf]", औ: "cf}",
  "ा": "f", "ि": "l", "ी": "L", "ु": "'", "ू": '"', "ृ": "[", "े": "]", "ै": "}", "ो": "f]", "ौ": "f}",
  "ं": "+", "ँ": "F", "ः": "M", "्": "\\", "।": ".", "ॐ": "ç",
  "०": ")", "१": "!", "२": "@", "३": "#", "४": "$", "५": "%", "६": "^", "७": "&", "८": "*", "९": "(",
  // ASCII digits and the punctuation that Preeti draws from other keys (plain "1" would draw ज्ञ).
  "0": ")", "1": "!", "2": "@", "3": "#", "4": "$", "5": "%", "6": "^", "7": "&", "8": "*", "9": "(",
  "(": "-", ")": "_", ".": "=", "?": "<", "/": "÷",
  [REPH]: "{",
};

const isCons = (c: string | undefined) => c !== undefined && CONSONANTS[c] !== undefined;

/** Convert Unicode Devanagari to Preeti-encoded ASCII (paste it into a document set in the Preeti font). */
export function unicodeToPreeti(input: string): string {
  let s = input.replace(U2P_REPH, (m: string, cl: string, off: number, str: string) => (str[off - 1] === "्" ? m : `${cl}${REPH}`));
  s = s.replace(U2P_I, "ि$1");
  let out = "";
  let i = 0;
  while (i < s.length) {
    let hit = false;
    for (const [u, p] of CONJUNCTS) {
      if (s.startsWith(u, i) && (u !== "क्ष्" || isCons(s[i + 4]))) {
        out += p;
        i += u.length;
        hit = true;
        break;
      }
    }
    if (hit) continue;
    const c = s.charAt(i);
    const glyph = CONSONANTS[c];
    if (glyph) {
      const [full, half] = glyph;
      if (s[i + 1] === "्" && s[i + 2] === "र") {
        out += full + (ROUND_RA.has(c) ? "«" : "|");
        i += 3;
      } else if (s[i + 1] === "्" && isCons(s[i + 2])) {
        out += half ?? `${full}\\`;
        i += 2;
      } else {
        out += full;
        i += 1;
      }
      continue;
    }
    out += OTHERS[c] ?? c;
    i += 1;
  }
  return out;
}

/**
 * Does this look like Preeti-encoded text (ASCII that should be Devanagari)? Useful for detecting pasted legacy text.
 * Heuristic: mostly ASCII, no Devanagari, and Preeti's tell-tale patterns (`f]`, `]g`, `l` before a consonant key, `{`).
 * Since 1.1.0 it also returns false for text that breaks Preeti's key grammar, which is typical of other legacy fonts.
 */
export function looksLikePreeti(text: string): boolean {
  const s = (text ?? "").trim();
  if (!s || /[ऀ-ॿ]/.test(s)) return false;
  const words = s.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return false;
  const tells = words.filter((w) => /f\]|f}|\]k|g\]|cf|l[a-z;:/]|[a-z]\{|[a-z]'|[a-z]"|^[;:/>][a-z]|kf|sf|df|gf/.test(w)).length;
  // English words rarely contain these; Preeti words almost always do.
  const englishish = words.filter((w) => /^[A-Za-z]+[.,!?]?$/.test(w) && /[aeiou]{1}[a-z]*[aeiou]?/i.test(w) && !/f\]|cf|sf|kf|df|gf/.test(w)).length;
  // Other legacy ASCII fonts (Kantipur, Himali, PCS …) look Preeti-ish but break Preeti's grammar: the `m` tail only
  // follows k e p q Q (or a vowel sign typed before it), and `<` (?) / `(` (९) never sit before a letter.
  const anomalies = words.filter((w) => /[^kepqQ'"\]}F|\s]m/.test(w) || /[<(][A-Za-z]/.test(w)).length;
  if (anomalies / words.length >= 0.25) return false;
  return tells / words.length >= 0.4 && tells > englishish;
}

// ---- Mixed English + Preeti -----------------------------------------------------------------------------------------

type Kind = "en" | "preeti" | "keep";
type Lean = "en" | "preeti";
interface Tok { text: string; kind?: Kind; lean?: Lean }

/** Characters that only make sense as Preeti glyphs when they sit inside a word. */
const PREETI_INNER = /[\/;:'"()\[\]{}|\\`~<>?_=+«¿ª¡-ÿ„…ˆ‰‹‘•˜›\u0080-\u009f]/;
const LEAD_PUNCT = /^[("'“‘\[]+/;
const TRAIL_PUNCT = /[.,;:!?)"'”’-]+$/;
const CONTRACTION = /^(s|t|d|m|ll|re|ve)$/;

/** Known English word (all lower, Capitalised or ALL CAPS), allowing common inflections: notices, results, passed, applying … */
function isEnglishWord(w: string): boolean {
  if (!/^([a-z]+|[A-Z][a-z]+|[A-Z]+)$/.test(w)) return false;
  const l = w.toLowerCase();
  if (ENGLISH.has(l)) return true;
  const stems = [/(.{3,})s$/, /(.{3,})es$/, /(.{3,})ed$/, /(.{3,})d$/, /(.{3,})ing$/, /(.{3,})ly$/, /(.{3,})er$/, /(.{3,})ers$/];
  for (const re of stems) {
    const m = re.exec(l);
    if (m && (ENGLISH.has(m[1] as string) || ENGLISH.has(`${m[1]}e`))) return true;
  }
  const y = /(.{2,})(ies|ied)$/.exec(l);
  return !!y && ENGLISH.has(`${y[1]}y`);
}
const isAcronym = (w: string) => /^[A-Z][A-Z0-9&]*[A-Z0-9]$/.test(w) && /[A-Z].*[A-Z]|[A-Z]\d/.test(w);

/** Classify one whitespace-free token. Strong kinds decide; weak tokens lean one way and follow their neighbours. */
function classify(tok: string): Tok {
  if (/[ऀ-ॿ]/.test(tok)) return { text: tok, kind: "keep" };
  if (/^(https?:\/\/|www\.)\S+$/i.test(tok) || /^[\w.+-]+@[\w-]+(\.[\w-]+)+[.,;:]?$/.test(tok)) return { text: tok, kind: "en" };
  const core = tok.replace(LEAD_PUNCT, "").replace(TRAIL_PUNCT, "");
  // Western numbers: dates, amounts, roll numbers. A lone digit is ambiguous (5 = छ, 1 = ज्ञ in Preeti).
  if (/^\d{2,}([.,:\/-]\d+)*$/.test(core) || /^\d+([.,:\/-]\d+)+$/.test(core)) return { text: tok, kind: "en" };
  if (/^\d$/.test(core) || core === "") {
    // Lone digit or punctuation-only token: the Preeti numerals !@#$%^&*() lean Preeti, anything else is neutral.
    return { text: tok, lean: /^[!@#$%^&*()]+$/.test(tok) && tok.length > 1 ? "preeti" : undefined };
  }
  // Preeti numerals typed with Shift (@)*@ = २०८२), possibly with Preeti punctuation around them.
  if (/^[!@#$%^&*()=.,\-_]+$/.test(tok) && (/[@#$%^&*]/.test(tok) || /^[!()]{2,}[.,]?$/.test(tok) && !/^\(!+\)$/.test(tok))) return { text: tok, lean: "preeti" };
  // Ordinals and units: 2nd, 10th, 5km, 4G, B2B, A4, COVID-19.
  if (/^\d+(st|nd|rd|th|am|pm|km|kg|mm|cm|ml|mb|gb|kb|g|k|m|s|x)$/i.test(core) || /^[A-Z]+\d+[A-Z]*$/.test(core) || /^[A-Z]+-\d+$/.test(core)) return { text: tok, kind: "en" };
  if (/^[A-Za-z]+$/.test(core) || /^[A-Za-z]+['’][a-z]{1,2}$/.test(core) || /^[A-Za-z]+\/[A-Za-z]+$/.test(core)) {
    const parts = core.split(/['’\/]/);
    const word = parts[0] as string;
    const apostrophe = /['’]/.test(core);
    if (isAcronym(core)) return { text: tok, kind: "en" };
    const enPart = (p: string) => isEnglishWord(p) || isAcronym(p) || /^[A-Z]{1,3}[a-z]+$/.test(p) && /[aeiouy]/i.test(p);
    if (!apostrophe && parts.length > 1 && parts.every(enPart)) return { text: tok, kind: "en" }; // BE/BArch, and/or
    if (isEnglishWord(word) && parts.slice(1).every((p) => (apostrophe ? CONTRACTION.test(p) : isEnglishWord(p)))) {
      // Short lower-case words (to, do, go …) are also plausible Preeti (तय, मय, नय), so they only lean English.
      return word.length >= 4 || /^[A-Z]/.test(core) || parts.length > 1 ? { text: tok, kind: "en" } : { text: tok, lean: "en" };
    }
  }
  // From here on the token is not a known English word: look for Preeti fingerprints. Only an English-looking word
  // (letters with a vowel) gets its sentence punctuation stripped first; in Preeti ' " ; ? ) are glyphs (u'? = गुरु).
  const bare = tok.replace(/[.,]+$/, "");
  const m = /^[("“‘]*([A-Za-z]+)[)"”’!?:;']?$/.exec(bare);
  const inner = m && /[aeiouy]/i.test(m[1] as string) ? (m[1] as string) : bare;
  if (PREETI_INNER.test(inner)) return { text: tok, kind: "preeti" };
  if (/[a-z][0-9]|[0-9][a-z]/.test(core)) return { text: tok, kind: "preeti" }; // digits are letters in Preeti (af]8{, fli6«o)
  if (/^[A-Za-z]+$/.test(core)) {
    // No vowel: Preeti capitals (I O U A E) are half letters, so only a leading capital vowel counts.
    if (core.length >= 2 && !/[aeiouy]/.test(core.slice(1)) && !/^[AEIOUY][a-z]/.test(core)) return { text: tok, kind: "preeti" }; // glthf, lzIff
    if (/[^aeioufrl]f$/.test(core)) return { text: tok, kind: "preeti" }; // …thf: ा after a consonant key
    if (/^l[b-df-hj-km-np-tv-xzB-DF-HJ-KM-NP-TV-XZ]/.test(core)) return { text: tok, kind: "preeti" }; // ljefu: short i first
    if (/q(?!u)/.test(core) && !/^[A-Z][a-z]*aq$/.test(core)) return { text: tok, kind: "preeti" }; // leq: q = त्र

    if (/[a-z][A-Z]/.test(core) && !/^([A-Z]?[a-z]*[aeiouy][a-z]*)([A-Z][a-z]*[aeiouy][a-z]*)+$/.test(core)) return { text: tok, kind: "preeti" }; // cWoIf, not CamelCase
    if (/[^aeiouAEIOU\W]f[^aeioufltrsy\W]/.test(core)) return { text: tok, lean: "preeti" }; // consonant-ा-consonant
    return { text: tok, lean: /^[A-Z][a-z]+$/.test(core) ? "en" : undefined }; // unknown: follows its neighbours
  }
  return { text: tok, lean: "preeti" };
}

/** Split "Pre-/fli6«o" into an English head and a Preeti tail at the hyphen. */
function splitHyphen(tok: string): Tok[] | null {
  const m = /^([A-Za-z]+-)(.+)$/.exec(tok);
  if (!m) return null;
  const head = (m[1] as string).slice(0, -1);
  if (!(isEnglishWord(head) || isAcronym(head))) return null;
  const tail = classify(m[2] as string);
  return tail.kind === "preeti" ? [{ text: m[1] as string, kind: "en" }, tail] : null;
}

/**
 * Convert a line that mixes real English with Preeti ("Pre-/fli6«o k/LIff af]8{" → "Pre-राष्ट्रिय परीक्षा बोर्ड").
 * Each whitespace-separated token is classified: English (common words, gov/exam terms, acronyms, numbers, URLs,
 * emails) is kept; tokens with Preeti fingerprints are converted; ambiguous tokens (lone digits, short words, Preeti
 * numerals) follow their neighbours. Consecutive Preeti tokens are converted together, so a line with no English in
 * it converts exactly like preetiToUnicode(). Unicode Devanagari is left untouched.
 */
export function convertMixed(text: string): string {
  const input = text ?? "";
  return input.split(/(\r?\n)/).map((line) => (/^\r?\n$/.test(line) ? line : convertLine(line))).join("");
}

function convertLine(line: string): string {
  const parts = line.split(/(\s+)/);
  const toks: (Tok & { space?: boolean })[] = [];
  for (const p of parts) {
    if (p === "") continue;
    if (/^\s+$/.test(p)) { toks.push({ text: p, space: true }); continue; }
    const split = splitHyphen(p);
    if (split) toks.push(...split);
    else toks.push(classify(p));
  }
  const words = toks.filter((t) => !t.space);
  const strong = (t: Tok): Lean | undefined => (t.kind === "en" ? "en" : t.kind === "preeti" || t.kind === "keep" ? "preeti" : undefined);
  const lineDefault: Lean = words.some((t) => t.kind === "preeti") || looksLikePreeti(line) ? "preeti" : "en";
  // Resolve weak tokens from the nearest strong neighbour on each side.
  for (let i = 0; i < words.length; i++) {
    const t = words[i] as Tok;
    if (t.kind) continue;
    let left: Lean | undefined;
    let right: Lean | undefined;
    for (let j = i - 1; j >= 0 && !left; j--) left = strong(words[j] as Tok);
    for (let j = i + 1; j < words.length && !right; j++) right = strong(words[j] as Tok);
    let pick: Lean;
    if (left && right) pick = left === right ? left : t.lean ?? "preeti";
    else pick = left ?? right ?? (t.lean === "preeti" ? "preeti" : lineDefault);
    t.kind = pick;
  }
  let out = "";
  let run = "";
  let pendingSpace = "";
  const flush = () => { if (run) out += convertAll(run); run = ""; };
  for (const t of toks) {
    if (t.space) { if (run) pendingSpace += t.text; else out += t.text; continue; }
    if (t.kind === "preeti") { run += pendingSpace + t.text; pendingSpace = ""; continue; }
    flush();
    out += pendingSpace + t.text;
    pendingSpace = "";
  }
  flush();
  return out + pendingSpace;
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/preeti",
    version: VERSION,
    summary: "Preeti (legacy ASCII Devanagari font) ⇄ Unicode, both directions, with short-i and reph reordering, half letters, ra-kaar, conjunct keys and Preeti numerals; convertMixed() for lines mixing English and Preeti; plus looksLikePreeti() to detect pasted legacy text. Pure JS, zero dependencies.",
    commands: [
      { name: "preetiToUnicode", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "unicodeToPreeti", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "convertMixed", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "looksLikePreeti", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "boolean" },
    ],
  };
}
