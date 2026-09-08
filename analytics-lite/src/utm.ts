/**
 * @lacspace/analytics-lite — UTM / campaign parsing.
 *
 * Pure, zero-dependency parsing of `utm_*` query parameters from a URL (or a
 * bare query string) into a small campaign object you can attach to events.
 */

/** Marketing campaign attribution parsed from `utm_*` query parameters. */
export interface Campaign {
  source?: string;
  medium?: string;
  name?: string;
  term?: string;
  content?: string;
  /** Non-standard `utm_*` params kept verbatim (without the `utm_` prefix). */
  [key: string]: string | undefined;
}

const UTM_MAP: Record<string, keyof Campaign> = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "name",
  utm_term: "term",
  utm_content: "content",
};

/**
 * Parse UTM / campaign parameters from a URL (or a bare query string).
 * Returns `undefined` when no `utm_*` parameters are present.
 */
export function parseUtm(url: string): Campaign | undefined {
  if (!url) return undefined;
  const q = url.indexOf("?");
  const query = q === -1 ? url : url.slice(q + 1);
  const search = query.split("#")[0] ?? "";
  if (!search) return undefined;

  const campaign: Campaign = {};
  let found = false;
  for (const pair of search.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawVal = eq === -1 ? "" : pair.slice(eq + 1);
    let key: string;
    let val: string;
    try {
      key = decodeURIComponent(rawKey.replace(/\+/g, " ")).toLowerCase();
      val = decodeURIComponent(rawVal.replace(/\+/g, " "));
    } catch {
      continue;
    }
    if (!key.startsWith("utm_")) continue;
    found = true;
    const mapped = UTM_MAP[key];
    if (mapped) campaign[mapped] = val;
    else campaign[key.slice(4)] = val;
  }
  return found ? campaign : undefined;
}
