import { BASE_WORDS, LOANS } from "./lexicon.js";

/**
 * Romanised Nepali → Devanagari typing ("namaste" → नमस्ते, "mero desh" → मेरो देश) with candidates
 * per word, like a phonetic input method. Two layers:
 *   1. a lexicon matched through a loose key that forgives the usual romanisation variance
 *      (aa/a, ee/i, sh/s, v/w/b, ch/chh, dropped schwas, nasals), ranked by frequency;
 *   2. a phonetic engine for words the lexicon doesn't know (ITRANS-style capitals T D N Sh → ट ड ण ष).
 * Feed your own Nepali text with buildLexicon() and let learn() remember what users pick.
 * Pure JS, no dependencies, React Native safe.
 */

const VERSION = "1.0.0";

// ---- loose keys --------------------------------------------------------------------------------------------------

const DEV_CONS: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "c", छ: "c", ज: "j", झ: "jh", ञ: "n", ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n",
  त: "t", थ: "th", द: "d", ध: "dh", न: "n", प: "p", फ: "f", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "b",
  श: "s", ष: "s", स: "s", ह: "h", ड़: "d", ढ़: "dh",
};
const DEV_VOWEL: Record<string, string> = { अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ऋ: "ri", ए: "e", ऐ: "ai", ओ: "o", औ: "au" };
const DEV_MATRA: Record<string, string> = { "ा": "a", "ि": "i", "ी": "i", "ु": "u", "ू": "u", "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au" };
const VIRAMA = "्";

const finish = (k: string) => { const c = k.replace(/(.)\1+/g, "$1"); const t = c.replace(/a+$/, ""); return t || c; };

/** Loose key of a Devanagari word: what a typist would plausibly romanise it as, with variance folded. */
export function devKey(word: string): string {
  const s = word.normalize("NFC").replace(/[‌‍]/g, "");
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === "ज" && s[i + 1] === VIRAMA && s[i + 2] === "ञ") { out += "gy"; i += 2; if (!DEV_MATRA[s[i + 1] ?? ""] && s[i + 1] !== VIRAMA) out += "a"; continue; }
    if (ch === "क" && s[i + 1] === VIRAMA && s[i + 2] === "ष") { out += "ks"; i += 2; if (!DEV_MATRA[s[i + 1] ?? ""] && s[i + 1] !== VIRAMA) out += "a"; continue; }
    const c = DEV_CONS[ch];
    if (c) {
      out += c;
      const nx = s[i + 1] === "़" ? s[i + 2] : s[i + 1];
      if (s[i + 1] === "़") i++;
      if (nx !== VIRAMA && !(nx && DEV_MATRA[nx])) out += "a";
      continue;
    }
    if (DEV_VOWEL[ch]) { out += DEV_VOWEL[ch]; continue; }
    if (DEV_MATRA[ch]) { out += DEV_MATRA[ch]; continue; }
    if (ch === "ं" || ch === "ँ") { out += "n"; continue; }
  }
  return finish(out);
}

/** Loose key of a romanised word. */
export function latinKey(word: string): string {
  let s = word.toLowerCase().replace(/[^a-z]/g, "");
  s = s.replace(/chh/g, "c").replace(/ch/g, "c").replace(/sh/g, "s").replace(/ph/g, "f").replace(/[wv]/g, "b").replace(/z/g, "j").replace(/q/g, "k").replace(/x/g, "ks")
    .replace(/ee|ii/g, "i").replace(/oo|uu/g, "u").replace(/ou/g, "au").replace(/aa/g, "a")
    .replace(/m(?=[pbf])/g, "n").replace(/ng(?=[^aeiou]|$)/g, "n");
  return finish(s);
}

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const cheap = (c: string) => (c === "a" ? 0.35 : VOWELS.has(c) ? 0.6 : c === "h" || c === "y" ? 0.45 : c === "n" || c === "m" ? 0.5 : 1);
/** Weighted edit distance: schwas, vowels, aspiration and nasals are cheap to add or drop. */
function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = new Array<number>(n + 1);
  prev[0] = 0;
  for (let j = 1; j <= n; j++) prev[j] = prev[j - 1]! + cheap(b[j - 1]!);
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = prev[0]! + cheap(a[i - 1]!);
    for (let j = 1; j <= n; j++) {
      const x = a[i - 1]!, y = b[j - 1]!;
      const sub = x === y ? 0 : VOWELS.has(x) && VOWELS.has(y) ? 0.5 : 1;
      cur[j] = Math.min(prev[j - 1]! + sub, prev[j]! + cheap(x), cur[j - 1]! + cheap(y));
    }
    prev = cur;
  }
  return prev[n]!;
}
const skeleton = (k: string) => k.replace(/[aeiouhnmy]/g, "").replace(/(.)\1+/g, "$1");

