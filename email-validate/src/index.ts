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
  // Global
  "gmail.com", "googlemail.com", "yahoo.com", "ymail.com", "rocketmail.com",
  "hotmail.com", "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "protonmail.com", "protonmail.ch", "proton.me", "pm.me", "zoho.com", "zohomail.com",
  "gmx.com", "gmx.net", "mail.com", "tutanota.com", "tuta.io", "fastmail.com", "hey.com",
  // Regional Yahoo / Outlook
  "yahoo.co.in", "yahoo.co.uk", "yahoo.co.jp", "yahoo.fr", "yahoo.de", "yahoo.es", "yahoo.it",
  "yahoo.com.br", "yahoo.com.au", "yahoo.ca", "hotmail.co.uk", "hotmail.fr", "hotmail.de",
  "hotmail.it", "hotmail.es", "outlook.fr", "outlook.de", "outlook.jp", "live.co.uk", "live.fr",
  // China
  "qq.com", "foxmail.com", "163.com", "126.com", "yeah.net", "sina.com", "sina.cn", "sohu.com", "aliyun.com",
  // Korea / Japan
  "naver.com", "daum.net", "hanmail.net", "kakao.com", "docomo.ne.jp", "ezweb.ne.jp", "softbank.ne.jp",
  // Russia / CIS
  "yandex.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "list.ru", "inbox.ru", "rambler.ru", "ukr.net",
  // Europe
  "gmx.de", "gmx.at", "gmx.ch", "web.de", "t-online.de", "freenet.de", "orange.fr", "free.fr",
  "laposte.net", "sfr.fr", "wanadoo.fr", "libero.it", "virgilio.it", "seznam.cz", "wp.pl",
  "o2.pl", "interia.pl", "onet.pl", "btinternet.com",
  // South Asia / LatAm / Oceania
  "rediffmail.com", "uol.com.br", "bol.com.br", "terra.com.br", "bigpond.com", "xtra.co.nz",
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
// RFC 6531 (SMTPUTF8) local part: the same atoms, plus any Unicode letter, mark or digit.
const UNICODE_LOCAL_RE = /^[\p{L}\p{M}\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}\p{M}\p{N}!#$%&'*+/=?^_`{|}~-]+)*$/u;
// C0 controls and DEL are never part of an address. A trailing CR/LF that
// survives into a mail header is how header injection starts.
export const CONTROL_CHARS = /[\x00-\x1f\x7f]/;

/**
 * The ASCII (IDNA / punycode) form of a domain: `bücher.example` →
 * `xn--bcher-kva.example`. ASCII input is returned as-is; `null` when the name
 * can't be converted.
 */
