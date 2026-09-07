import { test, expect } from "vitest";
import { hash, needsRehash } from "./index";

test("needsRehash accepts a RehashParams object (new in 1.1.0)", async () => {
  const stored = await hash("pw", { iterations: 1000 });
  expect(needsRehash(stored, { iterations: 600000 })).toBe(true);
  expect(needsRehash(stored, { iterations: 1000 })).toBe(false);
  expect(needsRehash(stored, {})).toBe(true); // defaults to OWASP target
});

test("needsRehash number form is unchanged (backward compatible)", async () => {
  const stored = await hash("pw", { iterations: 1000 });
  expect(needsRehash(stored, 1000)).toBe(false);
  expect(needsRehash(stored, 2000)).toBe(true);
});
