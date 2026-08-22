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
      if (it.date) parts.push(`      <pubDate>${rfc822(toDate(it.date))}</pubDate>`);
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
    `    <lastBuildDate>${rfc822(latest(feed, items))}</lastBuildDate>`,
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
        `    <updated>${iso(toDate(it.date))}</updated>`,
      ];
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
    `  <updated>${iso(latest(feed, items))}</updated>\n` +
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
      date_published: it.date ? iso(toDate(it.date)) : undefined,
      authors: it.author ? [{ name: it.author }] : undefined,
      tags: it.categories,
    })),
  };
}
