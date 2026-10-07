/**
 * RFC 2369 List-* header parsing, RFC 2919 List-Id, RFC 2047 encoded words.
 */

export interface MailtoEntry {
  /** Recipient(s), comma-separated when the URI lists several. */
  to: string;
  subject?: string;
  body?: string;
  cc?: string;
}

/** A parsed RFC 2369 URL list (List-Help, List-Subscribe, List-Post, …). */
export interface ListUrls {
  /** Absolute https URLs, deduped, in header order. */
  https: string[];
  /** Plain http URLs. Insecure: shown to the user at most, never auto-POSTed. */
  http: string[];
  mailto: MailtoEntry[];
  /** The header value as given ("" when absent). */
  raw: string;
  /** List-Post: NO (RFC 2369 §3.4) — posting is not allowed. */
  no?: boolean;
}

export interface ParsedListUnsubscribe extends ListUrls {
  /**
   * RFC 8058 one-click: true only when List-Unsubscribe-Post is exactly
   * `List-Unsubscribe=One-Click` (case and whitespace tolerant) AND there is at
   * least one https URL.
   */
  oneClick: boolean;
}

export interface ListId {
  /** Human-readable description (RFC 2047 encoded words decoded). */
  name?: string;
  /** The list identifier, e.g. `digest.example.com`. */
  id: string;
}

/** Undo header folding (CRLF + WSP → single space). */
function unfold(v: string): string {
  return v.replace(/\r?\n[ \t]+/g, " ").replace(/[\r\n]/g, " ");
}

/**
 * Remove RFC 5322 comments `( … )` that sit outside `<…>` and quoted strings.
 * Nested comments and backslash escapes are honoured.
 */
function stripComments(v: string): string {
  let out = "";
  let depth = 0;
  let inAngle = false;
  let inQuote = false;
  for (let i = 0; i < v.length; i++) {
    const c = v[i]!;
    if (depth > 0) {
      if (c === "\\") i++;
      else if (c === "(") depth++;
      else if (c === ")") depth--;
      continue;
    }
    if (inQuote) {
      out += c;
      if (c === "\\" && i + 1 < v.length) out += v[++i];
      else if (c === '"') inQuote = false;
      continue;
    }
    if (inAngle) {
      out += c;
      if (c === ">") inAngle = false;
      continue;
    }
    if (c === "(") depth = 1;
    else {
      if (c === "<") inAngle = true;
      else if (c === '"') inQuote = true;
      out += c;
    }
  }
  return out;
}

function pctDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    // tolerate stray % signs: decode what we can
    return s.replace(/(%[0-9A-Fa-f]{2})+/g, (m) => {
      try {
        return decodeURIComponent(m);
      } catch {
        return m;
      }
    });
  }
}

const ADDR_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+$/;

/** Parse a `mailto:` URI (RFC 6068). Returns null when it has no valid recipient. */
export function parseMailto(uri: string): MailtoEntry | null {
  if (!/^mailto:/i.test(uri)) return null;
  const rest = uri.slice(7);
  const q = rest.indexOf("?");
  const path = q < 0 ? rest : rest.slice(0, q);
  const query = q < 0 ? "" : rest.slice(q + 1);
  const to: string[] = [];
  const cc: string[] = [];
  const addAddrs = (list: string[], raw: string) => {
    for (const a of pctDecode(raw).split(",")) {
      const t = a.trim();
      if (ADDR_RE.test(t) && !list.some((x) => x.toLowerCase() === t.toLowerCase())) list.push(t);
    }
  };
  addAddrs(to, path);
  let subject: string | undefined;
  let body: string | undefined;
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    const k = (eq < 0 ? pair : pair.slice(0, eq)).toLowerCase();
    const v = eq < 0 ? "" : pair.slice(eq + 1);
    if (k === "subject") subject = pctDecode(v);
    else if (k === "body") body = pctDecode(v);
    else if (k === "to") addAddrs(to, v);
    else if (k === "cc") addAddrs(cc, v);
  }
  if (!to.length) return null;
  const out: MailtoEntry = { to: to.join(", ") };
  if (subject !== undefined && subject !== "") out.subject = subject;
  if (body !== undefined && body !== "") out.body = body;
  if (cc.length) out.cc = cc.join(", ");
  return out;
}

function absoluteUrl(s: string, protocol: "https:" | "http:"): boolean {
  try {
    const u = new URL(s);
    return u.protocol === protocol && !!u.hostname;
  } catch {
    return false;
  }
}

