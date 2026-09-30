import { devanagariToLatin, isDevanagari } from "./devanagari.js";

// Honorifics / titles to strip before matching, Latin + Devanagari.
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "professor", "shri", "sri", "smt", "kumari", "km",
  "hon", "honble", "honorable", "honourable", "rt", "adv", "advocate", "ca", "er", "engineer",
  "श्री", "श्रीमती", "डा", "डाक्टर",
  "माननीय", "सुश्री", "कुमारी", "प्राध्यापक",
]);

export type Lang = "en" | "ne" | "auto";

export function detectScript(text: string): "ne" | "en" {
  let deva = 0;
  let latin = 0;
  for (const ch of text) {
    if (isDevanagari(ch)) deva++;
    else if (/[A-Za-z]/.test(ch)) latin++;
  }
  return deva > latin ? "ne" : "en";
}

/** Remove leading/standalone honorifics and titles from a name. */
export function stripHonorifics(name: string): string {
  const parts = name
    .replace(/[.,]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((p) => !HONORIFICS.has(p.toLowerCase().replace(/[^a-zऀ-ॿ]/g, "")));
  return parts.join(" ").trim();
}

// Fold Latin romanization variants into one phonetic key (a lightweight Soundex
// for Nepali romanization). Poudel/Paudel/Paudyal → same key.
export function phoneticKey(latin: string): string {
  let s = latin.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return "";
  s = s
    .replace(/chh/g, "C").replace(/ch/g, "C")
    .replace(/sh/g, "S").replace(/ss/g, "S")
    .replace(/ph/g, "F").replace(/f/g, "F")
    .replace(/kh/g, "K").replace(/gh/g, "G").replace(/th/g, "T").replace(/dh/g, "D").replace(/bh/g, "B").replace(/jh/g, "J")
    .replace(/w/g, "V").replace(/v/g, "V")
    .replace(/y/g, "");
  // Collapse vowel groups into classes.
  s = s
    .replace(/(ou|au|oo|ow)/g, "O")
    .replace(/(aa|ah)/g, "A")
    .replace(/(ee|ie|ei)/g, "I")
    .replace(/(oo|uu)/g, "U");
  s = s.replace(/[aeiou]/g, "a"); // remaining single vowels → neutral
  s = s.replace(/(.)\1+/g, "$1"); // drop doubled letters
  s = s.replace(/a+$/g, ""); // drop trailing inherent vowel
  return s.toUpperCase();
}

/** Romanize a name to a normalized Latin form (Devanagari input is transliterated first). */
export function normalizeName(name: string): string {
  const stripped = stripHonorifics(name);
  const romanized = detectScript(stripped) === "ne" ? devanagariToLatin(stripped) : stripped;
  return romanized.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function sim(a: string, b: string): number {
  if (!a && !b) return 1;
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - levenshtein(a, b) / max;
}

export interface NameVariantsOptions {
  /** Maximum variants to return. Default 12. */
  max?: number;
}

const VARIANT_SWAPS: [RegExp, string][] = [
  [/ou/g, "au"], [/au/g, "ou"], [/oo/g, "u"], [/ee/g, "i"], [/ph/g, "f"], [/f/g, "ph"],
  [/w/g, "v"], [/v/g, "w"], [/sh/g, "s"], [/(.)\1/g, "$1"],
];

/** Generate common spelling variants of a (Latin) name for matching/search. */
export function nameVariants(name: string, options: NameVariantsOptions = {}): string[] {
  const max = options.max ?? 12;
  const base = detectScript(name) === "ne" ? devanagariToLatin(stripHonorifics(name)) : stripHonorifics(name);
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (v: string) => {
    const t = v.trim();
    const k = t.toLowerCase();
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  };
  add(base);
  const lower = base.toLowerCase();
  for (const [re, to] of VARIANT_SWAPS) {
    if (re.test(lower)) add(base.replace(re, to));
  }
  // Titlecase form.
  add(base.replace(/\b\w/g, (c) => c.toUpperCase()));
  return out.slice(0, max);
}

export interface MatchNameOptions {
  /** Similarity 0–1 required to call it a match. Default 0.82. */
  threshold?: number;
  /** Known canonical names (any script) — a hit returns that spelling as `canonical`. */
  gazetteer?: string[];
}

export interface MatchNameResult {
  match: boolean;
  score: number;
  /** The gazetteer spelling this matched, if any. */
  canonical?: string;
  a: string;
  b: string;
}

/** Compare two names across scripts and spellings. Returns a similarity and a match flag. */
export function matchName(a: string, b: string, options: MatchNameOptions = {}): MatchNameResult {
  const threshold = options.threshold ?? 0.82;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const score = matchNormalized(na, nb);
  const result: MatchNameResult = { match: score >= threshold, score: round(score), a: na, b: nb };
  if (options.gazetteer) {
    let best: { name: string; score: number } | null = null;
    for (const g of options.gazetteer) {
      const s = Math.max(matchNormalized(na, normalizeName(g)), matchNormalized(nb, normalizeName(g)));
      if (!best || s > best.score) best = { name: g, score: s };
    }
    if (best && best.score >= threshold) result.canonical = best.name;
  }
  return result;
}

function consonants(s: string): string {
  return s.toLowerCase().replace(/[^a-z]/g, "").replace(/[aeiou]/g, "");
}
function isSubsequence(short: string, long: string): boolean {
  let i = 0;
  for (const ch of long) if (i < short.length && ch === short[i]) i++;
  return i === short.length;
}
function partSim(a: string, b: string): number {
  const base = Math.max(sim(phoneticKey(a), phoneticKey(b)), sim(a, b));
  // Abbreviation / initial: a short all-consonant part whose letters appear in
  // order in the longer part (bdr ⊂ bahadur, k ⊂ kp) counts as a strong match.
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length <= 3 && isSubsequence(consonants(s), consonants(l))) return Math.max(base, 0.9);
  return base;
}

function matchNormalized(a: string, b: string): number {
  const pa = a.split(" ").filter(Boolean);
  const pb = b.split(" ").filter(Boolean);
  if (!pa.length || !pb.length) return 0;

  // Whole-string similarity — robust when one script wrote a name as one token
  // (रामचन्द्र) and the other split it ("Ram Chandra").
  const whole = sim(phoneticKey(pa.join("")), phoneticKey(pb.join("")));

  // Order-independent best pairing of name parts.
  const [small, large] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const usedLarge = new Set<number>();
  let total = 0;
  for (const part of small) {
    let best = 0;
    let bestIdx = -1;
    large.forEach((lp, idx) => {
      if (usedLarge.has(idx)) return;
      const s = partSim(part, lp);
      if (s > best) {
        best = s;
        bestIdx = idx;
      }
    });
    if (bestIdx >= 0) usedLarge.add(bestIdx);
    total += best;
  }
  const parts = total / large.length;
  return Math.max(whole, parts);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export { phoneticKey as _phoneticKey };
