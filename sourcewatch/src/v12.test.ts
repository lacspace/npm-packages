import { describe, expect, it } from "vitest";
import { botBlockReason, check, jsAppReason, legacyFontFamily, normalise, pdfFonts, pdfInfo, pdfText } from "./index";

// ---------------------------------------------------------------- helpers

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

type Obj = string | { dict: string; data: Uint8Array | string };

function buildPdf(objs: Obj[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc(b) : b;
    parts.push(u);
    len += u.length;
  };
  push("%PDF-1.7\n");
  objs.forEach((o, i) => {
    if (typeof o === "string") push(`${i + 1} 0 obj\n${o}\nendobj\n`);
    else {
      const data = typeof o.data === "string" ? enc(o.data) : o.data;
      push(`${i + 1} 0 obj\n${o.dict.replace(/>>\s*$/, ` /Length ${data.length} >>`)}\nstream\n`);
      push(data);
      push("\nendstream\nendobj\n");
    }
  });
  push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");
const utf16hex = (s: string) => Array.from(s, (c) => hex4(c.charCodeAt(0))).join("");
const glyphs = (ids: number[]) => `<${ids.map(hex4).join("")}>`;

/** A ToUnicode CMap from glyph id → text (bfchar entries). */
function toUnicode(map: Record<number, string>): string {
  const rows = Object.entries(map).map(([g, u]) => `<${hex4(Number(g))}> <${utf16hex(u)}>`);
  return `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
${rows.length} beginbfchar
${rows.join("\n")}
endbfchar endcmap CMapName currentdict /CMap defineresource pop end end`;
}

/** A minimal sfnt with only a `cmap` table (format 4, platform 3/1) mapping chars → glyph ids. */
function sfntWithCmap(map: Record<string, number>): Uint8Array {
  const entries = Object.entries(map)
    .map(([ch, g]) => [ch.charCodeAt(0), g] as const)
    .sort((a, b) => a[0] - b[0]);
  const segs = [...entries.map(([c, g]) => ({ start: c, end: c, delta: (g - c) & 0xffff })), { start: 0xffff, end: 0xffff, delta: 1 }];
  const segX2 = segs.length * 2;
  const subLen = 16 + segs.length * 8;
  const sub: number[] = [];
  const w16 = (a: number[], v: number) => a.push((v >> 8) & 255, v & 255);
  w16(sub, 4); w16(sub, subLen); w16(sub, 0); w16(sub, segX2); w16(sub, 0); w16(sub, 0); w16(sub, 0);
  for (const s of segs) w16(sub, s.end);
  w16(sub, 0);
  for (const s of segs) w16(sub, s.start);
  for (const s of segs) w16(sub, s.delta);
  for (let i = 0; i < segs.length; i++) w16(sub, 0);
  const cmap: number[] = [];
  w16(cmap, 0); w16(cmap, 1); w16(cmap, 3); w16(cmap, 1); cmap.push(0, 0, 0, 12, ...sub);
  const head: number[] = [0, 1, 0, 0];
  w16(head, 1); w16(head, 16); w16(head, 0); w16(head, 0);
  head.push(..."cmap".split("").map((c) => c.charCodeAt(0)), 0, 0, 0, 0, 0, 0, 0, 28, 0, 0, (cmap.length >> 8) & 255, cmap.length & 255);
  return Uint8Array.from([...head, ...cmap]);
}

/** One page, one Type0 / Identity-H font (F1), optional embedded font program, content as given. */
function type0Pdf(o: { content: string; tounicode: Record<number, string>; widths: string; fontFile?: Uint8Array; name?: string }): Uint8Array {
  const objs: Obj[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    `<< /Type /Font /Subtype /Type0 /BaseFont /${o.name ?? "ABCDEF+Kokila"} /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>`,
    { dict: "<< >>", data: o.content },
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${o.name ?? "ABCDEF+Kokila"} /CIDToGIDMap /Identity /DW 500 /W ${o.widths} /FontDescriptor 8 0 R >>`,
    { dict: "<< >>", data: toUnicode(o.tounicode) },
    `<< /Type /FontDescriptor /FontName /${o.name ?? "ABCDEF+Kokila"}${o.fontFile ? " /FontFile2 9 0 R" : ""} >>`,
  ];
  if (o.fontFile) objs.push({ dict: "<< >>", data: o.fontFile });
  return buildPdf(objs);
}

// glyph ids of a made-up Devanagari font
const G = { ma: 10, i: 11, ta: 12, na: 13, reph: 14, ya: 15, aa: 16, ka: 17, la: 18, sa: 19, uu: 20, ca: 21, e: 22, ga: 23, eReph: 24, ra: 25, iVar: 26, halfLa: 27 };
const CMAP = { म: G.ma, "ि": G.i, त: G.ta, न: G.na, य: G.ya, "ा": G.aa, क: G.ka, ल: G.la, स: G.sa, "ू": G.uu, च: G.ca, "े": G.e, ग: G.ga, र: G.ra };
// What a word processor's broken export writes: logical characters zipped onto visually ordered glyphs,
// first cluster wins (i-matra → "म", consonants → "ि", reph → "श", न → "र्न", variants → consonants).
const BROKEN_TOUNICODE: Record<number, string> = {
  [G.i]: "म", [G.ma]: "ि", [G.ta]: "ि", [G.na]: "र्न", [G.reph]: "श", [G.ya]: "य", [G.aa]: "ा", [G.ka]: "क",
  [G.la]: "ल", [G.sa]: "स", [G.uu]: "ू", [G.ca]: "च", [G.e]: "े", [G.ga]: "ग", [G.eReph]: "े", [G.ra]: "र",
  [G.iVar]: "र", [G.halfLa]: "ल", 3: " ",
};
const WIDTHS = `[3 [250] 10 [500 200 450 450 0 480 220 520 500 500 0 480 0 470 0 420 200 300]]`;
const line = (y: number, ids: number[][]) => `1 0 0 1 72 ${y} Tm [${ids.map(glyphs).join(" -10 ")}] TJ`;

// ---------------------------------------------------------------- Devanagari repair

describe("pdfText: Devanagari repair (1.2.0)", () => {
  const content = [
    "BT /F1 12 Tf",
    // मिति = [ि म ि त]  · सूचना = [स ू च न ा]  · कार्यालय = [क ा य ा reph ल य]
    line(700, [[G.i, G.ma, G.i, G.ta, 3, G.sa, G.uu, G.ca, G.na, G.aa, 3, G.ka, G.aa, G.ya, G.aa, G.reph, G.la, G.ya]]),
    // गर्ने = [ग न (े+reph)] · गरिएको-like: [ग iVar र] → गरि · उल्ल-like: [halfLa ल] → ल्ल
    line(680, [[G.ga, G.na, G.eReph, 3, G.ga, G.iVar, G.ra, 3, G.halfLa, G.la]]),
    // glyphs drawn one Tj at a time still form one run: [ि] [त]
    "1 0 0 1 72 660 Tm <000B> Tj 2.4 0 Td <000C> Tj",
    "ET",
  ].join("\n");
  const pdf = type0Pdf({ content, tounicode: BROKEN_TOUNICODE, widths: WIDTHS, fontFile: sfntWithCmap(CMAP) });

  it("trusts the embedded font's cmap over a broken ToUnicode and restores logical order", async () => {
    expect(await pdfText(pdf)).toBe("मिति सूचना कार्यालय\nगर्ने गरि ल्ल\nति");
  });

  it("can be turned off (raw ToUnicode text, as other extractors give)", async () => {
    const raw = await pdfText(pdf, { fixDevanagari: false });
    expect(raw.split("\n")[0]).toBe("मिमि सूचर्ना कायाशलय");
  });

  it("recovers U+FFFD i-matra / ी variants from context and drops (and counts) the rest", async () => {
    // no embedded font program: ToUnicode maps variant glyphs to U+FFFD
    const T: Record<number, string> = {
      3: " ", 40: "न", 41: "य", 42: "म", 43: "ा", 44: "व", 45: "ल", 46: "ी", 47: "क",
      50: "�", // pre-base i-matra variant
      51: "�", // ी variant (same width as 46)
      52: "�", // a conjunct ligature: unrecoverable
      53: "र्", // zero-width reph, ToUnicode already says र्
      54: "ज",
    };
    const W = "[3 [250] 40 [450 470 500 220 430 440 250 520] 50 [230 250 600 0 480]]";
    // नियमावली ×3 = [iVar न य म ा व ल iiVar]; then [52 ा] ; then सार्वजनिक-like [व reph ज iVar न क]
    const word = [50, 40, 41, 42, 43, 44, 45, 51];
    const content = ["BT /F1 12 Tf", line(700, [[...word, 3, ...word, 3, ...word]]), line(680, [[52, 43, 3, 44, 53, 54, 50, 40, 47]]), "ET"].join("\n");
    const info = await pdfInfo(type0Pdf({ content, tounicode: T, widths: W, name: "XYZABC+Kalimati" }));
    expect(info.text).toBe("नियमावली नियमावली नियमावली\nा र्वजनिक");
    expect(info.text).not.toContain("�");
    expect(info.replacementChars).toBe(1);
    expect(info.fonts).toEqual(["Kalimati"]);
    const raw = await pdfInfo(type0Pdf({ content, tounicode: T, widths: W }), { fixDevanagari: false });
    expect(raw.text).toContain("�नयमावल�");
    expect(raw.replacementChars).toBe(8);
  });

  it("does not split a word when a zero-width mark is positioned back over its base", async () => {
    // क (9.6 wide at 12 pt), े drawn at +6 (over क), न at +9.6: one word, not "के न"
    const T: Record<number, string> = { 70: "क", 71: "े", 72: "न" };
    const content = "BT /F1 12 Tf 1 0 0 1 72 700 Tm <0046> Tj 6 0 Td <0047> Tj 3.6 0 Td <0048> Tj ET";
    expect(await pdfText(type0Pdf({ content, tounicode: T, widths: "[70 [800 0 500]]" }))).toBe("केन");
  });

  it("leaves correctly ordered (logical) Devanagari alone", async () => {
    // ToUnicode already gives logical text: the i-matra follows its consonant
    const T: Record<number, string> = { 3: " ", 60: "न", 61: "ि", 62: "य", 63: "म", 64: "क" };
    const content = ["BT /F1 12 Tf", line(700, [[60, 61, 62, 63, 3, 64, 61, 63]]), "ET"].join("\n");
    expect(await pdfText(type0Pdf({ content, tounicode: T, widths: "[3 [250] 60 [450 200 470 500 520]]" }))).toBe("नियम किम");
  });
});

// ---------------------------------------------------------------- fonts, legacy fonts, images

function simplePdf(content: string, fonts: string, extra: Obj[], xobjects = ""): Uint8Array {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /Resources << /Font << ${fonts} >> ${xobjects ? `/XObject << ${xobjects} >>` : ""} >> /Contents 4 0 R >>`,
    { dict: "<< >>", data: content },
    ...extra,
  ]);
}
const PREETI = "<< /Type /Font /Subtype /TrueType /BaseFont /QWERTY+Preeti /Encoding /WinAnsiEncoding >>";
const HELV = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
const IMG = { dict: "<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode >>", data: "\xFF\xD8\xFF\xD9" };

