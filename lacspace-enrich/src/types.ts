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
}
