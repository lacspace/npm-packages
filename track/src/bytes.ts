/** Small byte helpers: UTF-8, base64url, varints. No dependencies. */

const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });

export function utf8(s: string): Uint8Array {
  return enc.encode(s);
}

export function fromUtf8(b: Uint8Array): string | null {
  try {
    return dec.decode(b);
  } catch {
    return null;
  }
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_REV: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_REV[B64[i] as string] = i;

export function toBase64Url(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8) | (bytes[i + 2] as number);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = (bytes[i] as number) << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
  } else if (rem === 2) {
    const n = ((bytes[i] as number) << 16) | ((bytes[i + 1] as number) << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]!;
  }
  return out;
}

/** Strict base64url decode (no padding). Returns null on any invalid input. */
export function fromBase64Url(s: string): Uint8Array | null {
  if (typeof s !== "string" || s.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64_REV[s[i] as string];
    if (v === undefined) return null;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  // Non-canonical trailing bits make two strings decode to the same bytes; reject them.
  if (bits > 0 && (buf & ((1 << bits) - 1)) !== 0) return null;
  return out.subarray(0, o);
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function varint(n: number): Uint8Array {
  const out: number[] = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return new Uint8Array(out);
}

export class Reader {
  pos = 0;
  constructor(private readonly b: Uint8Array) {}
  get remaining(): number {
    return this.b.length - this.pos;
  }
  byte(): number | null {
    if (this.pos >= this.b.length) return null;
    return this.b[this.pos++] as number;
  }
  u32(): number | null {
    if (this.remaining < 4) return null;
    const b = this.b;
    const p = this.pos;
    this.pos += 4;
    return (((b[p] as number) << 24) >>> 0) + ((b[p + 1] as number) << 16) + ((b[p + 2] as number) << 8) + (b[p + 3] as number);
  }
  varint(): number | null {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 5; i++) {
      const c = this.byte();
      if (c === null) return null;
      result += (c & 0x7f) * 2 ** shift;
      if ((c & 0x80) === 0) return result;
      shift += 7;
    }
    return null;
  }
  bytes(n: number): Uint8Array | null {
    if (n < 0 || this.remaining < n) return null;
    const out = this.b.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  str(): string | null {
    const n = this.varint();
    if (n === null) return null;
    const b = this.bytes(n);
    return b ? fromUtf8(b) : null;
  }
}

export function u32(n: number): Uint8Array {
  const v = Math.max(0, Math.min(0xffffffff, Math.floor(n)));
  return new Uint8Array([(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff]);
}

/** Constant-time comparison of two byte arrays (time depends only on length). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
