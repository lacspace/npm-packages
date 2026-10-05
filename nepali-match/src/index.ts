/**
 * Nepali / English matching for names and keywords in running text.
 *
 *   normaliseNe   fold spelling variants (chandrabindu, half nasals, long/short vowels, nukta, ZWJ)
 *   createMatcher whole-word matching that lets Nepali postpositions follow a word
 *                 (झापाको → Jhapa) but nothing else (पर्वतारोही ≠ Parbat), and keeps short
 *                 English acronyms case-sensitive (SEE ≠ "see")
 *   near          two terms within N characters, optionally in the same sentence
 *
 * Every match carries offsets into the ORIGINAL text, so callers can highlight or cut.
 */

export const VERSION = "1.1.0";

export interface NormaliseOptions {
  /** Also fold श/ष → स, व → ब and ण → न. Default false. */
  loose?: boolean;
  /** Devanagari digits ०-९ → 0-9. Default true. */
  digits?: boolean;
  /** Treat hyphens (- ‐ ‑) as spaces, so "Solu Khumbu" matches "Solu-Khumbu". Default false. @since 1.1.0 */
  hyphenAsSpace?: boolean;
}

/** Normalised text plus, for each output char, the index of the input char it came from. */
interface Mapped {
  text: string;
  map: number[];
}

const NUKTA = 0x093c;
const HALANT = 0x094d;
const NASALS = new Set([0x0919, 0x091e, 0x0923, 0x0928, 0x092e]); // ङ ञ ण न म
const DROP = new Set([NUKTA, 0x200c, 0x200d, 0x00ad, 0xfeff]);
const FOLD: Record<number, number> = {
  0x0901: 0x0902, // ँ → ं
  0x0908: 0x0907, // ई → इ
  0x090a: 0x0909, // ऊ → उ
  0x0940: 0x093f, // ी → ि
  0x0942: 0x0941, // ू → ु
};
const LOOSE: Record<number, number> = {
  0x0936: 0x0938, // श → स
  0x0937: 0x0938, // ष → स
  0x0935: 0x092c, // व → ब
  0x0923: 0x0928, // ण → न
};

const isSpace = (c: number): boolean =>
  c === 32 || (c >= 9 && c <= 13) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
const isHyphen = (c: number): boolean => c === 0x2d || c === 0x2010 || c === 0x2011;
const isConsonant = (c: number): boolean => (c >= 0x0915 && c <= 0x0939) || (c >= 0x0958 && c <= 0x095f);

function mapNormalise(input: string, opts: NormaliseOptions = {}): Mapped {
  const digits = opts.digits !== false;
  // NFC per char would lose the map; NFC first, then map onto the NFC string.
  const s = input.normalize("NFC");
  const out: string[] = [];
  const map: number[] = [];
  const push = (ch: string, i: number): void => {
    out.push(ch);
    map.push(i);
  };
  // Next code point index after i, skipping chars we drop anyway.
  const next = (i: number): number => {
    let j = i + 1;
    while (j < s.length && DROP.has(s.charCodeAt(j))) j++;
    return j;
  };
  let lastSpace = false;
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (DROP.has(c)) continue;
    if (isSpace(c) || (opts.hyphenAsSpace && isHyphen(c))) {
      if (!lastSpace) push(" ", i);
      lastSpace = true;
      continue;
    }
    lastSpace = false;
    // Half nasal + consonant → anusvara: चन्द्र → चंद्र, सम्म → संम.
    if (NASALS.has(c)) {
      const h = next(i);
      if (s.charCodeAt(h) === HALANT) {
        const k = next(h);
        if (k < s.length && isConsonant(s.charCodeAt(k))) {
          push("ं", i);
          i = h;
          continue;
        }
      }
    }
    if (FOLD[c] !== undefined) c = FOLD[c]!;
    if (opts.loose && LOOSE[c] !== undefined) c = LOOSE[c]!;
    if (digits && c >= 0x0966 && c <= 0x096f) c = 0x30 + (c - 0x0966);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      push(s[i]!, i);
      push(s[i + 1]!, i + 1);
      i++;
      continue;
    }
    push(String.fromCharCode(c), i);
  }
  return { text: out.join(""), map };
}

