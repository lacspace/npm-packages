/**
 * @lacspace/email-validate
 * Smart email validation — beyond a regex.
 *
 * Syntax + disposable/temp-mail detection, role-address detection, free-provider
 * flags, Gmail normalization and "did you mean?" typo suggestions.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

/** Common free/consumer email providers. */
export const FREE_PROVIDERS: Set<string> = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "yahoo.co.uk",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com",
  "aol.com", "protonmail.com", "proton.me", "zoho.com", "gmx.com", "gmx.net",
  "yandex.com", "yandex.ru", "mail.com", "mail.ru", "rediffmail.com",
]);

/** Well-known disposable / temporary-mail domains. Extend via {@link validateEmail} options. */
export const DISPOSABLE_DOMAINS: Set<string> = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "grr.la",
  "10minutemail.com", "10minutemail.net", "tempmail.com", "temp-mail.org",
  "throwawaymail.com", "yopmail.com", "yopmail.fr", "getnada.com", "nada.email",
  "trashmail.com", "trashmail.de", "sharklasers.com", "spam4.me", "dispostable.com",
  "maildrop.cc", "mailnesia.com", "mohmal.com", "fakeinbox.com", "tempinbox.com",
  "mintemail.com", "mytemp.email", "emailondeck.com", "burnermail.io", "33mail.com",
  "spamgourmet.com", "tempr.email", "discard.email", "mailcatch.com", "inboxbear.com",
  "tempmailo.com", "temp-mail.io", "1secmail.com", "moakt.com", "tmpmail.org",
  "guerrillamailblock.com", "pokemail.net", "spambog.com", "einrot.com",
]);

/** Local-parts that indicate a shared/role mailbox rather than a person. */
export const ROLE_LOCALS: Set<string> = new Set([
  "admin", "administrator", "info", "support", "sales", "contact", "help",
  "no-reply", "noreply", "donotreply", "do-not-reply", "postmaster", "webmaster",
  "abuse", "billing", "hr", "jobs", "careers", "marketing", "team", "hello",
  "office", "enquiry", "enquiries", "service", "root", "security", "privacy",
]);

/** Popular domains used for typo suggestions. */
const COMMON_DOMAINS = [
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "live.com", "icloud.com", "aol.com", "protonmail.com", "zoho.com",
  "yandex.com", "mail.com", "msn.com",
];

// Pragmatic RFC-5321-ish address grammar (no comments/quoted-strings; good for real-world use).
const LOCAL_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
// TLD is either an alphabetic label (com, org, …) or an IDN/punycode A-label
// (e.g. `xn--p1ai`). The `.` separator stays outside every character class so
// there is no ambiguous overlap that could cause catastrophic backtracking.
const DOMAIN_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:xn--[A-Za-z0-9-]{2,}|[A-Za-z]{2,})$/;

export interface ValidationOptions {
  /** Extra disposable domains to treat as disposable. */
  extraDisposable?: string[];
  /** Turn off "did you mean?" suggestions. */
  suggestions?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  /** Lowercased address; for Gmail, dots and +tags stripped. `null` if invalid. */
  normalized: string | null;
  local: string | null;
  domain: string | null;
  disposable: boolean;
  /** A shared/role mailbox (info@, admin@, …). */
  role: boolean;
  /** A free consumer provider (gmail, yahoo, …). */
  free: boolean;
  /** A likely-correct address if a typo was detected, else `null`. */
  suggestion: string | null;
  /** Why it failed, when `valid` is false. */
  reason?: string;
}

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Fast boolean syntax + structure check. */
export function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  const parts = splitEmail(trimmed);
  if (!parts) return false;
  const { local, domain } = parts;
  if (local.length > 64 || local.length === 0) return false;
  if (domain.length > 253) return false;
  if (!LOCAL_RE.test(local)) return false;
  if (!DOMAIN_RE.test(domain)) return false;
  return true;
}

export function isDisposable(domain: string, extra?: string[]): boolean {
  const d = domain.toLowerCase();
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  return extra ? extra.map((x) => x.toLowerCase()).includes(d) : false;
}

export function isRoleAddress(local: string): boolean {
  return ROLE_LOCALS.has(local.toLowerCase());
}

export function isFreeProvider(domain: string): boolean {
  return FREE_PROVIDERS.has(domain.toLowerCase());
}

/** Canonical form: lowercased; Gmail addresses get dots + `+tags` removed. */
export function normalizeEmail(email: string): string {
  const parts = splitEmail(email.trim());
  if (!parts) return email.trim().toLowerCase();
  let { local } = parts;
  const domain = parts.domain.toLowerCase();
  local = local.toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+")[0]!.replace(/\./g, "");
    return `${local}@gmail.com`;
  }
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  return `${local}@${domain}`;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** Suggest a corrected address when the domain looks like a typo of a common one. */
export function suggestEmail(email: string): string | null {
  const parts = splitEmail(email.trim().toLowerCase());
  if (!parts) return null;
  const { local, domain } = parts;
  if (COMMON_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const candidate of COMMON_DOMAINS) {
    const dist = levenshtein(domain, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  // Only suggest for close typos, and never "correct" a longer legit domain.
  if (best && bestDist > 0 && bestDist <= 2 && Math.abs(domain.length - best.length) <= 2) {
    return `${local}@${best}`;
  }
  return null;
}

/** Full analysis of an email address. */
export function validateEmail(email: string, opts: ValidationOptions = {}): ValidationResult {
  const raw = typeof email === "string" ? email.trim() : "";
  const parts = splitEmail(raw);

  if (!isValidEmail(raw) || !parts) {
    return {
      valid: false,
      normalized: null,
      local: null,
      domain: null,
      disposable: false,
      role: false,
      free: false,
      suggestion: opts.suggestions === false ? null : suggestEmail(raw),
      reason: "invalid syntax",
    };
  }

  const local = parts.local;
  const domain = parts.domain.toLowerCase();
  return {
    valid: true,
    normalized: normalizeEmail(raw),
    local,
    domain,
    disposable: isDisposable(domain, opts.extraDisposable),
    role: isRoleAddress(local),
    free: isFreeProvider(domain),
    suggestion: opts.suggestions === false ? null : suggestEmail(raw),
  };
}
