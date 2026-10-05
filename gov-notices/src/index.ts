/**
 * @lacspace/gov-notices: parse Nepali government and university notice boards
 * into clean, dated, tagged items. Zero dependencies, isomorphic.
 */
import { parseHTML } from "./html.js";
import { ADAPTERS, adapterFor, generic, type Adapter } from "./adapters.js";
import { finalize, hashId, normTitle, type Notice, type RawNotice } from "./notice.js";
import { getSource, sourceForHost, type Source } from "./sources.js";
import { baseHeaders, getFetch, readCapped } from "./http.js";
import { runDetails } from "./detail.js";

export { parseBsDate, parseDate, toAsciiDigits, type BsParsed, type ParsedDate } from "./dates.js";
export { cleanTitle, titleLang, tag, isResult, attachmentType, hashId, isTruncated, completeTitle, type Notice, type Attachment, type AttachmentType, type RawNotice } from "./notice.js";
export { parseDetail, completeTitles, needsDetail, applyDetail, type NoticeDetail, type DetailOptions } from "./detail.js";
export { SOURCES, getSource, type Source, type SourceKind } from "./sources.js";
export { ADAPTERS, adapterFor, type Adapter } from "./adapters.js";
export { genericParse } from "./generic.js";
export { parseHTML } from "./html.js";
export { queryAll, queryOne } from "./select.js";

export { VERSION, DEFAULT_USER_AGENT } from "./http.js";

export interface ParseOptions {
  /** A registered source id ("neb", "psc", …) or any label you want on the items. */
  sourceId?: string;
  /** The page's URL: picks the adapter (by host) and resolves relative links. */
  baseUrl: string;
  /** Reserved for date heuristics; defaults to the current time. */
  now?: Date;
}

function pickAdapter(sourceId: string | undefined, host: string): Adapter {
  const src = sourceId ? getSource(sourceId) : undefined;
  if (src) return ADAPTERS.find((a) => a.id === src.adapter) ?? generic;
  return adapterFor(host);
}

/**
 * Parse a notice-list page (HTML, or the JSON feed of a JS-rendered site) into
 * notices. Picks the site adapter by `sourceId` or the host of `baseUrl`, else
 * the generic finder. Items keep the page's order; exact duplicates are removed.
 */
export function parseNotices(body: string, opts: ParseOptions): Notice[] {
  const baseUrl = opts.baseUrl;
  let host = "";
  try { host = new URL(baseUrl).hostname; } catch { throw new TypeError(`@lacspace/gov-notices: baseUrl must be an absolute URL, got ${JSON.stringify(baseUrl)}`); }
  const adapter = pickAdapter(opts.sourceId, host);
  const sourceId = opts.sourceId ?? sourceForHost(host)?.id ?? host.replace(/^www\./, "");
  const trimmed = body.trimStart();
  let raws: RawNotice[] = [];
  if (adapter.parseJson && (trimmed.startsWith("{") || trimmed.startsWith("["))) {
    try {
      raws = adapter.parseJson(JSON.parse(trimmed), baseUrl);
    } catch {
      raws = [];
    }
  } else {
    raws = adapter.parse(parseHTML(body), baseUrl);
  }
  const out: Notice[] = [];
  for (const r of raws) {
    const n = finalize(r, sourceId, baseUrl);
    if (n) out.push(n);
  }
  return dedupe(out);
}

/** Remove duplicates: same url first, then same normalised title + date. Keeps the first; merges attachments. */
export function dedupe(notices: Notice[]): Notice[] {
  const byUrl = new Map<string, Notice>();
  const byTitle = new Map<string, Notice>();
  const out: Notice[] = [];
  for (const n of notices) {
    const tKey = `${n.sourceId}|${normTitle(n.title)}|${n.date ?? ""}`;
    const prev = (n.url && byUrl.get(n.url)) || byTitle.get(tKey);
    if (prev) {
      for (const a of n.attachments) if (!prev.attachments.some((b) => b.url === a.url)) prev.attachments.push(a);
      continue;
    }
    if (n.url) byUrl.set(n.url, n);
    byTitle.set(tKey, n);
    out.push(n);
  }
  return out;
}

/** The notices whose id is not in `prevIds` (ids you stored from the last run). */
export function newSince(notices: Notice[], prevIds: Iterable<string>): Notice[] {
  const seen = new Set(prevIds);
  return notices.filter((n) => !seen.has(n.id));
}

/** Request headers for a conditional GET from a previous response's validators. */
export function conditional(prev: { etag?: string | null; lastModified?: string | null } | null | undefined): Record<string, string> {
  const h: Record<string, string> = {};
  if (prev?.etag) h["If-None-Match"] = prev.etag;
  if (prev?.lastModified) h["If-Modified-Since"] = prev.lastModified;
  return h;
}

