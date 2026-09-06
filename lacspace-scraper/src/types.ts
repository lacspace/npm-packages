/** Output formats the tool can write. */
export type OutputFormat = "json" | "ndjson" | "csv" | "xlsx";

/** Rendering engine: static HTTP fetch (fast) or a real browser (JS-rendered). */
export type Engine = "http" | "browser";

/**
 * How to pull one field out of a page.
 * - `selector` — a CSS selector (omitted = the page root).
 * - `attr` — what to read: `"text"` (default), `"html"`, `"@href"` / any
 *   `@attribute`, or a bare attribute name.
 * - `all` — collect every match as an array (default: first match only).
 * - `trim` — collapse/trim whitespace (default true for text).
 * - `transform` — an optional post-processing pipe applied to the value, e.g.
 *   `"number"`, `"absolute"`, or `["date", "trim"]`. See {@link ./transform.ts}.
 */
export interface FieldSpec {
  selector?: string;
  attr?: string;
  all?: boolean;
  trim?: boolean;
  /** Transform pipe applied to the extracted value (string or list of tokens). */
  transform?: string | string[];
}

/**
 * An extraction schema: field name → a CSS selector string (shorthand for the
 * element's text) or a full {@link FieldSpec}. Example:
 * `{ title: "h1", price: { selector: ".price", attr: "text" }, links: { selector: "a", attr: "@href", all: true } }`
 */
export type Schema = Record<string, string | FieldSpec>;

/** A single scraped page's data. */
export type ScrapeRecord = Record<string, unknown>;

/** A discovered link. */
export interface LinkInfo {
  href: string;
  text: string;
}

/** Auto-detected page data (when no schema is given, or `auto` is on). */
export interface AutoData {
  url?: string;
  status?: number;
  title?: string;
  description?: string;
  canonical?: string;
  lang?: string;
  headings?: { level: number; text: string }[];
  links?: LinkInfo[];
  images?: string[];
  emails?: string[];
  phones?: string[];
  /** OpenGraph `og:*` properties, keyed without the prefix (e.g. `title`). */
  openGraph?: Record<string, string>;
  /** Parsed `<script type="application/ld+json">` blocks. */
  jsonLd?: unknown[];
  /** RSS/Atom feed URLs declared in the head. */
  feeds?: string[];
  /** The main readable text (best-effort), when `text` is requested. */
  text?: string;
  /** Extracted `<table>`s as arrays of row-objects, when `tables` is requested. */
  tables?: Record<string, string>[][];
}

/** Which auto-extractors to run. `true` = a sensible default set. */
export interface AutoOptions {
  metadata?: boolean;
  headings?: boolean;
  links?: boolean;
  images?: boolean;
  emails?: boolean;
  phones?: boolean;
  openGraph?: boolean;
  jsonLd?: boolean;
  feeds?: boolean;
  text?: boolean;
  tables?: boolean;
}

/** Options for scraping one or many URLs. */
export interface ScrapeOptions {
  /** A CSS-selector extraction schema. Omit to rely on `auto`. */
  schema?: Schema;
  /** Run auto-extractors: `true` for the default set, or pick specific ones. */
  auto?: boolean | AutoOptions;
  /**
   * When a schema selects repeating items (e.g. product cards), set `item` to
   * the container selector and the schema is applied to EACH matched container,
   * yielding one record per item instead of one per page.
   */
  item?: string;
  /** Rendering engine. Default "http". "browser" needs `playwright-core`. */
  engine?: Engine;
  /** Extra request headers (http engine). */
  headers?: Record<string, string>;
  /** Cookies sent with every request, as a `{ name: value }` map (http engine). */
  cookies?: Record<string, string>;
  /** User-Agent string. */
  userAgent?: string;
  /** Per-request timeout in ms. Default 15000. */
  timeoutMs?: number;
  /** Retry a failed request up to this many times. Default 1. */
  retries?: number;
  /** Pause between requests in ms (politeness). Default 0 for one URL. */
  delayMs?: number;
  /** Randomise the delay ±40%. */
  jitter?: boolean;
  /** Proxy URL, e.g. "http://user:pass@host:port". */
  proxy?: string;
  /**
   * A pool of proxy URLs rotated per request (http engine). Takes precedence
   * over `proxy`. The browser engine uses the first entry for the session.
   * Note: routing the http engine through a proxy needs the optional `undici`
   * package installed; the browser engine needs nothing extra.
   */
  proxies?: string[];
  /** Minimum delay in ms between requests to the SAME host (politeness). */
  rateMs?: number;
  /** How many URLs to fetch in parallel. Default 4. */
  concurrency?: number;
  /** Respect robots.txt (default true). */
  robots?: boolean;
  /** Browser engine: CSS selector to wait for before extracting. */
  waitFor?: string;
  /** Browser engine: extra fixed wait in ms after load (e.g. for animations). */
  waitMs?: number;
  /** Browser engine: auto-scroll this many passes to trigger lazy content. */
  scroll?: number;
  /** Browser engine: save a full-page PNG screenshot to this path. */
  screenshot?: string;
  /** Browser engine: save the page as a PDF to this path (headless only). */
  pdf?: string;
  /** Browser engine: run headless. Default true. */
  headless?: boolean;
  /**
   * Follow a "next page" link and accumulate records across pages. Value is a
   * CSS selector for the next-page anchor; paging stops when it's gone or
   * `maxPages` is reached. Sequential and polite (reuses delay/rate/robots).
   */
  paginate?: string;
  /** Cap on pages followed by `paginate` (per seed URL). */
  maxPages?: number;
  /**
   * After scraping a list, visit each record's link and merge in fields from the
   * detail page. Value is a field NAME already in the record (e.g. one produced
   * by a schema field) or a CSS selector giving a URL. Pair with `detailSchema`.
   */
  follow?: string;
  /** Extraction schema applied to each followed detail page (see `follow`). */
  detailSchema?: Schema;
  /** Seed the URL list from this sitemap (or sitemap index) before scraping. */
  sitemap?: string;
  /** Called with a short progress message. */
  onProgress?: (message: string) => void;
  /** Called with each record as it's scraped. */
  onRecord?: (record: ScrapeRecord) => void;
  /** An AbortSignal to cancel the run. */
  signal?: AbortSignal;
}

/** Options for crawling a whole site. */
export interface CrawlOptions extends ScrapeOptions {
  /** Max link depth from the seed. Default 2. */
  depth?: number;
  /** Max pages to fetch. Default 50. */
  limit?: number;
  /** Only follow links on the same origin as the seed. Default true. */
  sameOrigin?: boolean;
  /** Only crawl URLs whose path matches one of these substrings/patterns. */
  include?: string[];
  /** Skip URLs whose path matches any of these substrings/patterns. */
  exclude?: string[];
  /** CSS selector for the links to follow. Default "a[href]". */
  linkSelector?: string;
  // `sitemap` is inherited from ScrapeOptions (seed the crawl from a sitemap).
}

/** The result of a scrape, with a little metadata. */
export interface ScrapeResult {
  records: ScrapeRecord[];
  /** URLs that failed, with the error message. */
  errors: { url: string; error: string }[];
  pages: number;
  elapsedMs: number;
}
