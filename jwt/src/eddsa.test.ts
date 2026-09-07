import { test, expect } from "vitest";
import {
  sign,
  verify,
  decode,
  generateKeyPair,
  exportJwk,
  importJwk,
  JwtError,
  type Algorithm,
} from "./index";

test("EdDSA (Ed25519) sign → verify roundtrip", async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const token = await sign({ sub: "u-ed" }, privateKey, { algorithm: "EdDSA", expiresIn: 60 });
  const payload = await verify(token, publicKey, { algorithms: ["EdDSA"] });
  expect(payload.sub).toBe("u-ed");
  expect(decode(token).header.alg).toBe("EdDSA");
});

test("EdDSA wrong key rejected", async () => {
  const a = await generateKeyPair("EdDSA");
  const b = await generateKeyPair("EdDSA");
  const token = await sign({ sub: "u1" }, a.privateKey, { algorithm: "EdDSA" });
  await expect(verify(token, b.publicKey, { algorithms: ["EdDSA"] })).rejects.toMatchObject({ code: "signature" });
});

for (const alg of ["ES256", "ES384", "ES512"] as Algorithm[]) {
  test(`${alg} sign → verify roundtrip`, async () => {
    const { privateKey, publicKey } = await generateKeyPair(alg);
    const token = await sign({ sub: `u-${alg}` }, privateKey, { algorithm: alg });
    const payload = await verify(token, publicKey, { algorithms: [alg] });
    expect(payload.sub).toBe(`u-${alg}`);
  });
}

test("exportJwk → importJwk roundtrip verifies", async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const pubJwk = await exportJwk(publicKey);
  expect(pubJwk.kty).toBe("OKP");
  expect(pubJwk.crv).toBe("Ed25519");
  const token = await sign({ sub: "jwk-u" }, privateKey, { algorithm: "EdDSA" });
  const reimported = await importJwk(pubJwk, "EdDSA");
  const payload = await verify(token, reimported, { algorithms: ["EdDSA"] });
  expect(payload.sub).toBe("jwk-u");
});

test("importJwk with extractable:true can be re-exported", async () => {
  const { publicKey } = await generateKeyPair("ES256");
  const jwk = await exportJwk(publicKey);
  const reimported = await importJwk(jwk, "ES256", true);
  const again = await exportJwk(reimported);
  expect(again.x).toBe(jwk.x);
});

test("generateKeyPair rejects symmetric alg", async () => {
  await expect(generateKeyPair("HS256")).rejects.toBeInstanceOf(JwtError);
});

test("custom protected header fields (typ/cty/custom) are set; alg stays enforced", async () => {
  const token = await sign({ sub: "u1" }, "s3cret", {
    header: { typ: "at+jwt", cty: "example", myField: 7, alg: "HStamper" },
    keyId: "k9",
  });
  const { header } = decode(token);
  expect(header.typ).toBe("at+jwt");
  expect(header.cty).toBe("example");
  expect(header.myField).toBe(7);
  expect(header.kid).toBe("k9");
  expect(header.alg).toBe("HS256"); // alg can never be overridden by header
  // still verifies fine
  expect((await verify(token, "s3cret")).sub).toBe("u1");
});

test("default header unchanged when no header option passed", async () => {
  const token = await sign({ sub: "u1" }, "s3cret");
  const { header } = decode(token);
  expect(header).toEqual({ alg: "HS256", typ: "JWT" });
});
