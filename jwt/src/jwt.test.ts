import { test, expect } from "vitest";
import { sign, verify, issueTokenPair, JwtError } from "./index";
import { toBase64url } from "@lacspace/crypto";

const SECRET = "test-secret-key";

test("HS256 sign → verify roundtrip", async () => {
  const token = await sign({ sub: "user-1", role: "admin" }, SECRET, { expiresIn: 3600 });
  const payload = await verify(token, SECRET);
  expect(payload.sub).toBe("user-1");
  expect(payload.role).toBe("admin");
  expect(typeof payload.exp).toBe("number");
});

test("expired token rejected", async () => {
  const token = await sign({ sub: "x" }, SECRET, { expiresIn: -10 });
  await expect(verify(token, SECRET)).rejects.toMatchObject({ code: "expired" });
});

test("bad signature rejected", async () => {
  const token = await sign({ sub: "x" }, SECRET);
  const tampered = token.slice(0, -3) + (token.endsWith("aaa") ? "bbb" : "aaa");
  await expect(verify(tampered, SECRET)).rejects.toMatchObject({ code: "signature" });
});

test("wrong secret rejected", async () => {
  const token = await sign({ sub: "x" }, SECRET);
  await expect(verify(token, "other-secret")).rejects.toBeInstanceOf(JwtError);
});

test('alg:"none" rejected', async () => {
  const enc = (o: unknown) => toBase64url(new TextEncoder().encode(JSON.stringify(o)));
  const noneToken = `${enc({ alg: "none", typ: "JWT" })}.${enc({ sub: "attacker" })}.`;
  await expect(verify(noneToken, SECRET)).rejects.toMatchObject({ code: "algorithm" });
});

test("issueTokenPair stamps typ + requireTyp gating", async () => {
  const pair = await issueTokenPair({ sub: "user-1" }, SECRET);
  const access = await verify(pair.accessToken, SECRET);
  const refresh = await verify(pair.refreshToken, SECRET);
  expect(access.typ).toBe("access");
  expect(refresh.typ).toBe("refresh");
  expect(typeof pair.refreshJti).toBe("string");

  // requireTyp: "refresh" accepts the refresh token, rejects the access token.
  expect((await verify(pair.refreshToken, SECRET, { requireTyp: "refresh" })).typ).toBe("refresh");
  await expect(verify(pair.accessToken, SECRET, { requireTyp: "refresh" })).rejects.toBeInstanceOf(JwtError);
});
