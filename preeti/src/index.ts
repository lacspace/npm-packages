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

const VERSION = "1.0.0";

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
};

/** Multi-key Preeti sequences, matched longest first. `m` is the tail glyph that turns प→फ, भ→झ, उ→ऊ. */
const MULTI: Record<string, string> = {
  "k|m": "फ्र",
  "cf}": "औ", "cf]": "ओ", cf: "आ", "O{": "ई", "P]": "ऐ", pm: "ऊ", km: "फ", em: "झ",
  qm: "क्र", Qm: "क्त", // (less common) ligature glyphs; Unicode → Preeti writes s| and St instead
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

/** Convert Preeti-encoded ASCII text to Unicode Devanagari. */
export function preetiToUnicode(input: string): string {
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
 */
export function looksLikePreeti(text: string): boolean {
  const s = (text ?? "").trim();
  if (!s || /[ऀ-ॿ]/.test(s)) return false;
  const words = s.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  if (words.length === 0) return false;
  const tells = words.filter((w) => /f\]|f}|\]k|g\]|cf|l[a-z;:/]|[a-z]\{|[a-z]'|[a-z]"|^[;:/>][a-z]|kf|sf|df|gf/.test(w)).length;
  // English words rarely contain these; Preeti words almost always do.
  const englishish = words.filter((w) => /^[A-Za-z]+[.,!?]?$/.test(w) && /[aeiou]{1}[a-z]*[aeiou]?/i.test(w) && !/f\]|cf|sf|kf|df|gf/.test(w)).length;
  return tells / words.length >= 0.4 && tells > englishish;
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/preeti",
    version: VERSION,
    summary: "Preeti (legacy ASCII Devanagari font) ⇄ Unicode, both directions, with short-i and reph reordering, half letters, ra-kaar, conjunct keys and Preeti numerals; plus looksLikePreeti() to detect pasted legacy text. Pure JS, zero dependencies.",
    commands: [
      { name: "preetiToUnicode", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "unicodeToPreeti", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "looksLikePreeti", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "boolean" },
    ],
  };
}