describe("pdfInfo / pdfFonts / legacy fonts (1.2.0)", () => {
  const legacy = simplePdf("BT /F1 12 Tf 72 700 Td (g]kfn ;/sf/ @\\)*# ) Tj /F2 12 Tf 0 -20 Td (Phone 1145) Tj ET", "/F1 5 0 R /F2 6 0 R", [PREETI, HELV]);

  it("lists font names without subset prefixes and names the legacy family", async () => {
    expect(await pdfFonts(legacy)).toEqual(["Preeti", "Helvetica"]);
    const info = await pdfInfo(legacy);
    expect(info).toMatchObject({ fonts: ["Preeti", "Helvetica"], legacyFont: "Preeti", pages: 1, replacementChars: 0, imageOnly: false });
    expect(legacyFontFamily("ABCDEF+Aakriti-Bold")).toBe("Aakriti");
    expect(legacyFontFamily("Preeti Bold")).toBe("Preeti");
    expect(legacyFontFamily("PCS NEPALI")).toBe("PCS Nepali");
    expect(legacyFontFamily("Kalimati")).toBeUndefined();
    expect(legacyFontFamily("Mangal-Bold")).toBeUndefined();
  });

  it("flags image-only PDFs and a scanner's invisible OCR layer", async () => {
    const scan = simplePdf("q 600 0 0 800 0 0 cm /Im1 Do Q", "", [IMG], "/Im1 5 0 R");
    expect(await pdfInfo(scan)).toMatchObject({ text: "", images: 1, imageOnly: true, ocrLayer: false });
    const inline = simplePdf("q 10 0 0 10 0 0 cm BI /W 1 /H 1 /CS /G /BPC 8 ID \x80 EI Q", "", []);
    expect(await pdfInfo(inline)).toMatchObject({ images: 1, imageOnly: true });
    const ocr = simplePdf("q 600 0 0 800 0 0 cm /Im1 Do Q BT 3 Tr /F1 12 Tf 72 700 Td (tqrf, \\(<zFT<) Tj ET", "/F1 6 0 R", [IMG, HELV], "/Im1 5 0 R");
    expect(await pdfInfo(ocr)).toMatchObject({ imageOnly: false, ocrLayer: true });
  });
});

