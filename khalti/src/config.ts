/**
 * Config presets — sandbox vs production base URLs and an auth-header builder.
 *
 * These are additive conveniences that mirror {@link KHALTI_BASE_URLS} from the
 * main module (byte-for-byte the same values) so callers who prefer named
 * constants, or who build the request themselves, don't have to hard-code URLs
 * or the `Key <secret>` header shape.
 */

/** Khalti **sandbox** (test) base URL — `a.khalti.com`. Same value as `KHALTI_BASE_URLS.test`. */
export const KHALTI_SANDBOX_BASE_URL = "https://a.khalti.com/api/v2";

/** Khalti **production** base URL — `khalti.com`. Same value as `KHALTI_BASE_URLS.prod`. */
export const KHALTI_PRODUCTION_BASE_URL = "https://khalti.com/api/v2";

/**
 * Build the server-side authorization header Khalti expects:
 * `{ Authorization: "Key <secretKey>" }`.
 *
 * @example
 * const headers = { ...buildAuthHeader(secret), "Content-Type": "application/json" };
 */
export function buildAuthHeader(secretKey: string): { Authorization: string } {
  return { Authorization: `Key ${secretKey}` };
}

/**
 * Resolve a base URL for a preset name. `"sandbox"`/`"test"` → sandbox,
 * `"production"`/`"prod"` → production. Purely a convenience over the two
 * constants above.
 */
export function baseUrlFor(preset: "sandbox" | "test" | "production" | "prod"): string {
  return preset === "production" || preset === "prod"
    ? KHALTI_PRODUCTION_BASE_URL
    : KHALTI_SANDBOX_BASE_URL;
}
