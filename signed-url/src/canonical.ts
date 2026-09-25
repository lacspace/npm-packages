/**
 * The string a signed URL's signature covers: origin + path + the query sorted
 * by key, with every key and value percent-encoded.
 *
 * Encoding is what makes it unambiguous. Before 1.2.0 the decoded values were
 * joined as-is, so `?name=x%26role%3Dadmin` (one parameter) and
 * `?name=x&role=admin` (two) produced the same string and shared a signature:
 * anyone who could get a value of their choosing signed could add parameters.
 */
export function canonicalize(u: URL, sigParam: string, legacy = false): string {
  const params = [...u.searchParams.entries()]
    .filter(([k]) => k !== sigParam)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const pair = legacy
    ? ([k, v]: [string, string]) => `${k}=${v}`
    : ([k, v]: [string, string]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
  return `${u.origin}${u.pathname}?${params.map(pair).join("&")}`;
}

/**
 * Accept signatures made with the pre-1.2.0 canonical form, so links issued
 * before the upgrade keep working during a migration. Those signatures remain
 * forgeable as described above; turn this off once old links have expired.
 */
export interface LegacySignatureOption {
  acceptLegacySignatures?: boolean;
}
