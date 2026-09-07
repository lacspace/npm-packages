import { test, expect } from "vitest";
import {
  generateApiKey,
  authenticateApiKey,
  fingerprint,
  parseKey,
  maskKey,
  scopeSatisfies,
  hasScope,
  hasAllScopes,
  hasAnyScope,
  isExpired,
  isRevoked,
  revoke,
  isRevokedId,
  revocationList,
  rotateApiKey,
  verifyRecord,
  verifyKeyAgainst,
  markUsed,
} from "./index";
import type { StoredApiKey } from "./index";

/* ---------------- fingerprint / labels ---------------- */

test("fingerprint is deterministic, prefixed, and hides the secret", async () => {
  const { key } = await generateApiKey({ prefix: "sk_live" });
  const fp = await fingerprint(key);
  expect(fp).toBe(await fingerprint(key)); // stable
  expect(fp.startsWith("fp_")).toBe(true);
  expect(fp.length).toBe(3 + 12);
  expect(key.includes(fp.slice(3))).toBe(false); // not part of the raw key
});

test("fingerprint differs between keys and honours length", async () => {
  const a = await generateApiKey({ prefix: "sk_live" });
  const b = await generateApiKey({ prefix: "sk_live" });
  expect(await fingerprint(a.key)).not.toBe(await fingerprint(b.key));
  expect((await fingerprint(a.key, { length: 8, prefix: "" })).length).toBe(8);
});

test("parseKey splits prefix / secret / last4 with a multi-segment prefix", async () => {
  const { key, prefix, last4 } = await generateApiKey({ prefix: "sk_live" });
  const p = parseKey(key);
  expect(p.prefix).toBe(prefix);
  expect(p.last4).toBe(last4);
  expect(p.secret.includes("_")).toBe(false);
  expect(`${p.prefix}_${p.secret}`).toBe(key);
});

test("maskKey shows prefix + last4 only", async () => {
  const { key, last4 } = await generateApiKey({ prefix: "sk_live" });
  const masked = maskKey(key);
  expect(masked).toBe(`sk_live_••••${last4}`);
  expect(masked.includes(parseKey(key).secret)).toBe(false);
});

/* ---------------- scopes ---------------- */

test("scopeSatisfies: exact, global, trailing-wildcard, hierarchical", () => {
  expect(scopeSatisfies("read", "read")).toBe(true);
  expect(scopeSatisfies("*", "anything:here")).toBe(true);
  expect(scopeSatisfies("billing:*", "billing:read")).toBe(true);
  expect(scopeSatisfies("billing:*", "billing")).toBe(true);
  expect(scopeSatisfies("billing:*", "billing:invoices:write")).toBe(true);
  expect(scopeSatisfies("billing", "billing:read")).toBe(true); // parent grants child
  expect(scopeSatisfies("billing:read", "billing:write")).toBe(false);
  expect(scopeSatisfies("billing", "billingzzz")).toBe(false); // not a segment boundary
});

test("hasScope works with a record or a bare scope array", () => {
  const record = { hash: "x", scopes: ["billing:*", "read"] };
  expect(hasScope(record, "billing:read")).toBe(true);
  expect(hasScope(record, "read")).toBe(true);
  expect(hasScope(record, "admin")).toBe(false);
  expect(hasScope(["*"], "whatever:you:want")).toBe(true);
  expect(hasScope({ hash: "x" }, "read")).toBe(false); // no scopes
});

test("hasAllScopes / hasAnyScope", () => {
  const record = { hash: "x", scopes: ["billing:*", "read"] };
  expect(hasAllScopes(record, ["billing:read", "read"])).toBe(true);
  expect(hasAllScopes(record, ["billing:read", "write"])).toBe(false);
  expect(hasAnyScope(record, ["write", "billing:refund"])).toBe(true);
  expect(hasAnyScope(record, ["write", "delete"])).toBe(false);
  expect(hasAllScopes(record, [])).toBe(true); // vacuous
  expect(hasAnyScope(record, [])).toBe(false);
});

/* ---------------- expiry (boundary) ---------------- */

test("isExpired boundary matches authenticateApiKey semantics (now > exp)", () => {
  expect(isExpired({ hash: "x" })).toBe(false); // no expiry
  expect(isExpired({ hash: "x", expiresAt: 1000 }, 1000)).toBe(false); // exactly at exp
  expect(isExpired({ hash: "x", expiresAt: 1000 }, 1001)).toBe(true); // past exp
  expect(isExpired({ hash: "x", expiresAt: new Date(1000) }, 999)).toBe(false); // Date accepted
});

/* ---------------- revocation ---------------- */

