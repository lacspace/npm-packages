import { ALL_FIELDS, FIELD_PRESETS, type LeadField } from "./types.js";

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

/**
 * The Google Maps search URL for a query. `hl` (interface language) keeps the
 * scraped aria-labels predictable; `gl` biases results to a region; `center`
 * (`{lat,lng,zoom}`) points the map at a location for a radius search.
 */
export function mapsSearchUrl(
  query: string,
  opts: { hl?: string; gl?: string; center?: { lat: number; lng: number; zoom?: number } } = {},
): string {
  const hl = (opts.hl ?? "en").split("-")[0] || "en";
  const params = new URLSearchParams({ hl });
  if (opts.gl) params.set("gl", opts.gl.toLowerCase());
  const base = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  const at = opts.center
    ? `/@${opts.center.lat},${opts.center.lng},${Math.round(opts.center.zoom ?? 14)}z`
    : "";
  return `${base}${at}?${params.toString()}`;
}

/**
 * Expand a possibly-multi search request into individual `{type, city, area}`
 * queries — the cross-product of comma-separated types × cities × areas. An
 * explicit `query` short-circuits to a single verbatim search. Used for batch.
 */
export function expandQueries(opts: {
  type?: string;
  city?: string;
  area?: string;
  query?: string;
}): { type?: string; city?: string; area?: string; query?: string }[] {
  if (opts.query && opts.query.trim()) return [{ query: opts.query.trim() }];
  const split = (s?: string): (string | undefined)[] => {
    const parts = (s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    return parts.length ? parts : [undefined];
  };
  const types = split(opts.type);
  const cities = split(opts.city);
  const areas = split(opts.area);
  const out: { type?: string; city?: string; area?: string }[] = [];
  for (const type of types) {
    for (const city of cities) {
      for (const area of areas) {
        const entry: { type?: string; city?: string; area?: string } = {};
        if (type) entry.type = type;
        if (city) entry.city = city;
        if (area) entry.area = area;
        out.push(entry);
      }
    }
  }
  return out;
}

/** Resolve a preset name to its field list, case-insensitively. */
export function resolvePreset(name?: string): LeadField[] | undefined {
  if (!name) return undefined;
  return FIELD_PRESETS[name.trim().toLowerCase()];
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
