/**
 * Byte-level codecs: base64, quoted-printable, charset decoding and the
 * "binary string" representation the parser works on (one char per octet).
 * Isomorphic: only TextEncoder / TextDecoder / Uint8Array.
 */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_REV = new Int16Array(256).fill(-1);
for (let i = 0; i < B64.length; i++) B64_REV[B64.charCodeAt(i)] = i;
// URL-safe alphabet is accepted on input too.
B64_REV["-".charCodeAt(0)] = 62;
B64_REV["_".charCodeAt(0)] = 63;

const enc = new TextEncoder();

/** UTF-8 encode a string. */
export function utf8(str: string): Uint8Array {
  return enc.encode(str);
}

/** Encode bytes (or a UTF-8 string) as unwrapped base64. */
export function encodeBase64(input: Uint8Array | string): string {
  const bytes = typeof input === "string" ? utf8(input) : input;
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[n >> 18]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[n >> 18]! + B64[(n >> 12) & 63]! + "==";
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[n >> 18]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + "=";
  }
  return out;
}

/**
 * Decode base64. Tolerant: whitespace, line breaks, padding anywhere and any
 * character outside the alphabet are skipped; a dangling final sextet is dropped.
 * Never throws.
 */
export function decodeBase64(input: string): Uint8Array {
  const out = new Uint8Array(Math.floor((input.length * 3) / 4) + 3);
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    const v = c < 256 ? B64_REV[c]! : -1;
    if (v < 0) continue;
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.slice(0, o);
}

const HEX = "0123456789ABCDEF";
function hexVal(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

/**
 * Decode a quoted-printable body given as a binary string. Handles soft line
 * breaks (`=` at end of line, CRLF or LF, with trailing whitespace), `=XX`
 * (either case) and leaves malformed `=` sequences as literal text.
 */
export function decodeQuotedPrintable(input: string): Uint8Array {
  const out = new Uint8Array(input.length);
  let o = 0;
  const n = input.length;
  for (let i = 0; i < n; i++) {
    const c = input.charCodeAt(i);
    if (c === 61 /* = */) {
      // soft line break: "=" [WSP*] (CRLF | LF)
      let j = i + 1;
      while (j < n && (input.charCodeAt(j) === 32 || input.charCodeAt(j) === 9)) j++;
      if (j < n && input.charCodeAt(j) === 13 && input.charCodeAt(j + 1) === 10) {
        i = j + 1;
        continue;
      }
      if (j < n && input.charCodeAt(j) === 10) {
        i = j;
        continue;
      }
      if (j >= n) {
        i = j;
        continue;
      }
      const h = hexVal(input.charCodeAt(i + 1));
      const l = hexVal(input.charCodeAt(i + 2));
      if (h >= 0 && l >= 0) {
        out[o++] = (h << 4) | l;
        i += 2;
        continue;
      }
      out[o++] = 61;
      continue;
    }
    out[o++] = c & 0xff;
  }
  return out.slice(0, o);
}

/**
 * Encode text as quoted-printable (RFC 2045 §6.7) over its UTF-8 bytes, with
 * CRLF hard breaks and soft breaks keeping every line within 76 columns.
 */
export function encodeQuotedPrintable(text: string): string {
  const lines = text.replace(/\r\n|\r|\n/g, "\n").split("\n");
  return lines
    .map((line) => {
      const bytes = utf8(line);
      const tokens: string[] = [];
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]!;
        const last = i === bytes.length - 1;
        if ((b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !last)) tokens.push(String.fromCharCode(b));
        else tokens.push("=" + HEX[b >> 4]! + HEX[b & 15]!);
      }
      const out: string[] = [];
      let cur = "";
      for (const t of tokens) {
        if (cur.length + t.length > 75) {
          out.push(cur + "=");
          cur = "";
        }
        cur += t;
      }
      out.push(cur);
      return out.join("\r\n");
    })
    .join("\r\n");
}

/* ------------------------------ binary strings ------------------------------ */

/** Bytes → binary string (each char code is one octet, 0–255). */
export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

/** Binary string → bytes (char codes masked to 8 bits). */
export function binaryToBytes(bin: string): Uint8Array {
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

/** True when the binary string contains an octet ≥ 0x80. */
export function hasHighBit(bin: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7f]/.test(bin);
}

/* ------------------------------ charsets ------------------------------ */

const ALIASES: Record<string, string> = {
  utf8: "utf-8",
  "utf-8": "utf-8",
  "unicode-1-1-utf-8": "utf-8",
  "x-unicode20utf8": "utf-8",
  ascii: "us-ascii",
  "us-ascii": "us-ascii",
  "ansi_x3.4-1968": "us-ascii",
  "iso-646-us": "us-ascii",
  "iso646-us": "us-ascii",
  us: "us-ascii",
  latin1: "iso-8859-1",
  "latin-1": "iso-8859-1",
  l1: "iso-8859-1",
  cp819: "iso-8859-1",
  ibm819: "iso-8859-1",
  latin2: "iso-8859-2",
  "x-sjis": "shift_jis",
  sjis: "shift_jis",
  "shift-jis": "shift_jis",
  "ms_kanji": "shift_jis",
  "windows-31j": "shift_jis",
  cp932: "shift_jis",
  "x-euc-jp": "euc-jp",
  "ks_c_5601-1987": "euc-kr",
  "ks_c_5601": "euc-kr",
  "ksc5601": "euc-kr",
  cp949: "euc-kr",
  "windows-949": "euc-kr",
  "x-gbk": "gbk",
  gb2312: "gbk",
  "gb_2312-80": "gbk",
  cp936: "gbk",
  "windows-936": "gbk",
  "euc-cn": "gbk",
  "x-euc-cn": "gbk",
  "big5-hkscs": "big5",
  "x-x-big5": "big5",
  cp950: "big5",
  "koi8r": "koi8-r",
  "koi8u": "koi8-u",
  "utf-16": "utf-16le",
  "ucs-2": "utf-16le",
};

