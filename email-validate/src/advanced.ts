/**
 * @lacspace/email-validate — advanced (additive) helpers.
 *
 * Stronger RFC-5322 syntax checking (quoted local parts + IP-literal domains),
 * plus email-level convenience wrappers for disposable / role detection.
 *
 * Everything here is zero-dependency, isomorphic and synchronous — NO network.
 */

import { DISPOSABLE_DOMAINS, ROLE_LOCALS } from "./index";

// atext (RFC 5322 §3.2.3) — the atoms allowed in an unquoted (dot-atom) local part.
const ATEXT = "A-Za-z0-9!#$%&'*+/=?^_`{|}~-";
// dot-atom: one-or-more atext labels joined by single dots. The `+(?:\.…)*`
// shape structurally forbids leading/trailing dots AND consecutive dots, and
// keeps the `.` outside every character class so there is no ambiguous overlap
// (ReDoS-safe, same discipline as the core validator).
const DOT_ATOM = new RegExp(`^[${ATEXT}]+(?:\\.[${ATEXT}]+)*$`);

// Quoted-string local part: "..." where the inside is qtext or a quoted-pair
// (backslash-escaped printable). Printable ASCII only — no bare CR/LF/controls.
const QUOTED_LOCAL = /^"(?:[\x20-\x21\x23-\x5B\x5D-\x7E]|\\[\x20-\x7E])*"$/;

// A "real" domain: dot-separated labels ending in an alphabetic or punycode TLD.
// (Same practical shape the core `isValidEmail` requires.)
const DOMAIN_DOT_ATOM =
  /^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+(?:xn--[A-Za-z0-9-]{2,}|[A-Za-z]{2,})$/;

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

// Standard fully-anchored IPv6 grammar (all alternatives fixed-length atoms — no
// catastrophic backtracking). Covers `::` compression and trailing/leading `::`.
const IPV6_RE =
  /^(?:(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,7}:|(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|(?:[0-9a-fA-F]{1,4}:){1,5}(?::[0-9a-fA-F]{1,4}){1,2}|(?:[0-9a-fA-F]{1,4}:){1,4}(?::[0-9a-fA-F]{1,4}){1,3}|(?:[0-9a-fA-F]{1,4}:){1,3}(?::[0-9a-fA-F]{1,4}){1,4}|(?:[0-9a-fA-F]{1,4}:){1,2}(?::[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:(?::[0-9a-fA-F]{1,4}){1,6}|:(?:(?::[0-9a-fA-F]{1,4}){1,7}|:))$/;

/** Options for {@link isValidEmailRFC5322}. Both extensions default ON. */
export interface Rfc5322Options {
  /** Accept quoted-string local parts like `"john doe"@example.com`. Default `true`. */
  allowQuoted?: boolean;
  /** Accept IP-literal domains like `user@[192.168.0.1]` / `user@[IPv6:::1]`. Default `true`. */
  allowIpLiteral?: boolean;
}

/**
 * Split an address into local + domain, honouring a quoted local part (which may
 * legally contain an `@`). Returns `null` if there is no usable `@` boundary.
 */
function splitStrict(email: string): { local: string; domain: string } | null {
  if (email.charCodeAt(0) === 0x22 /* " */) {
    let i = 1;
    while (i < email.length) {
      const c = email.charCodeAt(i);
      if (c === 0x5c /* \ */) {
        i += 2;
        continue;
      }
      if (c === 0x22 /* " */) break;
      i++;
    }
    if (email.charCodeAt(i) !== 0x22) return null; // unterminated quote
    if (email.charCodeAt(i + 1) !== 0x40 /* @ */) return null;
    return { local: email.slice(0, i + 1), domain: email.slice(i + 2) };
  }
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return { local: email.slice(0, at), domain: email.slice(at + 1) };
}

/** Validate an IP-literal domain token (already stripped of its `[` `]`). */
function isIpLiteral(inner: string): boolean {
  if (inner.length === 0) return false;
  if (inner.startsWith("IPv6:")) return IPV6_RE.test(inner.slice(5));
  return IPV4_RE.test(inner);
}

/**
 * Stronger, RFC-5322-oriented syntax check. A **superset** of {@link isValidEmail}:
 * everything the core validator accepts still passes, plus
 *
 * - quoted-string local parts — `"john doe"@example.com`, `"a@b"@example.com`
 * - IP-literal domains — `user@[192.168.0.1]`, `user@[IPv6:2001:db8::1]`
 *
 * while enforcing the RFC length limits (local ≤ 64, domain ≤ 255, whole
 * address ≤ 254) and rejecting consecutive / edge dots in the local part.
 *
 * Purely syntactic — it never touches the network.
 */
export function isValidEmailRFC5322(email: string, opts: Rfc5322Options = {}): boolean {
  if (typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  const parts = splitStrict(trimmed);
  if (!parts) return false;
  const { local, domain } = parts;
  if (local.length === 0 || local.length > 64) return false;
  if (domain.length === 0 || domain.length > 255) return false;

  // --- local part ---
  const quoted = local.charCodeAt(0) === 0x22;
  if (quoted) {
    if (opts.allowQuoted === false) return false;
    if (!QUOTED_LOCAL.test(local)) return false;
  } else if (!DOT_ATOM.test(local)) {
    return false;
  }

  // --- domain part ---
  if (domain.charCodeAt(0) === 0x5b /* [ */) {
    if (opts.allowIpLiteral === false) return false;
    if (domain.charCodeAt(domain.length - 1) !== 0x5d /* ] */) return false;
    return isIpLiteral(domain.slice(1, -1));
  }
  return DOMAIN_DOT_ATOM.test(domain);
}

/**
 * Email-level disposable/throwaway check — pass the WHOLE address (`x@mailinator.com`).
 * Complements the domain-level {@link isDisposable}.
 */
export function isDisposableEmail(email: string, extra?: string[]): boolean {
  if (typeof email !== "string") return false;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const d = email.slice(at + 1).trim().toLowerCase();
  if (d.length === 0) return false;
  if (DISPOSABLE_DOMAINS.has(d)) return true;
  return extra ? extra.map((x) => x.toLowerCase()).includes(d) : false;
}

/**
 * Email-level role-account check — pass the WHOLE address (`info@acme.com`).
 * Complements the local-part-level {@link isRoleAddress}.
 */
export function isRoleAccount(email: string): boolean {
  if (typeof email !== "string") return false;
  const at = email.indexOf("@");
  const local = (at < 0 ? email : email.slice(0, at)).trim().toLowerCase();
  if (local.length === 0) return false;
  // Ignore a +subaddress tag when classifying (info+news@ is still a role box).
  const plus = local.indexOf("+");
  const base = plus > 0 ? local.slice(0, plus) : local;
  return ROLE_LOCALS.has(base);
}
