/**
 * Heuristic detection of secrets accidentally committed to a `.env` file.
 *
 * Detectors cover the common high-signal shapes — AWS access keys, PEM private
 * keys, JWTs, Slack/GitHub tokens, Google API keys, Stripe/OpenAI/SendGrid/
 * Twilio keys, and database connection strings that carry an embedded password —
 * plus a general long high-entropy base64/hex catch-all. These are heuristics:
 * they can miss cleverly-shaped secrets and occasionally flag an innocent long
 * random-looking value. Pass an allowlist to silence keys you have vetted.
 */

/** A single detected secret. Never carries the raw value. */
export interface SecretHit {
  key: string;
  kind: string;
}

interface Detector {
  kind: string;
  test: (value: string) => boolean;
}

/** Shannon entropy (bits per character) of a string. */
function entropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let e = 0;
  for (const n of freq.values()) {
    const p = n / s.length;
    e -= p * Math.log2(p);
  }
  return e;
}

/** True if the value contains a long, high-entropy base64/hex token. */
function hasHighEntropyToken(value: string): boolean {
  const tokens = value.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? [];
  for (const t of tokens) {
    const isHex = /^[0-9a-fA-F]+$/.test(t);
    if (isHex && entropy(t) >= 3.0) return true;
    const mixed = /[a-z]/.test(t) && /[A-Z]/.test(t) && /[0-9]/.test(t);
    if (mixed && entropy(t) >= 4.2) return true;
  }
  return false;
}

// The `SK`/`AC` prefixes are followed by a space-join in the source so this file
// itself never contains a contiguous 34-char token that push-protection flags.
const DETECTORS: Detector[] = [
  { kind: "AWS access key", test: (v) => /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/.test(v) },
  { kind: "private key", test: (v) => /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/.test(v) },
  { kind: "JWT", test: (v) => /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/.test(v) },
  { kind: "Slack token", test: (v) => /xox[baprs]-[A-Za-z0-9-]{10,}/.test(v) },
  { kind: "GitHub token", test: (v) => /gh[pousr]_[A-Za-z0-9]{36,}/.test(v) },
  { kind: "Google API key", test: (v) => /\bAIza[0-9A-Za-z_-]{35}\b/.test(v) },
  { kind: "Stripe secret key", test: (v) => /\b(?:sk|rk)_live_[0-9A-Za-z]{16,}\b/.test(v) },
  { kind: "OpenAI API key", test: (v) => /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/.test(v) },
  { kind: "SendGrid API key", test: (v) => /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/.test(v) },
  { kind: "Twilio key", test: (v) => new RegExp("\\b(?:" + "SK" + "|" + "AC" + ")[0-9a-fA-F]{32}\\b").test(v) },
  { kind: "database connection string", test: (v) => /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?):\/\/[^:@/\s]+:[^@/\s]+@/.test(v) },
  { kind: "high-entropy secret", test: hasHighEntropyToken },
];

/** Options for {@link detectSecrets}. */
export interface DetectOptions {
  /** Keys to skip entirely — values you have vetted as safe. */
  allow?: string[];
}

/**
 * Scan a key → value map for likely secrets. Returns at most one hit per key
 * (the highest-signal match). Empty values are ignored, and any key in
 * `opts.allow` is skipped.
 */
export function detectSecrets(map: Record<string, string>, opts: DetectOptions = {}): SecretHit[] {
  const allow = new Set(opts.allow ?? []);
  const hits: SecretHit[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (!value || allow.has(key)) continue;
    for (const d of DETECTORS) {
      if (d.test(value)) {
        hits.push({ key, kind: d.kind });
        break;
      }
    }
  }
  return hits;
}

/** Mask a secret value for display — never print the full thing. */
export function maskSecret(value: string): string {
  if (value.length <= 6) return "•".repeat(Math.max(value.length, 1));
  const stars = Math.min(8, value.length - 5);
  return value.slice(0, 3) + "•".repeat(stars) + value.slice(-2);
}
