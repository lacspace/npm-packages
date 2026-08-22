/**
 * @lacspace/password
 * Password hashing & verification — PBKDF2 with a portable PHC-style string.
 *
 * Uses PBKDF2-HMAC-SHA256 (600k iterations by default, per OWASP) via Web
 * Crypto — correct and isomorphic (Node, edge, browser). Includes a simple
 * strength estimator. Never store plaintext passwords.
 *
 * Zero dependencies (bar @lacspace/crypto) · isomorphic · fully typed.
 */

import { deriveBits, randomBytes, toBase64url, fromBase64url, constantTimeEqual } from "@lacspace/crypto";

const DEFAULT_ITERATIONS = 600000;
const KEY_LENGTH = 32;

export interface HashOptions {
  iterations?: number;
  saltBytes?: number;
}

/**
 * Hash a password. Returns a self-describing PHC-style string safe to store:
 * `$pbkdf2-sha256$i=600000$<salt>$<hash>`.
 */
export async function hash(password: string, opts: HashOptions = {}): Promise<string> {
  if (!password) throw new Error("password must not be empty");
  const iterations = opts.iterations ?? DEFAULT_ITERATIONS;
  const salt = randomBytes(opts.saltBytes ?? 16);
  const derived = await deriveBits(password, salt, { iterations, hash: "SHA-256", length: KEY_LENGTH });
  return `$pbkdf2-sha256$i=${iterations}$${toBase64url(salt)}$${toBase64url(derived)}`;
}

/** Verify a password against a stored hash (constant-time). */
export async function verify(password: string, stored: string): Promise<boolean> {
  const m = stored.match(/^\$pbkdf2-sha256\$i=(\d+)\$([^$]+)\$([^$]+)$/);
  if (!m) return false;
  const iterations = parseInt(m[1]!, 10);
  const salt = fromBase64url(m[2]!);
  const expected = fromBase64url(m[3]!);
  const derived = await deriveBits(password, salt, {
    iterations,
    hash: "SHA-256",
    length: expected.length,
  });
  return constantTimeEqual(derived, expected);
}

/** True if a stored hash used fewer iterations than `iterations` — rehash on next login. */
export function needsRehash(stored: string, iterations = DEFAULT_ITERATIONS): boolean {
  const m = stored.match(/\$i=(\d+)\$/);
  if (!m) return true;
  return parseInt(m[1]!, 10) < iterations;
}

export interface Strength {
  /** 0 (very weak) – 4 (very strong). */
  score: 0 | 1 | 2 | 3 | 4;
  length: number;
  warnings: string[];
}

const COMMON = new Set([
  "password", "123456", "12345678", "qwerty", "abc123", "111111", "123456789",
  "letmein", "admin", "welcome", "monkey", "1234567890", "password1", "iloveyou",
]);

/** A quick, dependency-free password strength heuristic (not a substitute for zxcvbn). */
export function strength(password: string): Strength {
  const warnings: string[] = [];
  const length = password.length;
  let score = 0;

  if (length >= 8) score++;
  if (length >= 12) score++;
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^a-zA-Z0-9]/.test(password));
  if (classes >= 3) score++;
  if (classes === 4 && length >= 12) score++;

  if (length < 8) warnings.push("Use at least 8 characters.");
  if (classes < 3) warnings.push("Mix upper, lower, numbers and symbols.");
  if (COMMON.has(password.toLowerCase())) {
    score = 0;
    warnings.push("This is a very common password.");
  }
  if (/^(.)\1+$/.test(password)) {
    score = Math.min(score, 1);
    warnings.push("Avoid repeated characters.");
  }

  return { score: Math.max(0, Math.min(4, score)) as Strength["score"], length, warnings };
}
