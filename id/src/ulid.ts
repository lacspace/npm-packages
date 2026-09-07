import { getRandom } from "./random";

/**
 * ULID — a 26-character, Crockford base32, lexicographically sortable id:
 * 10 chars of 48-bit millisecond timestamp + 16 chars (80 bits) of randomness.
 * Monotonic within the same millisecond, so ids created back-to-back still sort
 * in creation order.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // 32 chars, no I L O U
const TIME_LEN = 10;
const RAND_LEN = 16;

function encodeTime(time: number): string {
  if (!Number.isInteger(time) || time < 0) {
    throw new Error("ulid: time must be a non-negative integer (ms).");
  }
  let out = "";
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % 32;
    out = CROCKFORD[mod] + out;
    time = (time - mod) / 32;
  }
  return out;
}

function randomCrockford(): number[] {
  const bytes = getRandom(new Uint8Array(RAND_LEN));
  const out: number[] = new Array(RAND_LEN);
  for (let i = 0; i < RAND_LEN; i++) out[i] = bytes[i]! & 0x1f; // 256 % 32 == 0 → unbiased
  return out;
}

function increment(rand: number[]): number[] {
  for (let i = RAND_LEN - 1; i >= 0; i--) {
    if (rand[i]! < 31) {
      rand[i]!++;
      return rand;
    }
    rand[i] = 0;
  }
  return rand; // full overflow wraps (astronomically unlikely)
}

let lastTime = -1;
let lastRand: number[] = [];

/**
 * Generate a ULID. Pass `now` (ms) to inject the clock — handy for
 * deterministic tests. Monotonic: within the same (or a non-increasing)
 * millisecond the random component is incremented so ids keep sorting.
 */
export function ulid(now?: number): string {
  let time = now ?? Date.now();
  let rand: number[];
  if (time <= lastTime) {
    // Same ms, or the clock went backwards: keep the last timestamp and bump
    // the random field so ordering is preserved.
    time = lastTime;
    rand = increment(lastRand.slice());
  } else {
    rand = randomCrockford();
  }
  lastTime = time;
  lastRand = rand;
  let r = "";
  for (let i = 0; i < RAND_LEN; i++) r += CROCKFORD[rand[i]!];
  return encodeTime(time) + r;
}

const ULID_RE = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;

/** Is this a well-formed ULID? */
export function isUlid(s: string): boolean {
  return typeof s === "string" && ULID_RE.test(s);
}

/** Extract the timestamp (ms since the Unix epoch) embedded in a ULID. */
export function ulidTime(s: string): number {
  if (!isUlid(s)) throw new Error("ulidTime: not a valid ULID.");
  const t = s.slice(0, TIME_LEN).toUpperCase();
  let time = 0;
  for (let i = 0; i < TIME_LEN; i++) {
    time = time * 32 + CROCKFORD.indexOf(t[i]!);
  }
  return time;
}
