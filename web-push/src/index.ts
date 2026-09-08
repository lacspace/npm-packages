/**
 * @lacspace/web-push — send Web Push notifications to browsers, zero dependencies.
 *
 * How this works (the short version):
 *   A browser hands your frontend a "subscription" (an endpoint URL + two keys).
 *   To push a message you must (1) ENCRYPT the payload so only that browser can
 *   read it (RFC 8291, "aes128gcm"), and (2) prove you own your app by signing a
 *   VAPID token (RFC 8292). Then you POST the encrypted bytes to the endpoint.
 *
 * We do all of that with the built-in Web Crypto API (`globalThis.crypto`) — no
 * npm dependencies, and it runs anywhere Web Crypto exists: Node 20+, Deno, Bun,
 * Cloudflare Workers, Vercel Edge. No Firebase, no FCM key, nothing to buy.
 */

/** A push subscription, exactly as `pushManager.subscribe().toJSON()` gives it to you. */
export interface PushSubscription {
  endpoint: string;
  keys: {
    /** The browser's public key (base64url, 65 raw bytes). */
    p256dh: string;
    /** The browser's auth secret (base64url, 16 raw bytes). */
    auth: string;
  };
}

/** Your application server's VAPID identity. Generate once with {@link generateVapidKeys}. */
export interface VapidDetails {
  /** A contact URL or `mailto:` so a push service can reach you about issues. */
  subject: string;
  /** VAPID public key (base64url). This is also your browser `applicationServerKey`. */
  publicKey: string;
  /** VAPID private key (base64url). Keep this secret. */
  privateKey: string;
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

export interface SendOptions {
  vapid: VapidDetails;
  /** Seconds the push service should retry delivery. Default 4 weeks (2419200). */
  ttl?: number;
  /** "very-low" | "low" | "normal" | "high" — hint to the push service. */
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Collapse key: a new push with the same topic replaces an undelivered one. */
  topic?: string;
  /** Absolute VAPID token expiry (unix seconds). Default now + 12h. Max 24h. */
  expiration?: number;
  /** aes128gcm record size. Default 4096; bump it only for large payloads. */
  recordSize?: number;
}

export interface SendResult {
  /** HTTP status from the push service. 201 = accepted. */
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  /** True when the subscription is gone (404/410) — delete it from your DB. */
  expired: boolean;
}

export interface EncryptResult {
  /** The full aes128gcm message body (header + ciphertext) to POST. */
  body: Uint8Array;
  salt: string;
  serverPublicKey: string;
}

/** Thrown for bad input or payloads that don't fit a single record. */
export class PushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PushError";
  }
}

// ---------------------------------------------------------------------------
// Small isomorphic helpers (base64url + byte plumbing, no Buffer dependency).
// ---------------------------------------------------------------------------

const enc = /* @__PURE__ */ new TextEncoder();

function webcrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new PushError(
      "Web Crypto is not available. @lacspace/web-push needs Node 20+, Deno, Bun, or an edge runtime.",
    );
  }
  return c;
}

/** Decode base64url → bytes. Tolerant of missing padding. */
export function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, "=");
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Encode bytes → base64url (no padding). */
export function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  // Chunk to stay well under any argument-count limits for large payloads.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/** HKDF-SHA256 (extract + expand in one shot) — the KDF the Web Push spec uses. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const c = webcrypto();
  const key = await c.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await c.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Build an EC P-256 JWK from a raw 65-byte public point (+ optional 32-byte private scalar). */
function ecJwk(publicRaw: Uint8Array, privateScalar?: Uint8Array): JsonWebKey {
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: toBase64url(publicRaw.subarray(1, 33)),
    y: toBase64url(publicRaw.subarray(33, 65)),
    ext: true,
  };
  if (privateScalar) jwk.d = toBase64url(privateScalar);
  return jwk;
}

// ---------------------------------------------------------------------------
// VAPID (RFC 8292) — proves the push came from you.
// ---------------------------------------------------------------------------

/**
 * Generate a VAPID key pair. Do this ONCE and store both keys.
 * The `publicKey` is what you pass to `pushManager.subscribe({ applicationServerKey })`.
 */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const c = webcrypto();
  const pair = await c.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pub = new Uint8Array(await c.subtle.exportKey("raw", pair.publicKey));
  const jwk = (await c.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { publicKey: toBase64url(pub), privateKey: jwk.d! };
}

async function importVapidSigningKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  const c = webcrypto();
  const jwk = ecJwk(fromBase64url(publicKey), fromBase64url(privateKey));
  return c.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/**
 * Build the `Authorization` header for one push, signing a fresh VAPID JWT.
 * `audience` must be the ORIGIN of the endpoint (e.g. https://fcm.googleapis.com).
 */
export async function createVapidHeaders(
  audience: string,
  vapid: VapidDetails,
  expiration?: number,
): Promise<{ Authorization: string }> {
  const c = webcrypto();
  const exp = expiration ?? Math.floor(Date.now() / 1000) + 12 * 60 * 60;
  const header = toBase64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64url(enc.encode(JSON.stringify({ aud: audience, exp, sub: vapid.subject })));
  const signingInput = `${header}.${claims}`;
  const key = await importVapidSigningKey(vapid.publicKey, vapid.privateKey);
  // Web Crypto ECDSA returns the raw r||s signature — exactly JWT/ES256 format.
  const sig = new Uint8Array(await c.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)));
  const jwt = `${signingInput}.${toBase64url(sig)}`;
  return { Authorization: `vapid t=${jwt}, k=${vapid.publicKey}` };
}

// ---------------------------------------------------------------------------
// Payload encryption (RFC 8291, content-coding "aes128gcm" / RFC 8188).
// ---------------------------------------------------------------------------

