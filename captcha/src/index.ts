/**
 * @lacspace/captcha — a keyless, privacy-friendly proof-of-work CAPTCHA.
 *
 * No Google, no Cloudflare, no account, no tracking, no images to squint at.
 * Instead of profiling the user, the browser solves a small computational puzzle
 * (invisible to humans, ~a few hundred ms) that makes bulk/automated submissions
 * expensive. The whole scheme is STATELESS and self-verifying via HMAC — you only
 * need one server secret; there's nothing to store between issue and verify.
 *
 * How it works:
 *   1. Server issues a challenge: a random `salt`, a secret `number` in
 *      [0, maxnumber], the target hash `challenge = SHA256(salt + number)`, and a
 *      `signature = HMAC(secret, challenge)`. The number itself is NOT sent.
 *   2. The browser brute-forces `number` back (that's the "work").
 *   3. Server verifies: recompute the hash from (salt, number), check it equals
 *      `challenge`, and check `HMAC(secret, challenge)` matches — proving the
 *      challenge was one we issued (so bots can't mint their own easy puzzles).
 */

import { sha256Hex, hmacSha256Hex, timingSafeEqual } from "./sha256";

export { sha256Hex, hmacSha256Hex } from "./sha256";

export interface Challenge {
  algorithm: "SHA-256";
  /** Random salt, optionally carrying `?expires=<unix seconds>`. */
  salt: string;
  /** Target hash the client must reproduce: SHA256(salt + number). */
  challenge: string;
  /** HMAC(secret, challenge) — proves we issued this challenge. */
  signature: string;
  /** Upper bound of the search space (the difficulty knob). */
  maxnumber: number;
}

export interface Solution {
  algorithm: "SHA-256";
  salt: string;
  number: number;
  challenge: string;
  signature: string;
}

export interface CreateChallengeOptions {
  /** Your server secret. Keep it private; the same secret must verify. */
  secret: string;
  /**
   * Difficulty: the secret number is chosen in [0, maxNumber]. Higher = more
   * work for the client. Default 100000 (~tens–hundreds of ms in a browser).
   */
  maxNumber?: number;
  /** Challenge lifetime in ms. Default 300000 (5 min). Use 0 to never expire. */
  expiresMs?: number;
  /** Provide a fixed salt (testing). Normally omit — a random one is generated. */
  salt?: string;
  /** Provide a fixed number (testing). Normally omit — a random one is chosen. */
  number?: number;
}

export interface VerifyResult {
  success: boolean;
  error?: "malformed" | "expired" | "bad-hash" | "bad-signature";
}

const getRandom = (): Crypto | undefined => (globalThis as { crypto?: Crypto }).crypto;

function randomHex(byteLen: number): string {
  const c = getRandom();
  const buf = new Uint8Array(byteLen);
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < byteLen; i++) buf[i] = Math.floor(Math.random() * 256);
  let s = "";
  for (const b of buf) s += b.toString(16).padStart(2, "0");
  return s;
}

function randomInt(maxInclusive: number): number {
  const c = getRandom();
  if (c?.getRandomValues) {
    const range = maxInclusive + 1;
    const limit = Math.floor(0xffffffff / range) * range; // rejection sampling → unbiased
    const buf = new Uint32Array(1);
    let v: number;
    do {
      c.getRandomValues(buf);
      v = buf[0]!;
    } while (v >= limit);
    return v % range;
  }
  return Math.floor(Math.random() * (maxInclusive + 1));
}

/**
 * Create a challenge to send to the browser. Store nothing — everything needed to
 * verify is carried in the (signed) challenge itself.
 *
 * @example
 * app.get("/api/captcha", async (_req, res) => {
 *   res.json(await createChallenge({ secret: process.env.CAPTCHA_SECRET! }));
 * });
 */
