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
  /**
   * MRSS `media:content` — one or many. Emitted by both {@link rss} and
   * {@link atom} when present. Purely additive; omit for classic feeds.
   */
  media?: MediaContent | MediaContent[];
}

/** A Media RSS (`media:content`) resource attached to a feed item. */
export interface MediaContent {
  url: string;
  /** MIME type, e.g. "image/jpeg". */
  type?: string;
  /** Coarse kind of media. */
  medium?: "image" | "audio" | "video" | "document" | "executable";
  width?: number;
  height?: number;
  /** Byte size. */
  fileSize?: number;
  /** Duration in seconds (audio/video). */
  duration?: number;
  /** Human title for the media object. */
  title?: string;
  /** Whether this is the default representation. */
  isDefault?: boolean;
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

function mediaList(m?: MediaContent | MediaContent[]): MediaContent[] {
  if (!m) return [];
  return Array.isArray(m) ? m : [m];
}

/** Render one `media:content` element (shared by rss/atom). */
function mediaContentXml(m: MediaContent, indent: string): string {
  const attrs = [`url="${esc(m.url)}"`];
  if (m.type) attrs.push(`type="${esc(m.type)}"`);
  if (m.medium) attrs.push(`medium="${esc(m.medium)}"`);
  if (m.width != null) attrs.push(`width="${m.width}"`);
  if (m.height != null) attrs.push(`height="${m.height}"`);
  if (m.fileSize != null) attrs.push(`fileSize="${m.fileSize}"`);
  if (m.duration != null) attrs.push(`duration="${m.duration}"`);
  if (m.isDefault) attrs.push(`isDefault="true"`);
  if (m.title) {
    return (
      `${indent}<media:content ${attrs.join(" ")}>\n` +
      `${indent}  <media:title type="plain">${esc(m.title)}</media:title>\n` +
      `${indent}</media:content>`
    );
  }
  return `${indent}<media:content ${attrs.join(" ")} />`;
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
      for (const m of mediaList(it.media)) parts.push(mediaContentXml(m, "      "));
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
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n  <channel>\n` +
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
      if (it.enclosure)
        parts.push(
          `    <link rel="enclosure" href="${esc(it.enclosure.url)}" type="${esc(it.enclosure.type)}"${
            it.enclosure.length ? ` length="${it.enclosure.length}"` : ""
          } />`,
        );
      for (const m of mediaList(it.media)) parts.push(mediaContentXml(m, "    "));
      return `  <entry>\n${parts.join("\n")}\n  </entry>`;
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">\n` +
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

/* ------------------------------ podcast (iTunes) ------------------------------ */

/** The podcast owner (iTunes `itunes:owner`). */
export interface PodcastOwner {
  name?: string;
  email?: string;
}

/**
 * A podcast channel — extends {@link FeedOptions} with the fields Apple
 * Podcasts / Spotify require. `image` (a square cover ≥1400px) is used as
 * both the RSS `<image>` and `itunes:image`.
 */
export interface PodcastFeed extends FeedOptions {
  /** Podcast author (`itunes:author`). Falls back to {@link FeedOptions.author}. */
  itunesAuthor?: string;
  /**
   * One or more `itunes:category` labels. Nested categories use "Parent > Child",
   * e.g. "Technology" or "Society & Culture > Personal Journals".
   */
  category?: string | string[];
  /** `itunes:explicit`. */
  explicit?: boolean;
  owner?: PodcastOwner;
  /** `itunes:type`. */
  podcastType?: "episodic" | "serial";
  /** `itunes:summary` — long description. Falls back to `description`. */
  summary?: string;
  /** Mark the whole show complete (`itunes:complete`). */
  complete?: boolean;
}

/** A podcast episode — a {@link FeedItem} whose `enclosure` (the audio file) is required. */
export interface PodcastEpisode extends FeedItem {
  /** The media file. Required for podcasts. */
  enclosure: { url: string; type: string; length?: number };
  /** `itunes:duration` — seconds (number) or "HH:MM:SS" / "MM:SS" (string). */
  duration?: string | number;
  /** `itunes:episode` number. */
  episode?: number;
  /** `itunes:season` number. */
  season?: number;
  /** `itunes:episodeType`. */
  episodeType?: "full" | "trailer" | "bonus";
  /** Per-episode `itunes:image`. */
  image?: string;
  /** `itunes:explicit` for this episode. */
  explicit?: boolean;
  /** `itunes:summary` for this episode. Falls back to `description`. */
  summary?: string;
}

/** Format seconds → "HH:MM:SS"; pass strings through unchanged. */
function itunesDuration(d: string | number): string {
  if (typeof d === "string") return d;
  const total = Math.max(0, Math.floor(d));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function yesNo(b: boolean): string {
  return b ? "yes" : "no";
}

/**
 * Build an RSS 2.0 feed with the iTunes podcast namespace — ready for Apple
 * Podcasts, Spotify and other directories. Existing {@link rss} is untouched;
 * this adds channel `itunes:author/image/category/explicit/owner` and per-episode
 * `<enclosure>`, `itunes:duration/episode/season/episodeType` and `<guid>`.
 *
 * @example
 * podcastRss(
 *   { title: "The Show", link: "https://show.fm", image: "https://show.fm/cover.jpg",
 *     itunesAuthor: "Jane", category: "Technology", explicit: false,
 *     owner: { name: "Jane", email: "jane@show.fm" } },
 *   [{ title: "Ep 1", link: "https://show.fm/1", duration: 1830, episode: 1,
 *      enclosure: { url: "https://show.fm/1.mp3", type: "audio/mpeg", length: 29344 } }],
 * );
 */
export function podcastRss(feed: PodcastFeed, episodes: PodcastEpisode[]): string {
  const author = feed.itunesAuthor ?? feed.author;
  const summary = feed.summary ?? feed.description;

  const head = [
    `    <title>${esc(feed.title)}</title>`,
    `    <link>${esc(feed.link)}</link>`,
    `    <description>${esc(feed.description ?? feed.title)}</description>`,
    `    <lastBuildDate>${rfc822(validDate(latest(feed, episodes)) ?? new Date(0))}</lastBuildDate>`,
  ];
  if (feed.language) head.push(`    <language>${esc(feed.language)}</language>`);
  if (feed.copyright) head.push(`    <copyright>${esc(feed.copyright)}</copyright>`);
  if (feed.feedUrl)
    head.push(
      `    <atom:link href="${esc(feed.feedUrl)}" rel="self" type="application/rss+xml" />`,
    );
  if (feed.image) {
    head.push(
      `    <image><url>${esc(feed.image)}</url><title>${esc(feed.title)}</title><link>${esc(feed.link)}</link></image>`,
    );
    head.push(`    <itunes:image href="${esc(feed.image)}" />`);
  }
  if (author) head.push(`    <itunes:author>${esc(author)}</itunes:author>`);
  if (summary) head.push(`    <itunes:summary>${cdata(summary)}</itunes:summary>`);
  if (feed.explicit != null)
    head.push(`    <itunes:explicit>${yesNo(feed.explicit)}</itunes:explicit>`);
  if (feed.podcastType) head.push(`    <itunes:type>${esc(feed.podcastType)}</itunes:type>`);
  if (feed.owner) {
    const parts: string[] = [];
    if (feed.owner.name) parts.push(`      <itunes:name>${esc(feed.owner.name)}</itunes:name>`);
    if (feed.owner.email) parts.push(`      <itunes:email>${esc(feed.owner.email)}</itunes:email>`);
    head.push(`    <itunes:owner>\n${parts.join("\n")}\n    </itunes:owner>`);
  }
  for (const cat of feed.category ? (Array.isArray(feed.category) ? feed.category : [feed.category]) : []) {
    const [parent, child] = cat.split(">").map((s) => s.trim());
    if (child) {
      head.push(
        `    <itunes:category text="${esc(parent!)}"><itunes:category text="${esc(child)}" /></itunes:category>`,
      );
    } else {
      head.push(`    <itunes:category text="${esc(parent!)}" />`);
    }
  }
  if (feed.complete) head.push(`    <itunes:complete>yes</itunes:complete>`);

  const body = episodes
    .map((ep) => {
      const parts = [
        `      <title>${esc(ep.title)}</title>`,
        `      <link>${esc(ep.link)}</link>`,
        `      <guid isPermaLink="${ep.id ? "false" : "true"}">${esc(ep.id ?? ep.link)}</guid>`,
        `      <enclosure url="${esc(ep.enclosure.url)}" type="${esc(ep.enclosure.type)}"${
          ep.enclosure.length ? ` length="${ep.enclosure.length}"` : ""
        } />`,
      ];
      const pubDate = validDate(ep.date);
      if (pubDate) parts.push(`      <pubDate>${rfc822(pubDate)}</pubDate>`);
      if (ep.author) parts.push(`      <itunes:author>${esc(ep.author)}</itunes:author>`);
      for (const c of ep.categories ?? []) parts.push(`      <category>${esc(c)}</category>`);
      const epSummary = ep.summary ?? ep.description;
      if (epSummary) parts.push(`      <description>${cdata(epSummary)}</description>`);
      if (ep.content)
        parts.push(`      <content:encoded>${cdata(ep.content)}</content:encoded>`);
      if (ep.duration != null)
        parts.push(`      <itunes:duration>${esc(itunesDuration(ep.duration))}</itunes:duration>`);
      if (ep.season != null) parts.push(`      <itunes:season>${ep.season}</itunes:season>`);
      if (ep.episode != null) parts.push(`      <itunes:episode>${ep.episode}</itunes:episode>`);
      if (ep.episodeType)
        parts.push(`      <itunes:episodeType>${esc(ep.episodeType)}</itunes:episodeType>`);
      if (ep.explicit != null)
        parts.push(`      <itunes:explicit>${yesNo(ep.explicit)}</itunes:explicit>`);
      if (ep.image) parts.push(`      <itunes:image href="${esc(ep.image)}" />`);
      for (const m of mediaList(ep.media)) parts.push(mediaContentXml(m, "      "));
      return `    <item>\n${parts.join("\n")}\n    </item>`;
    })
    .join("\n");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">\n  <channel>\n` +
    head.join("\n") +
    "\n" +
    body +
    `\n  </channel>\n</rss>`
  );
}

/** Podcast RSS as a Fetch/edge `Response` (application/rss+xml). */
export function podcastRssResponse(
  feed: PodcastFeed,
  episodes: PodcastEpisode[],
  init: ResponseInit = {},
): Response {
  return new Response(podcastRss(feed, episodes), {
    ...init,
    headers: { "content-type": "application/rss+xml; charset=utf-8", ...(init.headers ?? {}) },
  });
}
