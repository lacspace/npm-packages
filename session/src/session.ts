import { type CookieOptions, type CookieSource, clearCookie, cookieHeaderOf, parseCookies, serializeCookie } from "./cookie.js";
import { fromBase64url, keyId, open, randomBytes, seal, sign, toBase64url, utf8, verify } from "./crypto.js";

export type SessionMode = "encrypted" | "signed";

export interface SessionOptions {
  /**
   * One or more secrets (≥ 32 chars each). The first one writes; every one is
   * tried on read, so rotate by prepending a new secret and dropping the old
   * one later. Each secret is stretched with HKDF — never used raw.
   */
  secrets: string | string[];
  /** Cookie name + attributes. Default name "__Host-session" (Secure, Path=/, HttpOnly, SameSite=Lax). */
  cookie?: CookieOptions & { name?: string };
  /** "encrypted" (default, AES-256-GCM) or "signed" (HMAC-SHA256, payload readable but tamper-proof). */
  mode?: SessionMode;
  /** Session lifetime in seconds from the last `commit`. Default 7 days. */
  maxAge?: number;
  /** Hard cap in seconds from the session's creation, whatever `rolling` does. Default: none. */
  absoluteMaxAge?: number;
  /** Re-issue the cookie on read once past half its lifetime. Default false. */
  rolling?: boolean;
  /** Clock skew tolerated when checking expiry, in seconds. Default 0. */
  clockTolerance?: number;
  /** Cookie byte budget. Browsers cap at 4096; default 4096. */
  maxCookieBytes?: number;
  /** Injectable clock (ms) and randomness for tests. */
  now?: () => number;
  random?: (n: number) => Uint8Array;
}

export type SessionFailure = "missing" | "malformed" | "version" | "unknown_key" | "tampered" | "expired";

export interface SessionState<T> {
  /** Session payload, or null when there is no valid session. */
  data: T | null;
  /** Stable per-session id (16 random bytes, base64url) — bind CSRF tokens to it. */
  id: string | null;
  /** Epoch seconds. */
  createdAt: number | null;
  expiresAt: number | null;
  /** Why `data` is null. */
  reason?: SessionFailure;
  /** With `rolling`, a fresh Set-Cookie value when the session was past half-life. Send it if present. */
  refreshedCookie?: string;
}

export interface CommitOptions {
  /** Override the lifetime for this commit (seconds). */
  maxAge?: number;
  /** Keep an existing session id / creation time (pass what `read` returned). */
  id?: string | null;
  createdAt?: number | null;
}

export interface CookieSession<T> {
  readonly cookieName: string;
  /** Read and verify the session from a Cookie header, Web Request or Node request. Never throws. */
  read(src: CookieSource): Promise<SessionState<T>>;
  /** Seal `data` into a Set-Cookie header value. Throws if the cookie would exceed the byte budget. */
  commit(data: T, opts?: CommitOptions): Promise<string>;
  /** A Set-Cookie header value that deletes the session cookie. */
  destroy(): string;
  /** Seal without cookie attributes — the raw token, for storing elsewhere. */
  seal(data: T, opts?: CommitOptions): Promise<string>;
  /** Verify a raw token from `seal`. */
  unseal(token: string): Promise<SessionState<T>>;
}

interface Envelope<T> {
  d: T;
  i: string;
  c: number;
  e: number;
}

const VERSION = "v1";

function secretsOf(s: string | string[]): string[] {
  const arr = (Array.isArray(s) ? s : [s]).filter((x) => typeof x === "string");
  if (arr.length === 0) throw new TypeError("session: at least one secret is required");
  for (const x of arr) if (x.length < 32) throw new TypeError("session: each secret must be at least 32 characters");
  return arr;
}

