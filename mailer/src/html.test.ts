import { describe, it, expect } from "vitest";
import { htmlToText, previewText, preheader, decodeEntities } from "./index";

describe("htmlToText", () => {
  it("strips tags and turns blocks into newlines", () => {
    const out = htmlToText("<h1>Title</h1><p>Line one</p><p>Line two</p>");
    expect(out).toBe("Title\nLine one\nLine two");
  });
  it("drops script/style and decodes entities", () => {
    const out = htmlToText("<style>.x{}</style><p>Tom &amp; Jerry &#169;</p><script>evil()</script>");
    expect(out).toBe("Tom & Jerry ©");
  });
  it("keeps link hrefs as text (url)", () => {
    expect(htmlToText('<a href="https://x.com">click</a>')).toBe("click (https://x.com)");
  });
  it("renders list items as bullets", () => {
    expect(htmlToText("<ul><li>a</li><li>b</li></ul>")).toContain("- a");
  });
});

describe("decodeEntities", () => {
  it("decodes named, decimal and hex references", () => {
    expect(decodeEntities("&lt;a&gt; &#65; &#x42;")).toBe("<a> A B");
  });
});

describe("previewText", () => {
  it("truncates on a word boundary with an ellipsis", () => {
    const p = previewText("The quick brown fox jumps over the lazy dog again and again", 20);
    expect(p.length).toBeLessThanOrEqual(21);
    expect(p.endsWith("…")).toBe(true);
    expect(p).not.toContain("  ");
  });
  it("derives from HTML and collapses whitespace", () => {
    expect(previewText("<p>Hello    <b>world</b></p>")).toBe("Hello world");
  });
});

describe("preheader", () => {
  it("produces a hidden div carrying the text", () => {
    const h = preheader("Your code is 1234");
    expect(h).toContain("display:none");
    expect(h).toContain("Your code is 1234");
  });
});
