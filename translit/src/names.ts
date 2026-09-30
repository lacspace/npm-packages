import { devanagariToLatin, isDevanagari } from "./devanagari.js";

// Personal honorifics — never part of a real name, safe to drop anywhere. Latin + Devanagari.
const HONORIFICS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "professor", "shri", "sri", "smt", "kumari", "km",
  "hon", "honble", "honorable", "honourable", "rt", "adv", "advocate", "ca", "er", "engineer",
  "श्री", "श्रीमती", "डा", "डाक्टर",
  "माननीय", "सुश्री", "कुमारी", "प्राध्यापक",
]);

// Office / rank titles — stripped only when they LEAD the name (never a mid-name token),
// so a genuine name part is never removed. Latin + Devanagari.
const OFFICE_TITLES = new Set([
  "president", "vicepresident", "vice", "spokesperson", "spokesman", "spokeswoman",
  "ambassador", "minister", "prime", "pm", "dpm", "deputy", "chief", "justice",
  "secretary", "general", "governor", "mayor", "chairman", "chairperson", "chair",
  "leader", "captain", "colonel", "inspector", "commissioner", "director",
  "राष्ट्रपति", "उपराष्ट्रपति", "प्रवक्ता", "राजदूत", "मन्त्री", "प्रधानमन्त्री",
  "उपप्रधानमन्त्री", "सचिव", "न्यायाधीश", "प्रधानन्यायाधीश", "महान्यायाधिवक्ता",
  "सभामुख", "मेयर", "सांसद", "नेता", "गभर्नर", "प्रमुख",
]);

// Trailing respect particles.
const TRAILING = new Set(["ji", "jyu", "ji.", "जी", "ज्यू"]);

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

function cleanToken(p: string): string {
  return p.toLowerCase().replace(/[^a-zऀ-ॿ]/g, "");
}

function isLeadingTitle(p: string): boolean {
  const t = cleanToken(p);
  if (!t) return true; // pure punctuation
  if (HONORIFICS.has(t) || OFFICE_TITLES.has(t)) return true;
  if (/मन्त्री$/.test(t)) return true; // compound: अर्थमन्त्री, गृहमन्त्री, ऊर्जामन्त्री …
  return false;
}

/**
 * Remove honorifics and office titles from a name. Office/rank titles are stripped
 * only when they LEAD the name (so a real name token is never removed mid-name);
 * personal honorifics (Mr, Dr, श्री) are dropped wherever they sit, and trailing
 * respect particles (ji / जी / ज्यू) are removed.
 */
export function stripHonorifics(name: string): string {
  let parts = name.replace(/[.,]/g, " ").split(/\s+/).filter(Boolean);
  // Strip leading titles, but never nuke the last remaining token.
  while (parts.length > 1 && isLeadingTitle(parts[0]!)) parts.shift();
  // Strip trailing respect particles.
  while (parts.length > 1 && TRAILING.has(cleanToken(parts[parts.length - 1]!))) parts.pop();
  // Drop personal honorifics anywhere (they are never a real name token).
  parts = parts.filter((p) => !HONORIFICS.has(cleanToken(p)));
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
    .replace(/w/g, "V").replace(/v/g, "V").replace(/b/g, "V") // व / ब / v / w / b collapse (Deuba ≡ देउवा)
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
  /**
   * Keep the sibilants apart: श/ष ("sh") and स ("s") are treated as distinct
   * consonants, so different Nepali surnames like शाह (Shah) and साह (Sah) do not
   * match. Default false (lenient — sh ≈ s, tolerant of romanization variance).
   */
  strictSibilants?: boolean;
}

export interface MatchNameResult {
  match: boolean;
  score: number;
  /** The gazetteer spelling this matched, if any. */
  canonical?: string;
  a: string;
  b: string;
}

/**
 * Compare two names across scripts and spellings. A match requires BOTH a high
 * similarity AND a per-token safety check: every token must align on its consonant
 * skeleton and syllable count, so two different people who share a surname (Sita
 * Sharma vs Gita Sharma) or differ by one syllable (Sushila vs Sushil, Shahi vs
 * Shah) never come back as the same person.
 */
