import { test, expect } from "vitest";
import { verificationFile, verificationFileFor } from "./index";

// Search Console hands out a filename, `google<code>.html`. People paste it with
// the extension, without it, or paste just the code — and the first two of
// those are the common cases. The builder must produce the SAME correct file
// from all three, because a wrong filename never verifies and gives no error.
const GOOGLE = { path: "/google1234abcd.html", content: "google-site-verification: google1234abcd.html", contentType: "text/html" };

test("google: bare code, full filename and filename-without-extension all give the same file", () => {
  expect(verificationFile("google", "1234abcd")).toEqual(GOOGLE);
  expect(verificationFile("google", "google1234abcd.html")).toEqual(GOOGLE);
  expect(verificationFile("google", "google1234abcd")).toEqual(GOOGLE); // was /googlegoogle1234abcd.html
  expect(verificationFile("google", "1234abcd.html")).toEqual(GOOGLE);
});

test("google: the builder is idempotent on its own output filename", () => {
  const once = verificationFile("google", "1234abcd");
  expect(verificationFile("google", once.path.slice(1))).toEqual(once);
});

// Yandex hands out `yandex_<code>.html`, and the meta tag wants the BARE code.
test("yandex: every token form gives the same file, with the bare code in the meta tag", () => {
  const want = verificationFile("yandex", "abc123");
  expect(want.path).toBe("/yandex_abc123.html");
  expect(want.content).toContain('content="abc123"');
  expect(want.content).toContain("Verification: abc123");
  expect(want.content).not.toContain("yandex_abc123"); // the prefixed token must not leak into the body
  expect(verificationFile("yandex", "yandex_abc123")).toEqual(want); // was /yandex_abc123 with no .html
  expect(verificationFile("yandex", "yandex_abc123.html")).toEqual(want);
  expect(verificationFile("yandex", "abc123.html")).toEqual(want);
});

test("bing is unaffected", () => {
  const f = verificationFile("bing", "ABC123");
  expect(f.path).toBe("/BingSiteAuth.xml");
  expect(f.content).toContain("<user>ABC123</user>");
});

test("verificationFileFor still delegates to the same normalised result", () => {
  expect(verificationFileFor("google", "google1234abcd")).toEqual(GOOGLE);
  expect(verificationFileFor("yandex", "yandex_abc123")).toEqual(verificationFile("yandex", "abc123"));
});
