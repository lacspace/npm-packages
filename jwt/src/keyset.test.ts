import { test, expect } from "vitest";
import {
  sign,
  verify,
  createKeySet,
  resolveKey,
  generateKeyPair,
  exportJwk,
  JwtError,
} from "./index";

const SECRET_1 = "secret-one";
const SECRET_2 = "secret-two";

test("key rotation: createKeySet picks the HMAC secret by kid", async () => {
  const keyset = createKeySet([
    { kid: "k1", key: SECRET_1 },
    { kid: "k2", key: SECRET_2 },
  ]);
  const t1 = await sign({ sub: "a" }, SECRET_1, { keyId: "k1" });
  const t2 = await sign({ sub: "b" }, SECRET_2, { keyId: "k2" });
  expect((await verify(t1, keyset)).sub).toBe("a");
  expect((await verify(t2, keyset)).sub).toBe("b");
});

test("key rotation: token signed by wrong key in the set fails signature", async () => {
  const keyset = createKeySet([
    { kid: "k1", key: SECRET_1 },
    { kid: "k2", key: SECRET_2 },
  ]);
  // token claims kid k1 but is actually signed with SECRET_2
  const bad = await sign({ sub: "x" }, SECRET_2, { keyId: "k1" });
  await expect(verify(bad, keyset)).rejects.toMatchObject({ code: "signature" });
});

test("kid miss in a keyset errors cleanly (code: key)", async () => {
  const keyset = createKeySet([{ kid: "k1", key: SECRET_1 }]);
  const t = await sign({ sub: "x" }, SECRET_1, { keyId: "does-not-exist" });
  await expect(verify(t, keyset)).rejects.toMatchObject({ code: "key" });
});

test("keyset entry alg mismatch is rejected", async () => {
  const keyset = createKeySet([{ kid: "k1", alg: "HS512", key: SECRET_1 }]);
  const t = await sign({ sub: "x" }, SECRET_1, { keyId: "k1", algorithm: "HS256" });
  await expect(verify(t, keyset)).rejects.toMatchObject({ code: "algorithm" });
});

test("JWKS-by-kid: verify a token against a fake JWK set", async () => {
  const a = await generateKeyPair("ES256");
  const b = await generateKeyPair("ES256");
  const jwkA = { ...(await exportJwk(a.publicKey)), kid: "kA", alg: "ES256" };
  const jwkB = { ...(await exportJwk(b.publicKey)), kid: "kB", alg: "ES256" };
  const keyset = createKeySet({ keys: [jwkA, jwkB] });

  const tokenA = await sign({ sub: "from-A" }, a.privateKey, { algorithm: "ES256", keyId: "kA" });
  const tokenB = await sign({ sub: "from-B" }, b.privateKey, { algorithm: "ES256", keyId: "kB" });
  expect((await verify(tokenA, keyset, { algorithms: ["ES256"] })).sub).toBe("from-A");
  expect((await verify(tokenB, keyset, { algorithms: ["ES256"] })).sub).toBe("from-B");
});

test("JWKS-by-kid: unknown kid throws code:key", async () => {
  const a = await generateKeyPair("EdDSA");
  const jwkA = { ...(await exportJwk(a.publicKey)), kid: "kA", alg: "EdDSA" };
  const keyset = createKeySet({ keys: [jwkA] });
  const bad = await sign({ sub: "x" }, a.privateKey, { algorithm: "EdDSA", keyId: "ghost" });
  await expect(verify(bad, keyset, { algorithms: ["EdDSA"] })).rejects.toMatchObject({ code: "key" });
});

test("resolveKey selects by kid and errors on miss", async () => {
  const jwks = { keys: [{ kty: "oct", kid: "one" } as JsonWebKey, { kty: "oct", kid: "two" } as JsonWebKey] };
  expect((resolveKey(jwks, { kid: "two" }) as { kid?: string }).kid).toBe("two");
  expect(() => resolveKey(jwks, { kid: "nope" })).toThrow(JwtError);
  // ambiguous: multiple keys, no kid
  expect(() => resolveKey(jwks, {})).toThrow(JwtError);
});

test("remote JWKS uses an injectable fetchImpl and caches (no real network)", async () => {
  const a = await generateKeyPair("ES256");
  const jwkA = { ...(await exportJwk(a.publicKey)), kid: "remote-1", alg: "ES256" };
  let calls = 0;
  const fetchImpl = (async () => {
    calls++;
    return { ok: true, status: 200, json: async () => ({ keys: [jwkA] }) } as Response;
  }) as unknown as typeof fetch;

  const keyset = createKeySet([], { url: "https://issuer/jwks.json", fetchImpl });
  const token = await sign({ sub: "remote-u" }, a.privateKey, { algorithm: "ES256", keyId: "remote-1" });
  expect((await verify(token, keyset, { algorithms: ["ES256"] })).sub).toBe("remote-u");
  await verify(token, keyset, { algorithms: ["ES256"] });
  expect(calls).toBe(1); // cached, fetched exactly once
});

test("createKeySet does NOT hit the network when no url/fetchImpl is given", async () => {
  const a = await generateKeyPair("EdDSA");
  const jwkA = { ...(await exportJwk(a.publicKey)), kid: "k", alg: "EdDSA" };
  const keyset = createKeySet([jwkA]); // bare JsonWebKey[]
  const token = await sign({ sub: "no-net" }, a.privateKey, { algorithm: "EdDSA", keyId: "k" });
  expect((await verify(token, keyset, { algorithms: ["EdDSA"] })).sub).toBe("no-net");
});

test("clockTolerance: exp within leeway passes, outside fails", async () => {
  const token = await sign({ sub: "x" }, SECRET_1, { expiresIn: -5 }); // expired 5s ago
  await expect(verify(token, SECRET_1)).rejects.toMatchObject({ code: "expired" });
  expect((await verify(token, SECRET_1, { clockTolerance: 30 })).sub).toBe("x");
  await expect(verify(token, SECRET_1, { clockTolerance: 2 })).rejects.toMatchObject({ code: "expired" });
});

test("clockTolerance: nbf within leeway passes", async () => {
  const future = Math.floor(Date.now() / 1000) + 5;
  const token = await sign({ sub: "x", nbf: future }, SECRET_1);
  await expect(verify(token, SECRET_1)).rejects.toMatchObject({ code: "not_active" });
  expect((await verify(token, SECRET_1, { clockTolerance: 30 })).sub).toBe("x");
});

test("subject validation: matching passes, mismatch errors (code: subject)", async () => {
  const token = await sign({ sub: "user-42" }, SECRET_1);
  expect((await verify(token, SECRET_1, { subject: "user-42" })).sub).toBe("user-42");
  await expect(verify(token, SECRET_1, { subject: "someone-else" })).rejects.toMatchObject({ code: "subject" });
});

test("jti validation: matching passes, mismatch errors (code: jti)", async () => {
  const token = await sign({ sub: "x", jti: "abc123" }, SECRET_1);
  expect((await verify(token, SECRET_1, { jwtid: "abc123" })).jti).toBe("abc123");
  await expect(verify(token, SECRET_1, { jwtid: "wrong" })).rejects.toMatchObject({ code: "jti" });
});
