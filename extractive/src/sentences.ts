import { EN_STOP, NE_STOP } from "@lacspace/trend-detect";

const STOP = new Set<string>([...EN_STOP, ...NE_STOP]);

// Never a sentence end: titles, currency, "number", initials. Nepali: रु. रू. नं. डा. प्रा. …
const ABBR_STRONG = new Set([
  "mr", "mrs", "ms", "dr", "prof", "rs", "re", "st", "jr", "sr", "gen", "col", "lt", "capt", "maj", "sgt", "insp", "hon",
  "gov", "sen", "rep", "mt", "ft", "vs", "approx", "fig", "e.g", "i.e", "u.s", "u.k", "u.n",
  "रु", "रू", "नं", "डा", "प्रा", "प्रो", "इन्जि",
]);
// A sentence end only when the next word starts with a capital: "… Bank Ltd. The board …".
const ABBR_WEAK = new Set(["no", "ltd", "inc", "co", "corp", "pvt", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec"]);
// Short Nepali words that do end sentences when a writer uses "." for the danda.
const NE_VERB_END = new Set(["छ", "हो", "छन्", "भयो", "हुन्", "थ्यो", "गर्‍यो", "छैन"]);

function isAbbreviation(before: string, next: string): boolean {
  const word = (before.match(/[^\s(“"'‘]+$/u)?.[0] ?? "").replace(/\.$/, "");
  if (!word) return false;
  const lower = word.toLowerCase();
  if (ABBR_STRONG.has(lower)) return true;
  if (ABBR_WEAK.has(lower)) return !/^\p{Lu}/u.test(next);
  if (/^\p{Lu}$/u.test(word) || /^(?:\p{Lu}\.)+\p{Lu}$/u.test(word)) return true; // initials: "B." "B.P"
  // A one- or two-letter Devanagari chunk before "." is an abbreviation (ने.क.पा., वि.सं.), not a sentence.
  const last = word.split(".").pop()!;
  if (/^[\u0900-\u097F]+$/u.test(last) && last.length <= 3 && !NE_VERB_END.has(last)) return true;
  return false;
}

function splitLine(line: string, out: string[]): void {
  let buf = "";
  const chars = [...line];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    buf += ch;
    const isDanda = ch === "।" || ch === "॥";
    const isTerm = ch === "." || ch === "!" || ch === "?";
    if (!isDanda && !isTerm) continue;
    // A "." between two digits is a decimal point, not a boundary.
    if (ch === "." && /\d/.test(chars[i - 1] ?? "") && /\d/.test(chars[i + 1] ?? "")) continue;
    const next = chars[i + 1];
    if (next !== undefined && next !== " ") continue;
    if (ch === "." && isAbbreviation(buf.slice(0, -1), chars.slice(i + 2, i + 4).join(""))) continue;
    const t = buf.trim();
    if (t) out.push(t);
    buf = "";
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
}

/**
 * Split text into sentences, Devanagari-aware: the danda "।" and double danda "॥" end a
 * sentence, as do . ! ? — but not a decimal point or an abbreviation (रु. नं. डा. Rs. No. Dr. B.P.).
 * A line break ends a sentence too (a title line above the body), unless the line ends mid-clause
 * (, ; : -) or the next line starts in lowercase (hard-wrapped text). Deterministic.
 */
export function splitSentences(text: string): string[] {
  const lines = (text ?? "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const blocks: string[] = [];
  for (const line of lines) {
    const prev = blocks[blocks.length - 1];
    if (prev !== undefined && (/[,;:\-–—(]$/u.test(prev) || /^\p{Ll}/u.test(line))) blocks[blocks.length - 1] = `${prev} ${line}`;
    else blocks.push(line);
  }
  const out: string[] = [];
  for (const b of blocks) splitLine(b, out);
  return out;
}

/** Content tokens of a sentence (lowercased letters/digits, stopwords removed). */
export function tokenize(sentence: string): string[] {
  const words = sentence.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => w.length > 1 && !STOP.has(w));
}

export { STOP };
