/**
 * Run summaries — turn a collected lead list into headline stats: coverage of
 * phone/email/website, a rating-band breakdown and the top categories. Pure and
 * unit-tested; the CLI prints {@link formatSummary} after a `--summary` run.
 */
import type { Lead } from "./types.js";

/** One rating band and how many leads fall in it. */
export interface RatingBand {
  /** Human label, e.g. "4.5+" or "unrated". */
  band: string;
  count: number;
}

/** One category and its lead count. */
export interface CategoryCount {
  category: string;
  count: number;
}

/** A rich, printable summary of a run. See {@link summarize}. */
export interface LeadSummary {
  total: number;
  withPhone: number;
  withEmail: number;
  withWebsite: number;
  withSocial: number;
  /** Coverage percentages (0–100, rounded). */
  pctPhone: number;
  pctEmail: number;
  pctWebsite: number;
  /** Leads open at scrape time (only counted when the field was collected). */
  openNow: number;
  ratingBands: RatingBand[];
  topCategories: CategoryCount[];
  avgRating?: number;
}

const SOCIAL_KEYS: (keyof Lead)[] = [
  "facebook", "instagram", "whatsapp", "linkedin", "twitter", "youtube", "tiktok", "telegram",
];

const pct = (n: number, total: number): number => (total ? Math.round((n / total) * 100) : 0);

/** The rating band label for a numeric rating. */
function bandOf(rating: number): string {
  if (rating >= 4.5) return "4.5+";
  if (rating >= 4.0) return "4.0–4.4";
  if (rating >= 3.0) return "3.0–3.9";
  return "<3.0";
}

const BAND_ORDER = ["4.5+", "4.0–4.4", "3.0–3.9", "<3.0", "unrated"];

/**
 * Compute a {@link LeadSummary} over a lead list — coverage counts and
 * percentages, a rating-band histogram (bands with a zero count are omitted,
 * except "unrated" when some leads lack a rating), and the top categories by
 * frequency. Pure.
 */
export function summarize(leads: Lead[], opts: { topN?: number } = {}): LeadSummary {
  const total = leads.length;
  const withPhone = leads.filter((l) => l.phone).length;
  const withEmail = leads.filter((l) => l.email).length;
  const withWebsite = leads.filter((l) => l.website).length;
  const withSocial = leads.filter((l) => SOCIAL_KEYS.some((k) => l[k])).length;
  const openNow = leads.filter((l) => l.openNow === true).length;

  const bandCounts = new Map<string, number>();
  const ratings: number[] = [];
  for (const l of leads) {
    if (typeof l.rating === "number") {
      ratings.push(l.rating);
      const b = bandOf(l.rating);
      bandCounts.set(b, (bandCounts.get(b) ?? 0) + 1);
    } else {
      bandCounts.set("unrated", (bandCounts.get("unrated") ?? 0) + 1);
    }
  }
  const ratingBands: RatingBand[] = BAND_ORDER
    .filter((b) => (bandCounts.get(b) ?? 0) > 0)
    .map((band) => ({ band, count: bandCounts.get(band)! }));

  const catCounts = new Map<string, number>();
  for (const l of leads) {
    const cats = new Set<string>();
    if (l.category) cats.add(l.category.trim());
    for (const c of l.categories ?? []) if (c) cats.add(c.trim());
    for (const c of cats) if (c) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
  }
  const topN = Math.max(1, opts.topN ?? 5);
  const topCategories: CategoryCount[] = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, topN)
    .map(([category, count]) => ({ category, count }));

  const summary: LeadSummary = {
    total,
    withPhone,
    withEmail,
    withWebsite,
    withSocial,
    pctPhone: pct(withPhone, total),
    pctEmail: pct(withEmail, total),
    pctWebsite: pct(withWebsite, total),
    openNow,
    ratingBands,
    topCategories,
  };
  if (ratings.length) {
    summary.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  }
  return summary;
}

/** Render a {@link LeadSummary} as a compact multi-line report (no colour). Pure. */
export function formatSummary(s: LeadSummary): string {
  const lines: string[] = [];
  lines.push(`Summary — ${s.total} lead${s.total === 1 ? "" : "s"}`);
  lines.push(
    `  contactable: ${s.pctPhone}% phone · ${s.pctWebsite}% website · ${s.pctEmail}% email` +
      ` (${s.withSocial} with a social link)`,
  );
  if (s.avgRating !== undefined) lines.push(`  avg rating: ${s.avgRating} ★`);
  if (s.ratingBands.length) {
    lines.push("  rating bands: " + s.ratingBands.map((b) => `${b.band} ×${b.count}`).join(" · "));
  }
  if (s.openNow) lines.push(`  open now: ${s.openNow}`);
  if (s.topCategories.length) {
    lines.push("  top categories: " + s.topCategories.map((c) => `${c.category} (${c.count})`).join(", "));
  }
  return lines.join("\n");
}
