/* ------------------------------------------------------------------ *
 * Transaction UUID helper
 *
 * eSewa's `transaction_uuid` must be unique per attempt and stick to a safe
 * charset (letters, digits and hyphens — anything URL/form-unsafe risks a
 * signature mismatch or a rejected form). `generateTransactionUuid` mints one
 * with a CSPRNG (Web Crypto `getRandomValues`), no dependency, isomorphic.
 * ------------------------------------------------------------------ */

/** Allowed characters for an eSewa `transaction_uuid` (unreserved, sign-safe). */
const UUID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * `true` if `uuid` is a well-formed eSewa `transaction_uuid`: 1–64 chars, only
 * ASCII letters, digits and single hyphens (not leading/trailing/doubled). Pure.
 */
export function isValidTransactionUuid(uuid: string): boolean {
  return typeof uuid === "string" && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(uuid) && uuid.length <= 64;
}

/**
 * Generate a valid, unique eSewa `transaction_uuid` using the platform CSPRNG.
 * The result is `[A-Za-z0-9]` with an optional caller `prefix` joined by a
 * hyphen, and always passes {@link isValidTransactionUuid}.
 *
 * @param opts.length   number of random chars (default 20, clamped to 1–63).
 * @param opts.prefix   optional prefix (e.g. an order id); stripped to the safe
 *                      charset. The final length still respects the 64-char cap.
 *
 * @example
 * generateTransactionUuid();               // "k3Zq9RtA1bVn7cPmLxQw"
 * generateTransactionUuid({ prefix: "240" }); // "240-Xq7…"
 */
export function generateTransactionUuid(opts?: { length?: number; prefix?: string }): string {
  const getRandom = globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
  if (!getRandom) {
    throw new Error("@lacspace/esewa: Web Crypto (globalThis.crypto.getRandomValues) is unavailable in this runtime.");
  }

  const rawPrefix = (opts?.prefix ?? "").replace(/[^A-Za-z0-9]/g, "");
  const reserved = rawPrefix ? rawPrefix.length + 1 : 0; // +1 for the hyphen
  const want = opts?.length ?? 20;
  const length = Math.max(1, Math.min(want, 63 - reserved));

  const bytes = new Uint8Array(length);
  getRandom(bytes);
  let random = "";
  for (let i = 0; i < length; i++) {
    random += UUID_ALPHABET[bytes[i]! % UUID_ALPHABET.length];
  }

  return rawPrefix ? `${rawPrefix}-${random}` : random;
}
