/**
 * URL & path joining — dependency-free helpers for composing request URLs
 * without doubling or dropping slashes, and for appending query params to a URL
 * that may already carry a query string. Pure functions.
 */
import type { QueryParams } from "./index";
import { buildQuery, type BuildQueryOptions } from "./query";

/**
 * Join a base URL with any number of path segments, collapsing duplicate
 * slashes without mangling the `://` after the protocol. A trailing query string
 * or hash on the final segment is preserved.
 *
 * @example joinUrl("https://api.x.com/", "/v2/", "users") // "https://api.x.com/v2/users"
 */
export function joinUrl(base: string, ...parts: Array<string | number>): string {
  const segments = [base, ...parts].map((p) => String(p)).filter((p) => p.length > 0);
  if (segments.length === 0) return "";
  let out = segments[0] as string;
  for (let i = 1; i < segments.length; i++) {
    const next = (segments[i] as string).replace(/^\/+/, "");
    out = `${out.replace(/\/+$/, "")}/${next}`;
  }
  // Collapse accidental double slashes in the path, but never in the protocol.
  return out.replace(/([^:])\/{2,}/g, "$1/");
}

/** Join path segments into a single `/`-separated path (no host). */
export function joinPath(...parts: Array<string | number>): string {
  const joined = parts
    .map((p) => String(p).replace(/^\/+|\/+$/g, ""))
    .filter((p) => p.length > 0)
    .join("/");
  return joined.replace(/\/{2,}/g, "/");
}

/**
 * Append query params to a URL, merging with any query string already present.
 * A hash fragment on the URL is preserved and kept at the end.
 */
export function withQuery(url: string, params?: QueryParams, opts?: BuildQueryOptions): string {
  const added = buildQuery(params, { ...opts, leadingQuestionMark: false });
  if (!added) return url;
  const hashAt = url.indexOf("#");
  const hash = hashAt >= 0 ? url.slice(hashAt) : "";
  const withoutHash = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const sep = withoutHash.includes("?") ? "&" : "?";
  return `${withoutHash}${sep}${added}${hash}`;
}
