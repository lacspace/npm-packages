import { test, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

test("removes script/style elements and their contents", () => {
  const out = sanitizeHtml('<p>ok</p><script>alert(1)</script><style>body{}</style>');
  expect(out).toContain("<p>ok</p>");
  expect(out.toLowerCase()).not.toContain("<script");
  expect(out).not.toContain("alert(1)");
  expect(out).not.toContain("body{}");
});

test("strips event-handler attributes and dangerous urls", () => {
  const out = sanitizeHtml('<a href="javascript:alert(1)" onclick="steal()">x</a>');
  expect(out.toLowerCase()).not.toContain("javascript:");
  expect(out).not.toContain("onclick");
  expect(out).toContain('href="#"');
  expect(out).toContain(">x</a>");
});

test("drops disallowed tags but keeps their text", () => {
  const out = sanitizeHtml("<div><marquee>hi</marquee> there</div>");
  expect(out).not.toContain("marquee");
  expect(out).toContain("hi");
  expect(out).toContain("there");
  expect(out).toContain("<div>");
});

test("style attribute is dropped by default, allowlist honoured", () => {
  expect(sanitizeHtml('<p style="x">a</p>')).toBe("<p>a</p>");
  const kept = sanitizeHtml('<p style="color:red" id="k">a</p>', { allowedAttributes: ["style", "id"] });
  expect(kept).toContain('style="color:red"');
  expect(kept).toContain('id="k"');
});

test("keeps safe links and images", () => {
  const out = sanitizeHtml('<a href="https://x.com" title="t">go</a><img src="/i.png" alt="i" />');
  expect(out).toContain('href="https://x.com"');
  expect(out).toContain('src="/i.png"');
  expect(out).toContain('alt="i"');
});
