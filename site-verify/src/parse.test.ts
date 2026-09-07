import { test, expect } from "vitest";
import { parseVerificationMeta, allVerifications, verificationBatch } from "./index";

test("parseVerificationMeta maps known meta names back to provider ids", () => {
  const html = `
    <head>
      <meta name="google-site-verification" content="abc" />
      <meta name="msvalidate.01" content="xyz">
      <meta name='yandex-verification' content='y1'>
    </head>`;
  expect(parseVerificationMeta(html)).toEqual({ google: "abc", bing: "xyz", yandex: "y1" });
});

test("parseVerificationMeta keeps unknown verification-looking names raw and ignores the rest", () => {
  const html = `
    <meta name="custom-verify" content="t">
    <meta name="description" content="not a verification tag">
    <meta charset="utf-8">`;
  expect(parseVerificationMeta(html)).toEqual({ "custom-verify": "t" });
});

test("parseVerificationMeta round-trips allVerifications output", () => {
  const record = { google: "abc", bing: "xyz", "custom-verify": "t" };
  const html = allVerifications(record)
    .map((t) => `<meta name="${t.name}" content="${t.content}" />`)
    .join("\n");
  expect(parseVerificationMeta(html)).toEqual(record);
});

test("parseVerificationMeta round-trips a batch html string with escaping", () => {
  const record = { google: "abc", "custom-verify": 'a"&<b' };
  const { html } = verificationBatch(record);
  expect(parseVerificationMeta(html)).toEqual(record);
});

test("parseVerificationMeta reads facebook via property attribute fallback", () => {
  const html = '<meta property="facebook-domain-verification" content="fb1" />';
  expect(parseVerificationMeta(html)).toEqual({ facebook: "fb1" });
});
