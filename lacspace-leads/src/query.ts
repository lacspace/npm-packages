import { ALL_FIELDS, type LeadField } from "./types.js";

/**
 * Compose the human search query from options: an explicit `query` wins,
 * otherwise "<type> in <area>, <city>" with the empty parts dropped.
 */
export function composeQuery(opts: {
  query?: string;
  type?: string;
  area?: string;
  city?: string;
}): string {
  if (opts.query && opts.query.trim()) return opts.query.trim();
  const type = (opts.type ?? "").trim();
  const where = [opts.area, opts.city]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
  if (!type) throw new Error("A business `type` (or an explicit `query`) is required.");
  return where ? `${type} in ${where}` : type;
}

/** The Google Maps search URL for a query. `hl=en` keeps labels predictable. */
export function mapsSearchUrl(query: string): string {
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=en`;
}

/**
 * Normalise a fields request (array or comma string) into known {@link LeadField}s
 * in canonical order, de-duplicated. Unknown names are ignored; an empty result
 * falls back to all fields.
 */
export function normalizeFields(input?: readonly string[] | string): LeadField[] {
  if (!input) return [...ALL_FIELDS];
  const raw: readonly string[] = typeof input === "string" ? input.split(",") : input;
  const want = new Set(
    raw.map((f) => String(f).trim().toLowerCase()).filter(Boolean),
  );
  const picked = ALL_FIELDS.filter((f) => want.has(f.toLowerCase()));
  return picked.length > 0 ? picked : [...ALL_FIELDS];
}

/** A safe, timestamped default output filename for a query + format. */
export function defaultFilename(query: string, format: string): string {
  const slug =
    query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "leads";
  const stamp = new Date().toISOString().slice(0, 10);
  return `${slug}-${stamp}.${format}`;
}
