/**
 * Text helpers that complement the existing `truncate` / `titleCase`.
 */

/** Combining diacritical marks (U+0300–U+036F), built without literal marks in source. */
/**
 * Split into user-perceived characters (grapheme clusters). Uses
 * `Intl.Segmenter` where available, else code points (never half a surrogate).
 */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Truncate keeping the head and tail, ellipsis in the middle.
 * `truncateMiddle("/very/long/path/to/file.txt", 20)` keeps both ends.
 * The returned string is never longer than `max`.
 */
export function truncateMiddle(str: string, max: number, ellipsis = "…"): string {
  const chars = graphemes(str);
  if (chars.length <= max) return str;
  const dots = graphemes(ellipsis);
  if (max <= dots.length) return dots.slice(0, Math.max(0, max)).join("");
  const keep = max - dots.length;
  const head = Math.ceil(keep / 2);
  const tail = Math.floor(keep / 2);
  return chars.slice(0, head).join("") + ellipsis + (tail > 0 ? chars.slice(chars.length - tail).join("") : "");
}

export interface InitialsOptions {
  /** Maximum number of initials. Default 2. */
  max?: number;
}

/** Initials from a name. `initials("John Kennedy")` → "JK". */
export function initials(name: string, opts: InitialsOptions = {}): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const max = opts.max ?? 2;
  const picked = words.length <= max
    ? words
    : [words[0]!, ...words.slice(-(max - 1))];
  return picked.map((w) => (graphemes(w)[0] ?? "").toUpperCase()).join("");
}

/** Slugify. `slugcase("Hello, World!")` → "hello-world". */
export function slugcase(text: string): string {
  return text
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
