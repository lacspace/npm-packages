/**
 * Lightweight, zxcvbn-style password strength estimator.
 *
 * Estimates entropy from the effective character pool, then penalises detected
 * weaknesses (common passwords, sequences, repeats, keyboard runs, dates) and
 * maps the adjusted entropy to a 0–4 score with actionable feedback.
 *
 * Zero dependencies · isomorphic. Not a full zxcvbn replacement, but useful and
 * self-contained.
 */

/** A small embedded subset of the most-common passwords (lowercased). */
const COMMON_PASSWORDS = new Set([
  "password", "passw0rd", "password1", "123456", "12345678", "123456789", "1234567890",
  "qwerty", "qwertyuiop", "abc123", "111111", "000000", "123123", "654321", "666666",
  "letmein", "admin", "welcome", "monkey", "dragon", "master", "sunshine", "princess",
  "football", "baseball", "superman", "batman", "trustno1", "iloveyou", "starwars",
  "login", "root", "toor", "hello", "whatever", "shadow", "michael", "jennifer",
  "hunter2", "changeme", "secret", "ninja", "azerty", "qazwsx", "zxcvbn", "asdfgh",
]);

/** Common keyboard rows/runs used to spot keyboard-walk patterns. */
const KEYBOARD_RUNS = [
  "qwertyuiop", "asdfghjkl", "zxcvbnm",
  "1234567890", "0987654321",
  "qazwsx", "wsxedc", "edcrfv", "rfvtgb",
];

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = LOWER.toUpperCase();

export interface StrengthEstimate {
  /** 0 (very weak) – 4 (very strong). */
  score: 0 | 1 | 2 | 3 | 4;
  /** Estimated entropy in bits after pattern penalties. */
  entropyBits: number;
  /** Detected weakness categories, e.g. `"sequence"`, `"repeat"`. */
  patterns: string[];
  /** Things wrong with the password. */
  warnings: string[];
  /** Actionable ways to make it stronger. */
  suggestions: string[];
}

function poolSize(password: string): number {
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;
  return pool || 1;
}

/** True if `s` is a run of 3+ sequential characters (asc or desc) anywhere. */
function hasSequence(s: string): boolean {
  const lower = s.toLowerCase();
  for (let i = 0; i + 2 < lower.length; i++) {
    const a = lower.charCodeAt(i);
    const b = lower.charCodeAt(i + 1);
    const c = lower.charCodeAt(i + 2);
    if (b - a === 1 && c - b === 1) return true; // abc, 123
    if (a - b === 1 && b - c === 1) return true; // cba, 321
  }
  return false;
}

/** True if the string contains a repeated single char (aaaa) or repeated block (abcabc). */
function hasRepeat(s: string): boolean {
  if (/(.)\1{2,}/.test(s)) return true; // 3+ same char in a row
  // repeated block covering the whole string, e.g. "abcabc", "xyzxyz"
  if (s.length >= 4 && /^(.{2,})\1+$/.test(s)) return true;
  return false;
}

function hasKeyboardRun(s: string): boolean {
  const lower = s.toLowerCase();
  for (const run of KEYBOARD_RUNS) {
    for (let i = 0; i + 3 < run.length; i++) {
      const chunk = run.slice(i, i + 4);
      if (lower.includes(chunk)) return true;
    }
  }
  return false;
}

/** Detects an embedded date-like token (year 1900–2099 or 6–8 consecutive digits). */
function hasDate(s: string): boolean {
  if (/(?:19|20)\d{2}/.test(s)) return true;
  if (/\d{6,8}/.test(s)) return true;
  return false;
}

function containsCommonWord(lower: string): boolean {
  if (COMMON_PASSWORDS.has(lower)) return true;
  for (const w of COMMON_PASSWORDS) {
    if (w.length >= 5 && lower.includes(w)) return true;
  }
  return false;
}

/**
 * Estimate password strength (0–4) with entropy, detected patterns and
 * feedback. Deterministic and dependency-free.
 */
export function estimateStrength(password: string): StrengthEstimate {
  const patterns: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];
  const lower = password.toLowerCase();

  const len = password.length;
  let entropy = len > 0 ? len * Math.log2(poolSize(password)) : 0;

  // Detect weaknesses and apply entropy penalties.
  if (containsCommonWord(lower)) {
    patterns.push("common");
    warnings.push("This looks like a common or well-known password.");
    entropy = Math.min(entropy, 10);
  }
  if (hasSequence(password)) {
    patterns.push("sequence");
    suggestions.push("Avoid sequences like \"abc\" or \"123\".");
    entropy -= 8;
  }
  if (hasRepeat(password)) {
    patterns.push("repeat");
    suggestions.push("Avoid repeated characters or repeated blocks.");
    entropy -= 8;
  }
  if (hasKeyboardRun(password)) {
    patterns.push("keyboard");
    suggestions.push("Avoid keyboard runs like \"qwerty\" or \"asdf\".");
    entropy -= 8;
  }
  if (hasDate(password)) {
    patterns.push("date");
    suggestions.push("Avoid years and dates — they are easy to guess.");
    entropy -= 6;
  }

  entropy = Math.max(0, Math.round(entropy * 10) / 10);

  // Feedback for structural weaknesses.
  const classes =
    Number(/[a-z]/.test(password)) +
    Number(/[A-Z]/.test(password)) +
    Number(/[0-9]/.test(password)) +
    Number(/[^a-zA-Z0-9]/.test(password));
  if (len < 8) suggestions.push("Use at least 12 characters.");
  else if (len < 12) suggestions.push("Longer is stronger — aim for 12+ characters.");
  if (classes < 3) suggestions.push("Mix upper, lower, numbers and symbols.");

  // Map entropy to a 0–4 score.
  let score: 0 | 1 | 2 | 3 | 4;
  if (patterns.includes("common")) score = 0;
  else if (entropy < 28) score = 0;
  else if (entropy < 40) score = 1;
  else if (entropy < 60) score = 2;
  else if (entropy < 80) score = 3;
  else score = 4;

  if (score <= 1 && warnings.length === 0) {
    warnings.push("This password is weak and could be guessed.");
  }

  return { score, entropyBits: entropy, patterns, warnings, suggestions };
}
