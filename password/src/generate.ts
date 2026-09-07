/**
 * Cryptographically-random passphrase & password generators.
 *
 * Uses Web Crypto (`crypto.getRandomValues`) with rejection sampling for an
 * unbiased uniform pick — no modulo bias. Zero dependencies · isomorphic.
 */

import { WORDLIST } from "./wordlist";

/** Uniformly random integer in [0, max) using rejection sampling. */
function randomInt(max: number): number {
  if (max <= 0) throw new Error("max must be > 0");
  if (max === 1) return 0;
  const limit = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0]!;
  } while (x >= limit);
  return x % max;
}

/** Pick a uniformly random element from a non-empty array. */
function pick<T>(arr: readonly T[]): T {
  return arr[randomInt(arr.length)]!;
}

export interface PassphraseOptions {
  /** Number of words (default 6). */
  words?: number;
  /** Word separator (default "-"). */
  separator?: string;
  /** Capitalise the first letter of each word (default false). */
  capitalize?: boolean;
  /** Append a random digit 0–9 after the passphrase (default false). */
  includeNumber?: boolean;
  /** Custom wordlist to draw from (default the embedded 256-word list). */
  wordlist?: readonly string[];
}

/**
 * Generate a diceware-style passphrase from an embedded wordlist.
 *
 * ```ts
 * generatePassphrase();                       // "cedar-ember-hawk-...-atlas"
 * generatePassphrase({ words: 5, separator: " ", capitalize: true });
 * ```
 */
export function generatePassphrase(opts: PassphraseOptions = {}): string {
  const count = opts.words ?? 6;
  if (count < 1) throw new Error("words must be >= 1");
  const list = opts.wordlist ?? WORDLIST;
  if (list.length === 0) throw new Error("wordlist must not be empty");
  const sep = opts.separator ?? "-";

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let w = pick(list);
    if (opts.capitalize) w = w.charAt(0).toUpperCase() + w.slice(1);
    out.push(w);
  }
  let phrase = out.join(sep);
  if (opts.includeNumber) phrase += sep + String(randomInt(10));
  return phrase;
}

export interface PasswordGenOptions {
  /** Total length (default 16). */
  length?: number;
  /** Include lowercase letters (default true). */
  lowercase?: boolean;
  /** Include uppercase letters (default true). */
  uppercase?: boolean;
  /** Include digits (default true). */
  digits?: boolean;
  /** Include symbols (default true). */
  symbols?: boolean;
  /** Exclude visually ambiguous characters (0/O/1/l/I) (default false). */
  avoidAmbiguous?: boolean;
}

const SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
};
const AMBIGUOUS = new Set(["0", "O", "1", "l", "I"]);

/**
 * Generate a random password with per-class controls. Guarantees at least one
 * character from every enabled class.
 *
 * ```ts
 * generatePassword({ length: 20, symbols: false });
 * ```
 */
export function generatePassword(opts: PasswordGenOptions = {}): string {
  const length = opts.length ?? 16;
  if (length < 1) throw new Error("length must be >= 1");

  const enabled: string[] = [];
  const filter = (s: string) =>
    opts.avoidAmbiguous ? [...s].filter((c) => !AMBIGUOUS.has(c)).join("") : s;

  if (opts.lowercase !== false) enabled.push(filter(SETS.lowercase));
  if (opts.uppercase !== false) enabled.push(filter(SETS.uppercase));
  if (opts.digits !== false) enabled.push(filter(SETS.digits));
  if (opts.symbols !== false) enabled.push(filter(SETS.symbols));
  if (enabled.length === 0) throw new Error("at least one character class must be enabled");

  const pool = enabled.join("");
  const chars: string[] = [];

  // Guarantee one from each enabled class (only when there is room).
  for (const set of enabled) {
    if (chars.length < length) chars.push(pick([...set]));
  }
  while (chars.length < length) chars.push(pool[randomInt(pool.length)]!);

  // Fisher–Yates shuffle so the guaranteed chars aren't positionally predictable.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
