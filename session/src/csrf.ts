import { constantTimeEqual, keyId, randomBytes, sign, toBase64url, verify } from "./crypto.js";

export interface CsrfOptions {
  /** Same shape as the session secrets: first writes, all verify. */
  secrets: string | string[];
  /** Token lifetime in seconds. Default 86400. */
  maxAge?: number;
  now?: () => number;
  random?: (n: number) => Uint8Array;
}

export interface Csrf {
  /** Mint a token bound to a session id (use `SessionState.id`). Put it in a hidden field or a header. */
  issue(sessionId: string): Promise<string>;
  /** Verify a submitted token against the current session id. Never throws. */
  verify(token: string | null | undefined, sessionId: string | null | undefined): Promise<boolean>;
  /** Pull the token from a request: `x-csrf-token` header, then a form/JSON body field named `_csrf`. */
  tokenFrom(src: { headers: { get(n: string): string | null } } | { headers: Record<string, string | string[] | undefined> }, body?: Record<string, unknown> | FormData | null): string | null;
}

/**
 * Signed double-submit CSRF tokens: `random.expiry.hmac(random|expiry|sessionId)`.
 * Because the MAC covers the session id, a token stolen from one session is
 * useless in another, and nothing has to be stored server-side.
 */
export function createCsrf(options: CsrfOptions): Csrf {
  const secrets = (Array.isArray(options.secrets) ? options.secrets : [options.secrets]).filter(Boolean);
  if (secrets.length === 0) throw new TypeError("csrf: at least one secret is required");
  const maxAge = options.maxAge ?? 86400;
  const now = options.now ?? (() => Date.now());
  const random = options.random ?? randomBytes;
  const info = "csrf";
  const kids = new Map<string, string>();
  let ready: Promise<void> | null = null;
  const ensure = () => (ready ??= (async () => {
    for (const s of secrets) kids.set(await keyId(s), s);
  })());

  return {
    async issue(sessionId) {
      if (!sessionId) throw new TypeError("csrf: a session id is required");
      await ensure();
      const r = toBase64url(random(16));
      const exp = Math.floor(now() / 1000) + maxAge;
      const kid = await keyId(secrets[0]!);
      const mac = await sign(`${r}|${exp}|${sessionId}`, secrets[0]!, info);
      return `${r}.${exp}.${kid}.${mac}`;
    },
    async verify(token, sessionId) {
      if (!token || !sessionId) return false;
      const parts = token.split(".");
      if (parts.length !== 4) return false;
      const [r, expS, kid, mac] = parts as [string, string, string, string];
      const exp = Number(expS);
      if (!Number.isFinite(exp) || exp < Math.floor(now() / 1000)) return false;
      await ensure();
      const secret = kids.get(kid);
      if (!secret) return false;
      return verify(`${r}|${exp}|${sessionId}`, mac, secret, info);
    },
    tokenFrom(src, body) {
      const h = src.headers as { get?: (n: string) => string | null } & Record<string, string | string[] | undefined>;
      let v: string | string[] | null | undefined = typeof h.get === "function" ? h.get("x-csrf-token") : h["x-csrf-token"];
      if (Array.isArray(v)) v = v[0];
      if (v) return v;
      if (body) {
        if (typeof (body as FormData).get === "function") {
          const f = (body as FormData).get("_csrf");
          return typeof f === "string" ? f : null;
        }
        const f = (body as Record<string, unknown>)["_csrf"];
        return typeof f === "string" ? f : null;
      }
      return null;
    },
  };
}

export { constantTimeEqual };
