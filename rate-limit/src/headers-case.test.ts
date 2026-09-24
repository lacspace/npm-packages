import { test, expect } from "vitest";
import { ipKeyFromRequest } from "./index";

// Header names are case-insensitive (RFC 9110 §5.1); `{ "X-Forwarded-For": … }`
// used to rate-limit every client under the single key "unknown".
test("ipKeyFromRequest reads proxy headers in any case", () => {
  expect(ipKeyFromRequest({ "X-Forwarded-For": "1.1.1.1" })).toBe("1.1.1.1");
  expect(ipKeyFromRequest({ "CF-Connecting-IP": "9.9.9.9", "x-forwarded-for": "1.1.1.1" })).toBe("9.9.9.9");
  expect(ipKeyFromRequest({ "X-Real-IP": "3.3.3.3" })).toBe("3.3.3.3");
});
