// Zero-dep detectors for the sentence features we always want to keep.

const CURRENCY = /(?:रु|नेरु|रुपैयाँ|₹|\$|€|£|Rs\.?|USD|NPR|INR)/i;
// A number: Latin or Devanagari digits, optionally with separators/percent.
const NUMBERISH = /[0-9०-९][0-9०-९.,%]*/;
const PERCENT = /[%]|प्रतिशत/;
// A quotation: matched straight or curly quotes with content between.
const QUOTED = /"[^"]{3,}"|“[^”]{3,}”|‘[^’]{3,}’/;

export function hasNumber(text: string): boolean {
  return NUMBERISH.test(text) || CURRENCY.test(text) || PERCENT.test(text);
}

export function hasQuote(text: string): boolean {
  return QUOTED.test(text);
}

/** True if any gazetteer term appears in the text (case-insensitive, whole-token where Latin). */
export function hasEntity(text: string, gaz: Set<string> | null): boolean {
  if (!gaz || gaz.size === 0) return false;
  const lower = text.toLowerCase();
  for (const term of gaz) {
    if (!term) continue;
    // Devanagari has no case; Latin terms are matched with word boundaries.
    if (/[^\u0000-\u007F]/.test(term)) {
      if (text.includes(term)) return true;
    } else if (new RegExp(`(?:^|[^a-z])${escapeRe(term.toLowerCase())}(?:[^a-z]|$)`).test(lower)) {
      return true;
    }
  }
  return false;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word 3-gram shingles for near-duplicate detection. */
export function shingles(text: string, size = 3): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  if (words.length < size) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const t of small) if (large.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}
