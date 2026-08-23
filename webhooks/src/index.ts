/**
 * @lacspace/webhooks
 *
 * The webhook toolkit every backend re-implements — both directions:
 *
 *   • SEND    — sign outgoing webhooks and deliver them with retries & backoff
 *   • RECEIVE — verify incoming webhooks (timing-safe, replay-protected),
 *               with ready-made presets for Stripe, GitHub and Shopify
 *   • IDEMPOTENCY — event ids + a dedupe store so you never process twice
 *
 * Built on @lacspace/crypto (Web Crypto HMAC) — never hand-rolled. Isomorphic:
 * Node, edge runtimes and browsers.
 */
import { hmac, toHex, constantTimeEqual, randomBytes } from "@lacspace/crypto";

export type SignAlgorithm = "SHA-256" | "SHA-384" | "SHA-512";
export type Secret = string | Uint8Array;

const nowSec = (): number => Math.floor(Date.now() / 1000);

/* ------------------------------------------------------------------ *
 * Signing (outbound)
 * ------------------------------------------------------------------ */

export interface SignOptions {
  secret: Secret;
  /** Unix timestamp (seconds) baked into the signature. Default: now. */
  timestamp?: number;
  algorithm?: SignAlgorithm;
}

/**
 * Produce a signature header value for a payload, in the widely-used
 * `t=<unix>,v1=<hex>` scheme (same construction as Stripe): the HMAC is taken
 * over `"<timestamp>.<payload>"`, which binds the signature to a moment in time
 * and blocks replay.
 *
 * @example
 * const sig = await sign(rawBody, { secret }); // "t=1699999999,v1=ab34…"
 */
export async function sign(payload: string, opts: SignOptions): Promise<string> {
  const t = opts.timestamp ?? nowSec();
  const mac = toHex(await hmac(opts.secret, `${t}.${payload}`, opts.algorithm ?? "SHA-256"));
  return `t=${t},v1=${mac}`;
}

/**
 * Ready-to-spread headers for an outgoing webhook request: the signature,
 * a timestamp, a unique id and `content-type: application/json`.
 */
export async function signHeaders(
  payload: string,
  opts: SignOptions & { id?: string; signatureHeader?: string },
): Promise<Record<string, string>> {
  const t = opts.timestamp ?? nowSec();
  const signature = await sign(payload, { ...opts, timestamp: t });
  return {
    "content-type": "application/json",
    [opts.signatureHeader ?? "webhook-signature"]: signature,
    "webhook-timestamp": String(t),
    "webhook-id": opts.id ?? newId(),
  };
}

/* ------------------------------------------------------------------ *
 * Verifying (inbound)
 * ------------------------------------------------------------------ */

export type WebhookFailReason =
  | "no-signature"
  | "bad-format"
  | "bad-signature"
  | "timestamp-out-of-tolerance";

export interface WebhookResult {
  valid: boolean;
  reason?: WebhookFailReason;
  /** Parsed timestamp (seconds), when the scheme carries one. */
  timestamp?: number;
}

export interface VerifyOptions {
  secret: Secret;
  /** Max age of the timestamp in seconds (replay protection). Default 300. */
  toleranceSec?: number;
  algorithm?: SignAlgorithm;
  /** Override "now" (Unix seconds) — for deterministic tests. */
  now?: number;
}

/**
 * Verify a `t=<unix>,v1=<hex>` signature (the format from {@link sign}, and the
 * one Stripe uses). Timing-safe and replay-protected. Never throws.
 *
 * @example
 * const r = await verify(rawBody, req.headers["webhook-signature"], { secret });
 * if (!r.valid) return new Response("bad signature", { status: 400 });
 */
export async function verify(
  payload: string,
  signatureHeader: string | null | undefined,
  opts: VerifyOptions,
): Promise<WebhookResult> {
  if (!signatureHeader) return { valid: false, reason: "no-signature" };

  let t: number | undefined;
  const sigs: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k === "t") t = Number(v);
    else if (k === "v1") sigs.push(v);
  }
  if (t === undefined || !Number.isFinite(t) || sigs.length === 0) return { valid: false, reason: "bad-format" };

  const tolerance = opts.toleranceSec ?? 300;
  if (Math.abs((opts.now ?? nowSec()) - t) > tolerance) {
    return { valid: false, reason: "timestamp-out-of-tolerance", timestamp: t };
  }

  const expected = toHex(await hmac(opts.secret, `${t}.${payload}`, opts.algorithm ?? "SHA-256"));
  const ok = sigs.some((s) => constantTimeEqual(s, expected));
  return ok ? { valid: true, timestamp: t } : { valid: false, reason: "bad-signature", timestamp: t };
}

