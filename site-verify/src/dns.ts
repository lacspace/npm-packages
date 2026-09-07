/**
 * DNS TXT verification — the record most providers accept as an alternative to
 * a `<meta>` tag or an uploaded file (e.g. `google-site-verification=…`).
 *
 * Zero dependencies · isomorphic · fully typed.
 */
import { VERIFICATION_PROVIDERS, type VerificationRecord } from "./index";

/** A DNS TXT record to add at the domain's DNS host. */
export interface DnsTxtRecord {
  /** The DNS host/name to create the record on. `@` = the zone apex (root domain). */
  host: string;
  /** Always `TXT` — kept explicit so the shape can be dropped into DNS tooling. */
  type: "TXT";
  /** The provider's resolved meta `name` (the record's prefix), e.g. `google-site-verification`. */
  name: string;
  /** The full TXT value to publish, e.g. `google-site-verification=abc123`. */
  value: string;
}

export interface DnsTxtOptions {
  /** DNS host/name for the record. Defaults to `@` (the zone apex). */
  host?: string;
}

function resolveName(providerOrName: string): string {
  return (VERIFICATION_PROVIDERS as Record<string, string>)[providerOrName] ?? providerOrName;
}

/**
 * Build the DNS TXT record a provider expects for domain-level verification.
 * Known provider ids resolve through {@link VERIFICATION_PROVIDERS}; any other
 * string is used verbatim as the record prefix. The value follows the widely
 * used `name=token` convention (Google Search Console, Facebook domain
 * verification, …).
 *
 * @example verificationTxt("google", "abc123")
 * // { host: "@", type: "TXT", name: "google-site-verification", value: "google-site-verification=abc123" }
 */
export function verificationTxt(
  providerOrName: string,
  token: string,
  opts: DnsTxtOptions = {},
): DnsTxtRecord {
  const name = resolveName(providerOrName);
  return { host: opts.host ?? "@", type: "TXT", name, value: `${name}=${token}` };
}

/**
 * Build DNS TXT records for every entry of a loose record. Empty/undefined
 * tokens are skipped.
 *
 * @example verificationTxtAll({ google: "abc", facebook: "fb1" })
 * // [{ host: "@", type: "TXT", name: "google-site-verification", value: "google-site-verification=abc" },
 * //  { host: "@", type: "TXT", name: "facebook-domain-verification", value: "facebook-domain-verification=fb1" }]
 */
export function verificationTxtAll(
  record: VerificationRecord,
  opts: DnsTxtOptions = {},
): DnsTxtRecord[] {
  const out: DnsTxtRecord[] = [];
  for (const [key, token] of Object.entries(record)) {
    if (!token) continue;
    out.push(verificationTxt(key, token, opts));
  }
  return out;
}
