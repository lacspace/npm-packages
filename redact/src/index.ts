/**
 * @lacspace/redact
 * Redact secrets & PII from strings and objects before you log them.
 *
 * Masks values by sensitive key name (password, token, authorization…) and by
 * pattern (JWTs, API keys, emails, credit cards, IPs). Safe for AWS CloudWatch,
 * Mongo logs and error trackers.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/** Key names whose values are always masked (case-insensitive substring match). */
export const SENSITIVE_KEYS = [
  "password", "passwd", "pwd", "secret", "token", "apikey", "api_key", "accesstoken",
  "access_token", "refreshtoken", "refresh_token", "authorization", "auth", "cookie",
  "session", "privatekey", "private_key", "clientsecret", "client_secret", "creditcard",
  "card", "cvv", "ssn", "pin", "otp",
];

interface Pattern {
  name: string;
  re: RegExp;
  replace: (m: string) => string;
}

const MASK = "•••";

function maskMiddle(s: string, keepStart = 0, keepEnd = 4): string {
  if (s.length <= keepStart + keepEnd) return MASK;
  return s.slice(0, keepStart) + MASK + s.slice(s.length - keepEnd);
}

const PATTERNS: Pattern[] = [
  { name: "jwt", re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replace: () => "[REDACTED_JWT]" },
  { name: "email", re: /([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, replace: (m) => m.replace(/^(.)(.*)(@.*)$/, (_x, a, _b, c) => `${a}${MASK}${c}`) },
  { name: "creditCard", re: /\b(?:\d[ -]?){13,19}\b/g, replace: (m) => maskMiddle(m.replace(/\D/g, ""), 0, 4) },
  { name: "bearer", re: /Bearer\s+[A-Za-z0-9._~+/=-]+/gi, replace: () => "Bearer [REDACTED]" },
  { name: "apiKey", re: /\b(?:sk|pk|rk|lac|ghp|xox[baprs]|AKIA)[_-][A-Za-z0-9_-]{8,}\b/g, replace: (m) => m.slice(0, 6) + MASK },
  { name: "ipv4", re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replace: (m) => m.replace(/\.\d+$/, ".•••") },
];

export interface RedactOptions {
  /** Extra sensitive key names. */
  keys?: string[];
  /** Disable specific built-in patterns by name. */
  disablePatterns?: string[];
  /** Replacement text for masked values (key matches). Default "[REDACTED]". */
  mask?: string;
  /** Max recursion depth for objects. Default 8. */
  maxDepth?: number;
}

/** Redact sensitive substrings from a single string. */
export function redactString(input: string, opts: RedactOptions = {}): string {
  let out = input;
  for (const p of PATTERNS) {
    if (opts.disablePatterns?.includes(p.name)) continue;
    out = out.replace(p.re, p.replace);
  }
  return out;
}

function isSensitiveKey(key: string, extra: string[]): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  return [...SENSITIVE_KEYS, ...extra].some((s) => k.includes(s.toLowerCase().replace(/[_-]/g, "")));
}

/**
 * Redact a string or (deeply) an object. Objects are cloned; values under
 * sensitive keys are fully masked, all string values are pattern-scrubbed.
 */
export function redact<T>(input: T, opts: RedactOptions = {}): T {
  const mask = opts.mask ?? "[REDACTED]";
  const maxDepth = opts.maxDepth ?? 8;
  const extraKeys = opts.keys ?? [];

  const walk = (val: unknown, depth: number, keyName?: string): unknown => {
    if (keyName && isSensitiveKey(keyName, extraKeys)) return mask;
    if (typeof val === "string") return redactString(val, opts);
    if (val === null || typeof val !== "object" || depth >= maxDepth) return val;
    if (Array.isArray(val)) return val.map((v) => walk(v, depth + 1));
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) out[k] = walk(v, depth + 1, k);
    return out;
  };

  return walk(input, 0) as T;
}

/** Bind options once and reuse (e.g. as a logger serializer). */
export function createRedactor(opts: RedactOptions = {}) {
  return <T>(input: T): T => redact(input, opts);
}

/** Mask an email like `j•••@example.com`. */
export function maskEmail(email: string): string {
  return email.replace(/^(.)(.*)(@.*)$/, (_m, a, _b, c) => `${a}${MASK}${c}`);
}

/** Keep only the last `keepEnd` characters, mask the rest. */
export function maskString(s: string, keepEnd = 4): string {
  return maskMiddle(s, 0, keepEnd);
}