/** Normalise a charset label to one TextDecoder understands (best effort). */
export function normalizeCharset(label: string | undefined): string {
  if (!label) return "";
  let l = label.trim().replace(/^["']|["']$/g, "").toLowerCase();
  // RFC 2231 language suffix: utf-8*en
  l = l.replace(/\*.*$/, "");
  if (ALIASES[l]) return ALIASES[l]!;
  let m = l.match(/^iso[-_ ]?8859[-_ ]?(\d{1,2})(?::\d+)?$/);
  if (m) return `iso-8859-${m[1]}`;
  m = l.match(/^(?:windows|win|cp|x-cp|ms)[-_ ]?(125\d)$/);
  if (m) return `windows-${m[1]}`;
  m = l.match(/^iso[-_]?8859[-_](\d{1,2})[-_]?[a-z]?$/);
  if (m) return `iso-8859-${m[1]}`;
  return l;
}

const decoders = new Map<string, TextDecoder | null>();
function decoderFor(label: string, fatal = false): TextDecoder | null {
  const key = (fatal ? "!" : "") + label;
  if (decoders.has(key)) return decoders.get(key)!;
  let d: TextDecoder | null = null;
  try {
    d = new TextDecoder(label, { fatal });
  } catch {
    d = null;
  }
  decoders.set(key, d);
  return d;
}

/** Strict UTF-8 decode; `null` when the bytes are not valid UTF-8. */
export function tryUtf8(bytes: Uint8Array): string | null {
  const d = decoderFor("utf-8", true);
  if (!d) return null;
  try {
    return d.decode(bytes);
  } catch {
    return null;
  }
}

// windows-1252 0x80–0x9F (decoded by hand: some runtimes, e.g. Node ≤ 22,
// decode the "windows-1252" label as plain ISO-8859-1).
const CP1252 = [
  0x20ac, 0x81, 0x201a, 0x192, 0x201e, 0x2026, 0x2020, 0x2021, 0x2c6, 0x2030, 0x160, 0x2039, 0x152, 0x8d, 0x17d, 0x8f,
  0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x2dc, 0x2122, 0x161, 0x203a, 0x153, 0x9d, 0x17e, 0x178,
];

/** windows-1252 by hand (WHATWG also maps iso-8859-1 / us-ascii labels here). */
export function cp1252(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x2000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const codes = Array.from(bytes.subarray(i, i + CHUNK), (b) => (b >= 0x80 && b <= 0x9f ? CP1252[b - 0x80]! : b));
    out += String.fromCharCode.apply(null, codes);
  }
  return out;
}

/** ISO-8859-1 by hand (TextDecoder's "latin1" label is really windows-1252). */
export function latin1(bytes: Uint8Array): string {
  return bytesToBinary(bytes);
}

/**
 * Decode bytes in the given charset. Unknown or missing charsets fall back to
 * UTF-8 (when valid), then windows-1252/latin1. US-ASCII declared on 8-bit data
 * is treated as UTF-8 when valid (a very common mislabel). Never throws.
 */
export function decodeCharset(bytes: Uint8Array, charset?: string): string {
  const cs = normalizeCharset(charset);
  if (cs === "utf-8") {
    const d = decoderFor("utf-8");
    return d ? d.decode(bytes) : latin1(bytes);
  }
  if (!cs || cs === "us-ascii") {
    let ascii = true;
    for (let i = 0; i < bytes.length; i++) if (bytes[i]! > 0x7f) { ascii = false; break; }
    if (ascii) return latin1(bytes);
    const u = tryUtf8(bytes);
    if (u !== null) return u;
    return cp1252(bytes);
  }
  if (cs === "windows-1252" || cs === "iso-8859-1") return cp1252(bytes);
  const d = decoderFor(cs);
  if (d) {
    try {
      return d.decode(bytes);
    } catch {
      /* fall through */
    }
  }
  const u = tryUtf8(bytes);
  if (u !== null) return u;
  return latin1(bytes);
}

/** Decode a header line's raw octets: UTF-8 (RFC 6532) when valid, else windows-1252. */
export function decodeRawHeaderBinary(bin: string): string {
  if (!hasHighBit(bin)) return bin;
  const bytes = binaryToBytes(bin);
  const u = tryUtf8(bytes);
  if (u !== null) return u;
  return cp1252(bytes);
}

/** Fill `bytes` with random values (crypto.getRandomValues, else Math.random). */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(out);
  } else {
    // Fallback for exotic runtimes without Web Crypto: not cryptographically
    // strong, but Message-IDs and boundaries only need uniqueness.
    for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

/** Random lowercase hex token. */
export function randomHex(n: number): string {
  return Array.from(randomBytes(n), (b) => HEX[b >> 4]! + HEX[b & 15]!).join("").toLowerCase();
}
