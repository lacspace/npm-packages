/** Lightweight text helpers — no font metrics needed (SVG renders the real font). */

// Per-glyph advance widths (em), tuned to typical bold display faces and biased
// slightly generous so a wordmark box is never too small. Any char not listed
// falls back by class (lowercase / uppercase / digit).
const ADVANCE: Record<string, number> = {
  " ": 0.3,
  i: 0.29, j: 0.29, l: 0.29, I: 0.34, ".": 0.3, ",": 0.3, ":": 0.3, ";": 0.3,
  "'": 0.24, "!": 0.32, "|": 0.26, "(": 0.36, ")": 0.36, "[": 0.36, "]": 0.36,
  "{": 0.36, "}": 0.36, "-": 0.4, "/": 0.4,
  f: 0.38, t: 0.4, r: 0.44, J: 0.5,
  m: 0.92, w: 0.86, M: 0.98, W: 0.98, "@": 1.0, "%": 0.95,
};

/** Rough advance width of a string at a given font size (em-relative heuristic). */
export function estimateTextWidth(text: string, fontSize: number, tracking = 0): number {
  let em = 0;
  for (const ch of text) {
    const a = ADVANCE[ch];
    if (a !== undefined) em += a;
    else if (ch >= "A" && ch <= "Z") em += 0.72;
    else if (ch >= "0" && ch <= "9") em += 0.58;
    else em += 0.55; // lowercase & everything else
  }
  // A small safety margin keeps the real (font-dependent) width inside the box.
  return em * fontSize * 1.04 + Math.max(0, text.length - 1) * tracking;
}

/** Derive a compact monogram (1–3 letters) from a brand name. */
export function initials(name: string, max = 2): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "•";
  if (words.length === 1) {
    const w = words[0]!;
    return (w.length <= max ? w : w.slice(0, max)).toUpperCase();
  }
  return words
    .slice(0, max)
    .map((w) => w[0]!)
    .join("")
    .toUpperCase();
}

/** Escape text for safe inclusion in SVG. */
export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A single-letter cap for lettermark engines. */
export function firstLetter(name: string): string {
  const m = name.match(/\p{L}/u);
  return (m ? m[0] : "•").toUpperCase();
}