// ---------------------------------------------------------------- check(): new error codes

const fakeFetch = (fn: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => fn(String(input), init)) as typeof fetch;
const htmlRes = (s: string, init: ResponseInit = {}) => new Response(s, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });

describe("check: js_app (1.2.0)", () => {
  const vueShell = `<!DOCTYPE html><html><head><title>Public Service Commission</title>
    <link rel="modulepreload" href="https://example.gov.np/build/assets/app-DnZ1E1JP.js" />
    <script type="module" src="https://example.gov.np/build/assets/app-DnZ1E1JP.js"></script></head>
    <body><div id="front-office"></div><script type="module" src="https://example.gov.np/build/assets/app-DnZ1E1JP.js"></script></body></html>`;
  const reactShell = `<html><head><title>News</title></head><body><noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div><script src="/themes/site/js/app.js?v=2.9"></script></body></html>`;

  it("classifies JavaScript app shells instead of placeholder_page", async () => {
    for (const body of [vueShell, reactShell]) {
      const r = await check({ id: "x", url: "https://example.com.np/", expect: "notice" }, { fetch: fakeFetch(() => htmlRes(body)) });
      expect(r).toMatchObject({ ok: false, status: 200, error: "js_app" });
      expect(r.detail).toMatch(/^page renders with JavaScript; check its JSON API or use a headless browser/);
    }
  });

  it("keeps placeholder_page for tiny pages without app markers, and passes real pages that use bundles", async () => {
    const tiny = await check({ id: "x", url: "https://example.com.np/", expect: "x" }, { fetch: fakeFetch(() => htmlRes("<html><body>This is test</body></html>")) });
    expect(tiny.error).toBe("placeholder_page");
    const real = `<html><body><div id="root"><p>${"Toll free helpline 1145 for water supply complaints. ".repeat(6)}</p></div><script type="module" src="/assets/index-abc123.js"></script></body></html>`;
    const ok = await check({ id: "x", url: "https://example.com.np/", expect: "1145" }, { fetch: fakeFetch(() => htmlRes(real)) });
    expect(ok.ok).toBe(true);
    expect(jsAppReason('<div id="app"></div>', "")).toBe("empty app mount point");
    expect(jsAppReason("<p>hello</p>", "")).toBeNull();
  });
});

