/** Lightweight text helpers — no font metrics needed (SVG renders the real font). */

const NARROW = new Set("iIl.,:;'|!ftrj()[]{} ".split(""));
const WIDE = new Set("mwMW@%".split(""));
const CAPS = new Set("ABCDEFGHKNOQRSUVXYZ".split(""));

/** Rough advance width of a string at a given font size (em-relative heuristic). */
export function estimateTextWidth(text: string, fontSize: number, tracking = 0): number {
  let em = 0;
  for (const ch of text) {
    if (ch === " ") em += 0.3;
    else if (NARROW.has(ch)) em += 0.3;
    else if (WIDE.has(ch)) em += 0.92;
    else if (CAPS.has(ch)) em += 0.7;
    else em += 0.56;
  }
  return em * fontSize + Math.max(0, text.length - 1) * tracking;
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
