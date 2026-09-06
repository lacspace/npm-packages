import { describe, it, expect } from "vitest";
import { parseHTML, innerText, decodeEntities } from "./html.js";
import { queryAll, queryOne } from "./select.js";
import {
  applySchema, applySchemaItems, autoExtract,
  extractEmails, extractPhones, extractLinks, extractTables, extractOpenGraph, extractJsonLd, extractHeadings,
} from "./extract.js";
import { parseRobots } from "./robots.js";
import { serializeRows, columnsOf } from "./convert.js";

const HTML = `
<!doctype html><html lang="en"><head>
  <title>Acme &amp; Co</title>
  <meta name="description" content="We sell things">
  <meta property="og:title" content="Acme OG">
  <meta property="og:image" content="https://cdn.acme.com/og.png">
  <link rel="canonical" href="/home">
  <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
</head><body>
  <header><nav><a href="/about">About</a></nav></header>
  <main>
    <h1>Welcome</h1>
    <p>Contact us at hello@acme.com or call +977 1 4444444.</p>
    <ul class="products">
      <li class="card"><h3>Widget</h3><span class="price">$9.99</span><a href="/p/1">buy</a></li>
      <li class="card"><h3>Gadget</h3><span class="price">$19.99</span><a href="/p/2">buy</a></li>
    </ul>
    <table><tr><th>Name</th><th>Qty</th></tr><tr><td>A</td><td>2</td></tr><tr><td>B</td><td>5</td></tr></table>
  </main>
</body></html>`;

describe("parseHTML + innerText", () => {
  const root = parseHTML(HTML);
  it("decodes entities in text", () => {
    expect(innerText(queryOne(root, "title")!)).toBe("Acme & Co");
  });
  it("parses nested structure", () => {
    expect(queryAll(root, "li.card").length).toBe(2);
    expect(innerText(queryOne(root, "main h1")!)).toBe("Welcome");
  });
  it("decodeEntities handles named + numeric", () => {
    expect(decodeEntities("a &amp; b &#38; c &#x26; d")).toBe("a & b & c & d");
  });
  it("does not choke on scripts/comments", () => {
    expect(parseHTML("<div><!-- x --><script>var a='<b>';</script><p>ok</p></div>")).toBeTruthy();
    expect(innerText(queryOne(parseHTML("<div><script>1<2</script><p>ok</p></div>"), "p")!)).toBe("ok");
  });
});

describe("selectors", () => {
  const root = parseHTML(HTML);
  it("class, id, descendant, child", () => {
    expect(queryAll(root, ".price").map((e) => innerText(e))).toEqual(["$9.99", "$19.99"]);
    expect(queryAll(root, "ul.products > li").length).toBe(2);
    expect(queryAll(root, "main p").length).toBe(1);
  });
  it("attribute operators", () => {
    expect(queryAll(root, 'a[href^="/p/"]').length).toBe(2);
    expect(queryAll(root, 'meta[property="og:title"]').length).toBe(1);
    expect(queryAll(root, '[href$="/1"]').length).toBe(1);
  });
  it("selector list + pseudos", () => {
    expect(queryAll(root, "h1,h3").length).toBe(3);
    expect(innerText(queryOne(root, "li.card:first-child h3")!)).toBe("Widget");
    expect(innerText(queryOne(root, "li.card:last-child h3")!)).toBe("Gadget");
  });
});

describe("schema extraction", () => {
  const root = parseHTML(HTML);
  it("applySchema — single record with attrs + all", () => {
    const rec = applySchema(root, {
      title: "h1",
      canonical: { selector: 'link[rel="canonical"]', attr: "@href" },
      links: { selector: "a", attr: "@href", all: true },
    }, "https://acme.com");
    expect(rec.title).toBe("Welcome");
    expect(rec.canonical).toBe("https://acme.com/home"); // absolutized
    expect((rec.links as string[])).toContain("https://acme.com/p/1");
  });
  it("applySchemaItems — one record per card", () => {
    const rows = applySchemaItems(root, "li.card", { name: "h3", price: ".price", url: { selector: "a", attr: "@href" } }, "https://acme.com");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Widget", price: "$9.99", url: "https://acme.com/p/1" });
  });
});

describe("auto extractors", () => {
  const root = parseHTML(HTML);
  it("emails + phones", () => {
    expect(extractEmails(root)).toContain("hello@acme.com");
    expect(extractPhones(root).some((p) => p.replace(/\D/g, "") === "97714444444")).toBe(true);
  });
  it("links absolutized, hashes/mailto skipped", () => {
    const links = extractLinks(root, "https://acme.com");
    expect(links.every((l) => l.href.startsWith("https://acme.com/"))).toBe(true);
  });
  it("open graph + json-ld + headings", () => {
    expect(extractOpenGraph(root).title).toBe("Acme OG");
    expect((extractJsonLd(root)[0] as { name: string }).name).toBe("Acme");
    expect(extractHeadings(root)[0]).toEqual({ level: 1, text: "Welcome" });
  });
  it("tables → row objects", () => {
    const tables = extractTables(root);
    expect(tables[0]).toEqual([{ Name: "A", Qty: "2" }, { Name: "B", Qty: "5" }]);
  });
  it("autoExtract default set", () => {
    const data = autoExtract(root, "https://acme.com", true);
    expect(data.title).toBe("Acme & Co");
    expect(data.description).toBe("We sell things");
    expect(data.canonical).toBe("https://acme.com/home");
    expect(data.lang).toBe("en");
  });
});

describe("robots", () => {
  const txt = `User-agent: *\nDisallow: /private\nAllow: /private/ok\n\nUser-agent: badbot\nDisallow: /`;
  const r = parseRobots(txt);
  it("respects disallow with allow override (longest match)", () => {
    expect(r.isAllowed("/public")).toBe(true);
    expect(r.isAllowed("/private/secret")).toBe(false);
    expect(r.isAllowed("/private/ok")).toBe(true);
  });
  it("agent-specific group wins", () => {
    expect(r.isAllowed("/anything", "badbot/1.0")).toBe(false);
    expect(r.isAllowed("/anything", "goodbot")).toBe(true);
  });
});

describe("serializeRows", () => {
  const rows = [{ a: 1, b: [1, 2], c: { x: 1 } }, { a: 2, b: [3], c: null }];
  it("columns union + nested JSON-encoded for csv", () => {
    expect(columnsOf(rows)).toEqual(["a", "b", "c"]);
    const csv = serializeRows(rows, "csv").data as string;
    expect(csv.split("\r\n")[0]).toBe("a,b,c");
    expect(csv).toContain('"[1,2]"');
  });
  it("ndjson one object per line", () => {
    const out = serializeRows(rows, "ndjson").data as string;
    expect(out.trim().split("\n")).toHaveLength(2);
  });
});