describe("check: bot_blocked (1.2.0)", () => {
  it("classifies Cloudflare challenges by header or challenge body and keeps the status; not retried", async () => {
    let calls = 0;
    const cf = fakeFetch(() => (calls++, new Response("<html><title>Just a moment...</title></html>", { status: 403, headers: { server: "cloudflare" } })));
    const r = await check({ id: "x", url: "https://example.com.np/", expect: "x" }, { fetch: cf, retries: 2, retryDelayMs: 0 });
    expect(r).toMatchObject({ ok: false, status: 403, error: "bot_blocked" });
    expect(r.detail).toContain("Cloudflare");
    expect(calls).toBe(1);
    const mitigated = fakeFetch(() => new Response("", { status: 403, headers: { "cf-mitigated": "challenge", server: "cloudflare" } }));
    expect(await check({ id: "x", url: "https://example.com.np/", expect: "x" }, { fetch: mitigated })).toMatchObject({ status: 403, error: "bot_blocked" });
    const busy = fakeFetch(() => new Response('<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/x.js"></script>', { status: 503, headers: { server: "cloudflare" } }));
    expect(await check({ id: "x", url: "https://example.com.np/", expect: "x" }, { fetch: busy, retries: 0 })).toMatchObject({ status: 503, error: "bot_blocked" });
  });

  it("recognises other WAF pages and leaves plain refusals as http_4xx / http_5xx", async () => {
    expect(botBlockReason(403, { server: "AkamaiGHost" }, "<H1>Access Denied</H1> You don't have permission. Reference #18.6f2d1402.1759600000.1a2b3c")).toContain("Akamai");
    expect(botBlockReason(403, {}, "Sucuri WebSite Firewall - Access Denied")).toContain("Sucuri");
    expect(botBlockReason(403, { "x-iinfo": "1-2-3" }, "")).toContain("Imperva");
    expect(botBlockReason(404, { "cf-mitigated": "challenge" }, "")).toBeNull();
    expect(botBlockReason(403, { server: "cloudflare" }, "<h1>403 Forbidden</h1>")).toBeNull();
    const plain = await check({ id: "x", url: "https://example.com.np/", expect: "x" }, { fetch: fakeFetch(() => new Response("Forbidden", { status: 403 })) });
    expect(plain).toMatchObject({ status: 403, error: "http_4xx" });
  });
});

