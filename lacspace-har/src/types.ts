/**
 * HAR 1.2 types (the subset we read) plus the analysis report shape.
 * See the HAR spec: http://www.softwareishard.com/blog/har-12-spec/
 * All fields are optional-tolerant — real-world HARs vary between tools.
 */

/** A name/value header (or query/cookie) pair, as HAR stores them. */
export interface HarNameValue {
  name: string;
  value: string;
}

/** A cookie as HAR stores it (only the fields we touch are typed). */
export interface HarCookie {
  name: string;
  value: string;
  [k: string]: unknown;
}

/** `request.postData` — the request body descriptor. */
export interface HarPostData {
  mimeType?: string;
  text?: string;
  params?: HarNameValue[];
}

/** The request half of an entry. */
export interface HarRequest {
  method: string;
  url: string;
  httpVersion?: string;
  headers?: HarNameValue[];
  queryString?: HarNameValue[];
  cookies?: HarCookie[];
  postData?: HarPostData;
  headersSize?: number;
  bodySize?: number;
}

/** `response.content` — the decoded response body descriptor. */
export interface HarContent {
  /** Uncompressed body size in bytes. */
  size?: number;
  /** Bytes saved by compression, if the tool recorded it. */
  compression?: number;
  mimeType?: string;
  text?: string;
  encoding?: string;
}

/** The response half of an entry. */
export interface HarResponse {
  status: number;
  statusText?: string;
  httpVersion?: string;
  headers?: HarNameValue[];
  cookies?: HarCookie[];
  content?: HarContent;
  redirectURL?: string;
  headersSize?: number;
  bodySize?: number;
  /** Chrome/DevTools: bytes actually sent over the wire (-1 when unknown). */
  _transferSize?: number;
}

/** Per-phase timings for one request, in milliseconds (-1 = not applicable). */
export interface HarTimings {
  blocked?: number;
  dns?: number;
  connect?: number;
  ssl?: number;
  send?: number;
  wait?: number;
  receive?: number;
}

/** One request/response pair in `log.entries`. */
export interface HarEntry {
  startedDateTime?: string;
  /** Total elapsed time for the request, in milliseconds. */
  time?: number;
  request: HarRequest;
  response: HarResponse;
  timings?: HarTimings;
  cache?: unknown;
  serverIPAddress?: string;
  pageref?: string;
  /** Chrome/DevTools: true when served from the browser cache. */
  _fromCache?: string | boolean;
  /** Chrome/DevTools: "document" | "script" | "stylesheet" | "image" | ... */
  _resourceType?: string;
}

/** Page-level timing markers. */
export interface HarPageTimings {
  onContentLoad?: number;
  onLoad?: number;
}

/** A page grouping (optional; some tools omit `log.pages`). */
export interface HarPage {
  id?: string;
  title?: string;
  startedDateTime?: string;
  pageTimings?: HarPageTimings;
}

/** The `log` object — the root of a HAR file. */
export interface HarLog {
  version?: string;
  creator?: { name?: string; version?: string };
  pages?: HarPage[];
  entries: HarEntry[];
}

/** A parsed HAR file. */
export interface Har {
  log: HarLog;
}

/** MIME/resource category we bucket each request into. */
export type ResourceCategory =
  | "document"
  | "script"
  | "css"
  | "image"
  | "font"
  | "xhr-fetch"
  | "other";

/** A one-line summary of a single request (used for slowest/largest lists). */
export interface RequestSummary {
  url: string;
  method: string;
  status: number;
  /** Elapsed time in milliseconds. */
  ms: number;
  /** Transfer (on-the-wire) bytes. */
  bytes: number;
  category: ResourceCategory;
  domain: string;
  thirdParty: boolean;
}

/** Bytes + count for one MIME/resource category. */
export interface TypeBreakdown {
  category: ResourceCategory;
  bytes: number;
  count: number;
}

/** Bytes + count for one domain, with first/third-party flag. */
export interface DomainBreakdown {
  domain: string;
  bytes: number;
  count: number;
  thirdParty: boolean;
}

/** Requests + bytes for one status-code bucket. */
export interface StatusBucket {
  bucket: "1xx" | "2xx" | "3xx" | "4xx" | "5xx" | "other";
  count: number;
  bytes: number;
}

