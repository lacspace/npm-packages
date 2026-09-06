/**
 * Pure HAR analysis — totals, slowest/largest, breakdowns by type/domain/
 * status, aggregated timing phases, cache/compression wins and heuristic
 * performance issues. No network, no disk; a HAR in, a report out.
 */
import type {
  AnalyzeOptions,
  DomainBreakdown,
  Har,
  HarEntry,
  HarReport,
  Issue,
  RequestSummary,
  ResourceCategory,
  StatusBucket,
  TimingPhases,
  TypeBreakdown,
} from "./types.js";

/** Thresholds the issue heuristics use (bytes / counts). */
export const THRESHOLDS = {
  /** Text asset over this size with no compression → flagged. */
  uncompressedTextBytes: 30 * 1024,
  /** Image over this transfer size → flagged. */
  largeImageBytes: 300 * 1024,
  /** More third-party domains than this → flagged. */
  maxThirdPartyDomains: 10,
  /** Cap on how many "missing cache header" issues we list individually. */
  maxCacheIssues: 8,
} as const;

const CATEGORY_ORDER: ResourceCategory[] = [
  "document", "script", "css", "image", "font", "xhr-fetch", "other",
];

// ── small helpers ──────────────────────────────────────────────────────────

/** Look up a response/request header case-insensitively. */
function header(headers: { name: string; value: string }[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h && typeof h.name === "string" && h.name.toLowerCase() === lower) return h.value;
  }
  return undefined;
}

/** Transfer (on-the-wire) bytes for an entry: `_transferSize` if real, else body+headers. */
export function transferBytes(e: HarEntry): number {
  const t = e.response._transferSize;
  if (typeof t === "number" && t >= 0) return t;
  const body = e.response.bodySize;
  const hdr = e.response.headersSize;
  const b = typeof body === "number" && body > 0 ? body : 0;
  const h = typeof hdr === "number" && hdr > 0 ? hdr : 0;
  return b + h;
}

/** Uncompressed content bytes (`response.content.size`). */
export function contentBytes(e: HarEntry): number {
  const s = e.response.content?.size;
  return typeof s === "number" && s > 0 ? s : 0;
}

/** The hostname of an entry's request URL (empty string if unparseable). */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Fall back to a rough host grab for odd/relative urls.
    const m = /^[a-z]+:\/\/([^/?#]+)/i.exec(url);
    return (m?.[1] ?? "").toLowerCase();
  }
}

/** Registrable-ish domain: the last two labels, or three for known SLDs (co.uk …). */
export function registrableDomain(host: string): string {
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const sld = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go"]);
  const secondLast = labels[labels.length - 2]!;
  const take = sld.has(secondLast) ? 3 : 2;
  return labels.slice(labels.length - take).join(".");
}

/** Category for an entry, using DevTools `_resourceType` when available, else MIME/extension. */
export function categoryOf(e: HarEntry): ResourceCategory {
  const rt = (e._resourceType ?? "").toLowerCase();
  if (rt === "document") return "document";
  if (rt === "stylesheet") return "css";
  if (rt === "script") return "script";
  if (rt === "image") return "image";
  if (rt === "font") return "font";
  if (rt === "xhr" || rt === "fetch") return "xhr-fetch";

  const mime = (e.response.content?.mimeType ?? "").toLowerCase();
  const path = (e.request.url.split("?")[0] ?? "").toLowerCase();
  const ext = (path.split(".").pop() ?? "");

  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "ico", "bmp"].includes(ext)) return "image";
  if (mime.startsWith("font/") || mime.includes("font") || ["woff", "woff2", "ttf", "otf", "eot"].includes(ext)) return "font";
  if (mime.includes("javascript") || mime.includes("ecmascript") || ["js", "mjs", "cjs"].includes(ext)) return "script";
  if (mime.includes("css") || ext === "css") return "css";
  if (mime.includes("html") || ["html", "htm"].includes(ext)) return "document";
  if (mime.includes("json") || mime.includes("xml") || ["json", "xml"].includes(ext)) return "xhr-fetch";
  return "other";
}

/** Is this a text asset (compressible / cache-relevant text)? */
function isTextAsset(cat: ResourceCategory, mime: string): boolean {
  if (cat === "script" || cat === "css" || cat === "document" || cat === "xhr-fetch") return true;
  const m = mime.toLowerCase();
  return m.startsWith("text/") || m.includes("json") || m.includes("xml") || m.includes("svg");
}

