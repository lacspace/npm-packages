/**
 * Standard Webhooks (https://www.standardwebhooks.com), the scheme used by
 * Svix, OpenAI, Resend, Clerk, Supabase and others.
 *
 *   signed content  = `${webhook-id}.${webhook-timestamp}.${body}`
 *   webhook-signature = "v1,<base64 HMAC-SHA256>" (space-separated when several)
 *   secret = "whsec_<base64 key>" — the key is the base64-decoded part
 */
import { hmac, toBase64, fromBase64, constantTimeEqual } from "@lacspace/crypto";
import type { WebhookResult } from "./index";

export type StandardSecret = string | Uint8Array;

/** The raw HMAC key: `whsec_…` and bare base64 strings are decoded, bytes pass through. */
export function standardWebhookKey(secret: StandardSecret): Uint8Array {
  if (typeof secret !== "string") return secret;
  return fromBase64(secret.startsWith("whsec_") ? secret.slice(6) : secret);
}

export interface StandardSignOptions {
  secret: StandardSecret;
  /** `webhook-id`: the unique message id. */
  id: string;
  /** `webhook-timestamp` in seconds. Default: now. */
  timestamp?: number;
}

/** `"v1,<base64>"` for one message. */
export async function signStandardWebhook(payload: string, opts: StandardSignOptions): Promise<string> {
  const t = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const mac = await hmac(standardWebhookKey(opts.secret), `${opts.id}.${t}.${payload}`, "SHA-256");
  return `v1,${toBase64(mac)}`;
}

/** The three request headers for one message. */
export async function standardWebhookHeaders(payload: string, opts: StandardSignOptions): Promise<Record<string, string>> {
  const t = opts.timestamp ?? Math.floor(Date.now() / 1000);
  return {
    "webhook-id": opts.id,
    "webhook-timestamp": String(t),
    "webhook-signature": await signStandardWebhook(payload, { ...opts, timestamp: t }),
  };
}

type HeaderBag = Headers | Record<string, string | string[] | undefined | null>;

function header(h: HeaderBag, name: string): string | undefined {
  if (typeof (h as Headers).get === "function") return (h as Headers).get(name) ?? undefined;
  const rec = h as Record<string, string | string[] | undefined | null>;
  const key = Object.keys(rec).find((k) => k.toLowerCase() === name);
  const v = key === undefined ? undefined : rec[key];
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

export interface StandardVerifyOptions {
  secret: StandardSecret;
  /** Allowed clock skew either way, in seconds. Default 300 (the spec's 5 minutes). */
  toleranceSec?: number;
  /** Current time in seconds, for tests. */
  now?: number;
}

/**
 * Verify a Standard Webhooks request. Pass the RAW body and the request headers
 * (a `Headers` object or a plain record; names are case-insensitive).
 * Any one matching `v1` signature is enough, which is how secret rotation works.
 */
export async function verifyStandardWebhook(
  payload: string,
  headers: HeaderBag,
  opts: StandardVerifyOptions,
): Promise<WebhookResult & { id?: string }> {
  const id = header(headers, "webhook-id");
  const ts = header(headers, "webhook-timestamp");
  const sig = header(headers, "webhook-signature");
  if (!id || !ts || !sig) return { valid: false, reason: "no-signature" };
  if (!/^\d+$/.test(ts)) return { valid: false, reason: "bad-format" };
  const t = Number(ts);
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSec ?? 300)) {
    return { valid: false, reason: "timestamp-out-of-tolerance", timestamp: t, id };
  }
  const provided = sig
    .split(" ")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1,"))
    .map((s) => s.slice(3));
  if (!provided.length) return { valid: false, reason: "bad-format", timestamp: t, id };
  let key: Uint8Array;
  try {
    key = standardWebhookKey(opts.secret);
  } catch {
    return { valid: false, reason: "bad-format", timestamp: t, id };
  }
  const expected = toBase64(await hmac(key, `${id}.${t}.${payload}`, "SHA-256"));
  const ok = provided.some((p) => constantTimeEqual(p, expected));
  return ok ? { valid: true, timestamp: t, id } : { valid: false, reason: "bad-signature", timestamp: t, id };
}
