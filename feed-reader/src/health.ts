/**
 * Score how healthy a source feed is, so a newsroom can prune the dead and the
 * poisoned from a large source list without a human reading each one. Signals:
 * staleness vs its own cadence, empty feeds, duplicate items (a mis-generated or
 * hijacked feed), sudden volume spikes, missing links/dates, and — from an
 * optional poll history — the fetch error rate. Deterministic, no network.
 */

import type { FeedEntry, ParsedFeed } from "./parse.js";

export type HealthStatus = "healthy" | "degraded" | "stale" | "broken";

export interface PollRecord {
  /** Epoch ms of the poll. */
  at: number | string | Date;
  /** Did the fetch+parse succeed? */
  ok: boolean;
}

export interface HealthOptions {
  /** "now" for staleness, epoch ms. Default Date.now(). */
  now?: number;
  /** Recent fetch history to derive an error rate and detect flapping. */
  history?: PollRecord[];
  /**
   * Expected max hours between posts for this source. If omitted, it is inferred
   * from the feed's own median cadence (with a floor), so a weekly blog isn't
   * punished for weekly posting.
   */
  expectedMaxAgeHours?: number;
  /** A recent-window burst of this many × the baseline rate is flagged as a spike. Default 5. */
  spikeFactor?: number;
}

export interface FeedHealth {
  /** 0..1, higher is healthier. */
  score: number;
  status: HealthStatus;
  entries: number;
  /** ISO time of the newest entry, if any. */
  lastEntryAt?: string;
  /** Hours since the newest entry. */
  ageHours?: number;
  /** Estimated posts per day from the entry timestamps. */
  postsPerDay: number;
  /** Fraction of entries that duplicate another (by id/link/title). */
  duplicateRatio: number;
  /** Fraction of entries with no link. */
  missingLinkRatio: number;
  /** Fraction of entries with no parseable date. */
  missingDateRatio: number;
  /** Fetch failure rate from `history`, when provided. */
  errorRate?: number;
  /** A sudden burst of items well above the feed's baseline rate. */
  spike: boolean;
  /** Human-readable notes for an audit log. */
  reasons: string[];
}