// ---- phonetic engine ----------------------------------------------------------------------------------------------

interface Flags { finalA?: "aa" | "a"; innerA?: "a" | "aa"; finalI?: "ii" | "i"; s?: "स" | "श"; retroT?: boolean; retroD?: boolean; longU?: boolean }
const DEFAULT: Flags = { finalA: "aa", innerA: "a", finalI: "ii", s: "स" };

const LAT_CONS: [string, string][] = [
  ["ksh", "क्ष"], ["chh", "छ"], ["Sh", "ष"], ["Th", "ठ"], ["Dh", "ढ"], ["gy", "ज्ञ"],
  ["kh", "ख"], ["gh", "घ"], ["ch", "च"], ["jh", "झ"], ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"], ["sh", "श"],
  ["T", "ट"], ["D", "ड"], ["N", "ण"], ["k", "क"], ["g", "ग"], ["c", "च"], ["j", "ज"], ["t", "त"], ["d", "द"], ["n", "न"],
  ["p", "प"], ["f", "फ"], ["b", "ब"], ["m", "म"], ["y", "य"], ["r", "र"], ["l", "ल"], ["w", "व"], ["v", "व"], ["s", "स"],
  ["h", "ह"], ["z", "ज"], ["q", "क"], ["x", "क्स"],
];
const LAT_VOW: [string, string, string][] = [ // latin, independent, matra
  ["aa", "आ", "ा"], ["ai", "ऐ", "ै"], ["au", "औ", "ौ"], ["ou", "औ", "ौ"], ["ee", "ई", "ी"], ["ii", "ई", "ी"], ["oo", "ऊ", "ू"], ["uu", "ऊ", "ू"],
  ["a", "अ", ""], ["i", "इ", "ि"], ["e", "ए", "े"], ["u", "उ", "ु"], ["o", "ओ", "ो"], ["A", "आ", "ा"], ["I", "ई", "ी"], ["U", "ऊ", "ू"],
];

/** Phonetic spelling of one romanised word (no lexicon). */
export function phonetic(word: string, flags: Flags = DEFAULT): string {
  const f = { ...DEFAULT, ...flags };
  let out = "";
  let i = 0;
  let afterCons = false;
  const w = word;
  const lower = word.toLowerCase();
  while (i < w.length) {
    // ITRANS capitals (T Th D Dh N Sh) are case-sensitive; everything else matches lowercased.
    const cons = LAT_CONS.find(([k]) => /^[A-Z]/.test(k) && w.startsWith(k, i)) ?? LAT_CONS.find(([k]) => /^[a-z]/.test(k) && lower.startsWith(k, i));
    if (cons) {
      let dev = cons[1];
      if (cons[0] === "s" && f.s === "श") dev = "श";
      if (f.retroT && cons[0] === "t") dev = "ट";
      if (f.retroT && cons[0] === "th") dev = "ठ";
      if (f.retroD && cons[0] === "d") dev = "ड";
      if (f.retroD && cons[0] === "dh") dev = "ढ";
      // m/n before a labial consonant → anusvara
      if ((cons[0] === "m") && afterCons === false && /^(?:p|b|bh|ph|m)/.test(w.slice(i + 1).toLowerCase()) && out) { out += "ं"; i += 1; continue; }
      if (afterCons) out += VIRAMA;
      out += dev;
      afterCons = true;
      i += cons[0].length;
      continue;
    }
    const v = LAT_VOW.find(([k]) => /^[A-Z]/.test(k) && w.startsWith(k, i)) ?? LAT_VOW.find(([k]) => /^[a-z]/.test(k) && lower.startsWith(k, i));
    if (v) {
      const atEnd = i + v[0].length >= w.length;
      if (afterCons) {
        let m = v[2];
        if (v[0] === "a") m = atEnd ? (f.finalA === "aa" ? "ा" : "") : f.innerA === "aa" ? "ा" : "";
        if (v[0] === "i" && atEnd && f.finalI === "ii") m = "ी";
        if (v[0] === "u" && f.longU) m = "ू";
        out += m;
      } else out += v[1];
      afterCons = false;
      i += v[0].length;
      continue;
    }
    out += w[i];
    afterCons = false;
    i++;
  }
  return out;
}

