/** Social profile URLs discovered for a company. */
export interface Socials {
  facebook?: string;
  instagram?: string;
  whatsapp?: string;
  linkedin?: string;
  twitter?: string;
  youtube?: string;
  tiktok?: string;
  telegram?: string;
}

/** One MX record (mail exchanger + priority). */
export interface MxRecord {
  exchange: string;
  priority: number;
}

/** DNS + email-deliverability signals for a domain (from `node:dns`). */
export interface DnsSignals {
  /** MX records, sorted by priority (lowest first). */
  mx?: MxRecord[];
  /** True when the domain has at least one MX record. */
  hasMx?: boolean;
  /** Inferred mail provider from the MX hosts (Google Workspace, Microsoft 365…). */
  mailProvider?: string;
  /** Raw SPF record (a TXT beginning `v=spf1`), if present. */
  spf?: string;
  /** SPF "all" qualifier policy: `pass` (+all), `neutral` (?all), `softfail` (~all), `fail` (-all). */
  spfPolicy?: "pass" | "neutral" | "softfail" | "fail";
  /** Raw DMARC record from `_dmarc.<domain>`, if present. */
  dmarc?: string;
  /** DMARC enforcement policy (`p=`): none, quarantine or reject. */
  dmarcPolicy?: "none" | "quarantine" | "reject";
  /** True when a DKIM key was found at any probed selector. */
  dkim?: boolean;
  /** DKIM selectors that resolved (from a common-selector probe). */
  dkimSelectors?: string[];
  /**
   * Best-effort guess that the mail host accepts any local-part (catch-all).
   * Inferred from provider + a permissive SPF `all` — a hint, never a guarantee.
   */
  catchAllLikely?: boolean;
  /** Other notable root TXT records (verification tokens etc.). */
  txt?: string[];
}

/** Domain registration facts from RDAP (open, keyless WHOIS successor). */
export interface DomainRegistration {
  registrar?: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  nameServers?: string[];
  status?: string[];
  /** Where the data came from, or why it's missing. */
  source: "rdap" | "unavailable";
  note?: string;
}

/** A detected technology with a category, confidence and the signal that matched it. */
export interface TechItem {
  name: string;
  /** cms · framework · javascript · css · analytics · ads · tag-manager · cdn · ecommerce · payment · hosting · fonts · marketing · widget · security. */
  category: string;
  /** 0–1 rough confidence based on how specific the matching signal is. */
  confidence: number;
  /** Version, when a signal exposes one (e.g. a `generator` meta). */
  version?: string;
  /** A short note on which signal matched (e.g. `meta[generator]`, `script src`). */
  source: string;
}

/** Key pages discovered from a site's own navigation/links. */
export interface DiscoveredPages {
  contact?: string;
  about?: string;
  careers?: string;
  pricing?: string;
  blog?: string;
  rss?: string;
  status?: string;
}

/** One guessed email address for a person at a domain, ranked by likelihood. */
export interface EmailGuess {
  email: string;
  /** The pattern used, e.g. `first.last`, `flast`, `first`. */
  pattern: string;
  /** 0–1 likelihood (a known-pattern match ranks 1). */
  confidence: number;
}

/** Local file paths of assets saved with `--assets`. */
export interface SavedAssets {
  logo?: string;
  favicon?: string;
}

/** A per-field provenance note: how confident we are and where the value came from. */
export interface FieldSource {
  confidence?: number;
  source?: string;
}

/** A company/contact profile assembled from a domain's public pages. */
export interface EnrichedProfile {
  domain: string;
  url?: string;
  status?: number;
  name?: string;
  description?: string;
  logo?: string;
  emails?: string[];
  phones?: string[];
  address?: string;
  socials?: Socials;
  /** Detected platforms / libraries (WordPress, Shopify, Next.js…). */
  tech?: string[];
  contactPage?: string;
  error?: string;

  // ── v0.2.0 additive fields (all optional, never break older consumers) ──
  /** DNS + deliverability signals (populated when `dns` is enabled). */
  dns?: DnsSignals;
  /** Per-email deliverability status when MX-verification runs (`dns`). */
  emailStatus?: Record<string, "valid" | "no-mx" | "invalid-format">;
  /** Domain registration (populated when `rdap` is enabled). */
  registration?: DomainRegistration;
  /** Categorized tech detection with confidence + source. */
  techDetailed?: TechItem[];
  /** Key pages discovered from the home page (contact/about/careers/pricing/blog/rss/status). */
  pages?: DiscoveredPages;
  /** Local paths of downloaded logo/favicon (when `assetsDir` is set). */
  savedAssets?: SavedAssets;
  /** Optional per-field provenance (confidence + source), shown by `--verbose`. */
  sources?: Record<string, FieldSource>;
}

/** Options for enrichment. */
export interface EnrichOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Also fetch common /contact and /about pages to find more. Default true. */
  contactPages?: boolean;
  /** How many domains to enrich in parallel (batch). Default 4. */
  concurrency?: number;
  onProgress?: (message: string) => void;

  // ── v0.2.0 options (all optional, default off unless noted) ──
  /**
   * Collect DNS + deliverability signals (MX/SPF/DMARC/DKIM) and MX-verify the
   * emails we find. Off by default (adds DNS lookups). Node-only.
   */
  dns?: boolean;
  /** Fetch open, keyless domain registration via RDAP. Off by default. */
  rdap?: boolean;
  /** Discover key site pages (contact/about/careers/pricing/blog/rss/status). Default true. */
  discoverPages?: boolean;
  /** Download the logo + favicon into this directory. Off unless set. */
  assetsDir?: string;
  /** Minimum gap between requests to the SAME host, in ms (per-host rate limit). */
  perHostRateMs?: number;
  /** Timeout for DNS lookups, in ms. Default 5000. */
  dnsTimeoutMs?: number;
}
