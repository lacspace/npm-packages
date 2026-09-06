/**
 * Webhook signature verification. Everything uses `node:crypto` HMAC-SHA256 and
 * a timing-safe comparison — no third-party crypto.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Supported signature schemes. */
export type SignatureScheme = "github" | "stripe" | "hmac-sha256";

/** Arguments for {@link verifySignature}. */
export interface VerifyArgs {
  /** The exact raw request body the signature was computed over. */
  rawBody: string | Buffer;
  /** Request headers (case-insensitive lookup; array values use the first entry). */
  headers: Record<string, string | string[] | undefined>;
  /** The shared secret / signing key. */
  secret: string;
  /** For `hmac-sha256`: the header carrying the hex signature (default `X-Signature`). */
  header?: string;
}

/** The result of a verification attempt. */
export interface VerifyResult {
  ok: boolean;
  /** Present when `ok` is false: a short human reason. */
  reason?: string;
}

/** Case-insensitive header lookup returning a single string value. */
function getHeader(headers: VerifyArgs["headers"], name: string): string | undefined {
  const want = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === want) {
      const v = headers[key];
      if (Array.isArray(v)) return v[0];
      return v;
    }
  }
  return undefined;
}

/** Constant-time compare of two hex/ascii strings; never throws on length mismatch. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) {
    // Still spend the work on a same-length compare to avoid an early-out, but
    // the differing length already means "not equal".
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

function hmacHex(secret: string, body: string | Buffer): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Verify a webhook signature for one of the supported schemes.
 *
 * - `github`  — `X-Hub-Signature-256: sha256=<hex>` over the raw body.
 * - `stripe`  — `Stripe-Signature: t=<ts>,v1=<hex>` where the signed payload is `"{t}.{rawBody}"`.
 * - `hmac-sha256` — hex HMAC-SHA256 of the raw body in a configurable header (default `X-Signature`).
 */
export function verifySignature(scheme: SignatureScheme, args: VerifyArgs): VerifyResult {
  const { rawBody, headers, secret } = args;
  if (!secret) return { ok: false, reason: "no secret configured" };

  if (scheme === "github") {
    const header = getHeader(headers, "X-Hub-Signature-256");
    if (!header) return { ok: false, reason: "missing X-Hub-Signature-256 header" };
    const prefix = "sha256=";
    if (!header.startsWith(prefix)) return { ok: false, reason: "malformed signature (expected sha256=…)" };
    const provided = header.slice(prefix.length);
    const expected = hmacHex(secret, rawBody);
    return safeEqual(provided, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
  }

  if (scheme === "stripe") {
    const header = getHeader(headers, "Stripe-Signature");
    if (!header) return { ok: false, reason: "missing Stripe-Signature header" };
    let t: string | undefined;
    const v1: string[] = [];
    for (const part of header.split(",")) {
      const idx = part.indexOf("=");
      if (idx === -1) continue;
      const k = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (k === "t") t = val;
      else if (k === "v1") v1.push(val);
    }
    if (!t) return { ok: false, reason: "missing timestamp (t=)" };
    if (v1.length === 0) return { ok: false, reason: "missing v1 signature" };
    const bodyStr = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const expected = hmacHex(secret, `${t}.${bodyStr}`);
    const match = v1.some((sig) => safeEqual(sig, expected));
    return match ? { ok: true } : { ok: false, reason: "signature mismatch" };
  }

  // hmac-sha256 (generic)
  const headerName = args.header ?? "X-Signature";
  const provided = getHeader(headers, headerName);
  if (!provided) return { ok: false, reason: `missing ${headerName} header` };
  const expected = hmacHex(secret, rawBody);
  return safeEqual(provided, expected) ? { ok: true } : { ok: false, reason: "signature mismatch" };
}
