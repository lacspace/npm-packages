/**
 * CSP structural helpers — nonce/hash sources, parse, merge, serialize.
 *
 * `csp()` (in index) builds a policy string from camelCase directives; these
 * helpers work with an already-serialized string or a structured `CspPolicy`
 * (kebab-case directive names → source arrays), so you can parse an existing
 * policy, merge two policies, or inject a nonce/hash into a live header.
 */

/** A structured CSP policy: directive name (kebab-case) → source list (empty = valueless flag). */
export type CspPolicy = Record<string, string[]>;

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return typeof btoa !== "undefined" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}

/**
 * Compute a CSP source hash (`sha256-…` / `sha384-…` / `sha512-…`) for an inline
 * script/style body, via Web Crypto. Async and isomorphic (Node 20+, edge, browser).
 * The returned token is unquoted; wrap it as `'…'` when placing it in a directive.
 */
export async function cspHash(
  source: string,
  algorithm: "sha256" | "sha384" | "sha512" = "sha256",
): Promise<string> {
  const map = { sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512" } as const;
  const data = new TextEncoder().encode(source);
  const digest = await globalThis.crypto.subtle.digest(map[algorithm], data);
  return `${algorithm}-${toBase64(new Uint8Array(digest))}`;
}

/** Parse a Content-Security-Policy string into a structured `CspPolicy`. */
export function parseCsp(policy: string): CspPolicy {
  const out: CspPolicy = {};
  for (const segment of policy.split(";")) {
    const tokens = segment.trim().split(/\s+/).filter(Boolean);
    const name = tokens[0];
    if (!name) continue;
    out[name.toLowerCase()] = tokens.slice(1);
  }
  return out;
}

/** Serialize a structured `CspPolicy` back to a header string. */
export function serializeCsp(policy: CspPolicy): string {
  const parts: string[] = [];
  for (const [name, sources] of Object.entries(policy)) {
    parts.push(sources.length ? `${name} ${sources.join(" ")}` : name);
  }
  return parts.join("; ");
}

function unionSources(a: string[], b: string[]): string[] {
  const out = [...a];
  for (const s of b) if (!out.includes(s)) out.push(s);
  return out;
}

/**
 * Merge two CSP policies (strings or structured) into one, taking the union of
 * sources per directive (order-preserving, de-duplicated). Values from `b`
 * extend those in `a`.
 */
export function mergeCsp(a: string | CspPolicy, b: string | CspPolicy): CspPolicy {
  const pa = typeof a === "string" ? parseCsp(a) : a;
  const pb = typeof b === "string" ? parseCsp(b) : b;
  const out: CspPolicy = {};
  for (const [name, sources] of Object.entries(pa)) out[name] = [...sources];
  for (const [name, sources] of Object.entries(pb)) {
    const existing = out[name];
    out[name] = existing ? unionSources(existing, sources) : [...sources];
  }
  return out;
}

/**
 * Add a per-request nonce source (`'nonce-…'`) to the given directives of a CSP
 * string (default `script-src` & `style-src`), creating them if absent.
 */
export function withNonce(
  policy: string,
  nonce: string,
  directives: string[] = ["script-src", "style-src"],
): string {
  const parsed = parseCsp(policy);
  const token = `'nonce-${nonce}'`;
  for (const dir of directives) {
    const existing = parsed[dir];
    parsed[dir] = existing ? unionSources(existing, [token]) : [token];
  }
  return serializeCsp(parsed);
}

/**
 * Add one or more hash sources (from {@link cspHash}) to the given directives of
 * a CSP string (default `script-src`), creating them if absent.
 */
export function withHashes(
  policy: string,
  hashes: string[],
  directives: string[] = ["script-src"],
): string {
  const parsed = parseCsp(policy);
  const tokens = hashes.map((h) => (/^'.*'$/.test(h) ? h : `'${h}'`));
  for (const dir of directives) {
    const existing = parsed[dir];
    parsed[dir] = existing ? unionSources(existing, tokens) : [...tokens];
  }
  return serializeCsp(parsed);
}
