import { test, expect } from "vitest";
import { verificationBatch } from "./index";

test("verificationBatch emits meta, html and next together", () => {
  const b = verificationBatch({ google: "abc", bing: "xyz", yandex: "y1" });
  expect(b.meta).toEqual([
    { name: "google-site-verification", content: "abc" },
    { name: "msvalidate.01", content: "xyz" },
    { name: "yandex-verification", content: "y1" },
  ]);
  expect(b.html).toBe(
    [
      '<meta name="google-site-verification" content="abc" />',
      '<meta name="msvalidate.01" content="xyz" />',
      '<meta name="yandex-verification" content="y1" />',
    ].join("\n"),
  );
  expect(b.next).toEqual({
    google: "abc",
    yandex: "y1",
    other: { "msvalidate.01": "xyz" },
  });
});

test("verificationBatch resolves raw names and escapes html", () => {
  const b = verificationBatch({ "custom-verify": 'a"&<b' });
  expect(b.meta).toEqual([{ name: "custom-verify", content: 'a"&<b' }]);
  expect(b.html).toBe('<meta name="custom-verify" content="a&quot;&amp;&lt;b" />');
  expect(b.next).toEqual({ other: { "custom-verify": 'a"&<b' } });
});

test("verificationBatch on an empty record yields empty artefacts", () => {
  expect(verificationBatch({})).toEqual({ meta: [], html: "", next: {} });
});