/**
 * Encrypt a payload for one subscription. You normally don't call this directly —
 * {@link sendNotification} does — but it's exported (and accepts a fixed salt +
 * server key pair) so the encryption can be tested against the RFC test vector.
 */
export async function encryptPayload(
  payload: string | Uint8Array,
  keys: PushSubscription["keys"],
  opts: {
    salt?: string;
    serverKeys?: { publicKey: string; privateKey: string };
    recordSize?: number;
  } = {},
): Promise<EncryptResult> {
  const c = webcrypto();
  const plaintext = typeof payload === "string" ? enc.encode(payload) : payload;

  const clientPub = fromBase64url(keys.p256dh); // 65 raw bytes
  const authSecret = fromBase64url(keys.auth); // 16 raw bytes
  const clientPubKey = await c.subtle.importKey(
    "raw",
    clientPub as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  // The application server's ephemeral ECDH key: random, or injected for testing.
  let serverPrivKey: CryptoKey;
  let asPublic: Uint8Array;
  if (opts.serverKeys) {
    asPublic = fromBase64url(opts.serverKeys.publicKey);
    serverPrivKey = await c.subtle.importKey(
      "jwk",
      ecJwk(asPublic, fromBase64url(opts.serverKeys.privateKey)),
      { name: "ECDH", namedCurve: "P-256" },
      false,
      ["deriveBits"],
    );
  } else {
    const pair = await c.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    serverPrivKey = pair.privateKey;
    asPublic = new Uint8Array(await c.subtle.exportKey("raw", pair.publicKey));
  }

  // ECDH shared secret = the X coordinate of the shared point (32 bytes).
  const sharedSecret = new Uint8Array(
    await c.subtle.deriveBits({ name: "ECDH", public: clientPubKey }, serverPrivKey, 256),
  );

  // RFC 8291 §3.4: derive the input keying material from the ECDH secret + auth.
  const keyInfo = concat(enc.encode("WebPush: info\0"), clientPub, asPublic);
  const ikm = await hkdf(authSecret, sharedSecret, keyInfo, 32);

  const salt = opts.salt ? fromBase64url(opts.salt) : webcrypto().getRandomValues(new Uint8Array(16));

  // RFC 8188: content-encryption key + nonce, from the salt and that IKM.
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const recordSize = opts.recordSize ?? 4096;
  // Single record: plaintext + a 0x02 "last record" delimiter, then a 16-byte tag.
  const maxData = recordSize - 16 - 1;
  if (plaintext.length > maxData) {
    throw new PushError(
      `payload is ${plaintext.length} bytes but only ${maxData} fit in one record (recordSize ${recordSize}). ` +
        `Send a smaller payload or raise recordSize.`,
    );
  }
  const record = concat(plaintext, new Uint8Array([2]));

  const aesKey = await c.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await c.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource, tagLength: 128 }, aesKey, record as BufferSource),
  );

  // Header: salt(16) || record-size(uint32 BE) || idlen(1) || keyid(server public, 65).
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, recordSize, false);
  const idlen = new Uint8Array([asPublic.length]);
  const body = concat(salt, rs, idlen, asPublic, ciphertext);

  return { body, salt: toBase64url(salt), serverPublicKey: toBase64url(asPublic) };
}

// ---------------------------------------------------------------------------
// Sending.
// ---------------------------------------------------------------------------

/** True when a push status means the subscription is dead and should be deleted. */
export function isSubscriptionExpired(statusCode: number): boolean {
  return statusCode === 404 || statusCode === 410;
}

/**
 * Send ONE push notification.
 *
 * @param payload  A string (commonly `JSON.stringify(...)`), bytes, or `null` for
 *                 a "tickle" (a push with no data — the SW still wakes up).
 *
 * @example
 * const res = await sendNotification(sub, JSON.stringify({ title: "Hi" }), {
 *   vapid: { subject: "mailto:you@site.com", publicKey, privateKey },
 * });
 * if (res.expired) await db.deleteSubscription(sub.endpoint);
 */
export async function sendNotification(
  subscription: PushSubscription,
  payload: string | Uint8Array | null,
  options: SendOptions,
): Promise<SendResult> {
  const endpoint = subscription.endpoint;
  const audience = new URL(endpoint).origin;

  const headers: Record<string, string> = {
    TTL: String(options.ttl ?? 2419200),
    ...(await createVapidHeaders(audience, options.vapid, options.expiration)),
  };
  if (options.urgency) headers["Urgency"] = options.urgency;
  if (options.topic) headers["Topic"] = options.topic;

  let body: Uint8Array | undefined;
  if (payload != null) {
    const encrypted = await encryptPayload(payload, subscription.keys, { recordSize: options.recordSize });
    body = encrypted.body;
    headers["Content-Encoding"] = "aes128gcm";
    headers["Content-Type"] = "application/octet-stream";
  }

  const res = await fetch(endpoint, { method: "POST", headers, body: body as BodyInit | undefined });
  const text = await res.text().catch(() => "");
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });

  return {
    statusCode: res.status,
    body: text,
    headers: resHeaders,
    expired: isSubscriptionExpired(res.status),
  };
}

/**
 * Send the same push to many subscriptions. Never rejects — you get one settled
 * result per subscription, so a single dead endpoint can't sink the whole batch.
 */
export async function sendNotifications(
  subscriptions: PushSubscription[],
  payload: string | Uint8Array | null,
  options: SendOptions,
): Promise<Array<{ subscription: PushSubscription; result?: SendResult; error?: Error }>> {
  return Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        return { subscription, result: await sendNotification(subscription, payload, options) };
      } catch (error) {
        return { subscription, error: error as Error };
      }
    }),
  );
}
