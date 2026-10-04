/**
 * @lacspace/triage — decide which news candidates to WRITE before spending any AI tokens.
 *
 * Pure and deterministic: rank candidates by freshness, independent sources, trend, novelty
 * and trust; fill the publish slots per language (respecting category quotas); send the rest
 * to the queue or drop them; let real breaking news jump the line. Sensitive stories need
 * two independent sources or an official one. Routine notices are grouped for roundups.
 *
 * Built for WeNepal: "write only what we will publish, and publish it while it's fresh".
 */

const VERSION = "1.0.0";
const HOUR = 3_600_000;

export interface Source {
  /** Domain or URL of the source page. */
  domain: string;
  /** Official / primary source (government body, regulator, court, the company itself). */
  primary?: boolean;
  /** 0–100. */
  trust?: number;
  /** When this source published or was seen (ISO string or ms). */
  at?: string | number;
}

export interface Candidate {
  id: string;
  title: string;
  lang: string;
  category: string;
  firstSeenAt: string | number;
  newestKnownAt?: string | number | null;
  sources: Source[];
  /** 0–1 trend match. */
  trend?: number;
  /** 0–1, 1 = nothing similar published in the last 48 h. */
  novelty?: number;
  breaking?: boolean;
  /** "notice" = a routine notice (bonus share registered, court notice board, …). */
  kind?: "notice" | "news";
  /** The story makes an allegation against a named person (always treated as sensitive). */
  allegation?: boolean;
  /** Force sensitive handling regardless of category. */
  sensitive?: boolean;
}

export interface TriageOptions {
  /** Current time (ISO or ms). Default Date.now(). */
  now?: string | number;
  /** Freshness window in hours (default 48), with per-category overrides. */
  freshnessHours?: number | { default?: number; [category: string]: number | undefined };
  slots: {
    /** Stories you can publish per hour, per language. */
    perHour: Record<string, number>;
    /** Already used this hour, per language. */
    usedThisHour?: Record<string, number>;
  };
  /** Max new stories per category per hour. */
  quotas?: Record<string, number>;
  /** Already used this hour, per category. */
  quotasUsedThisHour?: Record<string, number>;
  /** Sensitive categories (default: politics, courts, crime, death, communal, minors, health-emergency). */
  sensitive?: string[];
  /** Breaking fast-lane writes allowed per hour beyond the slots (default 2). */
  fastLanePerHour?: number;
  /** Fast-lane writes already used this hour. */
  fastLaneUsedThisHour?: number;
  /** Minimum novelty before a candidate counts as a duplicate (default 0.3). */
  minNovelty?: number;
  /** Extra title patterns that mark a routine notice. */
  noticePatterns?: RegExp[];
}

export type Action = "write_now" | "queue" | "drop";

export interface TriageResult {
  id: string;
  action: Action;
  /** 0–1. */
  priority: number;
  reasons: string[];
  /** Group key for a combined roundup (routine notices), e.g. "nepse-notices". */
  roundup?: string;
  /** Distinct registrable source domains. */
  independentSources: number;
  /** When the story stops being publishable (ISO). */
  expiresAt: string;
}

/** Default sensitive categories. */
export const SENSITIVE_DEFAULT = ["politics", "courts", "court", "crime", "death", "communal", "minors", "health-emergency"];

/** Titles that are routine market / court notices rather than news. */
export const NOTICE_PATTERNS: RegExp[] = [
  /\b(bonus|right)\s+shares?\b.*\b(registered|approved|allotted|listed)\b/i,
  /\b(book\s+closure|agm|annual\s+general\s+meeting|dividend\s+(declared|announced)|auction|ipo\s+(result|allotment)|debenture\s+(listed|issued))\b/i,
  /\b(listed|registered|approved)\b\s*$/i,
  /(बोनस|हकप्रद)\s*सेयर.*(दर्ता|स्वीकृत|सूचीकृत)/,
  /(पुस्तक\s*बन्द|साधारण\s*सभा|लाभांश)/,
  /^[^\s]+\s+(जिल्ला|उच्च|सर्वोच्च)\s+अदालत\s*$/,
  /^[^\s]+\s+(district|high)\s+court\s*$/i,
];

/* ── helpers ────────────────────────────────────────────────────────────── */

