/**
 * Webhook signature verification. Everything uses `node:crypto` HMAC and a
 * timing-safe comparison — no third-party crypto.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Supported signature schemes.
 *
 * - `github`      — `X-Hub-Signature-256: sha256=<hex>` over the raw body.
 * - `stripe`      — `Stripe-Signature: t=<ts>,v1=<hex>`; signed payload is `"{t}.{body}"`.
 * - `hmac-sha256` — hex HMAC-SHA256 of the body in a configurable header (default `X-Signature`).
 * - `shopify`     — `X-Shopify-Hmac-Sha256: <base64>` HMAC-SHA256 of the body.
 * - `slack`       — `X-Slack-Signature: v0=<hex>`; signed payload is `"v0:{ts}:{body}"`.
 * - `svix`        — Svix / Resend / Clerk; `svix-id`/`svix-timestamp`/`svix-signature`,
 *                   base64 secret, signed payload `"{id}.{ts}.{body}"`.
 * - `sha1`        — legacy hex HMAC-SHA1 in a configurable header (default `X-Hub-Signature`).
 * - `paypal`      — documented but NOT verifiable offline (certificate-based).
 * - `auto`        — infer the scheme from the incoming headers.
 */
export type SignatureScheme =
  | "github"
  | "stripe"
  | "hmac-sha256"
  | "shopify"
  | "slack"
  | "svix"
  | "sha1"
  | "paypal"
  | "auto";

/** The concrete schemes `auto` can resolve to (everything except `auto`). */
export type ConcreteScheme = Exclude<SignatureScheme, "auto">;

/** Arguments for {@link verifySignature}. */
export interface VerifyArgs {
  /** The exact raw request body the signature was computed over. */
  rawBody: string | Buffer;
  /** Request headers (case-insensitive lookup; array values use the first entry). */
  headers: Record<string, string | string[] | undefined>;
  /** The shared secret / signing key. */
  secret: string;
  /** For `hmac-sha256`/`sha1`: the header carrying the signature (defaults per scheme). */
  header?: string;
}

/** The result of a verification attempt. */
export interface VerifyResult {
  ok: boolean;
  /** Present when `ok` is false: a short human reason. */
  reason?: string;
  /** The scheme actually used (useful when `auto` resolves one). */
  scheme?: ConcreteScheme;
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

/** Whether a header is present at all (case-insensitive). */
function hasHeader(headers: VerifyArgs["headers"], name: string): boolean {
  return getHeader(headers, name) !== undefined;
}

/** Constant-time compare of two ascii strings; never throws on length mismatch. */
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

function hmacHex(secret: string | Buffer, body: string | Buffer, algo = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("hex");
}

function hmacB64(secret: string | Buffer, body: string | Buffer, algo = "sha256"): string {
  return createHmac(algo, secret).update(body).digest("base64");
}

/**
 * Infer the signature scheme from the request headers. Returns `undefined`
 * when no known signature header is present.
 */
export function detectScheme(headers: VerifyArgs["headers"], customHeader?: string): ConcreteScheme | undefined {
  if (hasHeader(headers, "X-Hub-Signature-256")) return "github";
  if (hasHeader(headers, "Stripe-Signature")) return "stripe";
  if (hasHeader(headers, "X-Shopify-Hmac-Sha256")) return "shopify";
  if (hasHeader(headers, "X-Slack-Signature")) return "slack";
  if (hasHeader(headers, "svix-signature") || hasHeader(headers, "webhook-signature")) return "svix";
  if (hasHeader(headers, "Paypal-Transmission-Sig")) return "paypal";
  if (hasHeader(headers, "X-Hub-Signature")) return "sha1";
  if (customHeader && hasHeader(headers, customHeader)) return "hmac-sha256";
  if (hasHeader(headers, "X-Signature")) return "hmac-sha256";
  return undefined;
}

function verifyGithub(args: VerifyArgs): VerifyResult {
  const header = getHeader(args.headers, "X-Hub-Signature-256");
  if (!header) return fail("missing X-Hub-Signature-256 header", "github");
  const prefix = "sha256=";
  if (!header.startsWith(prefix)) return fail("malformed signature (expected sha256=…)", "github");
  const provided = header.slice(prefix.length);
  const expected = hmacHex(args.secret, args.rawBody);
  return safeEqual(provided, expected) ? okResult("github") : fail("signature mismatch", "github");
}

function verifyStripe(args: VerifyArgs): VerifyResult {
  const header = getHeader(args.headers, "Stripe-Signature");
  if (!header) return fail("missing Stripe-Signature header", "stripe");
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
  if (!t) return fail("missing timestamp (t=)", "stripe");
  if (v1.length === 0) return fail("missing v1 signature", "stripe");
  const bodyStr = toStr(args.rawBody);
  const expected = hmacHex(args.secret, `${t}.${bodyStr}`);
  return v1.some((sig) => safeEqual(sig, expected)) ? okResult("stripe") : fail("signature mismatch", "stripe");
}

function verifyShopify(args: VerifyArgs): VerifyResult {
  const header = getHeader(args.headers, "X-Shopify-Hmac-Sha256");
  if (!header) return fail("missing X-Shopify-Hmac-Sha256 header", "shopify");
  const expected = hmacB64(args.secret, args.rawBody);
  return safeEqual(header.trim(), expected) ? okResult("shopify") : fail("signature mismatch", "shopify");
}

function verifySlack(args: VerifyArgs): VerifyResult {
  const header = getHeader(args.headers, "X-Slack-Signature");
  if (!header) return fail("missing X-Slack-Signature header", "slack");
  const ts = getHeader(args.headers, "X-Slack-Request-Timestamp");
  if (!ts) return fail("missing X-Slack-Request-Timestamp header", "slack");
  const prefix = "v0=";
  if (!header.startsWith(prefix)) return fail("malformed signature (expected v0=…)", "slack");
  const provided = header.slice(prefix.length);
  const base = `v0:${ts}:${toStr(args.rawBody)}`;
  const expected = hmacHex(args.secret, base);
  return safeEqual(provided, expected) ? okResult("slack") : fail("signature mismatch", "slack");
}

function verifySvix(args: VerifyArgs): VerifyResult {
  const id = getHeader(args.headers, "svix-id") ?? getHeader(args.headers, "webhook-id");
  const ts = getHeader(args.headers, "svix-timestamp") ?? getHeader(args.headers, "webhook-timestamp");
  const sigHeader = getHeader(args.headers, "svix-signature") ?? getHeader(args.headers, "webhook-signature");
  if (!id) return fail("missing svix-id header", "svix");
  if (!ts) return fail("missing svix-timestamp header", "svix");
  if (!sigHeader) return fail("missing svix-signature header", "svix");
  // Secret is base64, usually prefixed `whsec_`.
  const raw = args.secret.startsWith("whsec_") ? args.secret.slice("whsec_".length) : args.secret;
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    return fail("secret is not valid base64", "svix");
  }
  const base = `${id}.${ts}.${toStr(args.rawBody)}`;
  const expected = hmacB64(key, base);
  // Header is space-separated `v1,<base64>` (versioned) entries.
  const provided = sigHeader.split(" ").map((p) => {
    const comma = p.indexOf(",");
    return comma === -1 ? p : p.slice(comma + 1);
  });
  return provided.some((sig) => safeEqual(sig, expected)) ? okResult("svix") : fail("signature mismatch", "svix");
}

