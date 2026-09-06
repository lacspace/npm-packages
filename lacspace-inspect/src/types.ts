/**
 * Shared types for lacspace-inspect. A {@link Report} is a graded website audit:
 * a set of {@link Category} blocks, each holding {@link Finding}s (ok / warn /
 * fail / info) and a category score, rolled up to an overall letter grade A–F.
 */

/** A letter grade A (best) through F (worst). */
export type Grade = "A" | "B" | "C" | "D" | "F";

/** The outcome of a single check. `info` findings are shown but never graded. */
export type FindingStatus = "ok" | "warn" | "fail" | "info";

/** One check result inside a category. */
export interface Finding {
  /** Stable id, e.g. `seo.title`. */
  id: string;
  /** ok = pass, warn = minor issue, fail = real problem, info = not graded. */
  status: FindingStatus;
  /** A short, human sentence describing the result. */
  message: string;
  /** Optional extra detail (a value, a list, a hint). */
  detail?: string;
  /** Relative weight of this finding within its category (default 1). */
  weight?: number;
  /**
   * A concrete, copy-pasteable suggestion for how to fix this — populated for
   * `warn`/`fail` findings (see {@link ../fixes.ts}). Shown in every report
   * format and included in `--json`.
   */
  fix?: string;
}

/** The category keys lacspace-inspect reports on. */
export type CategoryKey =
  | "seo"
  | "social"
  | "structured"
  | "content"
  | "links"
  | "performance"
  | "security"
  | "crawlability"
  | "tech"
  | "budget";

/** A group of related checks with its own score and grade. */
export interface Category {
  key: CategoryKey;
  title: string;
  /** 0–100, or `null` when the category has no gradeable findings (skipped). */
  score: number | null;
  /** Letter grade for {@link score}, or `null` when not graded. */
  grade: Grade | null;
  /** How much this category counts toward the overall score. */
  weight: number;
  findings: Finding[];
}

/** A full audit of one URL. */
export interface Report {
  url: string;
  /** ISO timestamp of when the audit ran. */
  fetchedAt: string;
  /** HTTP status of the fetched page, when known. */
  httpStatus?: number;
  /** Whether the page was served over HTTPS. */
  https: boolean;
  /** Overall score 0–100 (weighted across graded categories). */
  score: number;
  /** Overall letter grade for {@link score}. */
  grade: Grade;
  categories: Category[];
  /** Detected technologies (informational, never graded). */
  tech: string[];
  /** A few handy raw stats. */
  stats: {
    htmlBytes: number;
    title?: string;
    /** The `<meta name="description">` content, when present. */
    metaDescription?: string;
    scripts: number;
    stylesheets: number;
    images: number;
    internalLinks: number;
    externalLinks: number;
    /** Time-to-first-byte / response time in ms, when measured over the network. */
    responseTimeMs?: number;
    /** The response `content-encoding` (gzip/br/…), when known. */
    contentEncoding?: string;
  };
}

/** Context handed to {@link analyzeHtml}. */
export interface AnalyzeContext {
  /** The (final) URL the HTML came from. Used for origin + HTTPS/mixed-content. */
  url: string;
  /** Response headers (lower-cased keys) for the security-header checks. */
  headers?: Record<string, string>;
  /** HTTP status of the response, if known. */
  status?: number;
  /** Measured response time (ms) for the `perf.responseTime` check. */
  responseTimeMs?: number;
  /** Response `content-encoding` for the `perf.compression` check. */
  contentEncoding?: string;
  /**
   * Whether the plain `http://` origin redirects to `https://`. `undefined`
   * when not probed → the `sec.httpsRedirect` check is reported as info.
   */
  httpsRedirect?: boolean;
}

/** Options for {@link inspectUrl}. */
export interface InspectOptions {
  /** Also run the (bounded, polite) broken-link check. Default false. */
  checkLinks?: boolean;
  /** Request timeout in ms (default 15000). */
  timeout?: number;
  /** Override the User-Agent. */
  userAgent?: string;
  /** Max links to check when {@link checkLinks} is on (default 50). */
  maxLinks?: number;
  /** Concurrency for the link check (default 6). */
  concurrency?: number;
  /** Probe whether the http:// origin redirects to https:// (default true). */
  probeHttpsRedirect?: boolean;
}

/** Options for {@link crawlSite}. */
export interface CrawlOptions extends InspectOptions {
  /** Max link depth from the seed. Default 2. */
  depth?: number;
  /** Max pages to audit. Default 20. */
  max?: number;
  /** Only follow same-origin links. Default true. */
  sameOrigin?: boolean;
  /** Progress callback (a short message per audited page). */
  onProgress?: (message: string) => void;
}

/** The result of checking one link's HTTP status. */
export interface LinkStatus {
  url: string;
  status: number;
  ok: boolean;
  redirected: boolean;
  error?: string;
}

/** One audited page inside a {@link SiteReport} (built by {@link auditPage}). */
export interface PageAudit {
  url: string;
  report: Report;
  title?: string;
  metaDescription?: string;
  /** Normalized absolute internal link targets found on the page. */
  internalLinks: string[];
  /** Normalized absolute external link targets found on the page. */
  externalLinks: string[];
  httpStatus?: number;
}

/** A whole-site audit rolled up from many {@link PageAudit}s. Pure output. */
export interface SiteReport {
  seed: string;
  pageCount: number;
  /** Average of every page's overall score (0–100). */
  averageScore: number;
  /** Letter grade of {@link averageScore}. */
  averageGrade: Grade;
  /** Every page, best grade first. */
  leaderboard: { url: string; score: number; grade: Grade }[];
  /** The lowest-scoring pages (worst first). */
  worst: { url: string; score: number; grade: Grade }[];
  /** The most frequent warn/fail findings across the site. */
  commonIssues: { id: string; message: string; status: FindingStatus; count: number }[];
  /** Groups of pages that share an identical `<title>`. */
  duplicateTitles: { value: string; urls: string[] }[];
  /** Groups of pages that share an identical meta description. */
  duplicateDescriptions: { value: string; urls: string[] }[];
  /** Internal links that point to a crawled page returning HTTP ≥ 400. */
  brokenInternalLinks: { from: string; to: string; status: number }[];
}

/** One parsed budget rule, e.g. `{ metric: "scripts", op: "<", value: 10 }`. */
export interface Budget {
  metric: "html" | "scripts" | "stylesheets" | "images" | "links" | "requests" | "responsetime";
  op: "<" | "<=" | ">" | ">=";
  /** The threshold, already normalized to the metric's base unit (bytes for html, ms for responsetime). */
  value: number;
  /** The raw text the value was parsed from (e.g. "100kb"), for reporting. */
  raw: string;
}

/** One regression found by {@link diffReports}. */
export interface Regression {
  kind: "overall" | "category" | "finding";
  id: string;
  message: string;
  /** The prior value (grade, score or status). */
  before: string | number;
  /** The current, worse value. */
  after: string | number;
}
