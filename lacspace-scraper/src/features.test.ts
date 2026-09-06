import { describe, it, expect } from "vitest";
import { applyTransform, parseFieldSpec, splitPipes } from "./transform.js";
import { dedupeRecords } from "./dedupe.js";
import { parseFeed } from "./feed.js";
import { resolveNextLink, buildFollowPlan, recordsFromHtml } from "./scrape.js";
import { applySchemaItems } from "./extract.js";
import { parseHTML } from "./html.js";

describe("applyTransform", () => {
  it("coerces numbers, trims, cases", () => {
    expect(applyTransform("$1,299.50", "number")).toBe(1299.5);
    expect(applyTransform("  9.99 ", "int")).toBe(9);
    expect(applyTransform("abc", "number")).toBeNull();
    expect(applyTransform("  Hello  World ", "trim")).toBe("Hello World");
    expect(applyTransform("Hi", "lower")).toBe("hi");
    expect(applyTransform("Hi", "upper")).toBe("HI");
  });
  it("replace, regex (with group), split, slice, default", () => {
    expect(applyTransform("a-b-c", "replace:-:_")).toBe("a_b_c");
    expect(applyTransform("Price: 42 USD", "regex:(\\d+):1")).toBe("42");
    expect(applyTransform("SKU-000", "regex:\\d+")).toBe("000");
    expect(applyTransform("a,b,c", "split:,")).toEqual(["a", "b", "c"]);
    expect(applyTransform("hello", "slice:0:2")).toBe("he");
    expect(applyTransform("", "default:n/a")).toBe("n/a");
    expect(applyTransform("x", "default:n/a")).toBe("x");
  });
  it("absolute resolves against base; chains pipes; maps arrays element-wise", () => {
    expect(applyTransform("/p/1", "absolute", { base: "https://acme.com" })).toBe("https://acme.com/p/1");
    // chain: trim then number
    expect(applyTransform("  12,000 ", "trim | number")).toBe(12000);
    // element-wise over an array (from all:true)
    expect(applyTransform(["/a", "/b"], "absolute", { base: "https://x.io" }))
      .toEqual(["https://x.io/a", "https://x.io/b"]);
    // prepend/append
    expect(applyTransform("id", ["prepend:#", "upper"])).toBe("#ID");
  });
});

describe("parseFieldSpec", () => {
  it("parses selector, @attr and [] exactly like the old CLI parser", () => {
    expect(parseFieldSpec("h1")).toEqual({ selector: "h1" });
    expect(parseFieldSpec("a@href[]")).toEqual({ selector: "a", attr: "href", all: true });
    expect(parseFieldSpec("h3 a@title")).toEqual({ selector: "h3 a", attr: "title" });
  });
  it("captures a transform pipe (single + chained)", () => {
    expect(parseFieldSpec(".price | number")).toEqual({ selector: ".price", transform: "number" });
    expect(parseFieldSpec(".date | date | trim")).toEqual({ selector: ".date", transform: ["date", "trim"] });
    expect(parseFieldSpec("a@href[] | absolute")).toEqual({ selector: "a", attr: "href", all: true, transform: "absolute" });
  });
  it("splitPipes ignores | inside [attr] and (regex) groups", () => {
    expect(splitPipes("a[lang|=en]@href | trim")).toEqual(["a[lang|=en]@href ", " trim"]);
    expect(splitPipes(".x | regex:(a|b)")).toEqual([".x ", " regex:(a|b)"]);
  });
  it("transforms flow through schema extraction", () => {
    const root = parseHTML(`<ul><li class="p"><span class="pr">$9.99</span><a href="/x">go</a></li></ul>`);
    const rows = applySchemaItems(root, "li.p", {
      price: parseFieldSpec(".pr | number"),
      link: parseFieldSpec("a@href | absolute"),
    }, "https://shop.io");
    expect(rows[0]).toEqual({ price: 9.99, link: "https://shop.io/x" });
  });
});

