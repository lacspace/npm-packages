/**
 * Parse a fetched feed — RSS 2.0, RSS 1.0 (RDF), Atom 1.0 or JSON Feed 1.1 — into
 * one normalized shape, so the rest of a pipeline never has to care which format a
 * source publishes. Dates are normalized to ISO-8601 where parseable. Pure and
 * deterministic: give it the body you fetched, get entries back. No network.
 */

import { child, childText, children, parseXml, type XmlNode } from "./xml.js";

export type FeedType = "rss" | "atom" | "rdf" | "json";

export interface Enclosure {
  url: string;
  type?: string;
  length?: number;
}

export interface FeedEntry {
  /** guid / atom:id / json id — a stable key for dedupe. Falls back to link. */
  id?: string;
  title?: string;
  link?: string;
  /** Short description / summary. */
  summary?: string;
  /** Full HTML content when the feed carries it (content:encoded, atom content). */
  content?: string;
  author?: string;
  /** ISO-8601 publish time, when parseable. */
  published?: string;
  /** ISO-8601 last-updated time, when parseable. */
  updated?: string;
  categories: string[];
  enclosure?: Enclosure;
}

export interface ParsedFeed {
  type: FeedType;
  title?: string;
  /** The site the feed represents (not the feed URL). */
  link?: string;
  description?: string;
  /** ISO-8601 feed-level last-updated, when present. */
  updated?: string;
  entries: FeedEntry[];
}

