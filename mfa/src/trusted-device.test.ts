import { test, expect } from "vitest";
import { issueTrustedDevice, verifyTrustedDevice } from "./index";

const secret = "unit-test-secret-key";

test("issue → verify round-trips valid claims", async () => {
  const token = await issueTrustedDevice({
    sub: "user_1",
    device: "dev_abc",
    secret,
    ttlMs: 60_000,
    scope: ["totp"],
    now: () => 1_000,
  });
  const claims = await verifyTrustedDevice(token, secret, { now: () => 2_000 });
  expect(claims).not.toBeNull();
  expect(claims!.sub).toBe("user_1");
  expect(claims!.device).toBe("dev_abc");
  expect(claims!.iat).toBe(1_000);
  expect(claims!.exp).toBe(61_000);
  expect(claims!.scope).toEqual(["totp"]);
});

test("expired token verifies to null", async () => {
  const token = await issueTrustedDevice({
    sub: "u",
    device: "d",
    secret,
    ttlMs: 1_000,
    now: () => 0,
  });
  expect(await verifyTrustedDevice(token, secret, { now: () => 500 })).not.toBeNull();
  expect(await verifyTrustedDevice(token, secret, { now: () => 1_001 })).toBeNull();
});

test("wrong secret or tampered token fails", async () => {
  const token = await issueTrustedDevice({ sub: "u", device: "d", secret, ttlMs: 60_000, now: () => 0 });
  expect(await verifyTrustedDevice(token, "other-secret", { now: () => 1 })).toBeNull();
  const tampered = token.slice(0, -2) + (token.endsWith("A") ? "BB" : "AA");
  expect(await verifyTrustedDevice(tampered, secret, { now: () => 1 })).toBeNull();
});

test("sub/device expectations are enforced", async () => {
  const token = await issueTrustedDevice({ sub: "u1", device: "d1", secret, ttlMs: 60_000, now: () => 0 });
  expect(await verifyTrustedDevice(token, secret, { now: () => 1, sub: "u1", device: "d1" })).not.toBeNull();
  expect(await verifyTrustedDevice(token, secret, { now: () => 1, sub: "u2" })).toBeNull();
  expect(await verifyTrustedDevice(token, secret, { now: () => 1, device: "d2" })).toBeNull();
});

test("malformed tokens verify to null without throwing", async () => {
  expect(await verifyTrustedDevice("", secret)).toBeNull();
  expect(await verifyTrustedDevice("nodot", secret)).toBeNull();
  expect(await verifyTrustedDevice("a.b.c", secret)).toBeNull();
});