/**
 * Fold Nepali spelling variants so equivalent spellings compare equal:
 * NFC; chandrabindu → anusvara; half nasal + consonant → anusvara; ई/ी → इ/ि and ऊ/ू → उ/ु;
 * nukta, ZWJ, ZWNJ and soft hyphens removed; Devanagari digits → ASCII; whitespace collapsed.
 * Latin text passes through unchanged (case included).
 */
export function normaliseNe(text: string, opts: NormaliseOptions = {}): string {
  return mapNormalise(text, opts).text;
}
/** US spelling alias. */
export const normalizeNe = normaliseNe;

/**
 * Words that may be glued to the end of a Nepali name without making it a different word.
 * Matching allows a chain of up to three (जिल्लाहरूमा, काठमाडौंबाटै).
 */
export const POSTPOSITIONS: readonly string[] = [
  "मा", "मै", "को", "का", "की", "के", "कै", "ले", "लाई", "बाट", "बाटै", "सँग", "संग", "सित",
  "देखि", "देखिनै", "सम्म", "सम्मै", "तिर", "तर्फ", "भित्र", "बाहिर", "माथि", "मुनि", "नजिक", "पछि",
  "अघि", "अगाडि", "पारि", "वारि", "द्वारा", "हरू", "हरु", "नै", "भर", "भरि", "वासी", "बासी",
  "स्थित", "निवासी", "मार्फत", "बारे", "अन्तर्गत", "मात्र", "जस्ता",
];

const isNeLetter = (c: number): boolean => (c >= 0x0900 && c <= 0x0963) || (c >= 0x0971 && c <= 0x097f);
const isWordChar = (ch: string | undefined): boolean => !!ch && /[\p{L}\p{M}\p{N}]/u.test(ch);
const hasDevanagari = (s: string): boolean => /[ऀ-ॿ]/.test(s);

/** A term to look for: a plain string, or an id with English and/or Nepali spellings. */
export type TermInput =
  | string
  | {
      id?: string;
      en?: string | readonly string[];
      ne?: string | readonly string[];
      /** Extra spellings in either script. */
      aliases?: readonly string[];
      /** English case rule for this term. Default "auto": all-caps terms up to 5 letters are exact-case. */
      caseSensitive?: boolean | "auto";
    };

export interface MatchOptions extends NormaliseOptions {
  /** Default English case rule. Default "auto". */
  caseSensitive?: boolean | "auto";
  /** Allow the built-in {@link POSTPOSITIONS} after a Nepali word. Default true. */
  postpositions?: boolean;
  /** Extra suffixes to allow. With `postpositions: false` these are the ONLY suffixes allowed. */
  extraSuffixes?: readonly string[];
  /** Multi-word Nepali terms also match written without the space (सुस्तापूर्व). Default false. @since 1.1.0 */
  joinNepali?: boolean;
  /**
   * An exact-case English term longer than 5 letters also matches in ALL CAPS ("KATHMANDU" in a
   * headline). Short acronyms are never affected. Default true. @since 1.1.0
   */
  allCaps?: boolean;
  /** Keep overlapping matches; by default the longest wins. */
  overlaps?: boolean;
}

export interface Match {
  /** The term's id (or the spelling itself for plain-string terms). */
  id: string;
  /** The spelling that matched, as given. */
  term: string;
  lang: "ne" | "en";
  /** Offsets into the original text; `text` is `original.slice(index, end)`, suffix included. */
  index: number;
  end: number;
  text: string;
  /** The postposition chain after the word, normalised (e.g. "मा", "हरुमा"). */
  suffix?: string;
}

