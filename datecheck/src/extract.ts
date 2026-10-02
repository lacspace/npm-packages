import { parseAnyDate, ParseOptions } from "./parse.js";

export type DateSource = "jsonld" | "meta" | "time" | "url" | "byline" | "text";

export interface DateCandidate {
  date: Date;
  source: DateSource;
  /** The raw string the date was read from. */
  raw: string;
  /** Whether this candidate was a publish or modify signal. */
  kind: "published" | "modified";
  /** True when the date came from a relative phrase ("today"/"आज") — lower trust. */
  relative?: boolean;
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
  jsonld: 0.95, meta: 0.9, time: 0.8, url: 0.6, byline: 0.7, text: 0.4,
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
// Class/id words that mark SITE CHROME (header, sidebar, related lists) — a date there
// is not the article's own date and must be ignored. The ICT Samachar bug was a header
// "today" bar being read as the publish date.
const CHROME_RE = /(?:^|[\s_-])(?:header|headbar|topbar|masthead|nav|navbar|navigation|menu|sidebar|aside|footer|widget|related|recommend(?:ed)?|popular|trending|most-?read|breadcrumb|today-?bar|ticker)(?:[\s_-]|$)/i;
// Class/id or label words that mark the ARTICLE's own publish date (strong → weak).
const STRONG_DATE_RE = /(?:post__?date|post-?date|article-?date|entry-?date|published|publish-?date|pubdate|byline|news-post-hour|प्रकाशित|मिति)/i;
const WEAK_DATE_RE = /(?:\bdate\b|\btime\b|datetime|mitti|dateline|timestamp)/i;
const RELATIVE_RE = /\b(?:today|yesterday|just now)\b|आज|हिजो|भर्खरै|अहिले|\bago\b|अगाडि|अघि/i;

function stripScriptStyle(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
}

/** Remove whole site-chrome container blocks (best-effort) so their dates never win. */
function stripChrome(html: string): string {
  let h = html;
  for (const tag of ["header", "nav", "aside", "footer"]) {
    h = h.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi"), " ");
  }
  return h;
}

function textOf(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function isRelative(raw: string): boolean {
  return RELATIVE_RE.test(raw) && !/\d{4}/.test(normalizeDigitsLocal(raw));
}
function normalizeDigitsLocal(s: string): string {
  return s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
}

/** Dates in elements whose class/id (or a nearby label) marks the article's own date. */
function fromByline(html: string, opts: ParseOptions, cands: DateCandidate[]): void {
  const clean = stripChrome(html);
  // 1) Classed/id'd elements — strong date classes first, then weak, skipping chrome.
  const elemRe = /<(\w+)\b([^>]*(?:class|id)\s*=\s*["'][^"']*["'][^>]*)>([\s\S]*?)<\/\1>/gi;
  const strong: DateCandidate[] = [];
  const weak: DateCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = elemRe.exec(clean))) {
    const attrs = m[2]!;
    if (CHROME_RE.test(attrs)) continue;
    const inner = textOf(m[3]!);
    if (!inner || inner.length > 120) continue;
    const bucket = STRONG_DATE_RE.test(attrs) ? strong : WEAK_DATE_RE.test(attrs) ? weak : null;
    if (!bucket) continue;
    const date = parseAnyDate(inner, opts);
    if (date) bucket.push({ date, source: "byline", raw: inner, kind: "published", relative: isRelative(inner) });
  }
  // 2) A "Published"/"प्रकाशित"/"मिति" label followed by a date, anywhere in content.
  const labelRe = /(?:published|प्रकाशित(?:\s*मिति)?|मिति)\s*[:：-]?\s*([^<\n]{3,60})/gi;
  while ((m = labelRe.exec(textOf(clean)))) {
    const date = parseAnyDate(m[1]!, opts);
    if (date) strong.push({ date, source: "byline", raw: m[1]!.trim(), kind: "published", relative: isRelative(m[1]!) });
  }
  for (const c of [...strong, ...weak]) cands.push(c);
}

/** A last-resort scan of the body text (chrome removed), concrete dates preferred. */
function fromBodyText(html: string, opts: ParseOptions, cands: DateCandidate[]): void {
  const text = textOf(stripChrome(html));
  const windows = text.match(
    /(?:वि\.?\s*सं\.?|बि\.?\s*सं\.?)?\s*[A-Za-z०-९\d][^.?!\n<]{0,30}?(?:[०-९\d]{1,4})/g,
  ) ?? [];
  for (const w of windows) {
    const d = parseAnyDate(w, opts);
    if (d) {
      cands.push({ date: d, source: "text", raw: w.trim(), kind: "published", relative: false });
      return;
    }
  }
  const rel = text.match(/\d+\s*(?:hour|minute|day)s?\s*ago|today|yesterday|आज|हिजो/i);
  if (rel) {
    const d = parseAnyDate(rel[0], opts);
    if (d) cands.push({ date: d, source: "text", raw: rel[0].trim(), kind: "published", relative: true });
  }
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
  fromByline(h, options, cands);
  fromBodyText(h, options, cands);

  // A concrete date always beats a relative one ("आज"); then higher-priority source.
  const better = (a: DateCandidate, b: DateCandidate): boolean => {
    if (!!a.relative !== !!b.relative) return !a.relative;
    return PRIORITY.indexOf(a.source) < PRIORITY.indexOf(b.source);
  };
  let best: DateCandidate | null = null;
  for (const c of cands) if (c.kind === "published" && (!best || better(c, best))) best = c;
  let bestMod: DateCandidate | null = null;
  for (const c of cands) if (c.kind === "modified" && (!bestMod || better(c, bestMod))) bestMod = c;

  return {
    publishedAt: best?.date ?? null,
    modifiedAt: bestMod?.date ?? null,
    source: best?.source ?? null,
    confidence: best ? CONFIDENCE[best.source] : 0,
    candidates: cands,
  };
}