const ms = (t: string | number) => (typeof t === "number" ? t : Date.parse(t));
const SECOND_LEVEL = new Set(["gov", "com", "org", "edu", "net", "mil", "ac", "co", "or", "ne", "go", "nic", "gob", "info", "biz"]);

/** Registrable domain: "www.sebon.gov.np" → "sebon.gov.np", "news.bbc.co.uk" → "bbc.co.uk". */
export function registrableDomain(input: string): string {
  let h = input.trim().toLowerCase();
  h = h.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0]!.split(":")[0]!.replace(/\.$/, "");
  const parts = h.split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  const tld = parts[parts.length - 1]!, sld = parts[parts.length - 2]!;
  const take = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return parts.slice(-take).join(".");
}

function freshnessFor(category: string, f: TriageOptions["freshnessHours"]): number {
  if (typeof f === "number") return f;
  return f?.[category] ?? f?.default ?? 48;
}

/** Sources within `windowMs` of each other: the largest cluster of distinct domains. */
function clusteredSources(sources: Source[], windowMs: number): number {
  const pts = sources
    .filter((s) => s.at !== undefined)
    .map((s) => ({ d: registrableDomain(s.domain), t: ms(s.at!) }))
    .sort((a, b) => a.t - b.t);
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const set = new Set<string>();
    for (let j = i; j < pts.length && pts[j]!.t - pts[i]!.t <= windowMs; j++) set.add(pts[j]!.d);
    best = Math.max(best, set.size);
  }
  return best;
}

/* ── triage ─────────────────────────────────────────────────────────────── */

