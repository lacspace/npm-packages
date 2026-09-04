import { test, expect } from "vitest";
import { markdownToHtml } from "./index";

test("basic bold / heading / code render", () => {
  expect(markdownToHtml("**bold**")).toContain("<strong>bold</strong>");
  const h = markdownToHtml("# Hello");
  expect(h).toContain("<h1");
  expect(h).toContain("Hello</h1>");
  expect(markdownToHtml("`x = 1`")).toContain("<code>x = 1</code>");
});

test("XSS: javascript: / data: / vbscript: hrefs are neutralized to #", () => {
  const js = markdownToHtml("[x](javascript:alert(1))");
  expect(js).not.toContain("javascript:");
  expect(js).toContain('href="#"');

  const data = markdownToHtml("![i](data:text/html,<script>alert(1)</script>)");
  expect(data.toLowerCase()).not.toContain("data:text/html");
  expect(data).toContain('src="#"');

  const vb = markdownToHtml("[x](vbscript:msgbox(1))");
  expect(vb.toLowerCase()).not.toContain("vbscript:");
  expect(vb).toContain('href="#"');
});

test("XSS: obfuscated scheme with control chars still rejected", () => {
  // A non-whitespace control char (\x01) is admitted by the link URL parser but
  // stripped by safeUrl before scheme testing, so the javascript: scheme is caught.
  const out = markdownToHtml("[x](java\x01script:alert\x02(1))");
  expect(out.toLowerCase()).not.toContain("javascript:");
  expect(out).toContain('href="#"');
});

test("safe URLs are preserved", () => {
  expect(markdownToHtml("[a](https://example.com)")).toContain('href="https://example.com"');
  expect(markdownToHtml("[a](/root/path)")).toContain('href="/root/path"');
  expect(markdownToHtml("[a](#frag)")).toContain('href="#frag"');
  expect(markdownToHtml("[a](mailto:hi@example.com)")).toContain('href="mailto:hi@example.com"');
});

test("headingOffset can't produce <h0>", () => {
  const out = markdownToHtml("# Title", { headingOffset: -5 });
  expect(out).not.toContain("<h0");
  expect(out).toContain("<h1");
});

test("raw HTML in source is escaped", () => {
  const out = markdownToHtml("<script>alert(1)</script>");
  expect(out).not.toContain("<script>");
  expect(out).toContain("&lt;script&gt;");
});