interface Variant {
  id: string;
  term: string;
  lang: "ne" | "en";
  key: string; // normalised (ne) or raw (en)
  re?: RegExp; // en
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function autoCase(term: string): boolean {
  const letters = term.replace(/[^\p{L}]/gu, "");
  return letters.length >= 2 && letters.length <= 5 && letters === letters.toUpperCase() && letters !== letters.toLowerCase();
}

/**
 * Text normalised once, to run many matchers over without re-normalising it each time.
 * Make it with {@link prepare} (or `matcher.prepare`) using the same normalise options as the matchers.
 * @since 1.1.0
 */
export interface Prepared {
  readonly kind: "prepared";
  /** The NFC original; match offsets point into this. */
  readonly original: string;
  /** The normalised text. */
  readonly text: string;
  /** @internal normalised index → original index. */
  readonly map: readonly number[];
  /** @internal options key. */
  readonly key: string;
}

const optsKey = (o: NormaliseOptions): string => `${o.loose ? 1 : 0}${o.digits === false ? 0 : 1}${o.hyphenAsSpace ? 1 : 0}`;

/** Normalise `text` once for repeated matching. @since 1.1.0 */
export function prepare(text: string, opts: NormaliseOptions = {}): Prepared {
  const nfc = text.normalize("NFC");
  const { text: n, map } = mapNormalise(nfc, opts);
  return { kind: "prepared", original: nfc, text: n, map, key: optsKey(opts) };
}

const isPrepared = (x: unknown): x is Prepared => typeof x === "object" && x !== null && (x as Prepared).kind === "prepared";

export type TextInput = string | Prepared;

export interface Matcher {
  /** Every match in `text`, in order of position. Pass a {@link Prepared} to skip normalising. */
  find(text: TextInput): Match[];
  /** True when any term (or the term with this id) occurs. */
  test(text: TextInput, id?: string): boolean;
  /** Distinct ids found, in order of first appearance. */
  ids(text: TextInput): string[];
  /** Normalise text with this matcher's options, for reuse across calls. @since 1.1.0 */
  prepare(text: string): Prepared;
  readonly size: number;
  readonly kind: "matcher";
}

/** Compile a set of terms once; reuse the matcher across many texts. */
export function createMatcher(terms: readonly TermInput[], opts: MatchOptions = {}): Matcher {
  const nopts: NormaliseOptions = { loose: opts.loose, digits: opts.digits, hyphenAsSpace: opts.hyphenAsSpace };
  const key = optsKey(nopts);
  const allCaps = opts.allCaps !== false;
  const suffixes = [...new Set([...(opts.postpositions === false ? [] : POSTPOSITIONS), ...(opts.extraSuffixes ?? [])].map((s) => normaliseNe(s, nopts)))]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const variants: Variant[] = [];
  for (const t of terms) {
    const obj = typeof t === "string" ? { id: t, aliases: [t] } : t;
    const list = (v: string | readonly string[] | undefined): string[] => (v === undefined ? [] : typeof v === "string" ? [v] : [...v]);
    const spellings = [...list(obj.en), ...list(obj.ne), ...(obj.aliases ?? [])].map((s) => s.trim()).filter(Boolean);
    const id = obj.id ?? spellings[0] ?? "";
    for (const sp of new Set(spellings)) {
      if (hasDevanagari(sp)) {
        const k = normaliseNe(sp, nopts);
        variants.push({ id, term: sp, lang: "ne", key: k });
        if (opts.joinNepali && k.includes(" ")) {
          // Every space optional: "बर्दघाट सुस्ता पूर्व" also matches "बर्दघाट सुस्तापूर्व" and "बर्दघाटसुस्तापूर्व".
          const parts = k.split(" ");
          const gaps = Math.min(parts.length - 1, 4);
          for (let mask = 1; mask < 1 << gaps; mask++) {
            let joined = parts[0]!;
            for (let g = 1; g < parts.length; g++) joined += (g <= gaps && mask & (1 << (g - 1)) ? "" : " ") + parts[g];
            variants.push({ id, term: sp, lang: "ne", key: joined });
          }
        }
      } else {
        const rule = obj.caseSensitive ?? opts.caseSensitive ?? "auto";
        const exact = rule === "auto" ? autoCase(sp) : rule;
        const words = normaliseNe(sp, nopts).split(" ").filter(Boolean);
        const body = words.map(escapeRe).join(" ");
        const letters = sp.replace(/[^\p{L}]/gu, "");
        const shout = exact && allCaps && letters.length > 5 && sp !== sp.toUpperCase();
        const alt = shout ? `|${words.map((w) => escapeRe(w.toUpperCase())).join(" ")}` : "";
        variants.push({ id, term: sp, lang: "en", key: sp, re: new RegExp(`(?:${body}${alt})`, exact ? "gu" : "giu") });
      }
    }
  }

  // Length of the postposition chain at `pos`, or -1 when the word continues with other letters.
  const suffixEnd = (s: string, pos: number, depth: number): number => {
    if (pos >= s.length || !isNeLetter(s.charCodeAt(pos))) return pos;
    if (depth >= 3) return -1;
    for (const suf of suffixes) {
      if (s.startsWith(suf, pos)) {
        const e = suffixEnd(s, pos + suf.length, depth + 1);
        if (e >= 0) return e;
      }
    }
    return -1;
  };

  const prep = (text: string): Prepared => prepare(text, nopts);
  const find = (input: TextInput): Match[] => {
    const p = isPrepared(input) ? (input.key === key ? input : prep(input.original)) : prep(input);
    const { text: n, map, original: nfc } = p;
    const toOrig = (i: number): number => (i >= map.length ? nfc.length : map[i]!);
    const found: Match[] = [];
    for (const v of variants) {
      if (v.lang === "ne") {
        if (!v.key) continue;
        let at = n.indexOf(v.key);
        while (at >= 0) {
          const before = n[at - 1];
          if (!isWordChar(before)) {
            const wordEnd = at + v.key.length;
            const end = suffixEnd(n, wordEnd, 0);
            const after = n[end];
            if (end >= 0 && !isWordChar(after)) {
              const s = toOrig(at);
              const e = end >= n.length ? nfc.length : toOrig(end);
              found.push({ id: v.id, term: v.term, lang: "ne", index: s, end: e, text: nfc.slice(s, e), ...(end > wordEnd ? { suffix: n.slice(wordEnd, end) } : {}) });
            }
          }
          at = n.indexOf(v.key, at + 1);
        }
      } else {
        v.re!.lastIndex = 0;
        for (const m of n.matchAll(v.re!)) {
          const at = m.index!;
          const end = at + m[0].length;
          if (isWordChar(n[at - 1]) || isWordChar(n[end])) continue;
          const s = toOrig(at);
          const e = end >= n.length ? nfc.length : toOrig(end);
          found.push({ id: v.id, term: v.term, lang: "en", index: s, end: e, text: nfc.slice(s, e) });
        }
      }
    }
    found.sort((a, b) => a.index - b.index || b.end - a.end);
    if (opts.overlaps) return found;
    const kept: Match[] = [];
    let reach = -1;
    for (const m of found) {
      if (m.index >= reach) {
        kept.push(m);
        reach = m.end;
      }
    }
    return kept;
  };

  return {
    find,
    test: (text, id) => find(text).some((m) => id === undefined || m.id === id),
    ids: (text) => [...new Set(find(text).map((m) => m.id))],
    prepare: prep,
    get size() { return variants.length; },
    kind: "matcher",
  };
}

/** One-off: every match of `terms` in `text`. Compile with {@link createMatcher} for repeated use. */
export function findTerms(text: TextInput, terms: TermInput | readonly TermInput[], opts?: MatchOptions): Match[] {
  return createMatcher(Array.isArray(terms) ? (terms as TermInput[]) : [terms as TermInput], opts).find(text);
}

/** One-off: does `term` occur in `text` as a whole word (Nepali postpositions allowed)? */
export function contains(text: TextInput, term: TermInput | readonly TermInput[], opts?: MatchOptions): boolean {
  return findTerms(text, term, opts).length > 0;
}

/**
 * Split a Nepali word into its stem and trailing postpositions:
 * `splitSuffix("जिल्लाहरूमा")` → `{ stem: "जिल्ला", suffixes: ["हरु", "मा"] }` (suffixes normalised).
 * Only splits when the whole tail is postpositions; the stem keeps the original spelling.
 */
export function splitSuffix(word: string): { stem: string; suffixes: string[] } {
  const { text: n, map } = mapNormalise(word.trim());
  const sufs = [...new Set(POSTPOSITIONS.map((s) => normaliseNe(s)))].sort((a, b) => b.length - a.length);
  const nfc = word.trim().normalize("NFC");
  let end = n.length;
  const out: string[] = [];
  while (out.length < 3) {
    const hit = sufs.find((s) => end - s.length >= 2 && n.slice(end - s.length, end) === s);
    if (!hit) break;
    out.unshift(hit);
    end -= hit.length;
  }
  return { stem: nfc.slice(0, end >= n.length ? nfc.length : map[end]), suffixes: out };
}

export interface NearOptions extends MatchOptions {
  /** Max characters between the end of one match and the start of the other. Default 60. */
  maxChars?: number;
  /** Require both in the same sentence (। ॥ . ? ! or a newline ends one). Default true. */
  sameSentence?: boolean;
}

/**
 * What `near` looks for: terms, a compiled {@link Matcher}, or matches you already found in the
 * same text (offsets must come from that text). @since 1.1.0 for Matcher / Match[]
 */
export type TermSource = TermInput | readonly TermInput[] | Matcher | readonly Match[];

const isMatcher = (x: unknown): x is Matcher => typeof x === "object" && x !== null && (x as Matcher).kind === "matcher";
const isMatchList = (x: unknown): x is readonly Match[] =>
  Array.isArray(x) && (x.length === 0 || (typeof x[0] === "object" && x[0] !== null && typeof (x[0] as Match).index === "number" && typeof (x[0] as Match).end === "number"));

export interface NearResult {
  a: Match;
  b: Match;
  /** Characters between the two matches (0 when adjacent). */
  gap: number;
}

// "ने.क.पा." / "U.S.": a token with an inner dot is an abbreviation, not a sentence end.
const dottedAbbr = (s: string, i: number): boolean => {
  let j = i - 1;
  while (j >= 0 && !/\s/.test(s[j]!)) j--;
  return s.slice(j + 1, i).includes(".");
};

/** Sentence boundaries as [start, end) offsets into the NFC text. "." ends a sentence only before a space or the end. */
export function sentenceSpans(text: string): [number, number][] {
  const s = text.normalize("NFC");
  const spans: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    const end = ch === "।" || ch === "॥" || ch === "?" || ch === "!" || ch === "\n" || (ch === "." && (i + 1 >= s.length || /\s/.test(s[i + 1]!)) && !dottedAbbr(s, i));
    if (end) {
      spans.push([start, i + 1]);
      start = i + 1;
    }
  }
  if (start < s.length) spans.push([start, s.length]);
  return spans;
}

