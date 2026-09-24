import { test, expect } from "vitest";
import { extractApiKey } from "./index";

// Header names are case-insensitive (RFC 9110 §5.1); `{ "X-Api-Key": … }`
// used to come back as no key at all.
test("extractApiKey reads x-api-key and Authorization in any case", () => {
  for (const src of [{ "x-api-key": "K" }, { "X-Api-Key": "K" }, { "X-API-KEY": "K" }, { authorization: "Bearer K" }, { Authorization: "Bearer K" }, { headers: { "X-Api-Key": "K" } }]) {
    expect(extractApiKey(src)).toBe("K");
  }
  expect(extractApiKey({})).toBeUndefined();
});
