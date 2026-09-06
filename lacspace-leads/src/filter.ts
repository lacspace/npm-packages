import type { Lead, LeadFilters, SearchOptions } from "./types.js";

/** Keep only leads that satisfy every set filter. Pure; returns a new array. */
export function filterLeads(leads: Lead[], filters: LeadFilters = {}): Lead[] {
  return leads.filter((l) => {
    if (filters.minRating !== undefined && !(typeof l.rating === "number" && l.rating >= filters.minRating)) return false;
    if (filters.minReviews !== undefined && !(typeof l.reviews === "number" && l.reviews >= filters.minReviews)) return false;
    if (filters.hasPhone && !l.phone) return false;
    if (filters.hasWebsite && !l.website) return false;
    if (filters.hasEmail && !l.email) return false;
    if (filters.hasValidEmail && l.emailStatus !== "valid") return false;
    if (filters.hasContact && !(l.phone || l.email || l.website)) return false;
    if (filters.excludeNames && filters.excludeNames.length) {
      const name = (l.name ?? "").toLowerCase();
      if (filters.excludeNames.some((t) => t && name.includes(t.toLowerCase()))) return false;
    }
    return true;
  });
}

/** The key used to detect a duplicate lead. */
function dedupeKey(lead: Lead, by: NonNullable<SearchOptions["dedupe"]>): string | undefined {
  if (by === "none") return undefined;
  if (by === "website") return normalizeHost(lead.website);
  if (by === "phone") return lead.phone?.replace(/[^0-9]/g, "") || undefined;
  if (by === "name") return lead.name?.trim().toLowerCase() || undefined;
  // "smart": the strongest identity available — website, else phone, else name.
  return (
    normalizeHost(lead.website) ??
    (lead.phone?.replace(/[^0-9]/g, "") || undefined) ??
    (lead.name?.trim().toLowerCase() || undefined)
  );
}

function normalizeHost(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase() || undefined;
  }
}

/**
 * Remove duplicate leads, keeping the first of each. A lead with no value for
 * the dedupe key is always kept (never merged away). Pure; new array.
 */
export function dedupeLeads(leads: Lead[], by: NonNullable<SearchOptions["dedupe"]> = "website"): Lead[] {
  if (by === "none") return [...leads];
  const seen = new Set<string>();
  const out: Lead[] = [];
  for (const lead of leads) {
    const key = dedupeKey(lead, by);
    if (key === undefined) {
      out.push(lead);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(lead);
  }
  return out;
}