export function matchName(a: string, b: string, options: MatchNameOptions = {}): MatchNameResult {
  const threshold = options.threshold ?? 0.82;
  const strict = options.strictSibilants ?? false;
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const m = matchNormalized(na, nb, strict);
  const result: MatchNameResult = { match: m.safe && m.score >= threshold, score: round(m.score), a: na, b: nb };
  if (options.gazetteer) {
    let best: { name: string; score: number } | null = null;
    for (const g of options.gazetteer) {
      const ng = normalizeName(g);
      const ra = matchNormalized(na, ng, strict);
      const rb = matchNormalized(nb, ng, strict);
      const s = Math.max(ra.safe ? ra.score : 0, rb.safe ? rb.score : 0);
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

/**
 * Ordered consonant classes of a token — digraph-aware, folding cross-spelling
 * equivalents (व/ब/v/w/b, ज्ञ→gy/jny, sh/s, ph/f, etc.). Two tokens with different
 * consonant skeletons are different words: Sita (st) ≠ Gita (gt), Ram (rm) ≠ Shyam.
 */
function consonantSkeleton(token: string, strict = false): string {
  // A final "y" is the vowel "i" (Adhikary≡Adhikari, Pandey), not a consonant.
  let s = token.toLowerCase().replace(/[^a-z]/g, "").replace(/y$/, "");
  s = s.replace(/chh/g, "C").replace(/ch/g, "C");
  // Sibilants: by default श/ष (sh) and स (s) collapse; with strictSibilants they stay
  // apart (साह Sah ≠ शाह Shah) — sh maps to its own class.
  if (strict) s = s.replace(/sh/g, "X");
  else s = s.replace(/sh/g, "S").replace(/ss/g, "S");
  s = s
    .replace(/ph/g, "F").replace(/f/g, "F")
    .replace(/kh/g, "K").replace(/gh/g, "G")
    .replace(/th/g, "T").replace(/dh/g, "D").replace(/bh/g, "B").replace(/jh/g, "J")
    .replace(/gy|jny|jn/g, "Y") // ज्ञ — Latin "gy" ≡ Devanagari-romanized "jny"
    .replace(/ng/g, "N")
    .replace(/z/g, "j"); // ज romanized "z" (Arzu ≡ आर्जु "arju")
  s = s.replace(/[wvb]/g, "V"); // व / ब / v / w / b
  s = s.replace(/[aeiou]/g, ""); // drop vowels → skeleton
  s = s.replace(/(.)\1+/g, "$1"); // collapse repeats
  return s.toUpperCase();
}

/**
 * Length-neutral vowel signature: fold diphthong/long spellings to one class
 * (ou/au→o, aa→a, ee/ie→i, oo/uu→u) so Poudel ≡ Paudel and राम "raam" ≡ "Ram", but a
 * genuine extra vowel still shows — Shahi "ai" ≠ Shah "a", Sushila "uia" ≠ Sushil "ui".
 */
function vowelSig(token: string): string {
  // Final "y": after a vowel it is a diphthong glide (-ey ≈ e, Pandey), so drop it;
  // after a consonant it is the vowel "i" (Adhikary → adhikari).
  let s = token.toLowerCase().replace(/[^a-z]/g, "").replace(/([aeiou])y$/, "$1").replace(/y$/, "i");
  s = s.replace(/ou|au|ow/g, "O").replace(/aa|ah/g, "A").replace(/ee|ie|ei/g, "I").replace(/oo|uu/g, "U");
  let v = "";
  for (const ch of s) {
    if (ch === "A" || ch === "O" || ch === "I" || ch === "U") v += ch.toLowerCase();
    else if ("aeiou".includes(ch)) v += ch;
  }
  return v.replace(/(.)\1+/g, "$1"); // collapse adjacent identical vowels (schwa doubling)
}

/** Is `short` a vowel-less initial/abbreviation of `long` (bdr ⊂ bahadur, k ⊂ kp)? */
function isInitialOf(short: string, long: string): boolean {
  const s = short.toLowerCase().replace(/[^a-z]/g, "");
  if (!s || s.length > 3 || /[aeiou]/.test(s)) return false; // a real word (has a vowel) is not an initial
  return isSubsequence(consonants(s), consonants(long));
}

/**
 * SAFE per-token match: the same token, a vowel-less initial/abbreviation, or a
 * shared consonant skeleton AND matching vowel signature. This is the guard that
 * stops different people collapsing into one (Sita/Gita, Shahi/Shah, Sushila/Sushil).
 */
function tokensMatch(x: string, y: string, strict = false): boolean {
  if (!x || !y) return false;
  if (x === y) return true;
  if (isInitialOf(x, y) || isInitialOf(y, x)) return true;
  if (consonantSkeleton(x, strict) !== consonantSkeleton(y, strict)) return false;
  const vx = vowelSig(x);
  const vy = vowelSig(y);
  if (vx === vy) return true;
  // Tolerate ONE euphonic trailing vowel after a consonant CLUSTER — the Latin
  // spelling keeps a final -a that Devanagari's schwa deletion drops (Gyanendra ↔
  // "gyaanendr", ...ndr+a). This never rescues a single-consonant ending, so
  // Shahi/Shah (…h+i) and Sushila/Sushil (…l+a) still fail.
  const [shortV, longV, longTok] = vx.length <= vy.length ? [vx, vy, y] : [vy, vx, x];
  if (longV.length === shortV.length + 1 && longV.startsWith(shortV) && endsInClusterVowel(longTok)) return true;
  return false;
}

/** Does the token end in consonant + consonant + vowel (a cluster then a vowel)? */
function endsInClusterVowel(token: string): boolean {
  return /[bcdfghjklmnpqrstvwxyz]{2}[aeiou]$/.test(token.toLowerCase().replace(/[^a-z]/g, ""));
}

/** Soft per-token similarity (for the informational score, not the safety gate). */
function partSim(a: string, b: string): number {
  const base = Math.max(sim(phoneticKey(a), phoneticKey(b)), sim(a, b));
  if (isInitialOf(a, b) || isInitialOf(b, a)) return Math.max(base, 0.9);
  return base;
}

interface MatchOutcome {
  /** Informational similarity 0–1. */
  score: number;
  /** Whether it is SAFE to call these the same person. */
  safe: boolean;
}

function matchNormalized(a: string, b: string, strict = false): MatchOutcome {
  const pa = a.split(" ").filter(Boolean);
  const pb = b.split(" ").filter(Boolean);
  if (!pa.length || !pb.length) return { score: 0, safe: false };

  // Whole-string similarity — robust when one script wrote a name as one token
  // (रामचन्द्र) and the other split it ("Ram Chandra").
  const whole = sim(phoneticKey(pa.join("")), phoneticKey(pb.join("")));

  // Order-independent best pairing of name parts.
  const [small, large] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const usedLarge = new Set<number>();
  let total = 0;
  let allPairsSafe = true;
  for (const part of small) {
    let best = 0;
    let bestIdx = -1;
    let bestSafe = false;
    large.forEach((lp, idx) => {
      if (usedLarge.has(idx)) return;
      const s = partSim(part, lp);
      if (s > best) {
        best = s;
        bestIdx = idx;
        bestSafe = tokensMatch(part, lp, strict);
      }
    });
    if (bestIdx >= 0) usedLarge.add(bestIdx);
    total += best;
    if (!bestSafe) allPairsSafe = false;
  }
  const parts = total / large.length;
  let score = Math.max(whole, parts);

  // Safety.
  let safe: boolean;
  if (pa.length === pb.length) {
    // Same token count: every token must pass the per-token guard — no whole-string
    // rescue. This is what rejects Sita/Gita, Shahi/Shah, Sushila/Sushil.
    safe = allPairsSafe;
    // A per-token-confirmed match is high-confidence — don't let noisy romanization
    // similarity (देउवा↔Deuba, आरजु↔Arzu, शाह↔Shah) drag the score below threshold.
    if (safe) score = Math.max(score, 0.9);
  } else {
    // Different counts (a merge/split like रामचन्द्र ↔ "Ram Chandra", or initials):
    // the FULL ordered consonant skeletons must be identical. This tolerates schwa
    // noise in romanization yet rejects a wrong or extra token (…"Paudel said" adds
    // an "sd" the other side lacks; a surname-only "Shah" lacks most consonants).
    const ska = consonantSkeleton(pa.join(""), strict);
    const skb = consonantSkeleton(pb.join(""), strict);
    const vsim = sim(vowelSig(pa.join("")), vowelSig(pb.join("")));
    const skeletonEqual = ska === skb && ska.length > 0;
    safe = skeletonEqual && vsim >= 0.6;
    // Reflect the skeleton match in the score so a genuine merge/split (whose noisy
    // whole-string number can dip below threshold) still clears it.
    if (skeletonEqual) score = Math.max(score, 0.6 + 0.4 * vsim);
  }

  return { score, safe };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export { phoneticKey as _phoneticKey };