/**
 * The closest pair of an `a` match and a `b` match within `maxChars` of each other
 * (in either order), or null. With `sameSentence` (default) the pair must share a sentence.
 */
export function near(
  text: TextInput,
  a: TermSource,
  b: TermSource,
  maxCharsOrOpts: number | NearOptions = {},
  sameSentence?: boolean,
): NearResult | null {
  const opts: NearOptions = typeof maxCharsOrOpts === "number" ? { maxChars: maxCharsOrOpts } : { ...maxCharsOrOpts };
  if (sameSentence !== undefined) opts.sameSentence = sameSentence;
  const max = opts.maxChars ?? 60;
  const same = opts.sameSentence !== false;
  const resolve = (src: TermSource): readonly Match[] => {
    if (isMatcher(src)) return src.find(text);
    if (isMatchList(src)) return src;
    return findTerms(text, src as TermInput | readonly TermInput[], opts);
  };
  const am = resolve(a);
  if (!am.length) return null;
  const bm = resolve(b);
  if (!bm.length) return null;
  const spans = same ? sentenceSpans(isPrepared(text) ? text.original : text) : [];
  const sentenceOf = (i: number): number => spans.findIndex(([s, e]) => i >= s && i < e);
  let best: NearResult | null = null;
  for (const x of am) {
    for (const y of bm) {
      if (x.index < y.end && y.index < x.end) continue; // same span of text
      const gap = x.end <= y.index ? y.index - x.end : x.index - y.end;
      if (gap > max) continue;
      if (same && sentenceOf(x.index) !== sentenceOf(y.index)) continue;
      if (!best || gap < best.gap) best = { a: x, b: y, gap };
    }
  }
  return best;
}

export { districtTerms, type DistrictTerm } from "./districts.js";
