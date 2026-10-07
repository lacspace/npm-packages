/**
 * Small internal MIME splitter. Good enough for bounce reports: header
 * unfolding, multipart boundaries (nested), quoted-printable and base64
 * text, charset decoding via TextDecoder. Never throws.
 */

export type HeaderInput = string | Record<string, string | string[] | undefined | null>;

/** Parsed headers: lower-cased name → values in order. */
export type HeaderMap = Map<string, string[]>;

export interface MimePart {
  contentType: string;
  body: string;
}

export interface SplitMessage {
  headers: string;
  text: string;
  html: string;
  parts: MimePart[];
}

/** Normalise line endings to LF. */
export function lf(s: string): string {
  return s.replace(/\r\n?/g, "\n");
}

/** Split a raw block into its header part and body at the first blank line. */
export function splitHeadBody(raw: string): { head: string; body: string } {
  const s = lf(raw);
  if (s.startsWith("\n")) return { head: "", body: s.slice(1) };
  const i = s.indexOf("\n\n");
  if (i < 0) return { head: s, body: "" };
  return { head: s.slice(0, i), body: s.slice(i + 2) };
}

/** Parse a header block (unfolding continuation lines). Stops at the first blank line. */
export function parseHeaderBlock(block: string): HeaderMap {
  const map: HeaderMap = new Map();
  const lines = lf(block).split("\n");
  let cur: string | null = null;
  const flush = () => {
    if (cur === null) return;
    const idx = cur.indexOf(":");
    if (idx > 0) {
      const name = cur.slice(0, idx).trim().toLowerCase();
      const value = cur.slice(idx + 1).trim();
      if (name && !/\s/.test(name)) {
        const arr = map.get(name);
        if (arr) arr.push(value);
        else map.set(name, [value]);
      }
    }
    cur = null;
  };
  for (const line of lines) {
    if (line === "" || /^\s*$/.test(line)) {
      if (cur !== null) {
        flush();
        break;
      }
      if (map.size > 0) break;
      continue;
    }
    if (/^[ \t]/.test(line) && cur !== null) {
      cur += " " + line.trim();
    } else {
      flush();
      cur = line;
    }
  }
  flush();
  return map;
}

/** Turn any supported header input into a HeaderMap. */
export function toHeaderMap(headers: HeaderInput | null | undefined): HeaderMap {
  if (!headers) return new Map();
  if (typeof headers === "string") return parseHeaderBlock(headers);
  const map: HeaderMap = new Map();
  if (typeof headers !== "object") return map;
  for (const k of Object.keys(headers)) {
    const v = (headers as Record<string, unknown>)[k];
    const vals = Array.isArray(v) ? v : [v];
    for (const x of vals) {
      if (typeof x !== "string") continue;
      const key = k.toLowerCase();
      const arr = map.get(key);
      if (arr) arr.push(x);
      else map.set(key, [x]);
    }
  }
  return map;
}

export function first(map: HeaderMap, name: string): string | undefined {
  const v = map.get(name.toLowerCase());
  return v && v.length ? v[0] : undefined;
}

