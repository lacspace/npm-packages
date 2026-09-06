import { describe, it, expect } from "vitest";
import { deflateSync, deflateRawSync } from "node:zlib";
import { extractPdfText, extractPdfPages, pdfMeta, pdfIsEncrypted, parsePageRange } from "./pdf.js";
import { htmlTables, lineTables, columnTables, splitFixedWidth } from "./tables.js";
import { readZip } from "./zip.js";
import { extractDocx, extractPptx, extractEpub } from "./office.js";
import { readableHtml } from "./readable.js";
import { toMarkdown } from "./markdown.js";
import { grepText, grepPages } from "./search.js";

// ── Test builders ────────────────────────────────────────────────────────────

/** Build a minimal ZIP (stored, or deflate per-entry) from name→content. */
function makeZip(files: Record<string, string>, deflate = false): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const raw = Buffer.from(content, "utf8");
    const stored = deflate ? deflateRawSync(raw) : raw;
    const method = deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(0, 14); local.writeUInt32LE(stored.length, 18); local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const localFull = Buffer.concat([local, nameBuf, stored]);
    locals.push(localFull);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(0, 16); central.writeUInt32LE(stored.length, 20); central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28); central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, nameBuf]));
    offset += localFull.length;
  }
  const localBlob = Buffer.concat(locals);
  const centralBlob = Buffer.concat(centrals);
  const n = Object.keys(files).length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(n, 8); eocd.writeUInt16LE(n, 10);
  eocd.writeUInt32LE(centralBlob.length, 12); eocd.writeUInt32LE(localBlob.length, 16);
  return new Uint8Array(Buffer.concat([localBlob, centralBlob, eocd]));
}

/** Build a multi-page PDF (no xref needed — the engine scans objects). */
function buildPdf(pages: string[], info?: Record<string, string>): Uint8Array {
  let s = "%PDF-1.4\n";
  const kids = pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ");
  s += "1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n";
  s += `2 0 obj <</Type/Pages/Kids[${kids}]/Count ${pages.length}>> endobj\n`;
  pages.forEach((content, i) => {
    const pageNum = 3 + i * 2, contentNum = 4 + i * 2;
    s += `${pageNum} 0 obj <</Type/Page/Parent 2 0 R/Contents ${contentNum} 0 R>> endobj\n`;
    s += `${contentNum} 0 obj <</Length ${content.length}>>\nstream\n${content}\nendstream endobj\n`;
  });
  let trailer = "<</Root 1 0 R";
  if (info) {
    const infoNum = 3 + pages.length * 2;
    s += `${infoNum} 0 obj <<${Object.entries(info).map(([k, v]) => `/${k} (${v})`).join("")}>> endobj\n`;
    trailer += `/Info ${infoNum} 0 R`;
  }
  s += `trailer ${trailer}>>\n%%EOF`;
  return new Uint8Array(Buffer.from(s, "latin1"));
}

const pageContent = (t: string): string => `BT /F1 12 Tf 72 720 Td (${t}) Tj ET`;

// Build a tiny but valid PDF with a text content stream (optionally FlateDecode).
function makePdf(content: string, flate: boolean): Uint8Array {
  const enc: BufferEncoding = "latin1";
  const stream = flate ? deflateSync(Buffer.from(content, enc)) : Buffer.from(content, enc);
  const dict = `<</Length ${stream.length}${flate ? "/Filter/FlateDecode" : ""}>>`;
  const parts: Buffer[] = [];
  const push = (b: string | Buffer): void => { parts.push(Buffer.isBuffer(b) ? b : Buffer.from(b, enc)); };
  push("%PDF-1.4\n");
  push("1 0 obj <</Type/Catalog/Pages 2 0 R>> endobj\n");
  push("2 0 obj <</Type/Pages/Kids[3 0 R]/Count 1>> endobj\n");
  push("3 0 obj <</Type/Page/Parent 2 0 R/Contents 4 0 R>> endobj\n");
  push(`4 0 obj ${dict}\nstream\n`); push(stream); push("\nendstream endobj\n");
  push("trailer <</Root 1 0 R>>\n%%EOF");
  return new Uint8Array(Buffer.concat(parts));
}

const CONTENT = `BT /F1 24 Tf 72 720 Td (Hello Lacspace) Tj ET
BT /F1 12 Tf 72 690 Td (Invoice #1001) Tj ET`;

describe("extractPdfText", () => {
  it("reads an uncompressed content stream", () => {
    const { text, pageCount } = extractPdfText(makePdf(CONTENT, false));
    expect(text).toContain("Hello Lacspace");
    expect(text).toContain("Invoice #1001");
    expect(pageCount).toBe(1);
  });
  it("inflates a FlateDecode content stream", () => {
    const { text } = extractPdfText(makePdf(CONTENT, true));
    expect(text).toContain("Hello Lacspace");
    expect(text).toContain("Invoice #1001");
  });
  it("decodes TJ arrays and hex strings", () => {
    const c = "BT [(Hel) -250 (lo)] TJ <48656C6C6F> Tj ET";
    const { text } = extractPdfText(makePdf(c, false));
    expect(text.replace(/\s+/g, "")).toContain("Hello");
  });
  it("never throws on junk input", () => {
    expect(() => extractPdfText(new Uint8Array([1, 2, 3, 4]))).not.toThrow();
  });
});