function verifySha1(args: VerifyArgs): VerifyResult {
  const headerName = args.header ?? "X-Hub-Signature";
  const raw = getHeader(args.headers, headerName);
  if (!raw) return fail(`missing ${headerName} header`, "sha1");
  const provided = raw.startsWith("sha1=") ? raw.slice("sha1=".length) : raw;
  const expected = hmacHex(args.secret, args.rawBody, "sha1");
  return safeEqual(provided, expected) ? okResult("sha1") : fail("signature mismatch", "sha1");
}

function verifyHmac(args: VerifyArgs): VerifyResult {
  const headerName = args.header ?? "X-Signature";
  const raw = getHeader(args.headers, headerName);
  if (!raw) return fail(`missing ${headerName} header`, "hmac-sha256");
  const provided = raw.startsWith("sha256=") ? raw.slice("sha256=".length) : raw;
  const expected = hmacHex(args.secret, args.rawBody);
  return safeEqual(provided, expected) ? okResult("hmac-sha256") : fail("signature mismatch", "hmac-sha256");
}

function toStr(body: string | Buffer): string {
  return typeof body === "string" ? body : body.toString("utf8");
}
function okResult(scheme: ConcreteScheme): VerifyResult {
  return { ok: true, scheme };
}
function fail(reason: string, scheme: ConcreteScheme): VerifyResult {
  return { ok: false, reason, scheme };
}

/**
 * Verify a webhook signature for one of the supported schemes. Pass `"auto"`
 * to infer the scheme from the request headers.
 */
export function verifySignature(scheme: SignatureScheme, args: VerifyArgs): VerifyResult {
  if (scheme === "auto") {
    const detected = detectScheme(args.headers, args.header);
    if (!detected) return { ok: false, reason: "could not detect a known signature header" };
    return verifySignature(detected, args);
  }

  if (scheme === "paypal") {
    return {
      ok: false,
      reason: "paypal signatures are certificate-based and cannot be verified offline (use PayPal's verify-webhook-signature API)",
      scheme: "paypal",
    };
  }

  if (!args.secret) return { ok: false, reason: "no secret configured", scheme };

  switch (scheme) {
    case "github": return verifyGithub(args);
    case "stripe": return verifyStripe(args);
    case "shopify": return verifyShopify(args);
    case "slack": return verifySlack(args);
    case "svix": return verifySvix(args);
    case "sha1": return verifySha1(args);
    case "hmac-sha256": return verifyHmac(args);
    default: return { ok: false, reason: `unknown scheme "${String(scheme)}"` };
  }
}
