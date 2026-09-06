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
  | "tech";

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
    scripts: number;
    stylesheets: number;
    images: number;
    internalLinks: number;
    externalLinks: number;
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
}

/** The result of checking one link's HTTP status. */
export interface LinkStatus {
  url: string;
  status: number;
  ok: boolean;
  redirected: boolean;
  error?: string;
}