describe("htmlTables", () => {
  it("reads a table into header-keyed rows", () => {
    const html = "<table><tr><th>Name</th><th>Qty</th></tr><tr><td>A</td><td>2</td></tr></table>";
    expect(htmlTables(html)).toEqual([[{ Name: "A", Qty: "2" }]]);
  });
});

describe("lineTables", () => {
  it("detects a column-aligned block", () => {
    const text = "Report\n\nItem      Qty   Price\nWidget    2     $9.99\nGadget    5     $19.99\n\nthe end";
    const tables = lineTables(text);
    expect(tables.length).toBe(1);
    expect(tables[0]![0]).toEqual(["Item", "Qty", "Price"]);
    expect(tables[0]![1]).toEqual(["Widget", "2", "$9.99"]);
  });
  it("ignores prose", () => {
    expect(lineTables("just a sentence here\nand another line")).toEqual([]);
  });
});

// ── v0.2.0 features ──────────────────────────────────────────────────────────

describe("readZip", () => {
  it("reads stored entries", () => {
    const zip = readZip(makeZip({ "a.txt": "hello", "dir/b.txt": "world" }));
    expect(zip.get("a.txt")?.toString()).toBe("hello");
    expect(zip.get("dir/b.txt")?.toString()).toBe("world");
  });
  it("inflates deflated entries", () => {
    const zip = readZip(makeZip({ "big.txt": "x".repeat(500) }, true));
    expect(zip.get("big.txt")?.toString()).toBe("x".repeat(500));
  });
  it("returns empty map for junk", () => {
    expect(readZip(new Uint8Array([1, 2, 3])).size).toBe(0);
  });
});

describe("extractDocx", () => {
  const doc = `<?xml version="1.0"?><w:document><w:body>
    <w:p><w:r><w:t>Hello Lacspace</w:t></w:r></w:p>
    <w:p><w:r><w:t xml:space="preserve">Line with </w:t></w:r><w:r><w:t>runs</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Item</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Qty</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Widget</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:body></w:document>`;
  it("walks paragraphs and joins runs", () => {
    const { text } = extractDocx(makeZip({ "word/document.xml": doc }));
    expect(text).toContain("Hello Lacspace");
    expect(text).toContain("Line with runs");
  });
  it("extracts w:tbl tables", () => {
    const { tables } = extractDocx(makeZip({ "word/document.xml": doc }, true));
    expect(tables).toEqual([[["Item", "Qty"], ["Widget", "2"]]]);
  });
});

describe("extractPptx", () => {
  const slide = (t: string): string => `<p:sld><p:cSld><p:spTree><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:spTree></p:cSld></p:sld>`;
  it("reads text per slide in order", () => {
    const { slides, text } = extractPptx(makeZip({
      "ppt/slides/slide2.xml": slide("Second slide"),
      "ppt/slides/slide1.xml": slide("First slide"),
    }));
    expect(slides.map((s) => s.page)).toEqual([1, 2]);
    expect(slides[0]!.text).toContain("First slide");
    expect(slides[1]!.text).toContain("Second slide");
    expect(text).toContain("First slide");
  });
});

