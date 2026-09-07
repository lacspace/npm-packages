/**
 * Breach check via k-anonymity against the HaveIBeenPwned range API.
 *
 * We SHA-1 the password, send only the first 5 hex chars of the digest to the
 * range endpoint, and match the remaining suffix locally — the full hash (and
 * therefore the password) never leaves the process. Opt-in, and the network
 * call goes through an INJECTABLE `fetchImpl` so tests never touch the wire.
 *
 * Zero dependencies · isomorphic (Web Crypto SHA-1).
 */

/** A minimal `fetch`-shaped function — only what the range lookup needs. */
export type FetchImpl = (
  url: string,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export interface IsPwnedOptions {
  /**
   * Injectable `fetch` implementation. Defaults to the global `fetch` when
   * available. Always inject a fake in tests so no real request is made.
   */
  fetchImpl?: FetchImpl;
  /** Base URL of the range API (override for a mirror). No trailing slash. */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.pwnedpasswords.com/range";

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", data);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i]!.toString(16).padStart(2, "0");
  return hex.toUpperCase();
}

/**
 * Check whether a password appears in a known breach corpus, using
 * k-anonymity. Returns the number of times it was seen (`0` = not found).
 *
 * ```ts
 * const count = await isPwned("password123", { fetchImpl });
 * if (count > 0) reject("This password has appeared in data breaches.");
 * ```
 *
 * @throws if no `fetchImpl` is supplied and no global `fetch` is available.
 */
export async function isPwned(password: string, opts: IsPwnedOptions = {}): Promise<number> {
  if (!password) return 0;
  const fetchImpl =
    opts.fetchImpl ?? (typeof fetch !== "undefined" ? (fetch as unknown as FetchImpl) : undefined);
  if (!fetchImpl) {
    throw new Error("isPwned requires a fetchImpl (no global fetch available)");
  }
  const base = opts.baseUrl ?? DEFAULT_BASE_URL;

  const digest = await sha1Hex(password);
  const prefix = digest.slice(0, 5);
  const suffix = digest.slice(5);

  const res = await fetchImpl(`${base}/${prefix}`);
  if (!res.ok) throw new Error(`breach range request failed: HTTP ${res.status}`);
  const body = await res.text();

  for (const line of body.split(/\r?\n/)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const lineSuffix = line.slice(0, idx).trim().toUpperCase();
    if (lineSuffix === suffix) {
      const count = parseInt(line.slice(idx + 1).trim(), 10);
      return Number.isFinite(count) ? count : 1;
    }
  }
  return 0;
}
