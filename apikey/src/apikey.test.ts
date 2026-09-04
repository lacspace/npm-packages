import { test, expect } from "vitest";
import { generateApiKey, verifyApiKey, parseApiKey, isValidKeyFormat } from "./index";

test("generateApiKey → verifyApiKey true; wrong key false", async () => {
  const { key, hash } = await generateApiKey();
  expect(await verifyApiKey(key, hash)).toBe(true);
  expect(await verifyApiKey(key + "x", hash)).toBe(false);
  expect(await verifyApiKey("lac_deadbeef", hash)).toBe(false);
});

test("parseApiKey handles single-segment prefix", async () => {
  const { key } = await generateApiKey({ prefix: "lac" });
  expect(parseApiKey(key).prefix).toBe("lac");
});

test("parseApiKey handles multi-segment prefix", async () => {
  const { key, prefix } = await generateApiKey({ prefix: "lac_live" });
  expect(prefix).toBe("lac_live");
  expect(parseApiKey(key).prefix).toBe("lac_live");
});

test("last4 matches the tail of the key", async () => {
  const { key, last4 } = await generateApiKey({ prefix: "lac_live" });
  expect(parseApiKey(key).last4).toBe(last4);
  expect(key.endsWith(last4)).toBe(true);
});

test("isValidKeyFormat true for generated keys", async () => {
  const { key } = await generateApiKey({ prefix: "lac_live" });
  expect(isValidKeyFormat(key)).toBe(true);
  expect(isValidKeyFormat("lac_short")).toBe(false);
  expect(isValidKeyFormat("nounderscorehere")).toBe(false);
});

test("the secret (after the last underscore) contains no underscore", async () => {
  const { key } = await generateApiKey({ prefix: "lac_live" });
  const secret = key.slice(key.lastIndexOf("_") + 1);
  expect(secret.includes("_")).toBe(false);
  expect(secret.length).toBeGreaterThanOrEqual(16);
});
