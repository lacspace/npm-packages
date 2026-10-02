import { parseAnyDate, ParseOptions } from "./parse.js";

export type DateSource = "jsonld" | "meta" | "time" | "url" | "byline" | "text";

export interface DateCandidate {
  date: Date;
  source: DateSource;
  /** The raw string the date was read from. */
  raw: string;
  /** Whether this candidate was a publish or modify signal. */
  kind: "published" | "modified";
}

export interface ExtractedDate {
  publishedAt: Date | null;
  modifiedAt: Date | null;
  /** The source that produced `publishedAt`. */
  source: DateSource | null;
  /** 0–1 confidence in `publishedAt`, by source reliability. */
  confidence: number;
  /** Every candidate found, in discovery order. */
  candidates: DateCandidate[];
}

const CONFIDENCE: Record<DateSource, number> = {
  jsonld: 0.95, meta: 0.9, time: 0.8, url: 0.6, byline: 0.5, text: 0.4,
};
// Priority order when choosing publishedAt (higher wins).
const PRIORITY: DateSource[] = ["jsonld", "meta", "time", "url", "byline", "text"];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0*39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#x?[0-9a-f]+;/gi, " ");
}

// --- JSON-LD ------------------------------------------------------------------------
function walkJsonLd(node: unknown, out: { published: string[]; modified: string[] }): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, out);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (typeof v === "string") {
      if (key === "datepublished" || key === "datecreated") out.published.push(v);
      else if (key === "datemodified" || key === "dateupdated") out.modified.push(v);
    } else if (v && typeof v === "object") {
      walkJsonLd(v, out); // @graph, arrays, nested objects
    }
  }
}

function fromJsonLd(html: string, opts: ParseOptions, cands: DateCandidate[]): void {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]!.trim());
    } catch {
      continue; // tolerate malformed blocks
    }
    const found = { published: [] as string[], modified: [] as string[] };
    walkJsonLd(parsed, found);
    for (const raw of found.published) {
      const date = parseAnyDate(raw, opts);
      if (date) cands.push({ date, source: "jsonld", raw, kind: "published" });
    }
    for (const raw of found.modified) {
      const date = parseAnyDate(raw, opts);
      if (date) cands.push({ date, source: "jsonld", raw, kind: "modified" });
    }
  }
}

// --- meta tags ----------------------------------------------------------------------
const META_PUBLISHED = new Set([
  "article:published_time", "og:published_time", "pubdate", "publishdate", "publish-date",
  "date", "dc.date", "dc.date.issued", "sailthru.date", "parsely-pub-date",
  "datepublished", "cxenseparse:recs:publishtime", "timestamp",
]);
const META_MODIFIED = new Set([
  "article:modified_time", "og:updated_time", "dc.date.modified", "lastmod",
  "datemodified", "revised",
]);

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return m ? decodeEntities(m[1]!).trim() : undefined;
}

function fromMeta(html: string, opts: ParseOptions, cands: DateCandidate[]): void {
  const re = /<meta\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const tag = m[0];
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? attr(tag, "itemprop") ?? "").toLowerCase();
    if (!key) continue;
    const content = attr(tag, "content");
    if (!content) continue;
    const kind = META_PUBLISHED.has(key) ? "published" : META_MODIFIED.has(key) ? "modified" : null;
    if (!kind) continue;
    const date = parseAnyDate(content, opts);
    if (date) cands.push({ date, source: "meta", raw: content, kind });
  }
}

// --- <time datetime> ----------------------------------------------------------------
function fromTime(html: string, opts: ParseOptions, cands: DateCandidate[]): void {
  const re = /<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = decodeEntities(m[1]!).trim();
    const date = parseAnyDate(raw, opts);
    if (date) cands.push({ date, source: "time", raw, kind: "published" });
  }
}

// --- URL patterns -------------------------------------------------------------------
function fromUrl(url: string, opts: ParseOptions, cands: DateCandidate[]): void {
  if (!url) return;
  const patterns: RegExp[] = [
    /\/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\/|$|\?)/, // /2019/09/10/
    /[/_-](\d{4})-(\d{2})-(\d{2})(?:[/_.-]|$|\?)/, // -2019-09-10
    /[/_-](\d{4})(\d{2})(\d{2})(?:[/_.-]|$|\?)/, // /20190910
    /[?&]date=(\d{4})-?(\d{2})-?(\d{2})/, // ?date=2019-09-10
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const raw = `${m[1]}-${m[2]}-${m[3]}`;
      const date = parseAnyDate(raw, opts);
      if (date) {
        cands.push({ date, source: "url", raw, kind: "published" });
        return;
      }
    }
  }
}

// --- visible byline / body text -----------------------------------------------------
function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ");
}

function fromText(html: string, opts: ParseOptions, cands: DateCandidate[]): void {
  const text = stripTags(html);
  // Look near the top (where bylines live) first, then the whole body.
  const head = text.slice(0, 1200);
  for (const chunk of [head, text]) {
    const date = scanText(chunk, opts);
    if (date) {
      cands.push({ date: date.date, source: chunk === head ? "byline" : "text", raw: date.raw, kind: "published" });
      return;
    }
  }
}

function scanText(text: string, opts: ParseOptions): { date: Date; raw: string } | null {
  // Try each date-ish window; return the first that parses.
  const windows = text.match(
    /(?:वि\.?\s*सं\.?|बि\.?\s*सं\.?)?\s*[०-९\d]{1,4}[^.?!\n]{0,24}?(?:[०-९\d]{1,4})/g,
  ) ?? [];
  for (const w of windows) {
    const d = parseAnyDate(w, opts);
    if (d) return { date: d, raw: w.trim() };
  }
  // Relative phrases ("2 hours ago", "३ घण्टा अगाडि", "today", "आज").
  const rel = text.match(/\d+\s*(?:second|minute|hour|day|week|month|year)s?\s*(?:ago|back)|today|yesterday|[०-९\d]+\s*\S+\s*(?:अगाडि|अघि|पहिले)|आज|हिजो/i);
  if (rel) {
    const d = parseAnyDate(rel[0], opts);
    if (d) return { date: d, raw: rel[0].trim() };
  }
  return null;
}

/**
 * Extract the published (and modified) date of an article from its HTML + URL.
 * Reads, in priority order: JSON-LD, meta tags, `<time datetime>`, URL patterns,
 * visible byline/body text — including Nepali Bikram Sambat dates and relative
 * phrases. Deterministic. Rejects dates before 1990 or more than ~1 day in the future.
 */
export function extractPublishedDate(html: string, url = "", options: ParseOptions = {}): ExtractedDate {
  const cands: DateCandidate[] = [];
  const h = html ?? "";
  fromJsonLd(h, options, cands);
  fromMeta(h, options, cands);
  fromTime(h, options, cands);
  fromUrl(url, options, cands);
  fromText(h, options, cands);

  const published = cands.filter((c) => c.kind === "published");
  let best: DateCandidate | null = null;
  for (const c of published) {
    if (!best || PRIORITY.indexOf(c.source) < PRIORITY.indexOf(best.source)) best = c;
  }
  const modified = cands.filter((c) => c.kind === "modified");
  let bestMod: DateCandidate | null = null;
  for (const c of modified) {
    if (!bestMod || PRIORITY.indexOf(c.source) < PRIORITY.indexOf(bestMod.source)) bestMod = c;
  }

  return {
    publishedAt: best?.date ?? null,
    modifiedAt: bestMod?.date ?? null,
    source: best?.source ?? null,
    confidence: best ? CONFIDENCE[best.source] : 0,
    candidates: cands,
  };
}