/** True when the browser reported this as a cache hit (or it's a 304). */
export function isCacheHit(e: HarEntry): boolean {
  const fc = e._fromCache;
  if (fc === true || fc === "memory" || fc === "disk") return true;
  return e.response.status === 304;
}

/** Bucket a status code into 1xx/2xx/…/other. */
function statusBucket(status: number): StatusBucket["bucket"] {
  if (status >= 100 && status < 200) return "1xx";
  if (status >= 200 && status < 300) return "2xx";
  if (status >= 300 && status < 400) return "3xx";
  if (status >= 400 && status < 500) return "4xx";
  if (status >= 500 && status < 600) return "5xx";
  return "other";
}

/** Pick the first-party URL: caller override, else the first HTML/document entry, else first entry. */
function detectPrimaryUrl(har: Har, override?: string): string | undefined {
  if (override) return override;
  const entries = har.log.entries;
  const doc = entries.find((e) => categoryOf(e) === "document" && e.response.status < 400);
  if (doc) return doc.request.url;
  const first = entries.find((e) => (e.request.url ?? "").startsWith("http"));
  return first?.request.url;
}

// ── the analyzer ────────────────────────────────────────────────────────────

/** Analyze a parsed HAR into a full {@link HarReport}. Pure. */
export function analyzeHar(har: Har, opts: AnalyzeOptions = {}): HarReport {
  const top = Math.max(1, opts.top ?? 10);
  const entries = har.log.entries ?? [];

  const primaryUrl = detectPrimaryUrl(har, opts.primaryUrl);
  const primaryDomain = primaryUrl ? registrableDomain(hostOf(primaryUrl)) : "";

  let transferTotal = 0;
  let contentTotal = 0;
  let wallTime = 0;
  let redirects = 0;
  let errors = 0;
  let cacheHits = 0;
  let compressionSaved = 0;

  const typeMap = new Map<ResourceCategory, TypeBreakdown>();
  const domainMap = new Map<string, DomainBreakdown>();
  const statusMap = new Map<StatusBucket["bucket"], StatusBucket>();
  const timings: TimingPhases = { blocked: 0, dns: 0, connect: 0, ssl: 0, send: 0, wait: 0, receive: 0 };
  const summaries: RequestSummary[] = [];
  const issues: Issue[] = [];
  const thirdPartyDomains = new Set<string>();
  let missingCacheCount = 0;

  for (const e of entries) {
    const transfer = transferBytes(e);
    const content = contentBytes(e);
    const cat = categoryOf(e);
    const status = e.response.status ?? 0;
    const ms = typeof e.time === "number" && e.time > 0 ? e.time : 0;
    const host = hostOf(e.request.url);
    const domain = registrableDomain(host) || host || "(unknown)";
    const thirdParty = primaryDomain !== "" && domain !== "" && domain !== primaryDomain;
    const mime = e.response.content?.mimeType ?? "";

    transferTotal += transfer;
    contentTotal += content;
    wallTime += ms;

    // status buckets + redirect/error counts
    const bucket = statusBucket(status);
    const sb = statusMap.get(bucket) ?? { bucket, count: 0, bytes: 0 };
    sb.count += 1;
    sb.bytes += transfer;
    statusMap.set(bucket, sb);
    if (bucket === "3xx") redirects += 1;
    if (bucket === "4xx" || bucket === "5xx") errors += 1;

    // cache
    if (isCacheHit(e)) cacheHits += 1;

    // compression savings on text assets
    if (isTextAsset(cat, mime) && content > transfer && transfer > 0) {
      compressionSaved += content - transfer;
    }

    // type breakdown
    const tb = typeMap.get(cat) ?? { category: cat, bytes: 0, count: 0 };
    tb.bytes += transfer;
    tb.count += 1;
    typeMap.set(cat, tb);

    // domain breakdown
    const db = domainMap.get(domain) ?? { domain, bytes: 0, count: 0, thirdParty };
    db.bytes += transfer;
    db.count += 1;
    domainMap.set(domain, db);
    if (thirdParty) thirdPartyDomains.add(domain);

    // timing phases (-1 = not applicable)
    const t = e.timings;
    if (t) {
      for (const k of ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"] as const) {
        const v = t[k];
        if (typeof v === "number" && v > 0) timings[k] += v;
      }
    }

    summaries.push({ url: e.request.url, method: e.request.method ?? "GET", status, ms, bytes: transfer, category: cat, domain, thirdParty });

    // ── issue heuristics ──
    if (isTextAsset(cat, mime) && cat !== "document" && transfer >= THRESHOLDS.uncompressedTextBytes && content <= transfer * 1.02) {
      issues.push({ severity: "warn", kind: "uncompressed-text", url: e.request.url, bytes: transfer, message: `Uncompressed ${cat} (${fmtBytes(transfer)}) — enable gzip/brotli` });
    }
    if (cat === "image" && transfer >= THRESHOLDS.largeImageBytes) {
      issues.push({ severity: "warn", kind: "large-image", url: e.request.url, bytes: transfer, message: `Large image (${fmtBytes(transfer)}) — resize or use WebP/AVIF` });
    }
    const cacheable = cat === "script" || cat === "css" || cat === "image" || cat === "font";
    if (cacheable && status >= 200 && status < 300 && !isCacheHit(e)) {
      const cc = header(e.response.headers, "cache-control");
      const exp = header(e.response.headers, "expires");
      if (!cc && !exp) {
        missingCacheCount += 1;
        if (missingCacheCount <= THRESHOLDS.maxCacheIssues) {
          issues.push({ severity: "info", kind: "missing-cache-headers", url: e.request.url, bytes: transfer, message: `No Cache-Control/Expires on ${cat}` });
        }
      }
    }
  }

  if (thirdPartyDomains.size > THRESHOLDS.maxThirdPartyDomains) {
    issues.push({ severity: "warn", kind: "too-many-third-parties", message: `${thirdPartyDomains.size} third-party domains — each adds a DNS/TLS round-trip` });
  }
  if (missingCacheCount > THRESHOLDS.maxCacheIssues) {
    issues.push({ severity: "info", kind: "missing-cache-headers", message: `…and ${missingCacheCount - THRESHOLDS.maxCacheIssues} more assets missing cache headers` });
  }

  const byBytesDesc = (a: { bytes: number }, b: { bytes: number }) => b.bytes - a.bytes;

  const slowest = [...summaries].sort((a, b) => b.ms - a.ms).slice(0, top);
  const largest = [...summaries].sort((a, b) => b.bytes - a.bytes).slice(0, top);

  const byType = CATEGORY_ORDER
    .map((c) => typeMap.get(c))
    .filter((x): x is TypeBreakdown => !!x)
    .sort(byBytesDesc);

  const byDomain = [...domainMap.values()].sort(byBytesDesc);

  const STATUS_ORDER: StatusBucket["bucket"][] = ["1xx", "2xx", "3xx", "4xx", "5xx", "other"];
  const byStatus = STATUS_ORDER
    .map((b) => statusMap.get(b))
    .filter((x): x is StatusBucket => !!x);

  // page timings from log.pages (take the max across pages)
  let onContentLoad: number | undefined;
  let onLoad: number | undefined;
  for (const p of har.log.pages ?? []) {
    const ocl = p.pageTimings?.onContentLoad;
    const ol = p.pageTimings?.onLoad;
    if (typeof ocl === "number" && ocl > 0) onContentLoad = Math.max(onContentLoad ?? 0, ocl);
    if (typeof ol === "number" && ol > 0) onLoad = Math.max(onLoad ?? 0, ol);
  }

  const totals: HarReport["totals"] = {
    requests: entries.length,
    transferBytes: transferTotal,
    contentBytes: contentTotal,
    wallTimeMs: Math.round(wallTime),
  };
  if (onContentLoad !== undefined) totals.onContentLoadMs = Math.round(onContentLoad);
  if (onLoad !== undefined) totals.onLoadMs = Math.round(onLoad);
  if (primaryUrl) totals.primaryUrl = primaryUrl;
  if (primaryDomain) totals.primaryDomain = primaryDomain;

  for (const k of Object.keys(timings) as (keyof TimingPhases)[]) timings[k] = Math.round(timings[k]);

  return {
    totals,
    slowest,
    largest,
    byType,
    byDomain,
    byStatus,
    timings,
    wins: { redirects, errors, cacheHits, compressionSavedBytes: compressionSaved },
    issues,
  };
}

/** Human-readable byte size (base-1024). Exported for the report + issue text. */
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}
