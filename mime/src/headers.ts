/**
 * Header block parsing (folding, CRLF/LF, 8-bit headers), MailHeaders, and
 * structured parameter parsing incl. RFC 2231 continuations / charsets.
 */

import { bytesToBinary, decodeCharset, decodeRawHeaderBinary, utf8 } from "./bytes";
import { decodeWords } from "./words";

interface HeaderEntry {
  name: string;
  key: string;
  value: string;
}

/** Parsed header block. Lookups are case-insensitive; `get` returns RFC 2047-decoded text. */
export class MailHeaders {
  private readonly list: HeaderEntry[];

  constructor(list: HeaderEntry[] = []) {
    this.list = list;
  }

  /** First value of `name`, unfolded, RFC 2047-decoded and trimmed. */
  get(name: string): string | undefined {
    const k = name.toLowerCase();
    const e = this.list.find((h) => h.key === k);
    return e ? decodeWords(e.value).trim() : undefined;
  }

  /** Every value of `name`, decoded, in message order. */
  getAll(name: string): string[] {
    const k = name.toLowerCase();
    return this.list.filter((h) => h.key === k).map((h) => decodeWords(h.value).trim());
  }

  /** First value of `name`, unfolded but not decoded. */
  raw(name: string): string | undefined {
    const k = name.toLowerCase();
    return this.list.find((h) => h.key === k)?.value.trim();
  }

  /** Every raw value of `name`. */
  rawAll(name: string): string[] {
    const k = name.toLowerCase();
    return this.list.filter((h) => h.key === k).map((h) => h.value.trim());
  }

  has(name: string): boolean {
    const k = name.toLowerCase();
    return this.list.some((h) => h.key === k);
  }

  /** `[name, decodedValue]` pairs in message order (original name casing). */
  entries(): Array<[string, string]> {
    return this.list.map((h) => [h.name, decodeWords(h.value).trim()]);
  }

  get size(): number {
    return this.list.length;
  }
}

/** Split a binary-string entity into its header block and body. */
export function splitEntity(bin: string): { head: string; body: string } {
  // A message that starts with a blank line has no headers.
  if (bin.startsWith("\r\n")) return { head: "", body: bin.slice(2) };
  if (bin.startsWith("\n")) return { head: "", body: bin.slice(1) };
  const m = /\r?\n\r?\n/.exec(bin);
  if (!m) {
    // No blank line: everything is headers if it looks like headers, else body.
    if (/^[^\s:]+:/.test(bin)) return { head: bin, body: "" };
    return { head: "", body: bin };
  }
  return { head: bin.slice(0, m.index), body: bin.slice(m.index + m[0].length) };
}

/** Parse a header block given as a binary string (octets). */
export function parseHeaderBinary(head: string): MailHeaders {
  const list: HeaderEntry[] = [];
  const lines = head.split(/\r?\n/);
  let cur: HeaderEntry | null = null;
  for (const line of lines) {
    if (/^[ \t]/.test(line)) {
      if (cur) cur.value += line;
      continue;
    }
    if (cur) list.push(cur);
    cur = null;
    const idx = line.indexOf(":");
    if (idx <= 0) continue; // mbox "From " line or junk
    const name = line.slice(0, idx).trim();
    if (!name || /\s/.test(name)) continue;
    cur = { name, key: name.toLowerCase(), value: line.slice(idx + 1) };
  }
  if (cur) list.push(cur);
  for (const h of list) h.value = decodeRawHeaderBinary(h.value);
  return new MailHeaders(list);
}

/**
 * Parse a header block (or a whole message — parsing stops at the first blank
 * line). Accepts a string or raw bytes.
 */
export function parseHeaders(raw: string | Uint8Array): MailHeaders {
  const bin = typeof raw === "string" ? (/[^\x00-\xff]/.test(raw) ? bytesToBinary(utf8(raw)) : raw) : bytesToBinary(raw);
  return parseHeaderBinary(splitEntity(bin).head);
}

/* ------------------------------ parameters ------------------------------ */

/** Split on `sep` outside quoted strings and comments. */
function splitOutside(value: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  let depth = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (q) {
      if (c === "\\" && i + 1 < value.length) {
        cur += c + value[++i];
        continue;
      }
      if (c === '"') q = false;
      cur += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === "(") depth++;
    else if (c === ")" && depth > 0) depth--;
    else if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1).replace(/\\(.)/g, "$1");
  if (t.startsWith('"')) return t.slice(1).replace(/\\(.)/g, "$1"); // unterminated quote
  return t;
}

function pctDecode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const b = utf8(s[i]!);
      for (const x of b) out.push(x);
    }
  }
  return Uint8Array.from(out);
}

/**
 * Merge raw `key → value` pairs applying RFC 2231: `name*=charset'lang'pct`,
 * continuations `name*0=`, `name*1*=` …; then RFC 2047 words in plain values.
 * Keys come back lowercase.
 */
export function mergeParams(pairs: Array<[string, string]>): Record<string, string> {
  const out: Record<string, string> = {};
  const cont = new Map<string, Array<{ n: number; v: string; enc: boolean }>>();
  for (const [rawKey, v] of pairs) {
    const key = rawKey.trim().toLowerCase();
    const m = key.match(/^([^*]+)\*(\d+)?(\*)?$/);
    if (!m) {
      if (!(key in out)) out[key] = /=\?/.test(v) ? decodeWords(v) : v;
      continue;
    }
    const base = m[1]!;
    const n = m[2] !== undefined ? parseInt(m[2], 10) : 0;
    const enc = m[3] !== undefined || (m[2] === undefined);
    if (!cont.has(base)) cont.set(base, []);
    cont.get(base)!.push({ n, v, enc });
  }
  for (const [base, segs] of cont) {
    segs.sort((a, b) => a.n - b.n);
    let charset = "utf-8";
    const chunks: Uint8Array[] = [];
    segs.forEach((s, i) => {
      let v = s.v;
      if (s.enc && i === 0) {
        const mm = v.match(/^([^']*)'[^']*'(.*)$/s);
        if (mm) {
          if (mm[1]) charset = mm[1];
          v = mm[2]!;
        }
      }
      chunks.push(s.enc ? pctDecode(v) : utf8(v));
    });
    const len = chunks.reduce((a, c) => a + c.length, 0);
    const all = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    // RFC 2231 form wins over a plain parameter of the same name.
    out[base] = decodeCharset(all, charset);
  }
  return out;
}

/**
 * Parse a structured header value such as Content-Type or Content-Disposition
 * into `{ value, params }`. `value` is lowercased and stripped of comments.
 */
export function parseHeaderParams(input: string | undefined): { value: string; params: Record<string, string> } {
  if (!input) return { value: "", params: {} };
  const parts = splitOutside(input, ";");
  const value = parts[0]!.replace(/\([^)]*\)/g, "").trim().toLowerCase();
  const pairs: Array<[string, string]> = [];
  for (const p of parts.slice(1)) {
    const idx = p.indexOf("=");
    if (idx <= 0) continue;
    const k = p.slice(0, idx).trim();
    if (!k) continue;
    pairs.push([k, unquote(p.slice(idx + 1))]);
  }
  return { value, params: mergeParams(pairs) };
}