test("isRevoked via flag, via revokedAt, and revoke() helper is pure", () => {
  expect(isRevoked({ hash: "x" })).toBe(false);
  expect(isRevoked({ hash: "x", revoked: true })).toBe(true);
  expect(isRevoked({ hash: "x", revokedAt: 1000 }, 1000)).toBe(true);
  expect(isRevoked({ hash: "x", revokedAt: 1000 }, 999)).toBe(false);
  const rec: StoredApiKey = { hash: "x", id: "k1" };
  const revoked = revoke(rec, 5);
  expect(revoked.revoked).toBe(true);
  expect(revoked.revokedAt).toBe(5);
  expect(rec.revoked).toBeUndefined(); // original untouched
});

test("revocation list helpers", () => {
  const list = revocationList(["a", "b", "c"]);
  expect(isRevokedId("b", list)).toBe(true);
  expect(isRevokedId("z", list)).toBe(false);
  expect(isRevokedId("a", ["a", "b"])).toBe(true); // plain iterable
});

/* ---------------- rotation ---------------- */

test("rotateApiKey issues a new secret, keeps id/scopes/prefix, updates hash", async () => {
  const { key: oldKey, hash: oldHash, prefix } = await generateApiKey({ prefix: "sk_live" });
  const record = { id: "k1", hash: oldHash, prefix, scopes: ["read"] };
  const rot = await rotateApiKey(record);
  expect(rot.key).not.toBe(oldKey);
  expect(rot.prefix).toBe("sk_live");
  expect(rot.record.id).toBe("k1");
  expect(rot.record.scopes).toEqual(["read"]);
  expect(rot.record.hash).toBe(rot.hash);
  expect(rot.record.hash).not.toBe(oldHash);
  // new key verifies against the new record; old key does not (no grace)
  expect(await verifyRecord(rot.key, rot.record)).not.toBeNull();
  expect(await verifyRecord(oldKey, rot.record)).toBeNull();
});

test("rotation grace window: old + new verify during grace, old fails after", async () => {
  const { key: oldKey, hash: oldHash } = await generateApiKey({ prefix: "sk_live" });
  const record = { id: "k1", hash: oldHash, prefix: "sk_live" };
  const rot = await rotateApiKey(record, { graceMs: 1000, now: 10_000 });

  // during grace (now <= deadline 11_000)
  const oldDuring = await verifyRecord(oldKey, rot.record, { now: 10_500 });
  expect(oldDuring?.matched).toBe("previous");
  const newDuring = await verifyRecord(rot.key, rot.record, { now: 10_500 });
  expect(newDuring?.matched).toBe("current");

  // at the boundary the old hash still works (now === deadline)
  expect(await verifyRecord(oldKey, rot.record, { now: 11_000 })).not.toBeNull();

  // after grace: old fails, new still works
  expect(await verifyRecord(oldKey, rot.record, { now: 11_001 })).toBeNull();
  expect(await verifyRecord(rot.key, rot.record, { now: 11_001 })).not.toBeNull();
});

/* ---------------- verify metadata / last-used ---------------- */

test("verifyKeyAgainst returns WHICH record matched", async () => {
  const a = await generateApiKey({ prefix: "sk_live" });
  const b = await generateApiKey({ prefix: "sk_live" });
  const records = [
    { id: "a", hash: a.hash },
    { id: "b", hash: b.hash },
  ];
  const match = await verifyKeyAgainst(b.key, records);
  expect(match?.record.id).toBe("b");
  expect(match?.matched).toBe("current");
  expect(await verifyKeyAgainst("sk_live_deadbeefdeadbeef", records)).toBeNull();
});

test("verifyRecord/verifyKeyAgainst active:true rejects expired & revoked", async () => {
  const { key, hash } = await generateApiKey({ prefix: "sk_live" });
  const expired = { hash, expiresAt: 500 };
  const revoked = { hash, revoked: true };
  expect(await verifyRecord(key, expired, { now: 1000, active: true })).toBeNull();
  expect(await verifyRecord(key, expired, { now: 1000 })).not.toBeNull(); // default ignores expiry
  expect(await verifyRecord(key, revoked, { active: true })).toBeNull();
  expect(await verifyKeyAgainst(key, [expired], { now: 1000, active: true })).toBeNull();
});

test("markUsed sets lastUsedAt without mutating the original", async () => {
  const rec: StoredApiKey = { hash: "x", id: "k1" };
  const touched = markUsed(rec, 42);
  expect(touched.lastUsedAt).toBe(42);
  expect(rec.lastUsedAt).toBeUndefined();
});

/* ---------------- backward compatibility ---------------- */

test("authenticateApiKey still works with new record fields present", async () => {
  const { key, hash, prefix } = await generateApiKey({ prefix: "sk_live" });
  const record = { id: "k1", hash, prefix, scopes: ["read"], lastUsedAt: 1, previousHash: undefined };
  const out = await authenticateApiKey(key, { resolve: () => record, scopes: ["read"] });
  expect(out.id).toBe("k1");
});