/** Parse "type/sub; a=b; c=\"d\"" into base type and lower-cased params. */
export function parseContentType(value: string | undefined): { type: string; params: Record<string, string> } {
  const params: Record<string, string> = {};
  if (!value) return { type: "", params };
  const semi = value.indexOf(";");
  const type = (semi < 0 ? value : value.slice(0, semi)).trim().toLowerCase();
  if (semi >= 0) {
    const re = /;\s*([^=\s;]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]*))/g;
    let m: RegExpExecArray | null;
    const rest = value.slice(semi);
    while ((m = re.exec(rest))) {
      const key = (m[1] ?? "").toLowerCase();
      params[key] = m[2] !== undefined ? m[2].replace(/\\(.)/g, "$1") : (m[3] ?? "");
    }
  }
  return { type, params };
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_LOOKUP[B64.charAt(i)] = i;
B64_LOOKUP["-"] = 62;
B64_LOOKUP["_"] = 63;

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/\-_]/g, "");
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < clean.length; i++) {
    const v = B64_LOOKUP[clean.charAt(i)];
    if (v === undefined) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

export function qpToBytes(s: string, header = false): Uint8Array {
  const src = lf(s).replace(/=\n/g, "");
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(src.slice(i + 1, i + 3))) {
      out.push(parseInt(src.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (header && c === "_") {
      out.push(0x20);
    } else {
      const code = src.charCodeAt(i);
      if (code < 0x80) out.push(code);
      else for (const b of new TextEncoder().encode(c)) out.push(b);
    }
  }
  return Uint8Array.from(out);
}

export function decodeBytes(bytes: Uint8Array, charset?: string): string {
  const cs = (charset || "utf-8").trim().toLowerCase();
  try {
    return new TextDecoder(cs === "us-ascii" || cs === "ascii" ? "utf-8" : cs).decode(bytes);
  } catch {
    try {
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      let s = "";
      for (const b of bytes) s += String.fromCharCode(b);
      return s;
    }
  }
}

/** Decode RFC 2047 encoded words ("=?utf-8?Q?...?="). */
export function decodeEncodedWords(value: string): string {
  if (!value || value.indexOf("=?") < 0) return value;
  return value
    .replace(/(\?=)\s+(=\?)/g, "$1$2")
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_m, cs: string, enc: string, data: string) => {
      const charset = cs.split("*")[0];
      const bytes = enc.toUpperCase() === "B" ? base64ToBytes(data) : qpToBytes(data, true);
      return decodeBytes(bytes, charset);
    });
}

function decodeBody(body: string, cte: string | undefined, charset: string | undefined): string {
  const enc = (cte || "").trim().toLowerCase();
  if (enc === "base64") return decodeBytes(base64ToBytes(body), charset);
  if (enc === "quoted-printable") return decodeBytes(qpToBytes(body), charset);
  return body;
}

const MAX_DEPTH = 8;

function walk(head: string, body: string, out: SplitMessage, depth: number, inEmbedded: boolean): void {
  const h = parseHeaderBlock(head);
  const ct = parseContentType(first(h, "content-type"));
  const type = ct.type || "text/plain";
  const cte = first(h, "content-transfer-encoding");
  if (type.startsWith("multipart/") && ct.params.boundary && depth < MAX_DEPTH) {
    const boundary = ct.params.boundary;
    const lines = lf(body).split("\n");
    const parts: string[] = [];
    let cur: string[] | null = null;
    for (const line of lines) {
      const t = line.replace(/[ \t]+$/, "");
      if (t === "--" + boundary + "--") {
        if (cur) parts.push(cur.join("\n"));
        cur = null;
        break;
      }
      if (t === "--" + boundary) {
        if (cur) parts.push(cur.join("\n"));
        cur = [];
        continue;
      }
      if (cur) cur.push(line);
    }
    if (cur) parts.push(cur.join("\n"));
    for (const p of parts) {
      const hb = splitHeadBody(p);
      walk(hb.head, hb.body, out, depth + 1, inEmbedded);
    }
    return;
  }
  const decoded = decodeBody(body, cte, ct.params.charset);
  if (!inEmbedded && type === "text/plain" && !out.text) out.text = decoded;
  else if (!inEmbedded && type === "text/html" && !out.html) out.html = decoded;
  out.parts.push({ contentType: type, body: decoded });
}

/** Split a whole RFC 822 message into headers, text, html and leaf parts. */
export function splitMessage(raw: string): SplitMessage {
  const { head, body } = splitHeadBody(raw);
  const out: SplitMessage = { headers: head, text: "", html: "", parts: [] };
  walk(head, body, out, 0, false);
  return out;
}

/** Strip tags from HTML for text matching. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ");
}