describe("dedupeRecords", () => {
  const rows = [
    { id: 1, name: "a" }, { id: 2, name: "b" }, { id: 1, name: "a" }, { id: 3, name: "b" },
  ];
  it("--unique drops later records sharing a field value", () => {
    expect(dedupeRecords(rows, { unique: "id" }).map((r) => r.id)).toEqual([1, 2, 3]);
  });
  it("--dedupe drops fully-identical records only", () => {
    expect(dedupeRecords(rows, { dedupe: true })).toHaveLength(3); // the exact {id:1,name:a} dup removed
  });
  it("--limit caps output (and 0 → empty)", () => {
    expect(dedupeRecords(rows, { limit: 2 })).toHaveLength(2);
    expect(dedupeRecords(rows, { limit: 0 })).toHaveLength(0);
  });
});

describe("resolveNextLink", () => {
  const html = `<html><body><a class="next" href="/page/2">Older</a></body></html>`;
  it("resolves the next-page link, absolutized, minus #fragment", () => {
    expect(resolveNextLink(html, "a.next", "https://blog.io/page/1")).toBe("https://blog.io/page/2");
  });
  it("returns undefined when the next link is absent", () => {
    expect(resolveNextLink("<html><body><p>end</p></body></html>", "a.next", "https://blog.io")).toBeUndefined();
  });
});

describe("buildFollowPlan", () => {
  it("plans one fetch per record with a usable URL, resolving against record.url", () => {
    const records = [
      { url: "https://s.io/list", link: "/p/1" },
      { url: "https://s.io/list", link: "/p/2" },
      { url: "https://s.io/list", link: "" }, // skipped
    ];
    const plan = buildFollowPlan(records, "link");
    expect(plan).toEqual([
      { index: 0, url: "https://s.io/p/1" },
      { index: 1, url: "https://s.io/p/2" },
    ]);
  });
  it("uses the first element of an array value and an explicit base", () => {
    const plan = buildFollowPlan([{ links: ["/a", "/b"] }], "links", "https://x.io");
    expect(plan).toEqual([{ index: 0, url: "https://x.io/a" }]);
  });
});

describe("parseFeed", () => {
  it("parses an RSS 2.0 feed into records", () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
      <title>Blog</title>
      <item><title>First &amp; Best</title><link>https://blog.io/1</link><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate><description>Hello</description><guid>g1</guid></item>
      <item><title>Second</title><link>https://blog.io/2</link><description><![CDATA[<b>rich</b>]]></description></item>
    </channel></rss>`;
    const items = parseFeed(rss);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ title: "First & Best", link: "https://blog.io/1", id: "g1" });
    expect(items[1]!.summary).toContain("rich");
  });
  it("parses an Atom feed and a JSON Feed", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>A</title>
      <entry><title>Post</title><link rel="alternate" href="https://a.io/p"/><updated>2026-01-01T00:00:00Z</updated><author><name>Ada</name></author><id>u1</id></entry>
    </feed>`;
    const a = parseFeed(atom);
    expect(a[0]).toMatchObject({ title: "Post", link: "https://a.io/p", author: "Ada", id: "u1" });

    const json = JSON.stringify({ version: "https://jsonfeed.org/version/1.1", items: [{ id: "1", url: "https://j.io/1", title: "JF", content_text: "body" }] });
    const j = parseFeed(json);
    expect(j[0]).toMatchObject({ title: "JF", link: "https://j.io/1", summary: "body" });
  });
});

describe("follow field injection (records untouched when follow is a plain field)", () => {
  it("recordsFromHtml still yields plain item records", () => {
    const html = `<ul><li class="c"><h3>W</h3><a href="/p/1">buy</a></li></ul>`;
    const recs = recordsFromHtml(html, "https://acme.io", 200, {
      schema: { name: "h3", link: parseFieldSpec("a@href") }, item: "li.c",
    });
    expect(recs[0]).toMatchObject({ url: "https://acme.io", name: "W", link: "https://acme.io/p/1" });
  });
});
