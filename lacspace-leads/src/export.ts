import { stringify as csvStringify } from "@lacspace/csv";
import { jsonToXlsx } from "@lacspace/xlsx";
import { ALL_FIELDS, type Lead, type LeadField, type OutputFormat } from "./types.js";

/** A column header for each field, for CSV/Excel exports. */
const HEADERS: Record<LeadField, string> = {
  name: "Name",
  category: "Category",
  rating: "Rating",
  reviews: "Reviews",
  priceLevel: "Price",
  address: "Address",
  phone: "Phone",
  website: "Website",
  email: "Email",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  plusCode: "Plus Code",
  latitude: "Latitude",
  longitude: "Longitude",
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
      const v = lead[f];
      row[HEADERS[f]] = v === undefined || v === null ? "" : (v as string | number);
    }
    return row;
  });
}

/** Serialize leads to a UTF-8 string or bytes in the chosen format. */
export function serialize(
  leads: Lead[],
  format: OutputFormat,
  fields: LeadField[] = ALL_FIELDS,
  opts: { sheetName?: string } = {},
): { data: string | Uint8Array; binary: boolean } {
  if (format === "json") {
    const picked = leads.map((lead) => {
      const o: Record<string, unknown> = {};
      for (const f of fields) if (lead[f] !== undefined) o[f] = lead[f];
      return o;
    });
    return { data: JSON.stringify(picked, null, 2), binary: false };
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