export function createCookieSession<T = Record<string, unknown>>(options: SessionOptions): CookieSession<T> {
  const secrets = secretsOf(options.secrets);
  const mode: SessionMode = options.mode ?? "encrypted";
  const { name: cookieName = "__Host-session", ...cookieAttrs } = options.cookie ?? {};
  const maxAge = options.maxAge ?? 60 * 60 * 24 * 7;
  const absolute = options.absoluteMaxAge;
  const rolling = options.rolling ?? false;
  const skew = options.clockTolerance ?? 0;
  const budget = options.maxCookieBytes ?? 4096;
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? randomBytes;
  const info = `session:${cookieName}`;

  const kids = new Map<string, string>(); // kid -> secret
  let kidsReady: Promise<void> | null = null;
  function ensureKids(): Promise<void> {
    if (!kidsReady)
      kidsReady = (async () => {
        for (const s of secrets) kids.set(await keyId(s), s);
      })();
    return kidsReady;
  }

  async function sealEnvelope(env: Envelope<T>): Promise<string> {
    await ensureKids();
    const secret = secrets[0]!;
    const kid = await keyId(secret);
    const header = `${VERSION}.${kid}.${mode === "encrypted" ? "e" : "s"}`;
    const json = JSON.stringify(env);
    if (mode === "encrypted") return `${header}.${await seal(utf8.encode(json), secret, info, header, random)}`;
    const body = toBase64url(utf8.encode(json));
    return `${header}.${body}.${await sign(`${header}.${body}`, secret, info)}`;
  }

  function fail(reason: SessionFailure): SessionState<T> {
    return { data: null, id: null, createdAt: null, expiresAt: null, reason };
  }

  async function unseal(token: string): Promise<SessionState<T>> {
    if (typeof token !== "string" || token.length === 0) return fail("missing");
    const parts = token.split(".");
    const [ver, kid, m] = parts;
    if (parts.length < 4 || parts.length > 5 || !ver || !kid || !m) return fail("malformed");
    if (ver !== VERSION) return fail("version");
    if ((m === "e") !== (mode === "encrypted")) return fail("malformed");
    await ensureKids();
    const secret = kids.get(kid);
    if (!secret) return fail("unknown_key");
    const header = `${ver}.${kid}.${m}`;
    let json: string;
    if (m === "e") {
      if (parts.length !== 4) return fail("malformed");
      const pt = await open(parts[3]!, secret, info, header);
      if (!pt) return fail("tampered");
      json = utf8.decode(pt);
    } else {
      if (parts.length !== 5) return fail("malformed");
      if (!(await verify(`${header}.${parts[3]}`, parts[4]!, secret, info))) return fail("tampered");
      try {
        json = utf8.decode(fromBase64url(parts[3]!));
      } catch {
        return fail("malformed");
      }
    }
    let env: Envelope<T>;
    try {
      env = JSON.parse(json);
    } catch {
      return fail("malformed");
    }
    if (!env || typeof env !== "object" || typeof env.i !== "string" || typeof env.c !== "number" || typeof env.e !== "number") return fail("malformed");
    const t = Math.floor(now() / 1000);
    if (env.e + skew < t) return fail("expired");
    if (absolute !== undefined && env.c + absolute + skew < t) return fail("expired");
    return { data: env.d, id: env.i, createdAt: env.c, expiresAt: env.e };
  }

  async function build(data: T, opts: CommitOptions = {}): Promise<{ token: string; expiresAt: number; now: number }> {
    const t = Math.floor(now() / 1000);
    const createdAt = opts.createdAt ?? t;
    let expiresAt = t + (opts.maxAge ?? maxAge);
    if (absolute !== undefined) expiresAt = Math.min(expiresAt, createdAt + absolute);
    const id = opts.id ?? toBase64url(random(16));
    return { token: await sealEnvelope({ d: data, i: id, c: createdAt, e: expiresAt }), expiresAt, now: t };
  }

  async function commit(data: T, opts: CommitOptions = {}): Promise<string> {
    const { token, expiresAt, now: t } = await build(data, opts);
    const header = serializeCookie(cookieName, token, { ...cookieAttrs, maxAge: cookieAttrs.maxAge ?? Math.max(0, expiresAt - t) });
    const bytes = utf8.encode(header).length;
    if (bytes > budget) throw new RangeError(`session cookie is ${bytes} bytes; browsers drop cookies over ${budget}. Store less in the session.`);
    return header;
  }

  return {
    cookieName,
    async read(src) {
      const h = cookieHeaderOf(src);
      const raw = h == null ? undefined : typeof h === "string" ? parseCookies(h)[cookieName] : h[cookieName];
      if (!raw) return fail("missing");
      const state = await unseal(raw);
      if (state.data !== null && rolling && state.createdAt !== null && state.expiresAt !== null) {
        const t = Math.floor(now() / 1000);
        const remaining = state.expiresAt - t;
        if (remaining < maxAge / 2 && (absolute === undefined || t < state.createdAt + absolute)) {
          state.refreshedCookie = await commit(state.data, { id: state.id, createdAt: state.createdAt });
        }
      }
      return state;
    },
    commit,
    destroy() {
      return clearCookie(cookieName, cookieAttrs);
    },
    seal: async (data, opts) => (await build(data, opts)).token,
    unseal,
  };
}

/** Everything an OAuth callback needs to remember between redirect and return. */
export interface OAuthStateData {
  state: string;
  codeVerifier?: string;
  nonce?: string;
  /** Where to send the user after login (validate it is a relative path before redirecting!). */
  returnTo?: string;
  provider?: string;
  [extra: string]: unknown;
}

export interface OAuthStateStoreOptions extends Omit<SessionOptions, "maxAge" | "rolling" | "absoluteMaxAge"> {
  /** Default 600 (10 minutes) — long enough for a login screen, short enough to bound replay. */
  maxAge?: number;
}

export interface OAuthStateStore {
  readonly cookieName: string;
  /** Set-Cookie to send with the redirect to the provider. */
  create(data: OAuthStateData): Promise<string>;
  /** Read it back on the callback; null when missing/expired/tampered. */
  read(src: CookieSource): Promise<OAuthStateData | null>;
  /** Set-Cookie that clears it — send on the callback response. */
  clear(): string;
}

/** A short-lived, encrypted cookie for `{ state, codeVerifier, nonce, returnTo }`. Default name "__Host-oauth". */
export function createOAuthStateStore(options: OAuthStateStoreOptions): OAuthStateStore {
  const { name = "__Host-oauth", ...attrs } = options.cookie ?? {};
  const s = createCookieSession<OAuthStateData>({ ...options, cookie: { name, ...attrs }, maxAge: options.maxAge ?? 600, rolling: false });
  return {
    cookieName: s.cookieName,
    create: (data) => s.commit(data),
    async read(src) {
      const r = await s.read(src);
      return r.data && typeof r.data.state === "string" ? r.data : null;
    },
    clear: () => s.destroy(),
  };
}
