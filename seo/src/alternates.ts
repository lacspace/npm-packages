/**
 * hreflang / canonical alternates + pagination + theme-color head helpers.
 *
 * {@link alternates} builds a Next.js `Metadata.alternates`-shaped object with
 * a resolved canonical, the `languages` hreflang map and an optional
 * `x-default`. {@link paginationLinks} / {@link paginationLinkTags} emit
 * rel="prev"/rel="next", and {@link themeColorTags} emits `theme-color` metas.
 *
 * Zero-dependency & isomorphic.
 */

function absUrl(path: string | undefined, baseUrl?: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface AlternatesInput {
  /** Canonical URL for the page (path or absolute; resolved against `baseUrl`). */
  canonical?: string;
  /** locale → URL map (paths resolved against `baseUrl`) → hreflang alternates. */
  languages?: Record<string, string>;
  /** The `x-default` hreflang URL (unmatched-locale fallback). */
  xDefault?: string;
  /** Base URL used to resolve relative canonical / language URLs. */
  baseUrl?: string;
}

export interface AlternatesMeta {
  canonical?: string;
  languages?: Record<string, string>;
}

/**
 * Build a `Metadata.alternates` object — canonical + `languages` hreflang map +
 * an `x-default` — for multi-locale pages. Relative URLs resolve against
 * `baseUrl`. Richer than {@link import("./index").hreflang} (which only wraps a
 * `languages` map).
 * @example alternates({ canonical: "/pricing", baseUrl: "https://x.com", languages: { en: "/en/pricing", ne: "/ne/pricing" }, xDefault: "/pricing" })
 */
export function alternates(input: AlternatesInput): AlternatesMeta {
  const out: AlternatesMeta = {};
  const canonical = absUrl(input.canonical, input.baseUrl);
  if (canonical) out.canonical = canonical;

  const langs: Record<string, string> = {};
  if (input.languages) {
    for (const [k, v] of Object.entries(input.languages)) {
      const u = absUrl(v, input.baseUrl);
      if (u) langs[k] = u;
    }
  }
  if (input.xDefault) {
    const u = absUrl(input.xDefault, input.baseUrl);
    if (u) langs["x-default"] = u;
  }
  if (Object.keys(langs).length) out.languages = langs;
  return out;
}

/* ---------------------------------------------------------------- *
 * Pagination (rel prev / next)
 * ---------------------------------------------------------------- */

export interface PaginationInput {
  /** 1-based current page. */
  page: number;
  /** Total number of pages. Omit if unknown (then `next` is always emitted). */
  totalPages?: number;
  /** Build the URL for a given 1-based page number. */
  href: (page: number) => string;
}

export interface PaginationLinks {
  prev?: string;
  next?: string;
}

/**
 * Resolve the rel="prev" / rel="next" URLs for a paginated listing.
 * @example paginationLinks({ page: 2, totalPages: 5, href: (p) => `/blog?page=${p}` })
 */
export function paginationLinks(o: PaginationInput): PaginationLinks {
  const links: PaginationLinks = {};
  if (o.page > 1) links.prev = o.href(o.page - 1);
  if (o.totalPages === undefined || o.page < o.totalPages) links.next = o.href(o.page + 1);
  return links;
}

/** The rel="prev"/rel="next" `<link>` tag string(s) for a paginated listing. */
export function paginationLinkTags(o: PaginationInput): string {
  const { prev, next } = paginationLinks(o);
  const tags: string[] = [];
  if (prev) tags.push(`<link rel="prev" href="${escAttr(prev)}">`);
  if (next) tags.push(`<link rel="next" href="${escAttr(next)}">`);
  return tags.join("\n");
}

/* ---------------------------------------------------------------- *
 * theme-color
 * ---------------------------------------------------------------- */

export interface ThemeColor {
  color: string;
  /** Optional media query, e.g. "(prefers-color-scheme: dark)". */
  media?: string;
}

/**
 * Render `<meta name="theme-color">` tag(s). Pass a single colour, or an array
 * of `{ color, media }` for light/dark variants.
 * @example themeColorTags([{ color: "#fff", media: "(prefers-color-scheme: light)" }, { color: "#000", media: "(prefers-color-scheme: dark)" }])
 */
export function themeColorTags(input: string | ThemeColor[]): string {
  const arr = typeof input === "string" ? [{ color: input }] : input;
  return arr
    .map(
      (t) =>
        `<meta name="theme-color" content="${escAttr(t.color)}"${
          t.media ? ` media="${escAttr(t.media)}"` : ""
        }>`,
    )
    .join("\n");
}
