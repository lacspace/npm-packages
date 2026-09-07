/**
 * Ready-made hardened header sets.
 *
 * - `strictPreset()` — maximum hardening: `strict-dynamic` CSP, HSTS with
 *   `preload`, and COOP/COEP/CORP for cross-origin isolation.
 * - `apiPreset()` — a lean set for JSON APIs / non-document endpoints: no
 *   document CSP framing surface, `no-referrer`, deny framing.
 */

import { securityHeaders, type SecurityHeadersOptions } from "./index";
import type { CspDirectives } from "./index";

export interface StrictPresetOptions extends SecurityHeadersOptions {
  /** Per-request nonce; when set, inline scripts/styles use `'nonce-…'` instead of `'unsafe-inline'`. */
  nonce?: string;
  /** Legacy `report-uri` endpoint added to the CSP. */
  reportUri?: string;
  /** `report-to` group name added to the CSP (pair with `reportingEndpoints`/`reportTo`). */
  reportTo?: string;
}

/**
 * A strict, cross-origin-isolated header set: `strict-dynamic` script policy,
 * 2-year HSTS with preload, COOP `same-origin` + COEP `require-corp` + CORP
 * `same-origin`, `DENY` framing and `no-referrer`. Pass a `nonce` to enable
 * inline scripts/styles safely. Extra `SecurityHeadersOptions` override defaults.
 */
export function strictPreset(opts: StrictPresetOptions = {}): Record<string, string> {
  const { nonce, reportUri, reportTo, ...overrides } = opts;
  const nonceSrc = nonce ? [`'nonce-${nonce}'`] : [];
  const cspDirectives: CspDirectives = {
    defaultSrc: ["'self'"],
    baseUri: ["'self'"],
    objectSrc: ["'none'"],
    scriptSrc: ["'self'", "'strict-dynamic'", ...nonceSrc],
    styleSrc: nonce ? ["'self'", ...nonceSrc] : ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "https:", "data:"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
    formAction: ["'self'"],
    upgradeInsecureRequests: true,
    ...(reportUri ? { reportUri: [reportUri] } : {}),
    ...(reportTo ? { reportTo: [reportTo] } : {}),
  };
  return securityHeaders({
    hstsMaxAge: 63072000,
    hstsIncludeSubDomains: true,
    hstsPreload: true,
    frameOptions: "DENY",
    referrerPolicy: "no-referrer",
    crossOriginOpenerPolicy: "same-origin",
    crossOriginEmbedderPolicy: "require-corp",
    crossOriginResourcePolicy: "same-origin",
    contentSecurityPolicy: cspDirectives,
    ...overrides,
  });
}

/**
 * A lean header set for JSON APIs and other non-document endpoints: a locked-down
 * `default-src 'none'` CSP, `DENY` framing, `no-referrer`, and `same-site` CORP.
 * Extra `SecurityHeadersOptions` override the defaults.
 */
export function apiPreset(opts: SecurityHeadersOptions = {}): Record<string, string> {
  return securityHeaders({
    frameOptions: "DENY",
    referrerPolicy: "no-referrer",
    crossOriginResourcePolicy: "same-site",
    contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    ...opts,
  });
}
