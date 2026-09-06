import { stringify as csvStringify } from "@lacspace/csv";
import { jsonToXlsx } from "@lacspace/xlsx";
import { ALL_FIELDS, type Lead, type LeadField, type LeadStats, type OutputFormat } from "./types.js";

/** A column header for each field, for CSV/Excel exports. */
const HEADERS: Record<LeadField, string> = {
  name: "Name",
  category: "Category",
  categories: "Categories",
  rating: "Rating",
  reviews: "Reviews",
  priceLevel: "Price",
  businessStatus: "Status",
  claimed: "Claimed",
  openNow: "Open Now",
  address: "Address",
  phone: "Phone",
  website: "Website",
  email: "Email",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  youtube: "YouTube",
  tiktok: "TikTok",
  telegram: "Telegram",
  emailStatus: "Email Status",
  plusCode: "Plus Code",
  latitude: "Latitude",
  longitude: "Longitude",
  distanceKm: "Distance (km)",
  hours: "Hours",
  mapsUrl: "Maps URL",
};

/** Project leads onto exactly the requested fields, in order, as header-keyed rows. */
export function toRows(
  leads: Lead[],
  fields: LeadField[] = ALL_FIELDS,
): Record<string, string | number>[] {
  return leads.map((lead) => {
    const row: Record<string, string | number> = {};
    for (const f of fields) {
      row[HEADERS[f]] = cellValue(lead[f]);
    }
    return row;
  });
}

/** Flatten a Lead value into a spreadsheet-safe cell (arrays joined, booleans yes/no). */
function cellValue(v: unknown): string | number {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join("; ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  return v as string | number;
}

/** Serialize leads to a UTF-8 string or bytes in the chosen format. */
export function serialize(
  leads: Lead[],
  format: OutputFormat,
  fields: LeadField[] = ALL_FIELDS,
  opts: { sheetName?: string } = {},
): { data: string | Uint8Array; binary: boolean } {
  if (format === "json" || format === "ndjson") {
    const picked = leads.map((lead) => {
      const o: Record<string, unknown> = {};
      for (const f of fields) if (lead[f] !== undefined) o[f] = lead[f];
      return o;
    });
    const data =
      format === "ndjson"
        ? picked.map((o) => JSON.stringify(o)).join("\n") + (picked.length ? "\n" : "")
        : JSON.stringify(picked, null, 2);
    return { data, binary: false };
  }

  const rows = toRows(leads, fields);

  if (format === "csv") {
    // escapeFormulas neutralises =,+,-,@ injection in spreadsheet apps.
    // csv's Row type wants string values; it String()s numbers internally.
    const csvRows = rows as unknown as Record<string, string>[];
    return { data: csvStringify(csvRows, { escapeFormulas: true }), binary: false };
  }
  // xlsx — size each column to its widest cell (clamped), bold header row.
  const columns = fields.map((f) => {
    const header = HEADERS[f];
    const widest = rows.reduce((m, r) => Math.max(m, String(r[header] ?? "").length), header.length);
    return { header, width: Math.min(60, Math.max(8, widest + 2)) };
  });
  return {
    data: jsonToXlsx(rows, { sheetName: opts.sheetName ?? "Leads", columns }),
    binary: true,
  };
}

/** Aggregate counts over a lead list — for summaries and reports. Pure. */
export function computeStats(leads: Lead[]): LeadStats {
  const socialKeys: LeadField[] = ["facebook", "instagram", "whatsapp", "linkedin", "twitter", "youtube", "tiktok", "telegram"];
  const ratings = leads.map((l) => l.rating).filter((r): r is number => typeof r === "number");
  const stats: LeadStats = {
    total: leads.length,
    withPhone: leads.filter((l) => l.phone).length,
    withWebsite: leads.filter((l) => l.website).length,
    withEmail: leads.filter((l) => l.email).length,
    withValidEmail: leads.filter((l) => l.emailStatus === "valid").length,
    withSocial: leads.filter((l) => socialKeys.some((k) => l[k])).length,
  };
  if (ratings.length) stats.avgRating = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  return stats;
}

/** Reverse lookup: header label OR field name (any case) → canonical LeadField. */
const FIELD_BY_KEY: Map<string, LeadField> = (() => {
  const m = new Map<string, LeadField>();
  for (const f of ALL_FIELDS) {
    m.set(f.toLowerCase(), f);
    m.set(HEADERS[f].toLowerCase(), f);
  }
  return m;
})();

const NUMERIC_FIELDS = new Set<LeadField>(["rating", "reviews", "latitude", "longitude", "distanceKm"]);
const BOOLEAN_FIELDS = new Set<LeadField>(["claimed", "openNow"]);
const ARRAY_FIELDS = new Set<LeadField>(["categories"]);

/** Parse a stored boolean cell (true/false, yes/no, 1/0). Undefined if unclear. */
function coerceBool(raw: unknown): boolean | undefined {
  if (typeof raw === "boolean") return raw;
  const s = String(raw).trim().toLowerCase();
  if (/^(yes|true|1|y|open)$/.test(s)) return true;
  if (/^(no|false|0|n|closed)$/.test(s)) return false;
  return undefined;
}

/**
 * Map arbitrary rows (as read back from a JSON/CSV/Excel export, keyed by field
 * name or header label) into {@link Lead}s. Unknown columns are ignored, blanks
 * dropped, and numeric fields coerced. Powers `--append` / resume. Pure.
 */
export function rowsToLeads(rows: Record<string, unknown>[]): Lead[] {
  return rows.map((row) => {
    const lead: Lead = {};
    for (const [key, raw] of Object.entries(row)) {
      const field = FIELD_BY_KEY.get(key.trim().toLowerCase());
      if (!field || raw === null || raw === undefined || raw === "") continue;
      if (NUMERIC_FIELDS.has(field)) {
        const n = typeof raw === "number" ? raw : parseFloat(String(raw));
        if (Number.isFinite(n)) (lead as Record<string, unknown>)[field] = n;
      } else if (BOOLEAN_FIELDS.has(field)) {
        const b = coerceBool(raw);
        if (b !== undefined) (lead as Record<string, unknown>)[field] = b;
      } else if (ARRAY_FIELDS.has(field)) {
        const arr = Array.isArray(raw)
          ? raw.map((x) => String(x).trim()).filter(Boolean)
          : String(raw).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
        if (arr.length) (lead as Record<string, unknown>)[field] = arr;
      } else {
        (lead as Record<string, unknown>)[field] = String(raw);
      }
    }
    return lead;
  });
}
