import { test, expect } from "vitest";
import { redactString, redactObject } from "./index";

// AWS access key IDs have no separator after the prefix (AKIAIOSFODNN7EXAMPLE);
// the apiKey pattern required `AKIA[_-]`, so every one of them passed through.
test("AWS access key IDs are redacted in strings and objects", () => {
  const out = redactString("key AKIAIOSFODNN7EXAMPLE temp ASIAQWERTYUIOP123456");
  expect(out).not.toContain("AKIAIOSFODNN7EXAMPLE");
  expect(out).not.toContain("ASIAQWERTYUIOP123456");
  expect(JSON.stringify(redactObject({ note: "creds AKIAIOSFODNN7EXAMPLE" }))).not.toContain("IOSFODNN7EXAMPLE");
});

test("prefixed keys are still redacted and short lookalikes are left alone", () => {
  const out = redactString("lac_live_abcdefghij sk_test_1234567890 AKIAKAKA is fine");
  expect(out).not.toContain("lac_live_abcdefghij");
  expect(out).not.toContain("sk_test_1234567890");
  expect(out).toContain("AKIAKAKA is fine");
});
