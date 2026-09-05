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
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
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

export interface SitemapOptions {
  /**
   * URL of an XSL stylesheet. When set, a `<?xml-stylesheet?>` processing
   * instruction is added so the raw sitemap renders human-readably in a browser.
   * @see {@link sitemapStylesheet}
   */
  stylesheet?: string;
}

/** Build a single sitemap.xml document. */
export function sitemap(urls: SitemapUrl[], opts?: SitemapOptions): string {
  const pi = opts?.stylesheet
    ? `\n<?xml-stylesheet type="text/xsl" href="${esc(opts.stylesheet)}"?>`
    : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>${pi}\n<urlset ${NS}>\n` +
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

/* --------------------- Specialised extension sitemaps --------------------- */

/** One entry of a Google News sitemap: a page URL plus its news metadata. */
export interface NewsSitemapItem extends SitemapNews {
  loc: string;
}

/**
 * Build a Google News sitemap (`<news:news>` per URL).
 * News sitemaps should only contain articles from the last 2 days.
 * @example newsSitemap([{ loc: "https://x.com/a", publicationName: "The Times", language: "en", title: "Headline", publicationDate: new Date() }])
 */
export function newsSitemap(items: NewsSitemapItem[], opts?: SitemapOptions): string {
  const urls: SitemapUrl[] = items.map(({ loc, ...news }) => ({ loc, news }));
  return sitemap(urls, opts);
}

/** One entry of a video sitemap: a page URL plus a single video's metadata. */
export interface VideoSitemapItem extends SitemapVideo {
  loc: string;
}

/**
 * Build a video extension sitemap (`<video:video>` per URL).
 * @example videoSitemap([{ loc: "https://x.com/watch", thumbnailLoc: "https://x.com/t.jpg", title: "Clip", description: "…", contentLoc: "https://x.com/v.mp4", duration: 120 }])
 */
export function videoSitemap(items: VideoSitemapItem[], opts?: SitemapOptions): string {
  const urls: SitemapUrl[] = items.map(({ loc, ...video }) => ({ loc, videos: [video] }));
  return sitemap(urls, opts);
}

/** One entry of an image sitemap: a page URL plus the images it contains. */
export interface ImageSitemapItem {
  loc: string;
  images: SitemapImage[];
}

/**
 * Build an image extension sitemap (`<image:image>` entries grouped per URL).
 * @example imageSitemap([{ loc: "https://x.com/gallery", images: [{ loc: "https://x.com/1.jpg", title: "One" }] }])
 */
export function imageSitemap(items: ImageSitemapItem[], opts?: SitemapOptions): string {
  const urls: SitemapUrl[] = items.map((i) => ({ loc: i.loc, images: i.images }));
  return sitemap(urls, opts);
}

/**
 * An XSL stylesheet that renders a raw `sitemap.xml` as a readable HTML table
 * in the browser. Serve it alongside your sitemap and reference it via the
 * `stylesheet` option on {@link sitemap} (or the extension sitemaps).
 * @example
 * // app/sitemap.xsl route → return sitemapStylesheet()
 * sitemap(urls, { stylesheet: "/sitemap.xsl" })
 */
export function sitemapStylesheet(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1"/>
        <title>XML Sitemap</title>
        <style>
          :root { color-scheme: light dark; }
          body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; background: #f7f8fa; color: #111; }
          @media (prefers-color-scheme: dark) { body { background: #0e0f12; color: #e7e9ee; } tr:nth-child(even) td { background: #16181d; } th { background: #1b1e24; } a { color: #7aa2ff; } }
          h1 { font-size: 1.4rem; margin: 0 0 .25rem; }
          p.meta { color: #667; margin: 0 0 1.5rem; }
          table { width: 100%; border-collapse: collapse; background: transparent; }
          th, td { text-align: left; padding: .55rem .75rem; border-bottom: 1px solid #e2e4ea; vertical-align: top; }
          @media (prefers-color-scheme: dark) { th, td { border-color: #24272e; } }
          th { font-weight: 600; background: #eef0f4; }
          tr:nth-child(even) td { background: #fbfbfd; }
          td.url { word-break: break-all; }
          a { color: #2456c9; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>XML Sitemap</h1>
        <p class="meta">This sitemap contains <xsl:value-of select="count(s:urlset/s:url)"/> URL(s).</p>
        <table>
          <tr><th>URL</th><th>Last modified</th><th>Change freq.</th><th>Priority</th></tr>
          <xsl:for-each select="s:urlset/s:url">
            <tr>
              <td class="url"><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td>
              <td><xsl:value-of select="s:lastmod"/></td>
              <td><xsl:value-of select="s:changefreq"/></td>
              <td><xsl:value-of select="s:priority"/></td>
            </tr>
          </xsl:for-each>
        </table>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>`;
}
