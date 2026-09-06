/**
 * Feed parsing — turn an RSS 2.0, Atom or JSON Feed document into flat records
 * (one per entry) you can export like anything else. Dependency-free: XML feeds
 * are scraped with tolerant regex (feeds are far more regular than HTML), JSON
 * Feed via `JSON.parse`. Reuses {@link decodeEntities} for HTML entities.
 */
import { decodeEntities } from "./html.js";
import type { ScrapeRecord } from "./types.js";

/** One normalized feed entry. */
export interface FeedItem extends ScrapeRecord {
  title: string;
  link: string;
  date: string;
  summary: string;
  id: string;
  author: string;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

/** Read the inner text of the first `<name>…</name>` in a block. */
function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i");
  const m = re.exec(block);
  if (!m) return "";
  return decodeEntities(stripCdata(m[1]!)).replace(/\s+/g, " ").trim();
}

/** First matching tag among several candidates. */
function firstTag(block: string, names: string[]): string {
  for (const n of names) { const v = tag(block, n); if (v) return v; }
  return "";
}

/** Pick a link from an Atom entry's `<link>` elements (prefer alternate). */
function atomLink(block: string): string {
  const links: { href: string; rel: string }[] = [];
  for (const m of block.matchAll(/<link\b([^>]*)\/?>/gi)) {
    const attrs = m[1]!;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? "alternate";
    links.push({ href: decodeEntities(href), rel });
  }
  if (!links.length) return "";
  return (links.find((l) => l.rel === "alternate") ?? links.find((l) => l.rel !== "self") ?? links[0]!).href;
}

function blocks(xml: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]!);
  return out;
}

function fromJsonFeed(json: { items?: unknown[]; authors?: { name?: string }[]; author?: { name?: string } }): FeedItem[] {
  const items = Array.isArray(json.items) ? json.items : [];
  const feedAuthor = json.author?.name ?? json.authors?.[0]?.name ?? "";
  return items.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    const author =
      (it.author as { name?: string } | undefined)?.name ??
      (Array.isArray(it.authors) ? (it.authors[0] as { name?: string })?.name : undefined) ??
      feedAuthor;
    return {
      title: String(it.title ?? ""),
      link: String(it.url ?? it.external_url ?? it.id ?? ""),
      date: String(it.date_published ?? it.date_modified ?? ""),
      summary: String(it.summary ?? it.content_text ?? it.content_html ?? ""),
      id: String(it.id ?? it.url ?? ""),
      author: String(author ?? ""),
    };
  });
}

/**
 * Parse a feed document (RSS/Atom XML or JSON Feed) into normalized records.
 * Each record has `title, link, date, summary, id, author`. Pure — pass the
 * already-fetched text. Returns `[]` for content it can't recognize as a feed.
 */
export function parseFeed(text: string): FeedItem[] {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try { return fromJsonFeed(JSON.parse(trimmed)); } catch { return []; }
  }

  const isAtom = /<feed[\s>]/i.test(trimmed) && !/<rss[\s>]/i.test(trimmed);
  const entryTag = isAtom ? "entry" : "item";
  return blocks(trimmed, entryTag).map((block): FeedItem => ({
    title: firstTag(block, ["title"]),
    link: isAtom ? atomLink(block) : firstTag(block, ["link", "guid"]),
    date: firstTag(block, ["pubDate", "published", "updated", "dc:date", "date"]),
    summary: firstTag(block, ["description", "summary", "content", "content:encoded"]),
    id: firstTag(block, isAtom ? ["id"] : ["guid", "link"]),
    // Atom nests the author under <author><name>…</name></author>.
    author: isAtom ? firstTag(block, ["name"]) : firstTag(block, ["author", "dc:creator", "creator"]),
  }));
}