export function toAsciiDomain(domain: string): string | null {
  if (!/[^\x00-\x7f]/.test(domain)) return domain;
  if (/[\s/?#@:[\]\\%]/.test(domain) || typeof URL === "undefined") return null;
  // IDNA: no empty labels and no label that starts or ends with a hyphen —
  // punycode would otherwise hide "-bücher" inside a legal-looking "xn---bcher-4ya".
  if (domain.split(".").some((l) => l === "" || l.startsWith("-") || l.endsWith("-"))) return null;
  try {
    return new URL(`http://${domain}/`).hostname || null;
  } catch {
    return null;
  }
}

function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Options for {@link isValidEmail}. */
export interface EmailSyntaxOptions {
  /**
   * Accept internationalised local parts such as `müller@` or `用户@` (RFC 6531).
   * Default `false`: they need an SMTPUTF8-capable mail path end to end.
   * Unicode *domains* are always accepted — they have an ASCII form.
   */
  allowUnicodeLocal?: boolean;
}
// TLD is either an alphabetic label (com, org, …) or an IDN/punycode A-label
// (e.g. `xn--p1ai`). The `.` separator stays outside every character class so
// there is no ambiguous overlap that could cause catastrophic backtracking.
const DOMAIN_RE = /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:xn--[A-Za-z0-9-]{2,}|[A-Za-z]{2,})$/;

export interface ValidationOptions extends EmailSyntaxOptions {
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
export function isValidEmail(email: string, opts: EmailSyntaxOptions = {}): boolean {
  if (typeof email !== "string" || CONTROL_CHARS.test(email)) return false;
  const trimmed = email.trim();
  const parts = splitEmail(trimmed);
  if (!parts) return false;
  const { local } = parts;
  const domain = toAsciiDomain(parts.domain);
  if (domain === null) return false;
  if (local.length === 0 || utf8Length(local) > 64) return false;
  if (domain.length > 253 || utf8Length(local) + 1 + domain.length > 254) return false;
  if (!LOCAL_RE.test(local) && !(opts.allowUnicodeLocal && UNICODE_LOCAL_RE.test(local))) return false;
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

/**
 * Fine-grained controls for {@link normalizeEmail}.
 *
 * Every field is optional and every default reproduces the v1.0 behaviour
 * exactly, so `normalizeEmail(email)` is unchanged — pass options only to relax
 * a rule (e.g. keep a Gmail user's dots, or preserve a `+tag`).
 */
export interface NormalizeOptions {
  /** Strip dots from the Gmail local part (`foo.bar` → `foobar`). Default `true`. */
  gmailRemoveDots?: boolean;
  /** Drop a `+subaddress` tag on Gmail addresses. Default `true`. */
  gmailRemoveSubaddress?: boolean;
  /** Drop a `+subaddress` tag on all other providers. Default `true`. */
  removeSubaddress?: boolean;
  /** Lowercase the local part (the domain is always lowercased). Default `true`. */
  lowercaseLocal?: boolean;
}

/**
 * Canonical form for de-duping users.
 *
 * With defaults (v1.0 behaviour): the domain is lowercased; the local part is
 * lowercased; `+subaddress` tags are dropped; and Gmail / Googlemail addresses
 * additionally have their dots removed and collapse to `@gmail.com`. IDN /
 * Unicode domains are lowercased with the Unicode-aware `toLowerCase()` (no
 * punycode transcoding — see README limitations). Pass {@link NormalizeOptions}
 * to relax any individual rule.
 */
export function normalizeEmail(email: string, opts: NormalizeOptions = {}): string {
  const {
    gmailRemoveDots = true,
    gmailRemoveSubaddress = true,
    removeSubaddress = true,
    lowercaseLocal = true,
  } = opts;
  const parts = splitEmail(email.trim());
  if (!parts) return email.trim().toLowerCase();
  let { local } = parts;
  // One mailbox, one key: bücher.example and xn--bcher-kva.example normalise alike.
  const domain = (toAsciiDomain(parts.domain) ?? parts.domain).toLowerCase();
  if (lowercaseLocal) local = local.toLowerCase();
  if (domain === "gmail.com" || domain === "googlemail.com") {
    if (gmailRemoveSubaddress) local = local.split("+")[0]!;
    if (gmailRemoveDots) local = local.replace(/\./g, "");
    return `${local}@gmail.com`;
  }
  if (removeSubaddress) {
    const plus = local.indexOf("+");
    if (plus > 0) local = local.slice(0, plus);
  }
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
  const original = typeof email === "string" ? email : "";
  const raw = original.trim();
  const parts = splitEmail(raw);

  if (!isValidEmail(original, opts) || !parts) {
    return {
      valid: false,
      normalized: null,
      local: null,
      domain: null,
      disposable: false,
      role: false,
      free: false,
      suggestion: opts.suggestions === false ? null : suggestEmail(raw),
      reason: CONTROL_CHARS.test(original) ? "control characters" : "invalid syntax",
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

// Advanced (additive) helpers: stronger RFC-5322 syntax + email-level wrappers.
export {
  isValidEmailRFC5322,
  isDisposableEmail,
  isRoleAccount,
  type Rfc5322Options,
} from "./advanced";
