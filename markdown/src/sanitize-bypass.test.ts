import { test, expect } from "vitest";
import { sanitizeHtml } from "./index";

// Regression cover for two XSS bypasses in a function whose whole job is to
// prevent XSS. Both are checked with a tag-level oracle: the sanitizer's output
// is canonical, so every real element starts with a literal "<" + letter, and
// escaped "&lt;" text is inert no matter what it contains.
function realTags(out: string): string[] {
  return [...out.matchAll(/<[a-zA-Z][^>]*>/g)].map((m) => m[0]);
}
function hrefOf(out: string): string {
  return /\s(?:href|src)="([^"]*)"/i.exec(out)?.[1] ?? "";
}

// 1. The scheme check ran on the RAW attribute. `&#106;avascript:` starts with
//    "&", which is not a scheme, so it passed — but the browser decodes the
//    reference before parsing the URL and executes javascript:.
test("an entity-encoded javascript: scheme is neutralised", () => {
  for (const href of [
    "&#106;avascript:alert(1)", // decimal
    "&#x6a;avascript:alert(1)", // hex
    "&#106avascript:alert(1)", // no semicolon — browsers accept this too
    "&#X6A;avascript:alert(1)", // upper-case hex marker
    "javascript&colon;alert(1)", // named entity for the colon
    "java&Tab;script:alert(1)", // named entity for whitespace inside the scheme
    "&#0000106;avascript:alert(1)", // leading zeros
  ]) {
    expect(hrefOf(sanitizeHtml(`<a href="${href}">x</a>`)), href).toBe("#");
  }
});

test("a double-encoded reference is left alone, because the browser decodes only once", () => {
  // &amp;#106; decodes to the literal text "&#106;", which the URL parser does
  // not decode again — so it is not a scheme and must not be mangled.
  const out = sanitizeHtml(`<a href="&amp;#106;avascript:alert(1)">x</a>`);
  expect(hrefOf(out)).toBe("&amp;#106;avascript:alert(1)");
});

test("a legitimate href with an entity in the query string survives", () => {
  expect(hrefOf(sanitizeHtml(`<a href="https://a.com/?q=1&amp;r=2">t</a>`))).toBe("https://a.com/?q=1&amp;r=2");
});

// 2. A tag with an unbalanced quote cannot match the well-formed-tag regex, so
//    it fell through UNTOUCHED, and a browser's forgiving parser ran it.
test("a tag with an unbalanced quote is escaped, not passed through", () => {
  for (const input of [
    `<img src="x onerror=alert(1)>`,
    `<img src='x onerror=alert(1)>`,
    `<a href="x onclick=alert(1)>hi</a>`,
  ]) {
    const out = sanitizeHtml(input);
    expect(out, input).toMatch(/^&lt;/);
    // No real element may carry an event handler.
    for (const tag of realTags(out)) expect(tag, input).not.toMatch(/\son[a-z]+\s*=/i);
  }
});

test("a split-tag fragment is escaped instead of left as a dangling '<'", () => {
  const out = sanitizeHtml(`<scr<script>ipt>alert(1)</script>`);
  expect(out).toBe("&lt;scr");
  expect(realTags(out)).toHaveLength(0);
});

test("a well-formed tag whose attribute contains '>' still round-trips intact", () => {
  // The fix must not trade fidelity for safety — this is why the malformed
  // branch only fires when the well-formed branch cannot match.
  expect(sanitizeHtml(`<a title="a>b" href="/x">t</a>`)).toBe(`<a title="a>b" href="/x">t</a>`);
});

test("a bare '<' in prose is untouched", () => {
  expect(sanitizeHtml("a < b and c > d")).toBe("a < b and c > d");
  expect(sanitizeHtml("1 <2")).toBe("1 <2");
});

test("the original vectors still hold", () => {
  const vectors = [
    `<script>alert(1)</script>`, `<SCRIPT>alert(1)</SCRIPT>`, `<img src=x onerror=alert(1)>`,
    `<svg onload=alert(1)>`, `<iframe srcdoc="<script>alert(1)</script>"></iframe>`,
    `<a href="javascript:alert(1)">x</a>`, `<a href="java\tscript:alert(1)">x</a>`,
    `<a href="data:text/html,<script>alert(1)</script>">x</a>`, `<img/src="x"/onerror="alert(1)">`,
    `<!--<script>alert(1)</script>-->`, `<p style="background:url(javascript:alert(1))">x</p>`,
  ];
  for (const v of vectors) {
    const out = sanitizeHtml(v);
    expect(out, v).not.toMatch(/<(script|iframe|svg)\b/i);
    for (const tag of realTags(out)) {
      expect(tag, v).not.toMatch(/\son[a-z]+\s*=/i);
      expect(tag, v).not.toMatch(/\sstyle=/i);
      expect(hrefOf(tag), v).not.toMatch(/^(javascript|data):/i);
    }
  }
});