function phoneticVariants(word: string): string[] {
  const set: Flags[] = [
    DEFAULT, { finalA: "a" }, { innerA: "aa" }, { finalI: "i" }, { s: "श" }, { retroT: true }, { retroD: true }, { longU: true },
    { finalA: "a", innerA: "aa" }, { innerA: "aa", finalI: "i" },
  ];
  return [...new Set(set.map((fl) => phonetic(word, fl)))];
}

// ---- lexicon + typer ---------------------------------------------------------------------------------------------

export type Lexicon = Record<string, number>;
// Longest first.
const SUFFIXES: [string, string][] = [
  ["harulai", "हरूलाई"], ["haruko", "हरूको"], ["harule", "हरूले"], ["haruka", "हरूका"], ["harubata", "हरूबाट"], ["haru", "हरू"],
  ["bhitra", "भित्र"], ["dekhi", "देखि"], ["samma", "सम्म"], ["sanga", "सँग"], ["bata", "बाट"], ["lai", "लाई"], ["lagi", "लागि"],
  ["ko", "को"], ["ka", "का"], ["ki", "की"], ["le", "ले"], ["ma", "मा"],
];
const DEV_TOKEN = /[ऀ-ॣॱ-ॿ‌‍]+/g;

/** Count Devanagari words in your own text (published stories, comments) to make a lexicon. */
export function buildLexicon(texts: string | string[]): Lexicon {
  const out: Lexicon = {};
  for (const t of Array.isArray(texts) ? texts : [texts]) for (const m of t.normalize("NFC").matchAll(DEV_TOKEN)) {
    const w = m[0].replace(/^[‌‍]+|[‌‍]+$/g, "");
    if (w.length >= 1 && /[अ-ह]/.test(w)) out[w] = (out[w] ?? 0) + 1;
  }
  return out;
}

export interface TyperOptions {
  /** Extra words: a list, or word → count (e.g. from buildLexicon). Merged with the bundled base list. */
  words?: string[] | Lexicon;
  /** Skip the bundled base list. */
  noBase?: boolean;
  /** Previously exported learn() data. */
  learned?: Record<string, Record<string, number>>;
}
export interface SuggestOptions {
  /** Max candidates (default 5). */
  limit?: number;
  /** Include longer words that start with what was typed (autocomplete). Default true. */
  complete?: boolean;
}
export interface ConvertOptions {
  /** Western digits → Devanagari digits (default true). */
  digits?: boolean;
  /** A sentence-ending "." → "।" (default true). */
  danda?: boolean;
  /** Words to keep in Latin (case-insensitive), e.g. brand names. ALL-CAPS words are kept by default. */
  keep?: string[];
}

interface Entry { word: string; key: string; weight: number }

export interface Typer {
  /** Candidates for one romanised word, best first. */
  suggest(roman: string, options?: SuggestOptions): string[];
  /** Convert a whole romanised line/text, taking the best candidate for each word. */
  convert(text: string, options?: ConvertOptions): string;
  /** Remember that the user picked `chosen` for `roman` (moves it to the top next time). */
  learn(roman: string, chosen: string): void;
  /** Add words (list or word → count). */
  addWords(words: string[] | Lexicon): void;
  /** Learned picks, to persist (AsyncStorage, localStorage…) and pass back as `learned`. */
  exportLearned(): Record<string, Record<string, number>>;
  /** Number of words in the lexicon. */
  size(): number;
}