/** Aggregated timing phases across all entries, in milliseconds. */
export interface TimingPhases {
  blocked: number;
  dns: number;
  connect: number;
  ssl: number;
  send: number;
  wait: number;
  receive: number;
}

/** A flagged performance issue. */
export interface Issue {
  severity: "warn" | "info";
  kind:
    | "uncompressed-text"
    | "large-image"
    | "too-many-third-parties"
    | "missing-cache-headers";
  message: string;
  url?: string;
  bytes?: number;
}

/** HAR-derived "web vitals-ish" estimates. NOT field metrics — see `note`. */
export interface VitalsEstimate {
  /** Time to first byte of the main document: its `wait` (TTFB) phase, ms. */
  ttfbMs?: number;
  /** Sum of `receive` phases across all requests, ms (bytes-on-the-wire time). */
  totalDownloadMs: number;
  /** When the largest image/document/text resource finished loading, ms from start. */
  lcpCandidateMs?: number;
  /** URL of that LCP-candidate resource. */
  lcpCandidateUrl?: string;
  /** Count of likely render-blocking requests (first-party CSS/JS before first paint). */
  renderBlocking: number;
  /** Honest label reminding callers these are derived, not measured. */
  note: string;
}

/** The full analysis of a HAR file. */
export interface HarReport {
  totals: {
    requests: number;
    /** Sum of transfer (on-the-wire) bytes. */
    transferBytes: number;
    /** Sum of uncompressed content bytes. */
    contentBytes: number;
    /** Sum of `entry.time` in milliseconds (not wall-clock overlap). */
    wallTimeMs: number;
    /** From `log.pages[].pageTimings.onContentLoad`, if present. */
    onContentLoadMs?: number;
    /** From `log.pages[].pageTimings.onLoad`, if present. */
    onLoadMs?: number;
    /** The URL treated as the first party. */
    primaryUrl?: string;
    primaryDomain?: string;
  };
  slowest: RequestSummary[];
  largest: RequestSummary[];
  byType: TypeBreakdown[];
  byDomain: DomainBreakdown[];
  byStatus: StatusBucket[];
  timings: TimingPhases;
  wins: {
    redirects: number;
    errors: number;
    cacheHits: number;
    /** Bytes saved by compression on text assets (content − transfer). */
    compressionSavedBytes: number;
  };
  issues: Issue[];
  /** HAR-derived web-vitals-ish estimates (v0.2). Always present from {@link analyzeHar}. */
  vitals?: VitalsEstimate;
}

/** Options for {@link analyzeHar}. */
export interface AnalyzeOptions {
  /** How many entries to keep in the slowest/largest lists (default 10). */
  top?: number;
  /** URL to treat as the first party. Auto-detected from the document otherwise. */
  primaryUrl?: string;
}

// ── v0.2: timeline / waterfall ──────────────────────────────────────────────

/** One request positioned on a timeline, with its phase breakdown. */
export interface TimelineRow {
  url: string;
  method: string;
  status: number;
  /** Elapsed time in milliseconds. */
  ms: number;
  /** Transfer (on-the-wire) bytes. */
  bytes: number;
  category: ResourceCategory;
  domain: string;
  thirdParty: boolean;
  /** Start offset from the earliest request, in milliseconds. */
  startMs: number;
  /** End offset (startMs + ms), in milliseconds. */
  endMs: number;
  /** Per-phase durations in order (only phases > 0). */
  phases: { name: keyof TimingPhases; ms: number }[];
  cacheHit: boolean;
}

/** A whole session laid out on a timeline. */
export interface Timeline {
  rows: TimelineRow[];
  /** Total wall-clock span (max endMs), in milliseconds. */
  spanMs: number;
}

/** Options for {@link toWaterfall}. */
export interface WaterfallOptions {
  /** Track width in characters (default 40). */
  width?: number;
  /** Limit to the N longest requests (default: all). */
  top?: number;
  /** Emit ANSI colors (default true). */
  color?: boolean;
  /** Order rows by start time (default) or by duration. */
  sort?: "start" | "time" | "bytes";
  /** URL to treat as first party (passed through to the timeline). */
  primaryUrl?: string;
}

/** Options for {@link toHtml}. */
export interface HtmlOptions {
  /** Document title (default derived from the primary URL). */
  title?: string;
}

// ── v0.2: diff ───────────────────────────────────────────────────────────────

