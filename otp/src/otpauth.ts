/**
 * otpauth:// URI parser — the inverse of `keyuri`.
 *
 * Reads the standard Key URI Format shared by Google Authenticator, Authy,
 * 1Password, etc., so you can import a secret a user pastes/scans back in.
 * Pure string work — no crypto, no network — so it runs anywhere `keyuri` does.
 */

import type { OtpAlgorithm } from "./index";

export interface ParsedOtpauthUri {
  /** `totp` (time-based) or `hotp` (counter-based). */
  type: "totp" | "hotp";
  /** Account label (issuer prefix stripped), e.g. the user's email. */
  label: string;
  /** Issuer / app name, if present. */
  issuer?: string;
  /** Base32 shared secret. */
  secret: string;
  /** Normalised HMAC hash — always `SHA-1` | `SHA-256` | `SHA-512`. */
  algorithm: OtpAlgorithm;
  /** Number of digits in the code. */
  digits: number;
  /** Time step in seconds (totp only). */
  period?: number;
  /** Moving counter (hotp only). */
  counter?: number;
}

function normalizeAlgorithm(raw: string | null): OtpAlgorithm {
  const v = (raw ?? "SHA1").toUpperCase().replace(/-/g, "");
  if (v === "SHA256") return "SHA-256";
  if (v === "SHA512") return "SHA-512";
  if (v === "SHA1") return "SHA-1";
  throw new Error(`unsupported otpauth algorithm "${raw}"`);
}

/**
 * Parse an `otpauth://` provisioning URI into its parts. Throws if the URI is
 * not a valid `otpauth://totp|hotp/...` string with a `secret`. Round-trips
 * with {@link keyuri}.
 */
export function parseOtpauthUri(uri: string): ParsedOtpauthUri {
  const trimmed = String(uri).trim();
  const m = /^otpauth:\/\/(totp|hotp)\/([^?]*)(?:\?(.*))?$/i.exec(trimmed);
  if (!m) throw new Error("not an otpauth:// URI");
  const type = m[1]!.toLowerCase() as "totp" | "hotp";

  let label = decodeURIComponent(m[2] ?? "");
  const params = new URLSearchParams(m[3] ?? "");

  let issuer = params.get("issuer") ?? undefined;
  // Label may carry an "Issuer:account" prefix.
  const colon = label.indexOf(":");
  if (colon !== -1) {
    const prefix = label.slice(0, colon).trim();
    label = label.slice(colon + 1).trim();
    if (!issuer && prefix) issuer = prefix;
  }

  const secret = params.get("secret");
  if (!secret) throw new Error("otpauth:// URI is missing its secret");

  const out: ParsedOtpauthUri = {
    type,
    label,
    issuer,
    secret,
    algorithm: normalizeAlgorithm(params.get("algorithm")),
    digits: params.has("digits") ? Number(params.get("digits")) : 6,
  };
  if (type === "totp") out.period = params.has("period") ? Number(params.get("period")) : 30;
  if (type === "hotp") out.counter = params.has("counter") ? Number(params.get("counter")) : 0;
  return out;
}
