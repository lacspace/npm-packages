/**
 * @lacspace/unsubscribe — RFC 2369 List-* headers, RFC 2919 List-Id and
 * RFC 8058 one-click unsubscribe. Zero dependencies, isomorphic.
 */

import { parseListId, parseListUnsubscribe, parseListUrls } from "./parse";
import type { ListId, ListUrls, ParsedListUnsubscribe } from "./parse";
import { mailtoUnsubscribe } from "./oneclick";
import type { MailtoMessage } from "./oneclick";

export {
  parseListUnsubscribe,
  parseListUrls,
  parseListId,
  parseMailto,
  isOneClickPost,
  decodeEncodedWords,
} from "./parse";
export type { ListId, ListUrls, MailtoEntry, ParsedListUnsubscribe } from "./parse";
export { oneClickUnsubscribe, mailtoUnsubscribe, ONE_CLICK_BODY } from "./oneclick";
export type { MailtoMessage, OneClickError, OneClickOptions, OneClickResult } from "./oneclick";
export { isPrivateHost, isPrivateIp, isPrivateIPv4, isPrivateIPv6 } from "./guard";

/** Anything with `get(name)` (Fetch `Headers`, `@lacspace/mime` MailHeaders, a Map) or a plain object. */
export type HeaderSource =
  | { get(name: string): string | undefined | null }
  | Record<string, string | string[] | undefined | null>;

/** Read a header case-insensitively; repeated headers are joined with ", ". */
export function getHeader(headers: HeaderSource | null | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  if (typeof (headers as { get?: unknown }).get === "function") {
    const g = headers as { get(name: string): string | undefined | null };
    const v = g.get(lower) ?? g.get(name);
    return v ?? undefined;
  }
  const rec = headers as Record<string, string | string[] | undefined | null>;
  const vals: string[] = [];
  for (const k of Object.keys(rec)) {
    if (k.toLowerCase() !== lower) continue;
    const v = rec[k];
    if (Array.isArray(v)) vals.push(...v);
    else if (typeof v === "string") vals.push(v);
  }
  return vals.length ? vals.join(", ") : undefined;
}

export interface ListHeaders {
  listId: ListId | null;
  /** List-Unsubscribe + List-Unsubscribe-Post, or null when absent. */
  unsubscribe: ParsedListUnsubscribe | null;
  /** List-Post (RFC 2369 §3.4); `no: true` for `List-Post: NO`. */
  post: ListUrls | null;
  help: ListUrls | null;
  subscribe: ListUrls | null;
  owner: ListUrls | null;
  archive: ListUrls | null;
}

/** Parse every RFC 2369 / RFC 2919 list header of a message. Absent headers are null. */
export function parseListHeaders(headers: HeaderSource): ListHeaders {
  const urls = (n: string) => {
    const v = getHeader(headers, n);
    return v && v.trim() ? parseListUrls(v) : null;
  };
  const lu = getHeader(headers, "List-Unsubscribe");
  return {
    listId: parseListId(getHeader(headers, "List-Id")),
    unsubscribe: lu && lu.trim() ? parseListUnsubscribe(lu, getHeader(headers, "List-Unsubscribe-Post")) : null,
    post: urls("List-Post"),
    help: urls("List-Help"),
    subscribe: urls("List-Subscribe"),
    owner: urls("List-Owner"),
    archive: urls("List-Archive"),
  };
}

export type UnsubscribeMethod = "one-click" | "https" | "mailto" | "none";

export interface UnsubscribeOptions {
  /**
   * - `one-click`: POST `url` from your server with `oneClickUnsubscribe()`.
   * - `mailto`: send `mailto` from the user's account.
   * - `https`: open `url` in a new tab after the user confirms.
   * - `none`: no usable method (an insecure http link may still be in `listUnsubscribe.http`).
   */
  method: UnsubscribeMethod;
  url?: string;
  mailto?: MailtoMessage;
  listId?: ListId;
  listUnsubscribe: ParsedListUnsubscribe;
}

/**
 * Pick the best way to unsubscribe: one-click > mailto > https > none.
 *
 * mailto ranks above a plain https link because the mail can be sent without
 * the user visiting anything: a non-one-click link opens a web page that may
 * run trackers, ask the user to log in or "confirm" through dark patterns, or
 * be a phishing page on a look-alike domain. A one-click URL is safe because
 * it is a fixed, cookie-less POST with no page to render.
 */
export function unsubscribeOptions(headers: HeaderSource): UnsubscribeOptions {
  const lu = parseListUnsubscribe(getHeader(headers, "List-Unsubscribe"), getHeader(headers, "List-Unsubscribe-Post"));
  const listId = parseListId(getHeader(headers, "List-Id"));
  const base = listId ? { listId, listUnsubscribe: lu } : { listUnsubscribe: lu };
  if (lu.oneClick) return { method: "one-click", url: lu.https[0]!, ...base };
  if (lu.mailto[0]) return { method: "mailto", mailto: mailtoUnsubscribe(lu.mailto[0]), ...base };
  if (lu.https[0]) return { method: "https", url: lu.https[0], ...base };
  return { method: "none", ...base };
}