/** Before/after values for one scalar metric. */
export interface MetricDelta {
  before: number;
  after: number;
  /** after − before. */
  delta: number;
  /** Percentage change vs before (0 when before is 0). */
  pct: number;
}

/** Before/after bytes for one type category. */
export interface TypeDelta {
  category: ResourceCategory;
  before: number;
  after: number;
  delta: number;
}

/** Before/after bytes for one domain. */
export interface DomainDelta {
  domain: string;
  before: number;
  after: number;
  delta: number;
}

/** A request whose time changed between the two HARs. */
export interface RequestChange {
  url: string;
  before: number;
  after: number;
  delta: number;
}

/** The difference between two analyzed HARs. */
export interface HarDiff {
  requests: MetricDelta;
  transferBytes: MetricDelta;
  contentBytes: MetricDelta;
  wallTimeMs: MetricDelta;
  byType: TypeDelta[];
  byDomain: DomainDelta[];
  /** Requests present in "after" but not "before". */
  added: RequestSummary[];
  /** Requests present in "before" but not "after". */
  removed: RequestSummary[];
  /** Requests that got slower (by time), biggest regression first. */
  slower: RequestChange[];
  /** Requests that got faster, biggest improvement first. */
  faster: RequestChange[];
}

/** Options for {@link diffHars}. */
export interface DiffOptions {
  /** How many added/removed/slower/faster rows to keep (default 10). */
  top?: number;
  /** Ignore time changes smaller than this many ms (default 20). */
  slowThresholdMs?: number;
  primaryUrl?: string;
}

// ── v0.2: budgets ────────────────────────────────────────────────────────────

/** A metric a budget can constrain. */
export type BudgetKey =
  | "js"
  | "css"
  | "images"
  | "fonts"
  | "document"
  | "xhr"
  | "other"
  | "requests"
  | "thirdparty"
  | "total";

/** One parsed budget rule, e.g. `js < 300kb`. */
export interface BudgetRule {
  key: BudgetKey;
  op: "<" | "<=" | ">" | ">=";
  limit: number;
  /** `bytes` for size metrics, `count` for requests/thirdparty. */
  unit: "bytes" | "count";
  raw: string;
}

/** The result of checking one rule against a report. */
export interface BudgetCheckItem {
  rule: BudgetRule;
  actual: number;
  pass: boolean;
  label: string;
}

/** The result of checking a whole budget. */
export interface BudgetResult {
  pass: boolean;
  items: BudgetCheckItem[];
}

// ── v0.2: filter ─────────────────────────────────────────────────────────────

/** Comparison operators a filter clause can use. */
export type FilterOp = "=" | "!=" | "~=" | ">" | "<" | ">=" | "<=";

/** One parsed filter clause, e.g. `size > 100kb`. */
export interface FilterRule {
  field: "domain" | "type" | "status" | "size" | "url" | "method";
  op: FilterOp;
  value: string;
  /** Parsed numeric value for `status`/`size` comparisons. */
  num?: number;
}

// ── v0.2: recommendations ────────────────────────────────────────────────────

/** A concrete, savings-quantified recommendation. */
export interface Recommendation {
  kind: "compress-text" | "resize-image" | "render-blocking" | "cache-headers";
  message: string;
  url?: string;
  /** Estimated bytes saved (first-load, or repeat-load for caching). */
  savingBytes?: number;
  /** Estimated milliseconds saved. */
  savingMs?: number;
  /** A suggested concrete target (e.g. "≤ 200 KB, WebP/AVIF"). */
  target?: string;
}

/** Options for {@link recommend}. */
export interface RecommendOptions {
  primaryUrl?: string;
  /** Assumed gzip/brotli ratio for text (default 0.72 = ~72% smaller). */
  textCompressionRatio?: number;
  /** Suggested max image transfer size in bytes (default 200 KB). */
  imageTargetBytes?: number;
}

// ── v0.2: redact ─────────────────────────────────────────────────────────────

/** Options for {@link redactHar}. */
export interface RedactOptions {
  /** Keep request/response bodies (default false → stripped). */
  keepBodies?: boolean;
  /** Extra request/response header names to redact (case-insensitive). */
  headers?: string[];
  /** Extra query-string parameter names to redact (case-insensitive). */
  params?: string[];
}

/** Options for {@link exportRequests} / {@link summarize}. */
export interface ExportOptions {
  primaryUrl?: string;
}
