/**
 * @lacspace/id
 *
 * Unique IDs done right — UUID v4, **UUID v7** (time-sortable), Nano-ID-style
 * and short URL-safe codes. Cryptographically random (Web Crypto), monotonic
 * v7 within the same millisecond, zero-dependency and isomorphic.
 */

function getRandom(bytes: Uint8Array): Uint8Array {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || typeof c.getRandomValues !== "function") {
    throw new Error("Web Crypto getRandomValues is unavailable in this environment.");
  }
  c.getRandomValues(bytes);
  return bytes;
}

const HEX: string[] = [];
for (let i = 0; i < 256; i++) HEX.push((i + 0x100).toString(16).slice(1));

function bytesToUuid(b: Uint8Array): string {
  return (
    HEX[b[0]!]! + HEX[b[1]!]! + HEX[b[2]!]! + HEX[b[3]!]! + "-" +
    HEX[b[4]!]! + HEX[b[5]!]! + "-" +
    HEX[b[6]!]! + HEX[b[7]!]! + "-" +
    HEX[b[8]!]! + HEX[b[9]!]! + "-" +
    HEX[b[10]!]! + HEX[b[11]!]! + HEX[b[12]!]! + HEX[b[13]!]! + HEX[b[14]!]! + HEX[b[15]!]!
  );
}

/** RFC 4122 UUID v4 (random). */
export function uuidv4(): string {
  const b = getRandom(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant
  return bytesToUuid(b);
}

let lastV7Time = 0;
let v7Counter = 0;

/**
 * UUID v7 — a time-sortable UUID (48-bit Unix-ms timestamp + randomness).
 * Great as a primary key: lexicographically sortable by creation time, index-
 * friendly, still globally unique. Monotonic within the same millisecond.
 */
export function uuidv7(now?: number): string {
  const time = now ?? Date.now();
  if (time === lastV7Time) v7Counter++;
  else { lastV7Time = time; v7Counter = 0; }

  const b = getRandom(new Uint8Array(16));
  // 48-bit timestamp (big-endian) in bytes 0..5
  b[0] = (time / 2 ** 40) & 0xff;
  b[1] = (time / 2 ** 32) & 0xff;
  b[2] = (time / 2 ** 24) & 0xff;
  b[3] = (time / 2 ** 16) & 0xff;
  b[4] = (time / 2 ** 8) & 0xff;
  b[5] = time & 0xff;
  // rand_a (12 bits) holds a monotonic counter so same-ms ids stay sortable
  b[6] = 0x70 | ((v7Counter >> 8) & 0x0f); // version 7 + counter high nibble
  b[7] = v7Counter & 0xff;                  // counter low byte
  b[8] = (b[8]! & 0x3f) | 0x80;             // variant
  return bytesToUuid(b);
}

/** Extract the timestamp (ms) embedded in a UUID v7. */
export function uuidv7Time(uuid: string): number {
  const hex = uuid.replace(/-/g, "").slice(0, 12);
  return parseInt(hex, 16);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Is this a well-formed UUID? */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/** UUID version digit (1–8), or null if not a UUID. */
export function uuidVersion(s: string): number | null {
  return isUuid(s) ? parseInt(s[14]!, 16) : null;
}

const NANO_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";
const URL_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

function randomFromAlphabet(size: number, alphabet: string): string {
  const mask = (2 << (31 - Math.clz32((alphabet.length - 1) | 1))) - 1;
  const step = Math.ceil((1.6 * mask * size) / alphabet.length);
  let id = "";
  while (id.length < size) {
    const bytes = getRandom(new Uint8Array(step));
    for (let i = 0; i < step && id.length < size; i++) {
      const idx = bytes[i]! & mask;
      if (idx < alphabet.length) id += alphabet[idx];
    }
  }
  return id;
}

/** Nano-ID-style URL-safe id (default 21 chars). */
export function nanoid(size = 21): string {
  return randomFromAlphabet(size, NANO_ALPHABET);
}

/** Short, URL-safe, human-shareable code (default 8 chars). */
export function shortId(size = 8): string {
  return randomFromAlphabet(size, URL_ALPHABET);
}

/** A prefixed id, e.g. `id("user")` → "user_9f8c…". Uses nanoid. */
export function id(prefix: string, size = 16): string {
  return `${prefix}_${nanoid(size)}`;
}
