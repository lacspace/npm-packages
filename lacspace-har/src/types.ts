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

/** The request half of an entry. */
export interface HarRequest {
  method: string;
  url: string;
  httpVersion?: string;
  headers?: HarNameValue[];
  queryString?: HarNameValue[];
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
}

/** Options for {@link analyzeHar}. */
export interface AnalyzeOptions {
  /** How many entries to keep in the slowest/largest lists (default 10). */
  top?: number;
  /** URL to treat as the first party. Auto-detected from the document otherwise. */
  primaryUrl?: string;
}