/** Convenience: `true` iff the webhook signature is valid. */
export async function isValid(
  payload: string,
  signatureHeader: string | null | undefined,
  opts: VerifyOptions,
): Promise<boolean> {
  return (await verify(payload, signatureHeader, opts)).valid;
}

/* ------------------------------------------------------------------ *
 * Provider presets (inbound)
 * ------------------------------------------------------------------ */

/** Verify a Stripe webhook (`Stripe-Signature: t=…,v1=…`). */
export async function verifyStripe(
  payload: string,
  stripeSignature: string | null | undefined,
  opts: VerifyOptions,
): Promise<WebhookResult> {
  return verify(payload, stripeSignature, opts);
}

/** Verify a GitHub webhook (`X-Hub-Signature-256: sha256=<hex>`, no timestamp). */
export async function verifyGitHub(
  payload: string,
  xHubSignature256: string | null | undefined,
  opts: { secret: Secret },
): Promise<WebhookResult> {
  if (!xHubSignature256) return { valid: false, reason: "no-signature" };
  const m = /^sha256=([0-9a-f]+)$/i.exec(xHubSignature256.trim());
  if (!m) return { valid: false, reason: "bad-format" };
  const expected = toHex(await hmac(opts.secret, payload, "SHA-256"));
  return constantTimeEqual(m[1]!.toLowerCase(), expected)
    ? { valid: true }
    : { valid: false, reason: "bad-signature" };
}

/** Verify a Shopify webhook (`X-Shopify-Hmac-Sha256: <base64>`, no timestamp). */
export async function verifyShopify(
  payload: string,
  hmacHeader: string | null | undefined,
  opts: { secret: Secret },
): Promise<WebhookResult> {
  if (!hmacHeader) return { valid: false, reason: "no-signature" };
  let provided: Uint8Array;
  try {
    provided = base64ToBytes(hmacHeader.trim());
  } catch {
    return { valid: false, reason: "bad-format" };
  }
  const expected = await hmac(opts.secret, payload, "SHA-256");
  return constantTimeEqual(provided, expected)
    ? { valid: true }
    : { valid: false, reason: "bad-signature" };
}

/* ------------------------------------------------------------------ *
 * Delivery (outbound, with retries)
 * ------------------------------------------------------------------ */

type FetchLike = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number }>;

export interface DeliverOptions {
  /** Signing secret — when set, signature headers are attached automatically. */
  secret?: Secret;
  algorithm?: SignAlgorithm;
  /** Retry attempts after the first try. Default 4. */
  retries?: number;
  /** Base backoff in ms (doubles each attempt, with jitter). Default 500. */
  backoffMs?: number;
  /** Cap on backoff in ms. Default 30_000. */
  maxBackoffMs?: number;
  /** Per-attempt timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Extra headers merged into the request. */
  headers?: Record<string, string>;
  /** Idempotency key sent as `idempotency-key`. Auto-generated when omitted. */
  idempotencyKey?: string;
  /** Event id sent as `webhook-id`. Auto-generated when omitted. */
  id?: string;
  /** Override fetch (for tests / custom agents). */
  fetchImpl?: FetchLike;
  /** Deterministic sleep (ms) — for tests. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Retry on these HTTP statuses (in addition to network errors). Default 408,425,429,>=500. */
  retryStatuses?: (status: number) => boolean;
}

