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
  searchLeadsDetailed,
  LeadsError,
  parseRating,
  parseReviewCount,
  parseLatLng,
  type DetailedResult,
} from "./scrape.js";
export { searchLeadsBatch, searchLeadsMulti, type BatchQuery, type BatchResumeHooks } from "./batch.js";
export { runConfig, assertConfig, type LeadsConfig } from "./config.js";
export { serialize, toRows, computeStats, rowsToLeads } from "./export.js";
export {
  parsePriceLevel,
  priceLevelValue,
  parseBusinessStatus,
  parseClaimed,
  parseOpenNow,
  parseCategoryTags,
} from "./parse.js";
export {
  queryKey,
  isDone,
  pendingQueries,
  recordQuery,
  emptyCheckpoint,
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  checkpointPath,
  type Checkpoint,
} from "./checkpoint.js";
export {
  summarize,
  formatSummary,
  type LeadSummary,
  type RatingBand,
  type CategoryCount,
} from "./summary.js";
export {
  pipeToEnrich,
  leadToEnrichInput,
  leadsToEnrichInput,
  leadDomains,
  leadDomain,
  type EnrichInput,
} from "./pipe.js";
export {
  verifyEmails,
  verifyEmail,
  emailFormatValid,
  emailDomain,
} from "./verify.js";
export {
  composeQuery,
  mapsSearchUrl,
  normalizeFields,
  defaultFilename,
  expandQueries,
  resolvePreset,
} from "./query.js";
export { filterLeads, dedupeLeads, subtractLeads } from "./filter.js";
export {
  cleanWebsite,
  normalizePhone,
  callingCode,
  sortLeads,
  CALLING_CODES,
} from "./normalize.js";
export { enrichContacts, extractEmails, extractSocials, type Contacts } from "./enrich.js";
export {
  haversineMeters,
  parseLatLngPair,
  parseDistance,
  zoomForRadius,
  type LatLng,
} from "./geo.js";
export {
  convertFile,
  readRows,
  serializeRows,
  detectFormat,
  columnsOf,
  type DataRow,
} from "./convert.js";
export { ALL_FIELDS, ENRICHED_FIELDS, DEFAULT_FIELDS, FIELD_PRESETS } from "./types.js";
export type {
  Lead,
  LeadField,
  LeadFilters,
  LeadStats,
  EmailStatus,
  BusinessStatus,
  OutputFormat,
  SortKey,
  SearchOptions,
} from "./types.js";
