/**
 * lacspace-leads — a free, open-source local-business lead finder.
 *
 * Name a city, area and business type; it drives a real browser over Google
 * Maps and collects each listing's name, category, rating, reviews, address,
 * phone, website and more — then hands them back as structured {@link Lead}s
 * you can export to JSON, CSV or Excel. No API keys, no paid services.
 *
 * ```ts
 * import { searchLeads, serialize } from "lacspace-leads";
 *
 * const leads = await searchLeads({ city: "Kathmandu", area: "Baneshwor", type: "restaurants", limit: 40 });
 * const { data } = serialize(leads, "csv");
 * ```
 *
 * Please use it responsibly: scraping Google Maps is against Google's Terms of
 * Service, so keep volumes small and human, respect local data-protection law,
 * and only collect public business information you have a lawful basis to use.
 */
export {
  scrapeLeads as searchLeads,
  scrapeLeads,
  LeadsError,
  parseRating,
  parseReviewCount,
  parseLatLng,
} from "./scrape.js";
export { serialize, toRows } from "./export.js";
export { composeQuery, mapsSearchUrl, normalizeFields, defaultFilename } from "./query.js";
export { filterLeads, dedupeLeads } from "./filter.js";
export { enrichContacts, extractEmails, extractSocials, type Contacts } from "./enrich.js";
export {
  convertFile,
  readRows,
  serializeRows,
  detectFormat,
  columnsOf,
  type DataRow,
} from "./convert.js";
export { ALL_FIELDS, ENRICHED_FIELDS } from "./types.js";
export type { Lead, LeadField, LeadFilters, OutputFormat, SearchOptions } from "./types.js";
