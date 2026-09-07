/**
 * Recovery / backup codes — an options-object API on top of the same idea as
 * {@link generateBackupCodes}, with configurable count, length and format, and
 * a verify helper that reports the remaining (unused) hashes so callers can
 * persist single-use semantics in one step.
 *
 * Codes are cryptographically random (Web Crypto CSPRNG); only SHA-256 hashes
 * are ever stored. Self-contained — no crypto helpers leak into the public API.
 */

function getCrypto(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error("Web Crypto API unavailable — @lacspace/otp needs Node 18+, an edge runtime, or a browser");
  }
  return c;
}

async function sha256Hex(input: string): Promise<string> {
  const c = getCrypto();
  const buf = await c.subtle.digest("SHA-256", new TextEncoder().encode(input) as unknown as BufferSource);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Normalise for comparison: upper-case, strip separators/whitespace. */
function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

/** How the visible characters of a recovery code are drawn. */
export type RecoveryCodeFormat = "alphanumeric" | "numeric" | "hex";

const ALPHABETS: Record<RecoveryCodeFormat, string> = {
  // No ambiguous characters (no 0/O/1/I).
  alphanumeric: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  numeric: "0123456789",
  hex: "0123456789ABCDEF",
};

export interface RecoveryCodesOptions {
  /** How many codes to generate (default 10). */
  count?: number;
  /** Number of dash-separated groups per code (default 2). */
  groups?: number;
  /** Characters per group (default 5). */
  groupLength?: number;
  /** Character set — `alphanumeric` (default), `numeric` or `hex`. */
  format?: RecoveryCodeFormat;
  /** Group separator (default `-`). */
  separator?: string;
}

export interface RecoveryCodesResult {
  /** Show these to the user ONCE. */
  codes: string[];
  /** Store THESE (SHA-256 hex hashes) — verify against them, mark used. */
  hashes: string[];
}

function drawCode(alphabet: string, groups: number, groupLen: number, separator: string): string {
  const total = groups * groupLen;
  // Rejection-free unbiased-enough draw for a code alphabet (256 % len bias is
  // negligible for these small alphabets); mirrors the existing backup-code path.
  const bytes = new Uint8Array(total);
  getCrypto().getRandomValues(bytes);
  const parts: string[] = [];
  let i = 0;
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let j = 0; j < groupLen; j++) s += alphabet[bytes[i++]! % alphabet.length];
    parts.push(s);
  }
  return parts.join(separator);
}

/**
 * Generate a set of single-use recovery codes. Returns the plaintext `codes`
 * (show the user once) and their SHA-256 `hashes` (persist these). Every call
 * yields fresh, cryptographically-random codes.
 */
export async function generateRecoveryCodes(opts: RecoveryCodesOptions = {}): Promise<RecoveryCodesResult> {
  const count = opts.count ?? 10;
  const groups = opts.groups ?? 2;
  const groupLen = opts.groupLength ?? 5;
  const separator = opts.separator ?? "-";
  const alphabet = ALPHABETS[opts.format ?? "alphanumeric"];
  const codes = Array.from({ length: count }, () => drawCode(alphabet, groups, groupLen, separator));
  const hashes = await Promise.all(codes.map((c) => sha256Hex(normalizeCode(c))));
  return { codes, hashes };
}

export interface RecoveryCodeVerification {
  /** Did the code match an unused hash? */
  ok: boolean;
  /** Index of the matched hash in the supplied set, or -1. */
  index: number;
  /** The stored set with the used hash removed — persist this. Unchanged on miss. */
  remaining: string[];
}

/**
 * Verify a recovery code against a stored set of SHA-256 hashes and consume it.
 * On a match returns `ok: true`, the matched `index`, and `remaining` (the set
 * minus the used hash) — persist `remaining` to enforce single use. On no match
 * returns `ok: false`, `index: -1`, and the original set untouched.
 */
export async function verifyRecoveryCode(code: string, hashedSet: string[]): Promise<RecoveryCodeVerification> {
  const target = await sha256Hex(normalizeCode(code));
  let index = -1;
  // Scan all entries (don't short-circuit) to avoid leaking position via timing.
  for (let i = 0; i < hashedSet.length; i++) {
    if (timingSafeEqual(hashedSet[i]!, target)) index = i;
  }
  if (index === -1) return { ok: false, index: -1, remaining: hashedSet };
  return { ok: true, index, remaining: hashedSet.filter((_, i) => i !== index) };
}
