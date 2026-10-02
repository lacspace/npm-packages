import { EN_STOP, NE_STOP } from "@lacspace/trend-detect";

const STOP = new Set<string>([...EN_STOP, ...NE_STOP]);

/**
 * Split text into sentences, Devanagari-aware: the danda "।" and double danda "॥" end a
 * sentence, as do . ! ? — but a period between digits (a decimal) does not. Deterministic.
 */
export function splitSentences(text: string): string[] {
  const s = (text ?? "").replace(/\s+/g, " ").trim();
  if (!s) return [];
  const out: string[] = [];
  let buf = "";
  const chars = [...s];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    buf += ch;
    const isDanda = ch === "।" || ch === "॥";
    const isTerm = ch === "." || ch === "!" || ch === "?";
    if (!isDanda && !isTerm) continue;
    // A "." between two digits is a decimal point, not a boundary.
    if (ch === "." && /\d/.test(chars[i - 1] ?? "") && /\d/.test(chars[i + 1] ?? "")) continue;
    const next = chars[i + 1];
    if (next === undefined || next === " ") {
      const t = buf.trim();
      if (t) out.push(t);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

/** Content tokens of a sentence (lowercased letters/digits, stopwords removed). */
export function tokenize(sentence: string): string[] {
  const words = sentence.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.filter((w) => w.length > 1 && !STOP.has(w));
}

export { STOP };
