/**
 * @lacspace/jwt — key sets, JWKS-by-`kid` selection & key rotation.
 *
 * A {@link createKeySet} resolver lets {@link verify} pick the right verification
 * key from MULTIPLE candidates by the token's `kid` header — for key rotation and
 * for verifying against a JWKS. Works with a static JWKS, raw rotation entries
 * (HMAC secrets or CryptoKeys), and — with an INJECTABLE `fetchImpl` (off by
 * default, never hits the network on its own) — a cached remote JWKS.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

import { importJwk, JwtError, type Algorithm, type KeyResolver, type SigningKey } from "./index";

/** A JSON Web Key Set. */
export interface Jwks {
  keys: JsonWebKey[];
}

/** A single rotation candidate: a signing/verification key, tagged by `kid` (and optionally `alg`). */
export interface KeySetEntry {
  kid?: string;
  alg?: Algorithm;
  key: SigningKey;
}

export interface KeySetOptions {
  /**
   * Injectable `fetch` used to (re)load a remote JWKS from {@link KeySetOptions.url}.
   * REMOTE fetching is OFF by default — with no `url`/`fetchImpl` the key set is purely
   * in-memory and never touches the network (safe in tests).
   */
  fetchImpl?: typeof fetch;
  /** Remote JWKS URL to fetch/refresh with `fetchImpl`. */
  url?: string;
  /** Re-fetch the remote JWKS at most once per this window (ms). Default 600000 (10 min). */
  cacheMaxAgeMs?: number;
}

function isJwks(v: unknown): v is Jwks {
  return !!v && typeof v === "object" && Array.isArray((v as Jwks).keys);
}

function isEntryArray(v: unknown): v is KeySetEntry[] {
  return Array.isArray(v) && v.every((e) => e && typeof e === "object" && "key" in (e as object));
}

/**
 * Select a single JWK from a key set by `kid` (and optionally `alg`). When no
 * `kid` is requested and the set holds exactly one key, that key is returned.
 * Throws a typed {@link JwtError} (`code: "key"`) when nothing matches.
 */
export function resolveKey(jwks: Jwks | JsonWebKey[], sel: { kid?: string; alg?: Algorithm } = {}): JsonWebKey {
  const keys = Array.isArray(jwks) ? jwks : jwks.keys;
  let matches = keys;
  if (sel.kid !== undefined) matches = matches.filter((k) => (k as { kid?: string }).kid === sel.kid);
  if (sel.alg !== undefined) {
    const byAlg = matches.filter((k) => (k as { alg?: string }).alg === sel.alg);
    if (byAlg.length) matches = byAlg;
  }
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0)
    throw new JwtError(sel.kid !== undefined ? `no JWK found for kid "${sel.kid}"` : "no JWK in key set", "key");
  // Ambiguous: multiple keys and no distinguishing kid.
  if (sel.kid === undefined) throw new JwtError("ambiguous key set — token has no kid to select a key", "key");
  return matches[0]!;
}

/**
 * Build a {@link KeyResolver} for {@link verify} that picks a key by the token's
 * `kid` — supporting key rotation and JWKS verification.
 *
 * `source` may be a JWKS (`{ keys }` or a `JsonWebKey[]`), or an array of raw
 * {@link KeySetEntry} candidates (HMAC secrets / CryptoKeys tagged by `kid`).
 * Imported JWK CryptoKeys are cached. Pass `opts.url` + `opts.fetchImpl` to also
 * refresh from a remote JWKS (cached for `cacheMaxAgeMs`).
 *
 * @example
 *   const keyset = createKeySet(jwks);                 // static, in-memory
 *   const payload = await verify(token, keyset, { algorithms: ["ES256"] });
 * @example
 *   const keyset = createKeySet([{ kid: "k1", key: SECRET_1 }, { kid: "k2", key: SECRET_2 }]);
 */
export function createKeySet(
  source: Jwks | JsonWebKey[] | KeySetEntry[] = [],
  opts: KeySetOptions = {},
): KeyResolver {
  const ttl = opts.cacheMaxAgeMs ?? 600000;
  const entries: KeySetEntry[] = isEntryArray(source) ? source : [];
  let jwkList: JsonWebKey[] = isJwks(source) ? source.keys : isEntryArray(source) ? [] : (source as JsonWebKey[]);
  const imported = new Map<string, CryptoKey>();
  let fetchedAt = 0;

  const remoteFetch = async (): Promise<void> => {
    if (!opts.url || !opts.fetchImpl) return;
    if (jwkList.length && Date.now() - fetchedAt < ttl) return;
    const res = await opts.fetchImpl(opts.url);
    if (!res.ok) throw new JwtError(`JWKS fetch failed: ${res.status}`, "key");
    const data = (await res.json()) as { keys?: JsonWebKey[] };
    jwkList = data.keys ?? [];
    fetchedAt = Date.now();
    imported.clear();
  };

  return async ({ alg, kid }) => {
    // 1) Raw rotation entries (HMAC secrets / CryptoKeys) — matched by kid, then alg.
    if (entries.length) {
      const cand =
        entries.find((e) => (kid === undefined ? e.kid === undefined : e.kid === kid)) ??
        (kid === undefined && entries.length === 1 ? entries[0] : undefined);
      if (!cand) throw new JwtError(kid !== undefined ? `no key for kid "${kid}"` : "ambiguous key set — token has no kid", "key");
      if (cand.alg && alg && cand.alg !== alg)
        throw new JwtError(`key "${kid ?? ""}" is for ${cand.alg}, token uses ${alg}`, "algorithm");
      return cand.key;
    }
    // 2) JWKS (static and/or remote).
    await remoteFetch();
    const jwk = resolveKey(jwkList, { kid, alg });
    const keyAlg = ((jwk as { alg?: string }).alg as Algorithm) ?? alg;
    const cacheKey = `${keyAlg}:${kid ?? (jwk as { kid?: string }).kid ?? ""}`;
    let ck = imported.get(cacheKey);
    if (!ck) {
      ck = await importJwk(jwk, keyAlg);
      imported.set(cacheKey, ck);
    }
    return ck;
  };
}
