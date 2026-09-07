import { test, expect } from "vitest";
import { toPlainText, otpEmail, welcomeEmail, passwordResetEmail } from "./index";

test("toPlainText strips tags and keeps text", () => {
  const out = toPlainText("<h1>Hello</h1><p>World & <b>you</b></p>");
  expect(out).toBe("Hello\nWorld & you");
});

test("toPlainText turns links into 'label (href)'", () => {
  const out = toPlainText('<a href="https://x.io/go">Click here</a>');
  expect(out).toBe("Click here (https://x.io/go)");
});

test("toPlainText drops head/style/script and hidden preheader", () => {
  const out = toPlainText(
    "<head><style>.a{color:red}</style></head>" +
      '<div style="display:none;max-height:0;">secret preview</div>' +
      "<p>Visible</p><script>evil()</script>",
  );
  expect(out).toBe("Visible");
  expect(out).not.toContain("secret preview");
  expect(out).not.toContain("color:red");
});

test("toPlainText decodes entities produced by escapeHtml", () => {
  const out = toPlainText("<p>a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39;</p>");
  expect(out).toBe(`a & b <c> "d" 'e'`);
});

test("toPlainText bullets list items", () => {
  const out = toPlainText("<ul><li>one</li><li>two</li></ul>");
  expect(out).toBe("• one\n• two");
});

test("toPlainText of a real rendered email keeps the CTA url and drops markup", () => {
  const html = passwordResetEmail({ resetUrl: "https://x.io/reset?t=abc", brandName: "Lacspace" });
  const text = toPlainText(html);
  expect(text).not.toContain("<");
  expect(text).toContain("https://x.io/reset?t=abc");
  expect(text).toContain("Reset your password");
});

test("toPlainText of otpEmail preserves the code, no tags", () => {
  const text = toPlainText(otpEmail({ code: "482913" }));
  expect(text).toContain("482913");
  expect(text).not.toMatch(/<[a-z]/i);
});

test("toPlainText collapses excess blank lines", () => {
  const out = toPlainText(welcomeEmail({ name: "Ada", ctaHref: "https://x.io" }));
  expect(out).not.toMatch(/\n{3,}/);
});
