/**
 * @lacspace/sitemap
 * Generate sitemap.xml, sitemap indexes and Next.js sitemaps.
 *
 * URL entries with lastmod / changefreq / priority, image / video / news
 * extensions and hreflang alternates. Auto-splits large sets into an index.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export type ChangeFreq =
  | "always"
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "never";

export interface SitemapImage {
  loc: string;
  title?: string;
  caption?: string;
}

export interface SitemapVideo {
  thumbnailLoc: string;
  title: string;
  description: string;
  contentLoc?: string;
  playerLoc?: string;
  duration?: number;
}

export interface SitemapNews {
  publicationName: string;
  language: string;
  title: string;
  publicationDate: string | Date;
}

export interface Alternate {
  hreflang: string;
  href: string;
}

export interface SitemapUrl {
  loc: string;
  lastmod?: string | Date;
  changefreq?: ChangeFreq;
  /** 0.0–1.0 */
  priority?: number;
  images?: SitemapImage[];
  videos?: SitemapVideo[];
  news?: SitemapNews;
  alternates?: Alternate[];
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function w3c(date: string | Date): string {
  if (date instanceof Date) return date.toISOString();
  return date;
}

function urlBlock(u: SitemapUrl): string {
  const parts = [`    <loc>${esc(u.loc)}</loc>`];
  if (u.lastmod) parts.push(`    <lastmod>${esc(w3c(u.lastmod))}</lastmod>`);
  if (u.changefreq) parts.push(`    <changefreq>${u.changefreq}</changefreq>`);
  if (u.priority !== undefined) {
    const p = Math.max(0, Math.min(1, u.priority));
    parts.push(`    <priority>${p.toFixed(1)}</priority>`);
  }
  for (const a of u.alternates ?? []) {
    parts.push(
      `    <xhtml:link rel="alternate" hreflang="${esc(a.hreflang)}" href="${esc(a.href)}" />`,
    );
  }
  for (const img of u.images ?? []) {
    parts.push(`    <image:image><image:loc>${esc(img.loc)}</image:loc>${
      img.title ? `<image:title>${esc(img.title)}</image:title>` : ""
    }${img.caption ? `<image:caption>${esc(img.caption)}</image:caption>` : ""}</image:image>`);
  }
  for (const v of u.videos ?? []) {
    parts.push(
      `    <video:video>` +
        `<video:thumbnail_loc>${esc(v.thumbnailLoc)}</video:thumbnail_loc>` +
        `<video:title>${esc(v.title)}</video:title>` +
        `<video:description>${esc(v.description)}</video:description>` +
        (v.contentLoc ? `<video:content_loc>${esc(v.contentLoc)}</video:content_loc>` : "") +
        (v.playerLoc ? `<video:player_loc>${esc(v.playerLoc)}</video:player_loc>` : "") +
        (v.duration ? `<video:duration>${v.duration}</video:duration>` : "") +
        `</video:video>`,
    );
  }
  if (u.news) {
    parts.push(
      `    <news:news><news:publication><news:name>${esc(u.news.publicationName)}</news:name>` +
        `<news:language>${esc(u.news.language)}</news:language></news:publication>` +
        `<news:publication_date>${esc(w3c(u.news.publicationDate))}</news:publication_date>` +
        `<news:title>${esc(u.news.title)}</news:title></news:news>`,
    );
  }
  return `  <url>\n${parts.join("\n")}\n  </url>`;
}

const NS =
  'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ' +
  'xmlns:xhtml="http://www.w3.org/1999/xhtml" ' +
  'xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" ' +
  'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" ' +
  'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"';

/** Build a single sitemap.xml document. */
export function sitemap(urls: SitemapUrl[]): string {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset ${NS}>\n` +
    urls.map(urlBlock).join("\n") +
    `\n</urlset>`
  );
}

/** Build a sitemap index that points at multiple sitemaps. */
export function sitemapIndex(sitemaps: { loc: string; lastmod?: string | Date }[]): string {
  const body = sitemaps
    .map(
      (s) =>
        `  <sitemap>\n    <loc>${esc(s.loc)}</loc>${
          s.lastmod ? `\n    <lastmod>${esc(w3c(s.lastmod))}</lastmod>` : ""
        }\n  </sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>`;
}

export interface SplitOptions {
  /** Base URL where sitemap files will be hosted, e.g. "https://x.com". */
  baseUrl: string;
  /** Max URLs per file (spec max 50,000). Default 50000. */
  perFile?: number;
  /** Name for the i-th file (0-based). Default `sitemap-${i}.xml`. */
  filename?: (i: number) => string;
}

/** Split a large URL set into an index + multiple sitemap files. */
export function splitSitemaps(
  urls: SitemapUrl[],
  opts: SplitOptions,
): { index: string; files: { name: string; xml: string }[] } {
  const per = Math.min(opts.perFile ?? 50000, 50000);
  const filename = opts.filename ?? ((i) => `sitemap-${i}.xml`);
  const base = opts.baseUrl.replace(/\/$/, "");
  const files: { name: string; xml: string }[] = [];
  for (let i = 0; i * per < urls.length; i++) {
    const name = filename(i);
    files.push({ name, xml: sitemap(urls.slice(i * per, (i + 1) * per)) });
  }
  const index = sitemapIndex(files.map((f) => ({ loc: `${base}/${f.name}` })));
  return { index, files };
}

/* ------------------------------ Next.js ------------------------------ */

export interface NextSitemapEntry {
  url: string;
  lastModified?: string | Date;
  changeFrequency?: ChangeFreq;
  priority?: number;
  alternates?: { languages: Record<string, string> };
}

/** Convert entries to the shape Next.js `sitemap.ts` expects (`MetadataRoute.Sitemap`). */
export function toNextSitemap(urls: SitemapUrl[]): NextSitemapEntry[] {
  return urls.map((u) => {
    const entry: NextSitemapEntry = {
      url: u.loc,
      lastModified: u.lastmod,
      changeFrequency: u.changefreq,
      priority: u.priority,
    };
    if (u.alternates?.length) {
      entry.alternates = {
        languages: Object.fromEntries(u.alternates.map((a) => [a.hreflang, a.href])),
      };
    }
    return entry;
  });
}

/** Minimal site shape shared across the Lacspace SEO Kit (structural, no imports). */
export interface SiteLike {
  /** Absolute base URL, e.g. "https://acme.com". */
  url: string;
}

/** A route: just a path string, or a full entry (its `loc`/`path` is resolved against the site URL). */
export type SiteRoute = string | (Omit<SitemapUrl, "loc"> & { loc?: string; path?: string });

/**
 * Build a sitemap from bare paths — no need to repeat your domain on every row.
 * Relative locs are resolved against the site URL; absolute ones pass through.
 * @example sitemapForSite({ url: "https://acme.com" }, ["/", "/pricing", { path: "/blog", changefreq: "daily", priority: 0.8 }])
 */
export function sitemapForSite(site: SiteLike, routes: SiteRoute[]): string {
  const base = site.url.replace(/\/$/, "");
  const resolve = (p: string): string =>
    /^https?:\/\//.test(p) ? p : `${base}/${p.replace(/^\//, "")}`;
  const urls: SitemapUrl[] = routes.map((r) => {
    if (typeof r === "string") return { loc: resolve(r) };
    const { path, loc, ...rest } = r;
    return { ...rest, loc: resolve(path ?? loc ?? "/") };
  });
  return sitemap(urls);
}