export interface FetchOptions {
  /** A fetch implementation (defaults to the global one). */
  fetch?: typeof globalThis.fetch;
  /** User-Agent header. Defaults to {@link DEFAULT_USER_AGENT}; pass a browser UA for sites that refuse bots. */
  userAgent?: string;
  /** Abort after this many ms (default 20000). */
  timeoutMs?: number;
  /** Validators from the last run: sent as If-None-Match / If-Modified-Since. */
  etag?: string;
  lastModified?: string;
  /** Stop reading the body after this many bytes (default 5 MB). */
  maxBytes?: number;
  /** Extra request headers. */
  headers?: Record<string, string>;
  now?: Date;
  /**
   * Opt-in: after the list, fetch detail pages for items whose title was cut
   * ("…"/"...") or that have no date, to complete them. Off by default, so a
   * call stays one request. See {@link completeTitles}.
   */
  details?: boolean;
  /** With `details`: at most this many detail pages per call (default 5). */
  maxDetails?: number;
  /** With `details`: ids you already hold; these are never fetched. */
  knownIds?: Iterable<string>;
  /** With `details`: pause between detail requests in ms (default 1000). */
  detailDelayMs?: number;
}

export interface FetchResult {
  status: number;
  /** true on HTTP 304: nothing changed since `etag`/`lastModified`; `notices` is empty. */
  notModified: boolean;
  notices: Notice[];
  etag?: string;
  lastModified?: string;
  /** The URL that was requested (after redirects, when the runtime reports it). */
  url: string;
  /**
   * A hash of the response body (200 only). Most of these sites send no ETag or
   * Last-Modified, so compare this with the previous run's to skip unchanged pages.
   */
  contentHash?: string;
  source?: Source;
  /** With `details: true`: how many detail pages were read. */
  detailsFetched?: number;
}

/**
 * Fetch one notice board and parse it. One request per call, no pagination.
 * Pass the `etag`/`lastModified` from the previous result to make it a
 * conditional GET; a 304 comes back as `notModified: true` with no parsing.
 * With `details: true` it then reads up to `maxDetails` detail pages, one at a
 * time, to complete cut titles and missing dates (see {@link completeTitles}).
 */
export async function fetchNotices(sourceIdOrUrl: string, opts: FetchOptions = {}): Promise<FetchResult> {
  const result = await fetchList(sourceIdOrUrl, opts);
  if (opts.details && result.notices.length) {
    const st = await runDetails(result.notices, {
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      ...(opts.userAgent ? { userAgent: opts.userAgent } : {}),
      ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
      ...(opts.maxDetails != null ? { maxDetails: opts.maxDetails } : {}),
      ...(opts.knownIds ? { knownIds: opts.knownIds } : {}),
      ...(opts.detailDelayMs != null ? { delayMs: opts.detailDelayMs } : {}),
    });
    result.detailsFetched = st.fetched;
  }
  return result;
}

async function fetchList(sourceIdOrUrl: string, opts: FetchOptions): Promise<FetchResult> {
  const doFetch = getFetch(opts);
  const src = /^https?:\/\//i.test(sourceIdOrUrl) ? undefined : getSource(sourceIdOrUrl);
  if (!src && !/^https?:\/\//i.test(sourceIdOrUrl)) throw new Error(`@lacspace/gov-notices: unknown source "${sourceIdOrUrl}"`);
  const url = src ? src.feedUrl ?? src.url : sourceIdOrUrl;
  const headers: Record<string, string> = {
    ...baseHeaders(opts),
    ...(src?.headers ?? {}),
    ...conditional(opts),
    ...(opts.headers ?? {}),
  };
  const ctrl = typeof AbortController === "function" ? new AbortController() : undefined;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000) : undefined;
  try {
    const res = await doFetch(url, { headers, redirect: "follow", signal: ctrl?.signal });
    const finalUrl = res.url || url;
    const etag = res.headers.get("etag") ?? undefined;
    const lastModified = res.headers.get("last-modified") ?? undefined;
    const base: FetchResult = { status: res.status, notModified: res.status === 304, notices: [], url: finalUrl };
    if (etag) base.etag = etag;
    if (lastModified) base.lastModified = lastModified;
    if (src) base.source = src;
    if (res.status === 304 || !res.ok) {
      try { await res.body?.cancel(); } catch { /* ignore */ }
      if (res.status === 304) {
        if (!base.etag && opts.etag) base.etag = opts.etag;
        if (!base.lastModified && opts.lastModified) base.lastModified = opts.lastModified;
      }
      return base;
    }
    const body = await readCapped(res, opts.maxBytes ?? 5_000_000);
    base.contentHash = hashId(body);
    // Parse against the human page so relative links resolve on the site, not the API path.
    const parseOpts: ParseOptions = { baseUrl: src && src.feedUrl ? src.url : finalUrl };
    if (src) parseOpts.sourceId = src.id;
    if (opts.now) parseOpts.now = opts.now;
    base.notices = parseNotices(body, parseOpts);
    return base;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