/** Normalize an RFC-822 (RSS) or ISO-8601 (Atom) date string to ISO, or undefined. */
export function toISO(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = Date.parse(s.trim());
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function firstNonEmpty(...xs: (string | undefined)[]): string | undefined {
  for (const x of xs) if (x && x.trim()) return x.trim();
  return undefined;
}

function guidOf(item: XmlNode): string | undefined {
  const g = child(item, "guid");
  const id = g?.text.trim() || childText(item, "id");
  return id || undefined;
}

function enclosureOf(item: XmlNode): Enclosure | undefined {
  // RSS <enclosure url type length>, or media:content, or Atom link rel=enclosure.
  const enc = child(item, "enclosure") ?? child(item, "content");
  if (enc && enc.attrs.url) {
    const length = enc.attrs.length ? Number(enc.attrs.length) : NaN;
    return {
      url: enc.attrs.url,
      ...(enc.attrs.type ? { type: enc.attrs.type } : {}),
      ...(Number.isFinite(length) ? { length } : {}),
    };
  }
  for (const l of children(item, "link")) {
    if (l.attrs.rel === "enclosure" && l.attrs.href) {
      const length = l.attrs.length ? Number(l.attrs.length) : NaN;
      return {
        url: l.attrs.href,
        ...(l.attrs.type ? { type: l.attrs.type } : {}),
        ...(Number.isFinite(length) ? { length } : {}),
      };
    }
  }
  return undefined;
}

function categoriesOf(item: XmlNode): string[] {
  const out: string[] = [];
  for (const c of children(item, "category")) {
    const v = c.text.trim() || c.attrs.term || c.attrs.label;
    if (v) out.push(v);
  }
  return out;
}

/** Atom: pick the alternate link (or the first link without rel="self"/"enclosure"). */
function atomLink(node: XmlNode): string | undefined {
  const links = children(node, "link");
  let fallback: string | undefined;
  for (const l of links) {
    const rel = l.attrs.rel;
    const href = l.attrs.href;
    if (!href) continue;
    if (rel === "alternate" || rel === undefined) return href;
    if (rel !== "self" && rel !== "enclosure" && fallback === undefined) fallback = href;
  }
  return fallback;
}

function parseAtom(root: XmlNode): ParsedFeed {
  const entries: FeedEntry[] = children(root, "entry").map((e) => {
    const author = child(child(e, "author"), "name")?.text.trim() || childText(e, "author");
    const content = firstNonEmpty(childText(e, "content"), childText(e, "summary"));
    const summary = firstNonEmpty(childText(e, "summary"), childText(e, "content"));
    const link = atomLink(e);
    return {
      id: childText(e, "id") || link || undefined,
      title: firstNonEmpty(childText(e, "title")),
      ...(link ? { link } : {}),
      ...(summary ? { summary } : {}),
      ...(content ? { content } : {}),
      ...(author ? { author } : {}),
      ...(toISO(childText(e, "published") || childText(e, "issued")) ? { published: toISO(childText(e, "published") || childText(e, "issued")) } : {}),
      ...(toISO(childText(e, "updated") || childText(e, "modified")) ? { updated: toISO(childText(e, "updated") || childText(e, "modified")) } : {}),
      categories: categoriesOf(e),
      ...(enclosureOf(e) ? { enclosure: enclosureOf(e)! } : {}),
    };
  });
  return {
    type: "atom",
    ...(firstNonEmpty(childText(root, "title")) ? { title: firstNonEmpty(childText(root, "title")) } : {}),
    ...(atomLink(root) ? { link: atomLink(root) } : {}),
    ...(firstNonEmpty(childText(root, "subtitle")) ? { description: firstNonEmpty(childText(root, "subtitle")) } : {}),
    ...(toISO(childText(root, "updated")) ? { updated: toISO(childText(root, "updated")) } : {}),
    entries,
  };
}

function parseRssItem(item: XmlNode): FeedEntry {
  const link = firstNonEmpty(childText(item, "link"), child(item, "guid")?.attrs.ispermalink === "true" ? childText(item, "guid") : undefined);
  const content = firstNonEmpty(childText(item, "encoded"), childText(item, "description"));
  const summary = firstNonEmpty(childText(item, "description"), childText(item, "encoded"));
  const author = firstNonEmpty(childText(item, "creator"), childText(item, "author"));
  const published = toISO(firstNonEmpty(childText(item, "pubdate"), childText(item, "date")));
  const updated = toISO(childText(item, "updated"));
  return {
    ...(guidOf(item) || link ? { id: guidOf(item) || link } : {}),
    ...(firstNonEmpty(childText(item, "title")) ? { title: firstNonEmpty(childText(item, "title")) } : {}),
    ...(link ? { link } : {}),
    ...(summary ? { summary } : {}),
    ...(content ? { content } : {}),
    ...(author ? { author } : {}),
    ...(published ? { published } : {}),
    ...(updated ? { updated } : {}),
    categories: categoriesOf(item),
    ...(enclosureOf(item) ? { enclosure: enclosureOf(item)! } : {}),
  };
}

function parseRss(root: XmlNode): ParsedFeed {
  const channel = child(root, "channel") ?? root;
  const items = children(channel, "item");
  return {
    type: "rss",
    ...(firstNonEmpty(childText(channel, "title")) ? { title: firstNonEmpty(childText(channel, "title")) } : {}),
    ...(firstNonEmpty(childText(channel, "link")) ? { link: firstNonEmpty(childText(channel, "link")) } : {}),
    ...(firstNonEmpty(childText(channel, "description")) ? { description: firstNonEmpty(childText(channel, "description")) } : {}),
    ...(toISO(firstNonEmpty(childText(channel, "lastbuilddate"), childText(channel, "pubdate"))) ? { updated: toISO(firstNonEmpty(childText(channel, "lastbuilddate"), childText(channel, "pubdate"))) } : {}),
    entries: items.map(parseRssItem),
  };
}

function parseRdf(root: XmlNode): ParsedFeed {
  // RSS 1.0: <item> are siblings of <channel> under <rdf:RDF>.
  const channel = child(root, "channel");
  const items = children(root, "item");
  return {
    type: "rdf",
    ...(firstNonEmpty(childText(channel, "title")) ? { title: firstNonEmpty(childText(channel, "title")) } : {}),
    ...(firstNonEmpty(childText(channel, "link")) ? { link: firstNonEmpty(childText(channel, "link")) } : {}),
    ...(firstNonEmpty(childText(channel, "description")) ? { description: firstNonEmpty(childText(channel, "description")) } : {}),
    ...(toISO(childText(channel, "date")) ? { updated: toISO(childText(channel, "date")) } : {}),
    entries: items.map(parseRssItem),
  };
}

interface JsonFeedItem {
  id?: string | number;
  title?: string;
  url?: string;
  external_url?: string;
  summary?: string;
  content_html?: string;
  content_text?: string;
  date_published?: string;
  date_modified?: string;
  author?: { name?: string };
  authors?: { name?: string }[];
  tags?: string[];
  attachments?: { url?: string; mime_type?: string; size_in_bytes?: number }[];
}

function parseJsonFeed(obj: Record<string, unknown>): ParsedFeed {
  const items = Array.isArray(obj.items) ? (obj.items as JsonFeedItem[]) : [];
  const entries: FeedEntry[] = items.map((it) => {
    const author = it.author?.name || it.authors?.[0]?.name;
    const link = it.url || it.external_url;
    const att = it.attachments?.[0];
    const enclosure: Enclosure | undefined = att?.url
      ? { url: att.url, ...(att.mime_type ? { type: att.mime_type } : {}), ...(Number.isFinite(att.size_in_bytes) ? { length: att.size_in_bytes! } : {}) }
      : undefined;
    return {
      ...(it.id !== undefined || link ? { id: it.id !== undefined ? String(it.id) : link } : {}),
      ...(it.title ? { title: it.title } : {}),
      ...(link ? { link } : {}),
      ...(it.summary ? { summary: it.summary } : {}),
      ...(it.content_html || it.content_text ? { content: it.content_html || it.content_text } : {}),
      ...(author ? { author } : {}),
      ...(toISO(it.date_published) ? { published: toISO(it.date_published) } : {}),
      ...(toISO(it.date_modified) ? { updated: toISO(it.date_modified) } : {}),
      categories: Array.isArray(it.tags) ? it.tags.filter(Boolean) : [],
      ...(enclosure ? { enclosure } : {}),
    };
  });
  return {
    type: "json",
    ...(typeof obj.title === "string" ? { title: obj.title } : {}),
    ...(typeof obj.home_page_url === "string" ? { link: obj.home_page_url } : {}),
    ...(typeof obj.description === "string" ? { description: obj.description } : {}),
    entries,
  };
}

/**
 * Parse a feed body of any supported format into a normalized {@link ParsedFeed}.
 * Returns null when the body is not a recognizable feed. Never throws.
 */
export function parseFeed(body: string): ParsedFeed | null {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return null;

  // JSON Feed.
  if (trimmed[0] === "{") {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj && (Array.isArray(obj.items) || typeof obj.version === "string")) return parseJsonFeed(obj);
    } catch {
      return null;
    }
    return null;
  }

  const root = parseXml(trimmed);
  if (!root) return null;
  const name = root.name.toLowerCase();
  if (name.endsWith("rdf")) return parseRdf(root);
  if (name === "feed" || name.endsWith(":feed")) return parseAtom(root);
  if (name === "rss" || name.endsWith(":rss") || child(root, "channel")) return parseRss(root);
  return null;
}