describe("check: PDFs (1.2.0)", () => {
  const pdfRes = (b: Uint8Array) => new Response(b as unknown as BodyInit, { headers: { "content-type": "application/pdf" } });

  it("reports image_only with the image count and pdfQuality", async () => {
    const scan = simplePdf("q 600 0 0 800 0 0 cm /Im1 Do Q q /Im1 Do Q", "", [IMG], "/Im1 5 0 R");
    const r = await check({ id: "scan", url: "https://example.gov.np/notice.pdf", expect: "1" }, { fetch: fakeFetch(() => pdfRes(scan)) });
    expect(r).toMatchObject({ ok: false, kind: "pdf", error: "image_only", detail: "scanned/image-only PDF (2 images, no text) — needs OCR" });
    expect(r.pdfQuality).toMatchObject({ imageOnly: true, images: 2, replacementChars: 0 });
  });

  it("passes fonts and legacyFont to textTransform and exposes pdfQuality", async () => {
    const pdf = simplePdf("BT /F1 12 Tf 72 700 Td (g]kfn ;/sf/ @\\)*# ) Tj ET", "/F1 5 0 R", [PREETI]);
    let seen: unknown;
    const r = await check(
      { id: "n", url: "https://example.gov.np/n.pdf", expect: "2083" },
      { fetch: fakeFetch(() => pdfRes(pdf)), textTransform: (t, ctx) => ((seen = ctx), ctx.legacyFont === "Preeti" ? t.replace("@)*#", "२०८३") : t) },
    );
    expect(seen).toMatchObject({ id: "n", kind: "pdf", fonts: ["Preeti"], legacyFont: "Preeti" });
    expect(r.ok).toBe(true);
    expect(r.pdfQuality).toMatchObject({ legacyFont: "Preeti", fonts: ["Preeti"], replacementChars: 0 });
  });

  it("normalise() never keeps U+FFFD", () => {
    expect(normalise("नियमावल� 2083")).toBe("नियमावल 2083");
  });
});