/** Rank candidates and decide write_now / queue / drop. Deterministic for the same inputs. */
export function triage(candidates: Candidate[], options: TriageOptions): TriageResult[] {
  const now = options.now === undefined ? Date.now() : ms(options.now);
  const sensitiveCats = new Set((options.sensitive ?? SENSITIVE_DEFAULT).map((s) => s.toLowerCase()));
  const minNovelty = options.minNovelty ?? 0.3;
  const noticeRes = [...NOTICE_PATTERNS, ...(options.noticePatterns ?? [])];
  const free: Record<string, number> = {};
  for (const [lang, n] of Object.entries(options.slots.perHour)) free[lang] = Math.max(0, n - (options.slots.usedThisHour?.[lang] ?? 0));
  const quotaLeft: Record<string, number> = {};
  for (const [cat, n] of Object.entries(options.quotas ?? {})) quotaLeft[cat] = Math.max(0, n - (options.quotasUsedThisHour?.[cat] ?? 0));
  let fastLeft = Math.max(0, (options.fastLanePerHour ?? 2) - (options.fastLaneUsedThisHour ?? 0));

  type Row = TriageResult & { c: Candidate; expiresMs: number; notice: boolean; fast: boolean };
  const rows: Row[] = candidates.map((c) => {
    const reasons: string[] = [];
    const freshH = freshnessFor(c.category, options.freshnessHours);
    const base = ms(c.newestKnownAt ?? c.firstSeenAt);
    const ageH = Math.max(0, (now - base) / HOUR);
    const expiresMs = base + freshH * HOUR;
    const domains = new Set(c.sources.map((s) => registrableDomain(s.domain)));
    const indep = domains.size;
    const primary = c.sources.some((s) => s.primary);
    const trust = c.sources.reduce((m, s) => Math.max(m, s.trust ?? (s.primary ? 90 : 50)), 0) / 100;
    const trend = Math.min(1, Math.max(0, c.trend ?? 0));
    const novelty = Math.min(1, Math.max(0, c.novelty ?? 1));
    const notice = c.kind === "notice" || noticeRes.some((re) => re.test(c.title.trim()));
    const fast = !!c.breaking || (clusteredSources(c.sources, HOUR) >= 3 && trend >= 0.5);

    const freshness = Math.max(0, 1 - ageH / freshH);
    const sourceScore = Math.min(1, indep / 3 + (primary ? 1 / 3 : 0));
    let priority = 0.35 * freshness + 0.25 * sourceScore + 0.2 * trend + 0.15 * novelty + 0.05 * trust;
    if (notice) { priority *= 0.5; reasons.push("routine_notice"); }
    priority = Math.round(priority * 1000) / 1000;

    const row: Row = {
      id: c.id, action: "queue", priority, reasons, independentSources: indep,
      expiresAt: new Date(expiresMs).toISOString(), c, expiresMs, notice, fast,
      ...(notice ? { roundup: `${c.category.toLowerCase()}-notices` } : {}),
    };

    const sensitive = !!c.sensitive || !!c.allegation || c.category.toLowerCase().split(/[\s/,]+/).some((p) => sensitiveCats.has(p));
    if (ageH > freshH) { row.action = "drop"; reasons.push(`stale:${ageH.toFixed(1)}h>${freshH}h`); }
    else if (novelty < minNovelty) { row.action = "drop"; reasons.push("duplicate"); }
    else if (sensitive && !(indep >= 2 || primary)) { row.action = "drop"; reasons.push("sensitive:needs_2_sources_or_official"); }
    else {
      if (sensitive) reasons.push(primary ? "sensitive:official_source" : `sensitive:${indep}_sources`);
      reasons.push(`sources:${indep}${primary ? "+official" : ""}`, `age:${ageH.toFixed(1)}h`);
    }
    return row;
  });

  // Highest priority first; ties broken by freshest, then id (stable output).
  const live = rows.filter((r) => r.action !== "drop").sort((a, b) => b.priority - a.priority || b.expiresMs - a.expiresMs || a.id.localeCompare(b.id));

  for (const r of live) {
    const cat = r.c.category;
    const quotaOk = !(cat in quotaLeft) || quotaLeft[cat]! > 0;
    if (r.notice) {
      r.reasons.push("roundup_candidate");
    } else if (r.fast && fastLeft > 0) {
      // Breaking fast lane: write now even when slots are full (still capped per hour).
      r.action = "write_now"; r.reasons.push("fast_lane"); fastLeft--;
      if (cat in quotaLeft) quotaLeft[cat] = Math.max(0, quotaLeft[cat]! - 1);
      continue;
    } else if ((free[r.c.lang] ?? 0) > 0 && quotaOk) {
      r.action = "write_now"; r.reasons.push("slot"); free[r.c.lang]!--;
      if (cat in quotaLeft) quotaLeft[cat]!--;
      continue;
    } else {
      r.reasons.push(!quotaOk ? `quota:${cat}` : "slots_full");
    }
    // Queued: drop if it would expire before the next hourly window opens.
    if (r.expiresMs < now + HOUR) { r.action = "drop"; r.reasons.push("expires_before_next_slot"); }
  }

  return rows
    .sort((a, b) => order(a.action) - order(b.action) || b.priority - a.priority || a.id.localeCompare(b.id))
    .map(({ c: _c, expiresMs: _e, notice: _n, fast: _f, ...out }) => out);
}

const order = (a: Action) => (a === "write_now" ? 0 : a === "queue" ? 1 : 2);

/** Group queued routine notices into roundups: { "nepse-notices": ["c", "d"] }. */
export function roundups(results: TriageResult[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const r of results) if (r.roundup && r.action === "queue") (out[r.roundup] ||= []).push(r.id);
  return out;
}

/** describe() for agents/conductors. */
export function describe() {
  return {
    name: "@lacspace/triage",
    version: VERSION,
    summary: "Pre-write news triage: rank candidates (freshness, independent source domains, trend, novelty, trust), fill per-language publish slots with category quotas, breaking fast lane, sensitive-story source rule, routine-notice roundups; write_now / queue / drop with reasons. Deterministic, no AI.",
    commands: [
      {
        name: "triage",
        input: {
          type: "object",
          properties: {
            candidates: { type: "array", description: "{ id, title, lang, category, firstSeenAt, newestKnownAt?, sources:[{domain, primary?, trust?, at?}], trend?, novelty?, breaking?, kind?, allegation? }[]" },
            options: { type: "object", description: "{ now?, freshnessHours?, slots:{perHour, usedThisHour?}, quotas?, sensitive?, fastLanePerHour? }" },
          },
          required: ["candidates", "options"],
        },
        output: "[{ id, action: write_now|queue|drop, priority, reasons[], roundup?, independentSources, expiresAt }]",
      },
    ],
  };
}
