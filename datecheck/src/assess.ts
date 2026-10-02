import { extractPublishedDate } from "./extract.js";
import { textStaleness } from "./staleness.js";
import { parseAnyDate } from "./parse.js";

export type Freshness = "fresh" | "stale" | "unknown";

export interface AssessFreshnessInput {
  /** Article HTML, if available (enables page-date extraction). */
  html?: string;
  /** Article body text (required — used for the staleness fallback). */
  text: string;
  /** Article URL, for URL-pattern date extraction. */
  url?: string;
  /** The date the feed reported for this item, if any. */
  feedDate?: Date | null;
  now?: Date;
  /** Freshness window in hours. */
  maxAgeHours: number;
}

export interface AssessFreshnessResult {
  verdict: Freshness;
  /** Hours since the chosen reference date, or null when no date was found. */
  ageHours: number | null;
  reasons: string[];
}

const HOUR = 3600000;

/**
 * Combine page-date extraction, the feed date, and body-text staleness into one
 * freshness verdict. Deterministic and fail-closed: an article with NO parseable date
 * anywhere and no staleness signal is `unknown`, never silently "fresh" — so a 2019
 * story with no machine-readable date is not published as today's news.
 *
 * Precedence: a page publish/modify date (authoritative) outranks the feed date; only
 * when no page date exists is the feed date used; only when neither exists does the
 * text-staleness fallback decide.
 */
export function assessFreshness(input: AssessFreshnessInput): AssessFreshnessResult {
  const now = input.now ?? new Date();
  const reasons: string[] = [];
  const maxAgeMs = input.maxAgeHours * HOUR;

  let pageDate: Date | null = null;
  if (input.html || input.url) {
    const ex = extractPublishedDate(input.html ?? "", input.url ?? "", { now });
    pageDate = ex.publishedAt ?? ex.modifiedAt ?? null;
    if (pageDate) {
      reasons.push(`page date ${iso(pageDate)} via ${ex.publishedAt ? ex.source : "modified/" + ex.source}`);
    }
  }
  const feed = input.feedDate ?? null;
  if (feed) reasons.push(`feed date ${iso(feed)}`);

  const primary = pageDate ?? feed;
  if (primary) {
    const ageHours = Math.round(((now.getTime() - primary.getTime()) / HOUR) * 10) / 10;
    const verdict: Freshness = now.getTime() - primary.getTime() > maxAgeMs ? "stale" : "fresh";
    reasons.push(`${verdict}: reference date is ${ageHours}h old (limit ${input.maxAgeHours}h)`);
    return { verdict, ageHours, reasons };
  }

  // No date anywhere → fall back to body-text staleness.
  const ts = textStaleness(input.text ?? "", { now, maxAgeDays: input.maxAgeHours / 24 });
  reasons.push(`no page/feed date; text staleness: ${ts.signals.join("; ")}`);
  if (ts.newestMention === null) {
    reasons.push("no dated content at all → unknown (not assumed fresh)");
    return { verdict: "unknown", ageHours: null, reasons };
  }
  const ageHours = Math.round(((now.getTime() - ts.newestMention.getTime()) / HOUR) * 10) / 10;
  if (ts.stale) {
    return { verdict: "stale", ageHours, reasons };
  }
  return { verdict: "fresh", ageHours, reasons };
}

export interface AssessFreshnessAIInput extends AssessFreshnessInput {
  /** Injected AI hook — called ONLY for an otherwise-`unknown` verdict. */
  ai: (prompt: string) => Promise<string>;
}

/**
 * Like `assessFreshness`, but when the deterministic verdict is `unknown` and an `ai`
 * hook is supplied, asks it (via `freshnessPrompt`) for the event date and upgrades the
 * verdict. The AI is never consulted for a date the deterministic pass already found.
 */
export async function assessFreshnessWithAI(input: AssessFreshnessAIInput): Promise<AssessFreshnessResult> {
  const base = assessFreshness(input);
  if (base.verdict !== "unknown") return base;
  const now = input.now ?? new Date();
  let raw: string;
  try {
    raw = await input.ai(freshnessPrompt(input.text ?? ""));
  } catch (e) {
    base.reasons.push(`ai hook failed: ${(e as Error).message}`);
    return base;
  }
  const parsed = parseAiJson(raw);
  if (!parsed) {
    base.reasons.push("ai returned unparseable output; staying unknown");
    return base;
  }
  if (parsed.eventDate) {
    const d = parseAnyDate(parsed.eventDate, { now });
    if (d) {
      const ageHours = Math.round(((now.getTime() - d.getTime()) / HOUR) * 10) / 10;
      const verdict: Freshness = now.getTime() - d.getTime() > input.maxAgeHours * HOUR ? "stale" : "fresh";
      return { verdict, ageHours, reasons: [...base.reasons, `ai eventDate ${parsed.eventDate} → ${verdict}`] };
    }
  }
  if (typeof parsed.isCurrentNews === "boolean") {
    return {
      verdict: parsed.isCurrentNews ? "fresh" : "stale",
      ageHours: null,
      reasons: [...base.reasons, `ai isCurrentNews=${parsed.isCurrentNews}`],
    };
  }
  return base;
}

/** A terse prompt asking an LLM for the event date + currency as compact JSON. */
export function freshnessPrompt(text: string): string {
  const snippet = (text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  return (
    "What is the main event date of this news text, and is it current news? " +
    'Reply ONLY with JSON: {"eventDate":"YYYY-MM-DD"|null,"isCurrentNews":true|false}\n\n' +
    snippet
  );
}

function parseAiJson(raw: string): { eventDate: string | null; isCurrentNews?: boolean } | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    return { eventDate: o.eventDate ?? null, isCurrentNews: o.isCurrentNews };
  } catch {
    return null;
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
