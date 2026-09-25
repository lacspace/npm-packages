const enc = new TextEncoder();

export type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text(): Promise<string>;
  json?(): Promise<unknown>;
}>;

export function defaultFetch(): FetchLike {
  const f = (globalThis as { fetch?: typeof fetch }).fetch;
  if (!f) throw new Error("no global fetch — pass `fetch` in the client options");
  return f.bind(globalThis) as unknown as FetchLike;
}

export function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  (globalThis as { crypto: Crypto }).crypto.getRandomValues(b);
  return b;
}

export function toBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function base64(s: string): string {
  return typeof btoa === "function" ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, "utf8").toString("base64");
}

export async function sha(alg: "SHA-256" | "SHA-384" | "SHA-512", data: string): Promise<Uint8Array> {
  return new Uint8Array(await (globalThis as { crypto: Crypto }).crypto.subtle.digest(alg, enc.encode(data)));
}

/** RFC 7636 §4.1: 43–128 chars from the unreserved set. 32 random bytes → 43 chars. */
export function generateCodeVerifier(random: (n: number) => Uint8Array = randomBytes): string {
  return toBase64url(random(32));
}

/** RFC 7636 §4.2: BASE64URL(SHA256(ASCII(code_verifier))). */
export async function codeChallengeS256(verifier: string): Promise<string> {
  return toBase64url(await sha("SHA-256", verifier));
}

export function generateState(random: (n: number) => Uint8Array = randomBytes): string {
  return toBase64url(random(24));
}

export function generateNonce(random: (n: number) => Uint8Array = randomBytes): string {
  return toBase64url(random(24));
}

/** OIDC Core §3.1.3.6 `at_hash`: left-most half of the hash the ID token's alg uses, base64url. */
export async function accessTokenHash(accessToken: string, alg: string): Promise<string> {
  const h = alg.endsWith("512") ? "SHA-512" : alg.endsWith("384") ? "SHA-384" : "SHA-256";
  const d = await sha(h, accessToken);
  return toBase64url(d.subarray(0, d.length / 2));
}

export function form(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) p.set(k, v);
  return p.toString();
}

export function scopesToString(scope: string | string[] | undefined, sep = " "): string | undefined {
  if (scope === undefined) return undefined;
  const list = Array.isArray(scope) ? scope : scope.split(/[\s,]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const v = s.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out.join(sep);
}

export function constantTimeEqual(a: string, b: string): boolean {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
