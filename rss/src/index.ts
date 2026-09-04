/**
 * @lacspace/rss
 * Generate RSS 2.0, Atom 1.0 and JSON Feed 1.1 from one set of items.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface FeedItem {
  title: string;
  link: string;
  /** Stable unique id / guid. Defaults to `link`. */
  id?: string;
  description?: string;
  /** Full HTML content. */
  content?: string;
  author?: string;
  date?: string | Date;
  categories?: string[];
  enclosure?: { url: string; type: string; length?: number };
}

export interface FeedOptions {
  title: string;
  /** Site URL. */
  link: string;
  description?: string;
  /** Feed id (Atom). Defaults to `link`. */
  id?: string;
  language?: string;
  updated?: string | Date;
  author?: string;
  copyright?: string;
  /** Self URL of this feed. */
  feedUrl?: string;
  image?: string;
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

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function toDate(d?: string | Date): Date {
  if (d instanceof Date) return d;
  if (typeof d === "string") return new Date(d);
  return new Date(0);
}

/** Parse to a Date, returning null for invalid inputs (so callers can omit the field instead of throwing). */
function validDate(d?: string | Date): Date | null {
  const date = toDate(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function rfc822(d: Date): string {
  return d.toUTCString();
}

function iso(d: Date): string {
  return d.toISOString();
}

function latest(feed: FeedOptions, items: FeedItem[]): Date {
  if (feed.updated) return toDate(feed.updated);
  const dates = items.map((i) => toDate(i.date).getTime()).filter((t) => t > 0);
  return dates.length ? new Date(Math.max(...dates)) : new Date(0);
}

/** Build an RSS 2.0 feed. */
export function rss(feed: FeedOptions, items: FeedItem[]): string {
  const body = items
    .map((it) => {
      const parts = [
        `      <title>${esc(it.title)}</title>`,
        `      <link>${esc(it.link)}</link>`,
        `      <guid isPermaLink="${it.id ? "false" : "true"}">${esc(it.id ?? it.link)}</guid>`,
      ];
      const pubDate = validDate(it.date);
      if (pubDate) parts.push(`      <pubDate>${rfc822(pubDate)}</pubDate>`);
      if (it.author) parts.push(`      <author>${esc(it.author)}</author>`);
      for (const c of it.categories ?? []) parts.push(`      <category>${esc(c)}</category>`);
      if (it.description) parts.push(`      <description>${cdata(it.description)}</description>`);
      if (it.content)
        parts.push(`      <content:encoded>${cdata(it.content)}</content:encoded>`);
      if (it.enclosure)
        parts.push(
          `      <enclosure url="${esc(it.enclosure.url)}" type="${esc(it.enclosure.type)}"${
            it.enclosure.length ? ` length="${it.enclosure.length}"` : ""
          } />`,
        );
      return `    <item>\n${parts.join("\n")}\n    </item>`;
    })
    .join("\n");

  const head = [
    `    <title>${esc(feed.title)}</title>`,
    `    <link>${esc(feed.link)}</link>`,
    `    <description>${esc(feed.description ?? feed.title)}</description>`,
    `    <lastBuildDate>${rfc822(validDate(latest(feed, items)) ?? new Date(0))}</lastBuildDate>`,
  ];
  if (feed.language) head.push(`    <language>${esc(feed.language)}</language>`);
  if (feed.copyright) head.push(`    <copyright>${esc(feed.copyright)}</copyright>`);
  if (feed.feedUrl)
    head.push(
      `    <atom:link href="${esc(feed.feedUrl)}" rel="self" type="application/rss+xml" />`,
    );
  if (feed.image)
    head.push(
      `    <image><url>${esc(feed.image)}</url><title>${esc(feed.title)}</title><link>${esc(feed.link)}</link></image>`,
    );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n` +
    head.join("\n") +
    "\n" +
    body +
    `\n  </channel>\n</rss>`
  );
}

/** Build an Atom 1.0 feed. */
export function atom(feed: FeedOptions, items: FeedItem[]): string {
  const entries = items
    .map((it) => {
      const parts = [
        `    <title>${esc(it.title)}</title>`,
        `    <link href="${esc(it.link)}" />`,
        `    <id>${esc(it.id ?? it.link)}</id>`,
      ];
      const updated = validDate(it.date);
      if (updated) parts.push(`    <updated>${iso(updated)}</updated>`);
      if (it.author) parts.push(`    <author><name>${esc(it.author)}</name></author>`);
      for (const c of it.categories ?? []) parts.push(`    <category term="${esc(c)}" />`);
      if (it.content) parts.push(`    <content type="html">${cdata(it.content)}</content>`);
      else if (it.description)
        parts.push(`    <summary type="html">${cdata(it.description)}</summary>`);
      return `  <entry>\n${parts.join("\n")}\n  </entry>`;
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom">\n` +
    `  <title>${esc(feed.title)}</title>\n` +
    `  <id>${esc(feed.id ?? feed.link)}</id>\n` +
    `  <link href="${esc(feed.link)}" />\n` +
    (feed.feedUrl ? `  <link href="${esc(feed.feedUrl)}" rel="self" />\n` : "") +
    `  <updated>${iso(validDate(latest(feed, items)) ?? new Date(0))}</updated>\n` +
    (feed.author ? `  <author><name>${esc(feed.author)}</name></author>\n` : "") +
    (feed.description ? `  <subtitle>${esc(feed.description)}</subtitle>\n` : "") +
    entries +
    `\n</feed>`
  );
}

export interface JsonFeed {
  version: string;
  title: string;
  home_page_url: string;
  feed_url?: string;
  description?: string;
  language?: string;
  items: {
    id: string;
    url: string;
    title: string;
    content_html?: string;
    summary?: string;
    date_published?: string;
    authors?: { name: string }[];
    tags?: string[];
  }[];
}

/** Build a JSON Feed 1.1 object. */
export function jsonFeed(feed: FeedOptions, items: FeedItem[]): JsonFeed {
  return {
    version: "https://jsonfeed.org/version/1.1",
    title: feed.title,
    home_page_url: feed.link,
    feed_url: feed.feedUrl,
    description: feed.description,
    language: feed.language,
    items: items.map((it) => ({
      id: it.id ?? it.link,
      url: it.link,
      title: it.title,
      content_html: it.content,
      summary: it.description,
      date_published: (() => {
        const d = it.date ? validDate(it.date) : null;
        return d ? iso(d) : undefined;
      })(),
      authors: it.author ? [{ name: it.author }] : undefined,
      tags: it.categories,
    })),
  };
}

/* ------------------------------ adapters ------------------------------ */

/** RSS 2.0 as a Fetch/edge `Response` (application/rss+xml). */
export function rssResponse(feed: FeedOptions, items: FeedItem[], init: ResponseInit = {}): Response {
  return new Response(rss(feed, items), {
    ...init,
    headers: { "content-type": "application/rss+xml; charset=utf-8", ...(init.headers ?? {}) },
  });
}

/** Atom 1.0 as a Fetch/edge `Response` (application/atom+xml). */
export function atomResponse(feed: FeedOptions, items: FeedItem[], init: ResponseInit = {}): Response {
  return new Response(atom(feed, items), {
    ...init,
    headers: { "content-type": "application/atom+xml; charset=utf-8", ...(init.headers ?? {}) },
  });
}

/** JSON Feed 1.1 as a Fetch/edge `Response` (application/feed+json). */
export function jsonFeedResponse(feed: FeedOptions, items: FeedItem[], init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(jsonFeed(feed, items)), {
    ...init,
    headers: { "content-type": "application/feed+json; charset=utf-8", ...(init.headers ?? {}) },
  });
}

/** Minimal site shape shared across the Lacspace SEO Kit (structural, no imports). */
export interface SiteLike {
  /** Brand / site name → feed title. */
  name?: string;
  /** Absolute base URL, e.g. "https://acme.com". */
  url: string;
  /** Feed / site description. */
  description?: string;
  /** Language, e.g. "en". */
  locale?: string;
}

/**
 * Prefill a {@link FeedOptions} from your site config, so a feed route is one line:
 * `rss(feedForSite(site), posts)`. Auto-fills title, link, feedUrl and language.
 * @example rss(feedForSite({ name: "Acme Blog", url: "https://acme.com" }, "/feed.xml"), items)
 */
export function feedForSite(site: SiteLike, feedPath = "/feed.xml"): FeedOptions {
  const base = site.url.replace(/\/$/, "");
  return {
    title: site.name ?? base,
    link: base,
    description: site.description,
    feedUrl: /^https?:\/\//.test(feedPath) ? feedPath : `${base}${feedPath.startsWith("/") ? "" : "/"}${feedPath}`,
    language: site.locale ? site.locale.replace(/_/g, "-").toLowerCase() : undefined,
  };
}