export async function createChallenge(options: CreateChallengeOptions): Promise<Challenge> {
  const maxnumber = options.maxNumber ?? 100000;
  const expiresMs = options.expiresMs ?? 300000;
  let salt = options.salt ?? randomHex(12);
  if (expiresMs > 0 && options.salt === undefined) {
    const expires = Math.floor((Date.now() + expiresMs) / 1000);
    salt += `?expires=${expires}`;
  }
  const number = options.number ?? randomInt(maxnumber);
  const challenge = sha256Hex(salt + number);
  const signature = hmacSha256Hex(options.secret, challenge);
  return { algorithm: "SHA-256", salt, challenge, signature, maxnumber };
}

export interface SolveOptions {
  /** Abort the search early (e.g. a timeout). */
  signal?: AbortSignal;
  /** Called with the current attempt count periodically (for progress UI). */
  onProgress?: (attempts: number, max: number) => void;
  /**
   * Iterations between yields to the event loop, so the browser stays responsive.
   * Default 5000. Set 0 to run fully synchronously (server-side / tests).
   */
  chunkSize?: number;
}

/**
 * Solve a challenge by finding the `number`. Runs on the client (or anywhere).
 * Yields to the event loop periodically so the UI doesn't freeze.
 */
export async function solveChallenge(challenge: Challenge, options: SolveOptions = {}): Promise<Solution | null> {
  if (challenge.algorithm !== "SHA-256") throw new Error(`Unsupported algorithm: ${challenge.algorithm}`);
  const chunk = options.chunkSize ?? 5000;
  const { salt, maxnumber } = challenge;

  for (let n = 0; n <= maxnumber; n++) {
    if (sha256Hex(salt + n) === challenge.challenge) {
      return { algorithm: "SHA-256", salt, number: n, challenge: challenge.challenge, signature: challenge.signature };
    }
    if (chunk > 0 && n % chunk === 0) {
      options.onProgress?.(n, maxnumber);
      if (options.signal?.aborted) return null;
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  return null;
}

/** Encode a solution as a compact base64 string to put in a form field. */
export function encodeSolution(solution: Solution): string {
  return btoa(JSON.stringify(solution));
}

/** Decode what {@link encodeSolution} produced. Returns null if malformed. */
export function decodeSolution(payload: string): Solution | null {
  try {
    const obj = JSON.parse(atob(payload));
    if (obj && obj.algorithm === "SHA-256" && typeof obj.number === "number") return obj as Solution;
    return null;
  } catch {
    return null;
  }
}

/**
 * Verify a solution on the server. Accepts either the encoded string (what the
 * browser submits) or a decoded {@link Solution}. Uses only your secret.
 *
 * @example
 * const { success } = await verifySolution(req.body["lacspace-captcha"], {
 *   secret: process.env.CAPTCHA_SECRET!,
 * });
 * if (!success) return res.status(400).json({ error: "captcha failed" });
 */
export async function verifySolution(
  payload: string | Solution | null | undefined,
  options: { secret: string },
): Promise<VerifyResult> {
  const solution = typeof payload === "string" ? decodeSolution(payload) : payload ?? null;
  if (!solution || solution.algorithm !== "SHA-256" || typeof solution.number !== "number") {
    return { success: false, error: "malformed" };
  }

  // Expiry (carried in the salt as ?expires=<unix seconds>).
  const q = solution.salt.split("?")[1];
  if (q) {
    const params = new URLSearchParams(q);
    const expires = params.get("expires");
    if (expires && Number(expires) * 1000 < Date.now()) {
      return { success: false, error: "expired" };
    }
  }

  // The number must actually reproduce the target hash (proof of work).
  if (sha256Hex(solution.salt + solution.number) !== solution.challenge) {
    return { success: false, error: "bad-hash" };
  }

  // And the challenge must be one WE signed (bots can't forge easy puzzles).
  const expected = hmacSha256Hex(options.secret, solution.challenge);
  if (!timingSafeEqual(expected, solution.signature)) {
    return { success: false, error: "bad-signature" };
  }

  return { success: true };
}