export interface DeliverResult {
  ok: boolean;
  status?: number;
  attempts: number;
  error?: string;
  idempotencyKey: string;
  id: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const shouldRetryStatus = (s: number): boolean => s === 408 || s === 425 || s === 429 || s >= 500;

/**
 * POST a webhook with automatic signing, retries and exponential backoff (full
 * jitter). Retries on network errors and retryable statuses (408/425/429/5xx).
 *
 * @example
 * const r = await deliver("https://client.app/webhooks", event, { secret });
 * if (!r.ok) log.warn("delivery failed after", r.attempts, "tries");
 */
export async function deliver(url: string, payload: unknown, opts: DeliverOptions = {}): Promise<DeliverResult> {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const id = opts.id ?? newId();
  const idempotencyKey = opts.idempotencyKey ?? newId("idem");
  const retries = opts.retries ?? 4;
  const base = opts.backoffMs ?? 500;
  const maxBackoff = opts.maxBackoffMs ?? 30_000;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const doFetch = opts.fetchImpl ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike);
  const sleep = opts.sleepImpl ?? defaultSleep;
  const retryStatus = opts.retryStatuses ?? shouldRetryStatus;
  if (!doFetch) throw new Error("No fetch implementation available; pass opts.fetchImpl.");

  const t = nowSec();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "webhook-id": id,
    "webhook-timestamp": String(t),
    "idempotency-key": idempotencyKey,
    ...opts.headers,
  };
  if (opts.secret) headers["webhook-signature"] = await sign(body, { secret: opts.secret, timestamp: t, algorithm: opts.algorithm });

  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (let i = 0; i <= retries; i++) {
    attempts++;
    let signal: AbortSignal | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (typeof AbortController !== "undefined") {
      const ac = new AbortController();
      signal = ac.signal;
      timer = setTimeout(() => ac.abort(), timeoutMs);
    }
    try {
      const res = await doFetch(url, { method: "POST", headers, body, signal });
      if (timer) clearTimeout(timer);
      lastStatus = res.status;
      if (res.ok) return { ok: true, status: res.status, attempts, idempotencyKey, id };
      if (!retryStatus(res.status) || i === retries) {
        return { ok: false, status: res.status, attempts, idempotencyKey, id, error: `HTTP ${res.status}` };
      }
    } catch (err) {
      if (timer) clearTimeout(timer);
      lastError = err instanceof Error ? err.message : String(err);
      if (i === retries) break;
    }
    // exponential backoff with full jitter
    const cap = Math.min(maxBackoff, base * 2 ** i);
    await sleep(Math.floor(jitter() * cap));
  }
  return { ok: false, status: lastStatus, attempts, idempotencyKey, id, error: lastError ?? `HTTP ${lastStatus}` };
}

// Deterministic-friendly jitter: 0.5–1.0 of the cap so backoff is never zero.
function jitter(): number {
  const r = randomBytes(2);
  return 0.5 + ((r[0]! << 8) | r[1]!) / 65535 / 2;
}

/* ------------------------------------------------------------------ *
 * Ids & idempotency
 * ------------------------------------------------------------------ */

/** Generate a unique, URL-safe id, e.g. `evt_9f8c1a…`. */
export function newId(prefix = "evt"): string {
  return `${prefix}_${toHex(randomBytes(16))}`;
}

export interface IdempotencyStore {
  has(key: string): boolean | Promise<boolean>;
  add(key: string): void | Promise<void>;
}

/** In-memory idempotency store with optional TTL (single-instance / dev). */
export class MemoryIdempotencyStore implements IdempotencyStore {
  private readonly seen = new Map<string, number>();
  constructor(private readonly ttlMs = 24 * 60 * 60 * 1000) {}
  has(key: string): boolean {
    const exp = this.seen.get(key);
    if (exp === undefined) return false;
    if (Date.now() > exp) { this.seen.delete(key); return false; }
    return true;
  }
  add(key: string): void {
    this.seen.set(key, Date.now() + this.ttlMs);
  }
}

/**
 * Returns `true` if this key was already processed; otherwise records it and
 * returns `false`. Use it to make webhook handlers exactly-once.
 *
 * @example
 * if (await isDuplicate(event.id, store)) return ok(); // already handled
 */
export async function isDuplicate(key: string, store: IdempotencyStore): Promise<boolean> {
  if (await store.has(key)) return true;
  await store.add(key);
  return false;
}

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

function base64ToBytes(b64: string): Uint8Array {
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob !== "function") throw new Error("base64 decode unavailable");
  const bin = g.atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