describe("extractEpub", () => {
  it("reads spine xhtml in reading order", () => {
    const zip = makeZip({
      "META-INF/container.xml": `<container><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
      "OEBPS/content.opf": `<package><metadata><dc:title>My Book</dc:title></metadata>
        <manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest>
        <spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`,
      "OEBPS/ch1.xhtml": `<html><body><h1>Chapter One</h1><p>The beginning.</p></body></html>`,
      "OEBPS/ch2.xhtml": `<html><body><p>The end.</p></body></html>`,
    });
    const { text, title } = extractEpub(zip);
    expect(title).toBe("My Book");
    expect(text.indexOf("beginning")).toBeLessThan(text.indexOf("end"));
    expect(text).toContain("Chapter One");
  });
});

describe("extractPdfPages", () => {
  const pdf = buildPdf([pageContent("Page one text"), pageContent("Page two text"), pageContent("Page three text")]);
  it("splits text per page", () => {
    const pages = extractPdfPages(pdf);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3]);
    expect(pages[0]!.text).toContain("Page one text");
    expect(pages[2]!.text).toContain("Page three text");
  });
  it("honours a page range", () => {
    const pages = extractPdfPages(pdf, { range: "2-3" });
    expect(pages.map((p) => p.page)).toEqual([2, 3]);
    expect(pages[0]!.text).toContain("Page two text");
  });
  it("parses range specs", () => {
    expect(parsePageRange("2-4", 10)).toEqual([2, 3, 4]);
    expect(parsePageRange("1,3,5", 10)).toEqual([1, 3, 5]);
    expect(parsePageRange("3-", 5)).toEqual([3, 4, 5]);
    expect(parsePageRange("2-99", 3)).toEqual([2, 3]);
  });
});

describe("pdfMeta", () => {
  it("reads the Info dict", () => {
    const pdf = buildPdf([pageContent("hi")], { Title: "Quarterly Report", Author: "Lacspace", Producer: "lacspace-extract" });
    const m = pdfMeta(pdf);
    expect(m.title).toBe("Quarterly Report");
    expect(m.author).toBe("Lacspace");
    expect(m.producer).toBe("lacspace-extract");
    expect(m.encrypted).toBe(false);
  });
  it("detects encryption", () => {
    const enc = new Uint8Array(Buffer.from("%PDF-1.4\ntrailer <</Root 1 0 R/Encrypt 9 0 R>>\n%%EOF", "latin1"));
    expect(pdfIsEncrypted(Buffer.from(enc).toString("latin1"))).toBe(true);
    expect(extractPdfText(enc).encrypted).toBe(true);
  });
});

describe("columnTables / splitFixedWidth", () => {
  it("splits aligned columns keeping multi-word cells intact", () => {
    const rows = [["Name", "City", "Age"], ["Alice Long", "New York", "30"], ["Bob", "Los Angeles", "25"]];
    const lines = rows.map((r) => r[0]!.padEnd(13) + r[1]!.padEnd(14) + r[2]!);
    expect(splitFixedWidth(lines)).toEqual(rows);
  });
  it("detects a column table from text", () => {
    const text = "Name        City         Age\nAlice Long  New York     30\nBob         Los Angeles  25";
    const tables = columnTables(text);
    expect(tables.length).toBe(1);
    expect(tables[0]![1]).toEqual(["Alice Long", "New York", "30"]);
  });
});

describe("toMarkdown", () => {
  it("renders a structured doc", () => {
    const md = toMarkdown({
      title: "Report",
      blocks: [
        { type: "heading", level: 2, text: "Intro" },
        { type: "paragraph", text: "Hello world." },
        { type: "list", items: ["one", "two"], ordered: true },
        { type: "table", rows: [["A", "B"], ["1", "2"]] },
      ],
    });
    expect(md).toContain("# Report");
    expect(md).toContain("## Intro");
    expect(md).toContain("1. one");
    expect(md).toContain("| A | B |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
  });
  it("renders an ExtractResult with tables", () => {
    const md = toMarkdown({ file: "x.txt", kind: "text", tables: [[["H1", "H2"], ["a", "b"]]] });
    expect(md).toContain("| H1 | H2 |");
    expect(md).toContain("| a | b |");
  });
});

describe("readableHtml", () => {
  const html = `<html><head><title>Great Article</title><meta name="author" content="Jane Doe"></head>
    <body>
      <nav><a href="/">Home</a><a href="/about">About</a></nav>
      <article>
        <h1>Great Article</h1>
        <p>This is the first substantial paragraph of the real content that we care about extracting.</p>
        <p>And here is a second meaningful paragraph with even more useful readable text inside it.</p>
        <ul><li>Point one</li><li>Point two</li></ul>
      </article>
      <footer><a href="/privacy">Privacy</a> © 2026 lots of footer nav junk links here</footer>
    </body></html>`;
  it("extracts the article and drops chrome", () => {
    const r = readableHtml(html);
    expect(r.title).toBe("Great Article");
    expect(r.byline).toBe("Jane Doe");
    expect(r.text).toContain("first substantial paragraph");
    expect(r.text).not.toContain("Privacy");
    expect(r.text).not.toContain("About");
    expect(r.blocks.some((b) => b.type === "list")).toBe(true);
  });
  it("exposes metadata", () => {
    expect(readableHtml(html).meta.author).toBe("Jane Doe");
  });
});

describe("grepText / grepPages", () => {
  const text = "alpha line\nBETA line\ngamma invoice 1001\ndelta line\ninvoice 1002";
  it("filters matching lines", () => {
    const hits = grepText(text, "invoice");
    expect(hits.map((h) => h.line)).toEqual([3, 5]);
    expect(hits[0]!.text).toContain("1001");
  });
  it("supports ignore-case and context", () => {
    const hits = grepText(text, "beta", { ignoreCase: true, context: 1 });
    expect(hits.length).toBe(1);
    expect(hits[0]!.context).toEqual(["alpha line", "BETA line", "gamma invoice 1001"]);
  });
  it("tags hits with page numbers", () => {
    const hits = grepPages([{ page: 1, text: "nothing here" }, { page: 2, text: "found invoice" }], "invoice");
    expect(hits.length).toBe(1);
    expect(hits[0]!.page).toBe(2);
  });
});