export function createTyper(options: TyperOptions = {}): Typer {
  const entries = new Map<string, Entry>();
  const bySkel = new Map<string, Entry[]>();
  const learned = new Map<string, Map<string, number>>();
  const add = (word: string, weight: number) => {
    const w = word.normalize("NFC");
    const e = entries.get(w);
    if (e) { e.weight += weight; return; }
    const key = devKey(w);
    if (!key) return;
    const entry = { word: w, key, weight };
    entries.set(w, entry);
    const sk = skeleton(key);
    (bySkel.get(sk) ?? bySkel.set(sk, []).get(sk)!).push(entry);
  };
  const addWords = (words: string[] | Lexicon) => {
    if (Array.isArray(words)) words.forEach((w, i) => add(w, 50 / (1 + i / 100)));
    else for (const [w, c] of Object.entries(words)) add(w, c);
  };
  if (!options.noBase) BASE_WORDS.forEach((w, i) => add(w, 100 / (1 + i / 150)));
  if (options.words) addWords(options.words);
  for (const [r, picks] of Object.entries(options.learned ?? {})) learned.set(r, new Map(Object.entries(picks)));

  const lexical = (roman: string, complete: boolean): [string, number][] => {
    const key = latinKey(roman);
    const out: [string, number][] = [];
    if (!key) return out;
    const max = Math.max(0.8, key.length * 0.27);
    for (const e of bySkel.get(skeleton(key)) ?? []) {
      const d = distance(key, e.key);
      if (d <= max) out.push([e.word, d * 2 - Math.log10(1 + e.weight) * 0.6]);
    }
    if (complete && key.length >= 2) {
      for (const e of entries.values()) if (e.key.length > key.length && e.key.startsWith(key)) out.push([e.word, 1.2 + (e.key.length - key.length) * 0.15 - Math.log10(1 + e.weight) * 0.6]);
    }
    return out.sort((x, y) => x[1] - y[1]);
  };

  const suggest = (roman: string, o: SuggestOptions = {}): string[] => {
    const limit = o.limit ?? 5;
    const raw = roman.trim();
    if (!raw) return [];
    const scored = new Map<string, number>();
    const put = (w: string, s: number) => { if (!scored.has(w) || scored.get(w)! > s) scored.set(w, s); };
    const picks = learned.get(raw.toLowerCase());
    if (picks) for (const [w, c] of picks) put(w, -10 - c);
    const loan = LOANS[raw.toLowerCase()];
    if (loan) put(loan, -5);
    for (const [w, sc] of lexical(raw, o.complete !== false)) put(w, sc);
    // Case endings typed on the word: "ankale" → अंक + ले, "netaharulai" → नेता + हरूलाई.
    const low = raw.toLowerCase();
    for (const [lat, dev] of SUFFIXES) {
      if (low.length - lat.length < 2 || !low.endsWith(lat)) continue;
      for (const [w, sc] of lexical(raw.slice(0, -lat.length), false).slice(0, 2)) put(w + dev, sc + 0.25);
      break;
    }
    // Phonetic spellings are always offered, after confident lexicon hits.
    // A lexicon hit within the distance budget beats a guess; with none, the phonetic spelling leads.
    const best = Math.min(...[...scored.values()].filter((v) => v > -5), Infinity);
    const base = Number.isFinite(best) ? Math.max(best + 0.4, 0.9) : 0.9;
    phoneticVariants(raw).forEach((w, i) => put(w, base + (i === 0 ? 0 : 0.7) + i * 0.05));
    return [...scored.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit).map(([w]) => w);
  };

  const convert = (text: string, o: ConvertOptions = {}): string => {
    const keep = new Set((o.keep ?? []).map((k) => k.toLowerCase()));
    let out = text.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (w) => (keep.has(w.toLowerCase()) || (w.length > 1 && w === w.toUpperCase()) ? w : suggest(w, { limit: 1, complete: false })[0] ?? w));
    if (o.digits !== false) out = out.replace(/[0-9]/g, (d) => "०१२३४५६७८९"[+d]!);
    if (o.danda !== false) out = out.replace(/(?<=[ऀ-ॿ])\.(?=\s|$)/g, "।");
    return out;
  };

  return {
    suggest,
    convert,
    learn(roman, chosen) {
      const r = roman.trim().toLowerCase();
      const m = learned.get(r) ?? learned.set(r, new Map()).get(r)!;
      m.set(chosen, (m.get(chosen) ?? 0) + 1);
      add(chosen, 5);
    },
    addWords,
    exportLearned() {
      const o: Record<string, Record<string, number>> = {};
      for (const [r, m] of learned) o[r] = Object.fromEntries(m);
      return o;
    },
    size: () => entries.size,
  };
}

let shared: Typer | undefined;
const def = () => (shared ??= createTyper());
/** Candidates for one word with the bundled lexicon. */
export const suggest = (roman: string, options?: SuggestOptions) => def().suggest(roman, options);
/** Convert romanised text with the bundled lexicon: toDevanagari("mero desh nepal") → "मेरो देश नेपाल". */
export const toDevanagari = (text: string, options?: ConvertOptions) => def().convert(text, options);

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/nepali-typing",
    version: VERSION,
    summary: "Romanised Nepali → Devanagari typing with per-word candidates (like a phonetic input method): lexicon matched by a loose key that forgives romanisation variance, ranked by frequency, plus a phonetic engine (ITRANS capitals T D N Sh for retroflex); buildLexicon() from your own text; learn() remembers picks. Pure JS, zero dependencies.",
    commands: [
      { name: "suggest", input: { type: "object", properties: { word: { type: "string" }, limit: { type: "integer" } }, required: ["word"] }, output: "string[]" },
      { name: "toDevanagari", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "string" },
      { name: "buildLexicon", input: { type: "object", properties: { texts: { type: "array", items: { type: "string" } } }, required: ["texts"] }, output: "Record<word, count>" },
    ],
  };
}