function ms(at: PollRecord["at"]): number {
  if (typeof at === "number") return at;
  if (at instanceof Date) return at.getTime();
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

function entryTimes(entries: FeedEntry[]): number[] {
  const out: number[] = [];
  for (const e of entries) {
    const t = e.published ?? e.updated;
    if (t) {
      const p = Date.parse(t);
      if (!Number.isNaN(p)) out.push(p);
    }
  }
  return out.sort((a, b) => b - a); // newest first
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function dedupeKey(e: FeedEntry): string {
  return (e.id || e.link || e.title || "").trim().toLowerCase();
}

function round(n: number, p = 3): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

/**
 * Score a parsed feed's health. Pass `history` (recent poll outcomes) to factor in
 * the fetch error rate; otherwise health is judged from the feed content alone.
 */
export function scoreFeedHealth(feed: ParsedFeed, options: HealthOptions = {}): FeedHealth {
  const now = options.now ?? Date.now();
  const spikeFactor = options.spikeFactor ?? 5;
  const entries = feed.entries;
  const n = entries.length;
  const reasons: string[] = [];

  const times = entryTimes(entries);
  const lastMs = times[0];
  const ageHours = lastMs !== undefined ? (now - lastMs) / 3_600_000 : undefined;

  // Cadence: median gap between consecutive entries → posts/day.
  const gaps: number[] = [];
  for (let i = 0; i + 1 < times.length; i++) gaps.push(times[i]! - times[i + 1]!);
  const medGapMs = median(gaps);
  const postsPerDay = medGapMs > 0 ? round(86_400_000 / medGapMs) : n > 0 && ageHours !== undefined ? 0 : 0;

  // Duplicates.
  const keys = entries.map(dedupeKey).filter(Boolean);
  const uniq = new Set(keys);
  const duplicateRatio = keys.length ? round(1 - uniq.size / keys.length) : 0;

  // Missing fields.
  const missingLink = entries.filter((e) => !e.link).length;
  const missingDate = entries.filter((e) => !e.published && !e.updated).length;
  const missingLinkRatio = n ? round(missingLink / n) : 0;
  const missingDateRatio = n ? round(missingDate / n) : 0;

  // Expected max age: caller value, else 3× median cadence with a 26h floor / 60d ceiling.
  const inferred = medGapMs > 0 ? (medGapMs * 3) / 3_600_000 : 168;
  const expectedMaxAgeHours = options.expectedMaxAgeHours ?? Math.min(1440, Math.max(26, inferred));

  // Spike: many items clustered within one *average* gap of the newest post. The
  // average gap resists the burst (old entries dominate the span), so a cluster
  // stands out against it — unlike the median, which the burst itself collapses.
  let spike = false;
  const span = times.length >= 2 ? times[0]! - times[times.length - 1]! : 0;
  if (times.length >= 4 && span > 0) {
    const avgGapMs = span / (times.length - 1);
    const windowStart = times[0]! - avgGapMs;
    const recentCount = times.filter((t) => t >= windowStart).length;
    if (recentCount >= spikeFactor) {
      spike = true;
      reasons.push(`spike: ${recentCount} items within one average posting interval`);
    }
  }

  // Error rate from history.
  let errorRate: number | undefined;
  if (options.history && options.history.length) {
    const hist = options.history;
    const fails = hist.filter((h) => !h.ok).length;
    errorRate = round(fails / hist.length);
  }

  // ---- Score ----
  let score = 1;

  if (n === 0) {
    score = 0;
    reasons.push("feed has no entries");
  }

  if (ageHours !== undefined) {
    if (ageHours > expectedMaxAgeHours) {
      const over = ageHours / expectedMaxAgeHours;
      const penalty = Math.min(0.6, 0.3 * Math.log2(over) + 0.15);
      score -= penalty;
      reasons.push(`stale: ${round(ageHours, 1)}h since last post (expected ≤ ${round(expectedMaxAgeHours, 1)}h)`);
    }
  } else if (n > 0) {
    score -= 0.2;
    reasons.push("no parseable dates on any entry");
  }

  if (duplicateRatio > 0.2) {
    score -= Math.min(0.4, duplicateRatio * 0.6);
    reasons.push(`${Math.round(duplicateRatio * 100)}% duplicate items`);
  }
  if (missingLinkRatio > 0.3) {
    score -= 0.15;
    reasons.push(`${Math.round(missingLinkRatio * 100)}% of items have no link`);
  }
  if (missingDateRatio > 0.5 && ageHours !== undefined) {
    score -= 0.1;
    reasons.push(`${Math.round(missingDateRatio * 100)}% of items have no date`);
  }
  if (spike) score -= 0.15;
  if (errorRate !== undefined && errorRate > 0) {
    score -= Math.min(0.5, errorRate * 0.7);
    reasons.push(`${Math.round(errorRate * 100)}% of recent fetches failed`);
  }

  score = round(Math.max(0, Math.min(1, score)));

  // Status.
  let status: HealthStatus;
  if (n === 0 || (errorRate !== undefined && errorRate >= 0.5)) status = "broken";
  else if (ageHours !== undefined && ageHours > expectedMaxAgeHours * 4) status = "stale";
  else if (score < 0.6) status = "degraded";
  else status = "healthy";

  if (reasons.length === 0) reasons.push("healthy");

  return {
    score,
    status,
    entries: n,
    ...(times[0] !== undefined ? { lastEntryAt: new Date(times[0]!).toISOString() } : {}),
    ...(ageHours !== undefined ? { ageHours: round(ageHours, 1) } : {}),
    postsPerDay,
    duplicateRatio,
    missingLinkRatio,
    missingDateRatio,
    ...(errorRate !== undefined ? { errorRate } : {}),
    spike,
    reasons,
  };
}
