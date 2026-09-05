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
  ĝ: "g", ġ: "g", ĥ: "h", ĵ: "j", ķ: "k", ŗ: "r", ţ: "t", ŵ: "w", ŷ: "y", ĳ: "ij",

  // Cyrillic (Russian + common Ukrainian).
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u",

  // Greek (base + a few precomposed accents, for engines without NFKD).
  α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
  κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
  ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
  ά: "a", έ: "e", ή: "i", ί: "i", ό: "o", ύ: "y", ώ: "o",
  ϊ: "i", ϋ: "y", ΐ: "i", ΰ: "y",
};

/** German umlaut / eszett word-expansion (opt-in via `{ german: true }`). */
const GERMAN_MAP: Record<string, string> = {
  ä: "ae", ö: "oe", ü: "ue", ß: "ss", ẞ: "SS",
  Ä: "Ae", Ö: "Oe", Ü: "Ue",
};

/** Currency / symbol → word expansion (opt-in via `{ symbols: true }`). */
const SYMBOL_MAP: Record<string, string> = {
  "&": "and", "@": "at", "%": "percent", "+": "plus",
  "€": "euro", $: "dollar", "£": "pound", "¥": "yen", "₹": "rupee", "¢": "cent",
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
  /**
   * Expand German umlauts/eszett as words (ü→ue, ö→oe, ä→ae, ß→ss) instead of
   * the default ASCII fold (ü→u). Opt-in; default false. */
  german?: boolean;
  /**
   * Expand common currency/symbol characters to words (& → "and", % → "percent",
   * € → "euro", …). Opt-in; default false. */
  symbols?: boolean;
  /** Value to return when the slug would otherwise be empty. Default "". */
  fallback?: string;
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

  if (opts.symbols) {
    for (const [from, to] of Object.entries(SYMBOL_MAP)) {
      if (s.includes(from)) s = s.split(from).join(` ${to} `);
    }
  }
  if (opts.german) {
    for (const [from, to] of Object.entries(GERMAN_MAP)) {
      if (s.includes(from)) s = s.split(from).join(to);
    }
  }

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
  // Trim separators from the ends — only when there is a separator to trim.
  // (An empty separator produces no leading/trailing separators, and would build
  // an invalid `^+|+$` regexp.)
  if (sep) {
    const sepRe = new RegExp(`^${escapeRe(sep)}+|${escapeRe(sep)}+$`, "g");
    s = s.replace(sepRe, "");
  }

  if (opts.maxLength && s.length > opts.maxLength) {
    s = s.slice(0, opts.maxLength);
    const lastSep = s.lastIndexOf(sep);
    if (lastSep > 0) s = s.slice(0, lastSep);
  }
  return s || (opts.fallback ?? "");
}

/**
 * Slugify each "/"-separated segment of a URL path, preserving the slashes
 * (and any leading/trailing slash). Empty segments are kept as-is.
 * @example slugifyPath("/Blog/My First Post/") // "/blog/my-first-post/"
 */
export function slugifyPath(path: string, opts: SlugOptions = {}): string {
  return path
    .split("/")
    .map((seg) => (seg ? slugify(seg, opts) : seg))
    .join("/");
}

/**
 * Slugify a filename's base name while preserving its extension.
 * The extension is lowercased (when `lower` is on) and stripped of non-alphanumerics.
 * @example slugifyFilename("My File.PDF") // "my-file.pdf"
 * @example slugifyFilename("Résumé (final).docx") // "resume-final.docx"
 */
export function slugifyFilename(name: string, opts: SlugOptions = {}): string {
  const dot = name.lastIndexOf(".");
  // No extension, or a dotfile like ".env" → slugify the whole thing.
  if (dot <= 0) return slugify(name, opts);
  const lower = opts.lower ?? true;
  const base = slugify(name.slice(0, dot), opts) || (opts.fallback ?? "file");
  let ext = name.slice(dot + 1).replace(/[^a-zA-Z0-9]+/g, "");
  if (lower) ext = ext.toLowerCase();
  return ext ? `${base}.${ext}` : base;
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
