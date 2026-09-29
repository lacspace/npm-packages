/** A sentence with its character offsets in the original source text. */
export interface Sentence {
  text: string;
  /** Inclusive start offset in the source. */
  start: number;
  /** Exclusive end offset in the source. */
  end: number;
}

// Terminators: Latin . ! ? plus Devanagari danda । and double danda ॥ and the ellipsis.
const TERMINATORS = new Set([".", "!", "?", "।", "॥", "…"]);
// Quote characters whose parity we track so we never split inside a quote.
const OPEN_QUOTES = new Set(["“", "‘", "«"]); // " ' «
const CLOSE_QUOTES = new Set(["”", "’", "»"]); // " ' »

// Common abbreviations after which a period does NOT end a sentence.
const ABBREV = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "vs", "etc", "inc", "ltd",
  "co", "corp", "govt", "gen", "rep", "sen", "gov", "no", "vol", "fig", "al",
  "rs", "u.s", "u.k", "e.g", "i.e", "a.m", "p.m",
]);

function isDigit(ch: string): boolean {
  return (ch >= "0" && ch <= "9") || (ch >= "०" && ch <= "९");
}

/**
 * Split `text` into sentences with character offsets. Handles Latin and
 * Devanagari terminators (। ॥), never splits inside a quotation, and does not
 * break on decimals (3.5), abbreviations (Dr.) or a terminator glued to a digit.
 * Deterministic: identical input always yields identical output.
 */
export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  if (!text) return out;
  let quoteDepth = 0;
  let doubleOpen = false;
  let start = 0;
  const n = text.length;

  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const trimmedStart = raw.length - raw.trimStart().length;
    const trimmedEnd = raw.length - raw.trimEnd().length;
    const s = from + trimmedStart;
    const e = to - trimmedEnd;
    if (e > s) out.push({ text: text.slice(s, e), start: s, end: e });
  };

  for (let i = 0; i < n; i++) {
    const ch = text[i]!;
    if (ch === '"') {
      doubleOpen = !doubleOpen;
      continue;
    }
    if (OPEN_QUOTES.has(ch)) {
      quoteDepth++;
      continue;
    }
    if (CLOSE_QUOTES.has(ch)) {
      if (quoteDepth > 0) quoteDepth--;
      continue;
    }
    if (!TERMINATORS.has(ch)) continue;
    if (quoteDepth > 0 || doubleOpen) continue; // inside a quote — keep it whole

    // A period between digits (3.5) or in an abbreviation is not a break.
    if (ch === ".") {
      const prev = text[i - 1];
      const next = text[i + 1];
      if (prev && next && isDigit(prev) && isDigit(next)) continue;
      // trailing abbreviation like "Dr." — look back to the word
      let j = i - 1;
      while (j >= 0 && /[A-Za-z.]/.test(text[j]!)) j--;
      const word = text.slice(j + 1, i).toLowerCase();
      if (ABBREV.has(word)) continue;
    }

    // Consume any run of terminators/closing quotes/brackets.
    let k = i + 1;
    while (k < n && (TERMINATORS.has(text[k]!) || CLOSE_QUOTES.has(text[k]!) || text[k] === '"' || text[k] === ")" || text[k] === "]")) {
      if (text[k] === '"') doubleOpen = !doubleOpen;
      k++;
    }
    // Must be followed by whitespace or end of text to count as a break.
    if (k >= n || /\s/.test(text[k]!)) {
      push(start, k);
      start = k;
      i = k - 1;
    }
  }
  if (start < n) push(start, n);
  return out;
}