/**
 * Parse any RFC 2369 URL-list header (List-Help, List-Subscribe, List-Owner,
 * List-Archive, List-Post, List-Unsubscribe). Junk entries are ignored.
 */
export function parseListUrls(value: string | null | undefined): ListUrls {
  const raw = value ?? "";
  const out: ListUrls = { https: [], http: [], mailto: [], raw };
  if (!raw.trim()) return out;
  const v = stripComments(unfold(raw));
  if (/^\s*no\s*$/i.test(v)) {
    out.no = true;
    return out;
  }
  const bracketed = v.match(/<[^>]*>/g);
  // Bracketless values are not RFC-compliant but common enough; fall back to commas
  // (same behaviour as @lacspace/mime).
  const items = (bracketed ?? v.split(",")).map((s) => s.replace(/^\s*<|>\s*$/g, "").replace(/\s+/g, "")).filter(Boolean);
  const seenMail = new Set<string>();
  for (const item of items) {
    if (/^https:\/\//i.test(item)) {
      if (absoluteUrl(item, "https:") && !out.https.includes(item)) out.https.push(item);
    } else if (/^http:\/\//i.test(item)) {
      if (absoluteUrl(item, "http:") && !out.http.includes(item)) out.http.push(item);
    } else if (/^mailto:/i.test(item)) {
      const m = parseMailto(item);
      if (!m) continue;
      const key = `${m.to.toLowerCase()}\n${m.subject ?? ""}\n${m.body ?? ""}\n${(m.cc ?? "").toLowerCase()}`;
      if (seenMail.has(key)) continue;
      seenMail.add(key);
      out.mailto.push(m);
    }
  }
  return out;
}

/** True when List-Unsubscribe-Post is exactly `List-Unsubscribe=One-Click` (case/space tolerant). */
export function isOneClickPost(post: string | null | undefined): boolean {
  if (!post) return false;
  return /^\s*list-unsubscribe\s*=\s*one-click\s*$/i.test(unfold(post));
}

/**
 * Parse List-Unsubscribe (RFC 2369) together with List-Unsubscribe-Post (RFC 8058).
 */
export function parseListUnsubscribe(
  listUnsubscribe: string | null | undefined,
  listUnsubscribePost?: string | null,
): ParsedListUnsubscribe {
  const urls = parseListUrls(listUnsubscribe);
  delete urls.no;
  return { ...urls, oneClick: urls.https.length > 0 && isOneClickPost(listUnsubscribePost) };
}

// ---------------------------------------------------------------- RFC 2047

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64Decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = (buf << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

function qDecode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "_") out.push(32);
    else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(s.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return String.fromCharCode(...bytes);
    }
  }
}

/** Minimal RFC 2047 decoder (B and Q). Whitespace between adjacent words is dropped. Never throws. */
export function decodeEncodedWords(input: string): string {
  if (!input || input.indexOf("=?") < 0) return input;
  return input
    .replace(/(=\?[^?\s]+\?[BbQq]\?[^?]*\?=)\s+(?==\?[^?\s]+\?[BbQq]\?[^?]*\?=)/g, "$1")
    .replace(/=\?([^?\s]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, text: string) => {
      const bytes = enc.toUpperCase() === "B" ? b64Decode(text) : qDecode(text);
      return decodeBytes(bytes, cs.replace(/\*.*$/, "").toLowerCase());
    });
}

// ---------------------------------------------------------------- RFC 2919

/**
 * Parse a List-Id header: `Weekly Digest <digest.example.com>` →
 * `{ name: "Weekly Digest", id: "digest.example.com" }`. Handles quoted names,
 * RFC 2047 encoded words, comments, a missing name and a bare id. Returns null
 * for an empty or unusable value.
 */
export function parseListId(value: string | null | undefined): ListId | null {
  if (!value || !value.trim()) return null;
  const v = stripComments(unfold(value)).trim();
  const m = /^(.*)<([^<>]*)>\s*$/s.exec(v);
  if (!m) {
    const id = v.replace(/\s+/g, "");
    return id ? { id } : null;
  }
  const id = m[2]!.replace(/\s+/g, "");
  if (!id) return null;
  let name = m[1]!.trim();
  const q = /^"((?:[^"\\]|\\.)*)"$/s.exec(name);
  if (q) name = q[1]!.replace(/\\(.)/g, "$1");
  name = decodeEncodedWords(name).replace(/\s+/g, " ").trim();
  return name ? { name, id } : { id };
}
