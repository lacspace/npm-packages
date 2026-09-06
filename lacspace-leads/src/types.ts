/** The fields a {@link Lead} can carry — request any subset via `fields`. */
export type LeadField =
  | "name"
  | "category"
  | "rating"
  | "reviews"
  | "priceLevel"
  | "address"
  | "phone"
  | "website"
  | "email"
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "linkedin"
  | "twitter"
  | "youtube"
  | "tiktok"
  | "telegram"
  | "plusCode"
  | "latitude"
  | "longitude"
  | "hours"
  | "mapsUrl";

/** Every field, in a sensible column order for exports. */
export const ALL_FIELDS: LeadField[] = [
  "name",
  "category",
  "rating",
  "reviews",
  "priceLevel",
  "address",
  "phone",
  "website",
  "email",
  "facebook",
  "instagram",
  "whatsapp",
  "linkedin",
  "twitter",
  "youtube",
  "tiktok",
  "telegram",
  "plusCode",
  "latitude",
  "longitude",
  "hours",
  "mapsUrl",
];

/** Fields that require visiting the business website (via `enrich`). */
export const ENRICHED_FIELDS: LeadField[] = [
  "email",
  "facebook",
  "instagram",
  "whatsapp",
  "linkedin",
  "twitter",
  "youtube",
  "tiktok",
  "telegram",
];

/** Named field bundles for common jobs — pass via `preset` / `--preset`. */
export const FIELD_PRESETS: Record<string, LeadField[]> = {
  /** Just enough to place a business: name, phone, website. */
  minimal: ["name", "phone", "website"],
  /** Cold-outreach columns: who, how to reach them, where. */
  outreach: ["name", "phone", "email", "website", "address"],
  /** Contact-book columns incl. socials (implies enrichment). */
  contact: ["name", "phone", "email", "website", "facebook", "instagram", "whatsapp"],
  /** Map/geo columns for plotting. */
  geo: ["name", "address", "latitude", "longitude", "plusCode", "mapsUrl"],
  /** Everything Maps shows, no website enrichment. */
  full: ALL_FIELDS.filter((f) => !ENRICHED_FIELDS.includes(f)),
  /** Every field, including enriched ones. */
  everything: [...ALL_FIELDS],
};

/**
 * Fields collected by default — everything Google Maps shows directly, i.e.
 * {@link ALL_FIELDS} minus the {@link ENRICHED_FIELDS} that need a website visit.
 * Ask for the enriched ones explicitly (or via `enrich`) to opt into that work.
 */
export const DEFAULT_FIELDS: LeadField[] = ALL_FIELDS.filter((f) => !ENRICHED_FIELDS.includes(f));

/** A single collected business lead. Every field is optional — Maps listings vary. */
export interface Lead {
  name?: string;
  category?: string;
  /** Star rating, 0–5. */
  rating?: number;
  /** Number of reviews. */
  reviews?: number;
  /** Price level as shown on Maps, e.g. "$$" or "₹₹". */
  priceLevel?: string;
  address?: string;
  phone?: string;
  website?: string;
  /** Email, discovered from the business website (needs enrichment). */
  email?: string;
  /** Facebook page URL, from the website (needs enrichment). */
  facebook?: string;
  /** Instagram URL, from the website (needs enrichment). */
  instagram?: string;
  /** WhatsApp number/link, from the website (needs enrichment). */
  whatsapp?: string;
  /** LinkedIn company/profile URL, from the website (needs enrichment). */
  linkedin?: string;
  /** Twitter / X URL, from the website (needs enrichment). */
  twitter?: string;
  /** YouTube channel URL, from the website (needs enrichment). */
  youtube?: string;
  /** TikTok URL, from the website (needs enrichment). */
  tiktok?: string;
  /** Telegram link, from the website (needs enrichment). */
  telegram?: string;
  /** Google Plus Code, when shown. */
  plusCode?: string;
  /** Latitude, parsed from the listing's Maps URL. */
  latitude?: number;
  /** Longitude, parsed from the listing's Maps URL. */
  longitude?: number;
  /** Opening-hours summary, when shown. */
  hours?: string;
  /** Canonical Google Maps URL for the listing. */
  mapsUrl?: string;
}

/** Post-collection filters — a lead must satisfy every set filter to be kept. */
export interface LeadFilters {
  /** Keep only leads with a rating ≥ this. */
  minRating?: number;
  /** Keep only leads with at least this many reviews. */
  minReviews?: number;
  /** Keep only leads that have a phone. */
  hasPhone?: boolean;
  /** Keep only leads that have a website. */
  hasWebsite?: boolean;
  /** Keep only leads that have an email (implies enrichment). */
  hasEmail?: boolean;
}

/** Output formats the tool can write. */
export type OutputFormat = "json" | "ndjson" | "csv" | "xlsx";

/** How to sort collected leads before export. */
export type SortKey = "rating" | "reviews" | "name" | "priceLevel";

/** Options for a lead search. */
export interface SearchOptions {
  /** City, e.g. "Kathmandu". */
  city?: string;
  /** Area / neighbourhood, e.g. "Baneshwor". */
  area?: string;
  /** Business type / keyword, e.g. "restaurants", "dental clinic". */
  type: string;
  /** A ready-made query, used verbatim instead of composing city/area/type. */
  query?: string;
  /** Max number of leads to collect. Default 60. */
  limit?: number;
  /** Fields to collect. Default: all of {@link ALL_FIELDS}. */
  fields?: LeadField[];
  /** Run the browser without a visible window. Default false (visible). */
  headless?: boolean;
  /**
   * Open each listing to pull phone/website/plus-code/hours (slower but far
   * richer). When false, only what the results list shows is captured.
   * Default true.
   */
  details?: boolean;
  /** Milliseconds to pause between listing opens (politeness). Default 700. */
  delayMs?: number;
  /**
   * Visit each lead's website to discover email + social links. Slower and hits
   * external sites. Implied when any enriched field or `hasEmail` is requested.
   * Default false.
   */
  enrich?: boolean;
  /** Drop leads that don't pass these filters. */
  filters?: LeadFilters;
  /** Drop duplicate leads by this key. Default "website" when present else "name". */
  dedupe?: "website" | "phone" | "name" | "none";
  /** Sort the results by this key before returning. */
  sort?: SortKey;
  /** Sort direction. Defaults to "desc" for numbers, "asc" for name. */
  sortDir?: "asc" | "desc";
  /**
   * Normalise phone numbers to E.164 using this default country — an ISO-2 code
   * (`"NP"`, `"US"`) or a raw calling code (`"977"`). Best-effort; numbers that
   * can't be parsed are left as-is.
   */
  country?: string;
  /**
   * Tidy website URLs — unwrap Google redirects and strip tracking params.
   * Default true.
   */
  cleanUrls?: boolean;
  /** How many websites to enrich in parallel. Default 3. */
  concurrency?: number;
  /** Browser/UI locale, e.g. "en-US", "ne-NP". Default "en-US". */
  locale?: string;
  /** Google region bias (ccTLD-style), e.g. "np", "us". Sets Maps `gl`. */
  region?: string;
  /** Stop collecting after this many milliseconds (best-effort). */
  maxMs?: number;
  /** Called with a short progress message as the search runs. */
  onProgress?: (message: string) => void;
  /** An AbortSignal to cancel a running search. */
  signal?: AbortSignal;
}
