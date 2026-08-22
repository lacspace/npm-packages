/**
 * @lacspace/slugify
 * Turn any text into a clean, SEO-friendly URL slug.
 *
 * Transliterates common Latin diacritics, strips the rest, collapses
 * separators, and can guarantee uniqueness against an existing set.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

// Common Latin-1 / Latin Extended characters → ASCII.
const CHAR_MAP: Record<string, string> = {
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", ā: "a", ă: "a", ą: "a", æ: "ae",
  ç: "c", ć: "c", č: "c", ĉ: "c", ċ: "c",
  è: "e", é: "e", ê: "e", ë: "e", ē: "e", ĕ: "e", ę: "e", ě: "e",
  ì: "i", í: "i", î: "i", ï: "i", ī: "i", ĭ: "i", į: "i", ı: "i",
  ñ: "n", ń: "n", ň: "n",
  ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ø: "o", ō: "o", ŏ: "o", ő: "o", œ: "oe",
  ù: "u", ú: "u", û: "u", ü: "u", ū: "u", ŭ: "u", ů: "u", ű: "u", ų: "u",
  ý: "y", ÿ: "y",
  ß: "ss", þ: "th", ð: "d",
  ł: "l", ľ: "l", ĺ: "l",
  ś: "s", š: "s", ş: "s",
  ź: "z", ż: "z", ž: "z",
  ř: "r", ŕ: "r", ť: "t", ď: "d", ğ: "g",
};

export interface SlugOptions {
  /** Lowercase the result. Default true. */
  lower?: boolean;
  /** Word separator. Default "-". */
  separator?: string;
  /** Truncate to at most this many characters (on a separator boundary). */
  maxLength?: number;
  /** Extra character replacements applied before transliteration. */
  replace?: Record<string, string>;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Slugify a string.
 * @example slugify("Héllo, World! — 2026") // "hello-world-2026"
 */
export function slugify(input: string, opts: SlugOptions = {}): string {
  const sep = opts.separator ?? "-";
  const lower = opts.lower ?? true;

  let s = input.trim();
  for (const [from, to] of Object.entries(opts.replace ?? {})) s = s.split(from).join(to);

  // Decompose accents and drop the combining marks (U+0300–U+036F).
  try {
    s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  } catch {
    /* normalize unsupported — the char map below still handles common cases */
  }
  // Map any remaining non-ASCII characters via the table, dropping the unknown.
  s = s.replace(/[^\x00-\x7f]/g, (ch) => CHAR_MAP[ch.toLowerCase()] ?? "");

  if (lower) s = s.toLowerCase();
  // Replace any run of non-alphanumerics with a single separator.
  s = s.replace(/[^a-zA-Z0-9]+/g, sep);
  // Trim separators from the ends.
  const sepRe = new RegExp(`^${escapeRe(sep)}+|${escapeRe(sep)}+$`, "g");
  s = s.replace(sepRe, "");

  if (opts.maxLength && s.length > opts.maxLength) {
    s = s.slice(0, opts.maxLength);
    const lastSep = s.lastIndexOf(sep);
    if (lastSep > 0) s = s.slice(0, lastSep);
  }
  return s;
}

/**
 * Slugify and guarantee uniqueness against existing slugs by appending -2, -3, …
 * @example uniqueSlug("Hello", new Set(["hello", "hello-2"])) // "hello-3"
 */
export function uniqueSlug(
  input: string,
  existing: Set<string> | string[],
  opts: SlugOptions = {},
): string {
  const set = existing instanceof Set ? existing : new Set(existing);
  const sep = opts.separator ?? "-";
  const base = slugify(input, opts);
  if (!set.has(base)) return base;
  let n = 2;
  while (set.has(`${base}${sep}${n}`)) n++;
  return `${base}${sep}${n}`;
}
