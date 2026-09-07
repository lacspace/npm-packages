/**
 * @lacspace/sitemap — validation & formatting helpers.
 *
 * Small, zero-dependency utilities for keeping sitemaps spec-compliant:
 * clamp `priority`, validate `changefreq`, format `lastmod` as W3C/ISO, and
 * guard against the 50,000-URL-per-file limit with a clear error.
 *
 * All additive — the core builders (`sitemap`, `splitSitemaps`, …) already
 * clamp priority and format dates internally; these expose the same rules so
 * callers can validate their data before building.
 */

import type { ChangeFreq } from "./index";

/** Max URLs a single sitemap file may contain (sitemaps.org spec). */
export const SITEMAP_MAX_URLS = 50000;

/** The seven valid `<changefreq>` values, in spec order. */
export const CHANGEFREQS: readonly ChangeFreq[] = [
  "always",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "never",
];

/** Type guard: is `value` one of the seven valid `<changefreq>` values? */
export function isValidChangefreq(value: unknown): value is ChangeFreq {
  return typeof value === "string" && (CHANGEFREQS as readonly string[]).includes(value);
}

/**
 * Clamp a `priority` into the valid 0.0–1.0 range and round to one decimal
 * (matching the value the builders actually emit). Non-finite input (`NaN`,
 * `Infinity`) falls back to the sitemap default of `0.5`.
 * @example clampPriority(1.7) // 1
 * @example clampPriority(-3)  // 0
 * @example clampPriority(0.83) // 0.8
 */
export function clampPriority(priority: number): number {
  if (!Number.isFinite(priority)) return 0.5;
  const clamped = Math.max(0, Math.min(1, priority));
  return Math.round(clamped * 10) / 10;
}

/**
 * Format a `lastmod` value as a W3C Datetime string (ISO 8601).
 * A `Date` becomes its full `toISOString()`; a string is passed through
 * unchanged (assumed already valid). Invalid `Date`s throw a clear error.
 * @example formatLastmod(new Date("2026-09-05T00:00:00Z")) // "2026-09-05T00:00:00.000Z"
 */
export function formatLastmod(date: Date | string): string {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new RangeError("[@lacspace/sitemap] lastmod is an Invalid Date");
    }
    return date.toISOString();
  }
  return date;
}

/**
 * Throw a clear `RangeError` if `count` exceeds the per-file limit. Use before
 * writing a single sitemap file; for larger sets use {@link splitSitemaps}.
 * @param count number of URLs
 * @param cap max allowed (default {@link SITEMAP_MAX_URLS}); values above the
 *   spec max are themselves capped at 50,000.
 */
export function assertUrlCount(count: number, cap: number = SITEMAP_MAX_URLS): void {
  const limit = Math.min(cap, SITEMAP_MAX_URLS);
  if (count > limit) {
    throw new RangeError(
      `[@lacspace/sitemap] ${count} URLs exceeds the limit of ${limit} per sitemap file. ` +
        `Use splitSitemaps() to shard into a sitemap index.`,
    );
  }
}

/** A single validation problem found on a URL entry. */
export interface SitemapUrlIssue {
  /** The offending field. */
  field: "loc" | "priority" | "changefreq" | "lastmod";
  /** Human-readable description. */
  message: string;
}

/**
 * Non-throwing validation of one URL-like entry. Returns a list of issues
 * (empty = valid). Checks that `loc` is a non-empty absolute URL, `priority`
 * is within 0.0–1.0, `changefreq` is a valid enum value, and `lastmod` parses.
 * @example validateSitemapUrl({ loc: "/rel", priority: 2 }) // 2 issues
 */
export function validateSitemapUrl(u: {
  loc?: unknown;
  priority?: unknown;
  changefreq?: unknown;
  lastmod?: unknown;
}): SitemapUrlIssue[] {
  const issues: SitemapUrlIssue[] = [];
  if (typeof u.loc !== "string" || u.loc.length === 0) {
    issues.push({ field: "loc", message: "loc is required and must be a non-empty string" });
  } else if (!/^https?:\/\//i.test(u.loc)) {
    issues.push({ field: "loc", message: `loc must be an absolute http(s) URL: "${u.loc}"` });
  }
  if (u.priority !== undefined) {
    if (typeof u.priority !== "number" || !Number.isFinite(u.priority)) {
      issues.push({ field: "priority", message: "priority must be a finite number" });
    } else if (u.priority < 0 || u.priority > 1) {
      issues.push({ field: "priority", message: `priority ${u.priority} is outside 0.0–1.0` });
    }
  }
  if (u.changefreq !== undefined && !isValidChangefreq(u.changefreq)) {
    issues.push({
      field: "changefreq",
      message: `changefreq "${String(u.changefreq)}" is not one of ${CHANGEFREQS.join(", ")}`,
    });
  }
  if (u.lastmod instanceof Date && Number.isNaN(u.lastmod.getTime())) {
    issues.push({ field: "lastmod", message: "lastmod is an Invalid Date" });
  }
  return issues;
}
