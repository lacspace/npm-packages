import { test, expect } from "vitest";
import { hash, verify, needsRehash } from "./index";

// Keep iterations low so the suite stays fast & deterministic.
const OPTS = { iterations: 1000 };

test("hash → verify true; wrong password false", async () => {
  const stored = await hash("correct horse", OPTS);
  expect(await verify("correct horse", stored)).toBe(true);
  expect(await verify("wrong horse", stored)).toBe(false);
});

test("verify rejects a malformed stored string", async () => {
  expect(await verify("anything", "not-a-phc-string")).toBe(false);
});

test("needsRehash behavior", async () => {
  const weak = await hash("pw", { iterations: 1000 });
  expect(needsRehash(weak, 600000)).toBe(true); // fewer iterations than target
  expect(needsRehash(weak, 1000)).toBe(false); // meets target
  expect(needsRehash("garbage")).toBe(true); // unparseable → rehash
});

test("same input yields different hashes (random salt) but both verify", async () => {
  const a = await hash("same-input", OPTS);
  const b = await hash("same-input", OPTS);
  expect(a).not.toBe(b);
  expect(await verify("same-input", a)).toBe(true);
  expect(await verify("same-input", b)).toBe(true);
});

test("empty password rejected at hash time", async () => {
  await expect(hash("")).rejects.toThrow();
});
