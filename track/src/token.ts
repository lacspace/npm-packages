/**
 * Signed tracking tokens.
 *
 * Layout (before base64url):
 *   [version=1][kind: 0 pixel | 1 click][issuedAt: u32 seconds]
 *   [varint len][campaignId utf8][varint len][messageId utf8]
 *   [recipient digest: 12 bytes]
 *   (click only) [varint len][url utf8]
 *   [HMAC-SHA256 over everything above, truncated to 16 bytes]
 *
 * The recipient is never stored in clear: it is a keyed digest
 * (HMAC-SHA256 of the lower-cased, trimmed address under the same secret,
 * domain-separated, truncated to 96 bits). Only the holder of the secret can
 * compute it, so a token leaked from a forwarded email does not reveal the
 * address. Use `tracker.recipientId(email)` to get the same value server-side.
 */

import { Reader, concat, fromBase64Url, timingSafeEqual, toBase64Url, u32, utf8, varint } from "./bytes";

export interface TrackContext {
  campaignId: string;
  recipient: string;
  messageId: string;
}

export interface ClickContext extends TrackContext {
  url: string;
}

export interface VerifiedToken {
  kind: "open" | "click";
  campaignId: string;
  messageId: string;
  /**
   * Keyed digest of the recipient address (base64url, 16 chars), NOT the
   * address itself. Compare with `tracker.recipientId(email)`.
   */
  recipient: string;
  /** When the token was issued. */
  issuedAt: Date;
  /** When the token stops verifying. */
  expiresAt: Date;
  /** Destination URL (click tokens only). */
  url?: string;
}

export interface TrackerOptions {
  /** Token lifetime in days. Default 180. */
  ttlDays?: number;
  /** Clock override (ms since epoch), mainly for tests. */
  now?: () => number;
}

export interface InjectOptions {
  /** URLs that must never be rewritten, e.g. your List-Unsubscribe https URLs. */
  unsubscribeUrls?: string[];
  /** Set false to only rewrite links and not add the open pixel. Default true. */
  pixel?: boolean;
  /** Set false to only add the pixel and not rewrite links. Default true. */
  links?: boolean;
}

export interface Tracker {
  pixelToken(ctx: TrackContext): Promise<string>;
  clickToken(ctx: ClickContext): Promise<string>;
  verify(token: string): Promise<VerifiedToken | null>;
  /** Verify a click token and return its destination (http/https only) or null. */
  resolveClick(token: string): Promise<string | null>;
  /** The keyed recipient digest stored inside tokens. */
  recipientId(email: string): Promise<string>;
  injectHtml(html: string, ctx: TrackContext, baseUrl: string, opts?: InjectOptions): Promise<string>;
}

const VERSION = 1;
const MAC_LEN = 16;
const RCPT_LEN = 12;
const MAX_FUTURE_SKEW_S = 300;

export async function hmac(key: CryptoKey, data: Uint8Array): Promise<Uint8Array> {
  const sig = await globalThis.crypto.subtle.sign("HMAC", key, data as Uint8Array<ArrayBuffer>);
  return new Uint8Array(sig);
}

export async function importKey(secret: string): Promise<CryptoKey> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("@lacspace/track: WebCrypto (globalThis.crypto.subtle) is not available");
  return subtle.importKey("raw", utf8(secret) as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

export function normaliseRecipient(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}

export function isHttpUrl(u: string): boolean {
  return /^https?:\/\/[^\s]/i.test(u);
}

export interface TokenCore {
  key: Promise<CryptoKey>;
  ttlSeconds: number;
  now: () => number;
}

async function rcptDigest(core: TokenCore, email: string): Promise<Uint8Array> {
  const mac = await hmac(await core.key, utf8("lacspace-track/rcpt\0" + normaliseRecipient(email)));
  return mac.subarray(0, RCPT_LEN);
}

export async function recipientId(core: TokenCore, email: string): Promise<string> {
  return toBase64Url(await rcptDigest(core, email));
}

function str(s: unknown): Uint8Array {
  const b = utf8(String(s ?? ""));
  return concat([varint(b.length), b]);
}

export async function makeToken(core: TokenCore, kind: 0 | 1, ctx: TrackContext, url?: string): Promise<string> {
  const iat = Math.floor(core.now() / 1000);
  const parts = [
    new Uint8Array([VERSION, kind]),
    u32(iat),
    str(ctx.campaignId),
    str(ctx.messageId),
    await rcptDigest(core, ctx.recipient),
  ];
  if (kind === 1) parts.push(str(url));
  const body = concat(parts);
  const mac = (await hmac(await core.key, concat([utf8("lacspace-track/v1\0"), body]))).subarray(0, MAC_LEN);
  return toBase64Url(concat([body, mac]));
}

export async function verifyToken(core: TokenCore, token: string): Promise<VerifiedToken | null> {
  if (typeof token !== "string" || token.length < 10 || token.length > 16384) return null;
  const raw = fromBase64Url(token.trim());
  if (!raw || raw.length < 2 + 4 + RCPT_LEN + 2 + MAC_LEN) return null;
  const body = raw.subarray(0, raw.length - MAC_LEN);
  const mac = raw.subarray(raw.length - MAC_LEN);
  const expected = (await hmac(await core.key, concat([utf8("lacspace-track/v1\0"), body]))).subarray(0, MAC_LEN);
  if (!timingSafeEqual(mac, expected)) return null;

  const r = new Reader(body);
  if (r.byte() !== VERSION) return null;
  const kind = r.byte();
  if (kind !== 0 && kind !== 1) return null;
  const iat = r.u32();
  const campaignId = r.str();
  const messageId = r.str();
  const rcpt = r.bytes(RCPT_LEN);
  if (iat === null || campaignId === null || messageId === null || !rcpt) return null;
  let url: string | undefined;
  if (kind === 1) {
    const u = r.str();
    if (u === null) return null;
    url = u;
  }
  if (r.remaining !== 0) return null;

  const nowS = Math.floor(core.now() / 1000);
  if (iat > nowS + MAX_FUTURE_SKEW_S) return null;
  if (nowS - iat > core.ttlSeconds) return null;

  const out: VerifiedToken = {
    kind: kind === 1 ? "click" : "open",
    campaignId,
    messageId,
    recipient: toBase64Url(rcpt),
    issuedAt: new Date(iat * 1000),
    expiresAt: new Date((iat + core.ttlSeconds) * 1000),
  };
  if (url !== undefined) out.url = url;
  return out;
}
