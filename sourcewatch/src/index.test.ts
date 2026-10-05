import { describe, expect, it } from "vitest";
import {
  check,
  checkAll,
  classifyError,
  extractText,
  fnv1a64,
  htmlToText,
  isPlaceholder,
  normalise,
  pdfText,
  summarize,
  type WatchItem,
} from "./index";

// ---------------------------------------------------------------- PDF builder

const enc = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 255);

async function deflate(s: string): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const w = cs.writable.getWriter();
  void w.write(enc(s) as unknown as BufferSource).then(() => w.close());
  const chunks: Uint8Array[] = [];
  const r = cs.readable.getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    chunks.push(value);
  }
  const out = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

type Obj = string | { dict: string; data: Uint8Array | string };

/** Assemble a PDF with a correct xref from numbered objects (1-based). Object 1 must be the catalog. */
function buildPdf(objs: Obj[]): Uint8Array {
  const parts: Uint8Array[] = [];
  let len = 0;
  const push = (b: Uint8Array | string) => {
    const u = typeof b === "string" ? enc(b) : b;
    parts.push(u);
    len += u.length;
  };
  push("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n");
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(len);
    if (typeof o === "string") push(`${i + 1} 0 obj\n${o}\nendobj\n`);
    else {
      const data = typeof o.data === "string" ? enc(o.data) : o.data;
      const dict = o.dict.replace(/>>\s*$/, ` /Length ${data.length} >>`);
      push(`${i + 1} 0 obj\n${dict}\nstream\n`);
      push(data);
      push("\nendstream\nendobj\n");
    }
  });
  const xref = len;
  push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) push(`${String(off).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const HELV = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";

function onePage(content: Obj, fonts = "/F1 4 0 R", extra: Obj[] = [HELV]): Uint8Array {
  return buildPdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << ${fonts} >> >> /Contents 5 0 R >>`,
    ...extra.slice(0, 1),
    content,
    ...extra.slice(1),
  ]);
}

const TOUNICODE_CMAP = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CMapName /Test-UCS def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfchar
<0001> <0048>
<0005> <D83DDE00>
endbfchar
2 beginbfrange
<0010> <0019> <0030>
<0020> <0021> [<0045> <006D>]
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

// ---------------------------------------------------------------- PDF tests

describe("pdfText", () => {
  it("extracts an uncompressed simple-font page with Td line breaks", async () => {
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (Emergency numbers) Tj 0 -14 Td (Police 100) Tj ET" });
    expect(await pdfText(pdf)).toBe("Emergency numbers\nPolice 100");
  });

  it("decodes a Flate-compressed content stream", async () => {
    const data = await deflate("BT /F1 12 Tf 72 700 Td (Fire Brigade 101) Tj ET");
    const pdf = onePage({ dict: "<< /Filter /FlateDecode >>", data });
    expect(await pdfText(pdf)).toBe("Fire Brigade 101");
  });

  it("inserts spaces for large negative TJ kerning only", async () => {
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td [(Ambu)-20(lance)-350(102)] TJ ET" });
    expect(await pdfText(pdf)).toBe("Ambulance 102");
  });

  it("reads hex strings and octal escapes", async () => {
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td <48656C6C6F> Tj ( \\061\\060\\060 \\(ok\\)) Tj ET" });
    expect(await pdfText(pdf)).toBe("Hello 100 (ok)");
  });

  it("maps Type0 / Identity-H glyphs through a ToUnicode CMap (bfchar, bfrange, array form, surrogates)", async () => {
    const data = await deflate("BT /F2 10 Tf 50 600 Td <0001002000210011001400140015> Tj 0 -20 Td <0005> Tj ET");
    const cmap = await deflate(TOUNICODE_CMAP);
    const pdf = buildPdf([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F2 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type0 /BaseFont /Test /Encoding /Identity-H /DescendantFonts [7 0 R] /ToUnicode 6 0 R >>",
      { dict: "<< /Filter /FlateDecode >>", data },
      { dict: "<< /Filter /FlateDecode >>", data: cmap },
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Test /DW 500 >>",
    ]);
    expect(await pdfText(pdf)).toBe("HEm1445\n\u{1F600}");
  });

  it("emits nothing (not garbage) for composite fonts without ToUnicode", async () => {
    const pdf = buildPdf([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 6 0 R /F3 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /DescendantFonts [] >>",
      { dict: "<< >>", data: "BT /F3 10 Tf 50 600 Td <00410042> Tj /F1 10 Tf 0 -20 Td (Toll free 1145) Tj ET" },
      HELV,
    ]);
    expect(await pdfText(pdf)).toBe("Toll free 1145");
  });

  it("applies /Differences glyph names (digits, uniXXXX)", async () => {
    const font = "<< /Type /Font /Subtype /Type1 /BaseFont /Legacy /Encoding << /BaseEncoding /WinAnsiEncoding /Differences [65 /one /one /four /five 70 /uni0915] >> >>";
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (ABCD F) Tj ET" }, "/F1 4 0 R", [font]);
    expect(await pdfText(pdf)).toBe("1145 क");
  });

  it("follows /Pages /Kids order (not object order) and inherited Resources", async () => {
    const pdf = buildPdf([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [4 0 R 3 0 R] /Count 2 /Resources << /Font << /F1 5 0 R >> >> >>",
      "<< /Type /Page /Parent 2 0 R /Contents 6 0 R >>",
      "<< /Type /Page /Parent 2 0 R /Contents 7 0 R >>",
      HELV,
      { dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (second) Tj ET" },
      { dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (first) Tj ET" },
    ]);
    expect(await pdfText(pdf)).toBe("first\n\nsecond");
  });

  it("reads objects packed in a compressed object stream (/Type /ObjStm)", async () => {
    const o3 = "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>";
    const o4 = HELV;
    const head = `3 0 4 ${o3.length + 1} `;
    const body = head + o3 + " " + o4;
    const objstm = await deflate(body);
    const pdf = buildPdf([
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "null",
      "null",
      { dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (from objstm 977) Tj ET" },
      { dict: `<< /Type /ObjStm /N 2 /First ${head.length} /Filter /FlateDecode >>`, data: objstm },
    ]);
    expect(await pdfText(pdf)).toBe("from objstm 977");
  });

  it("decodes ASCIIHex and ASCII85 filters", async () => {
    const content = "BT /F1 12 Tf 72 700 Td (Hi) Tj ET";
    const hex = Array.from(content, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("") + ">";
    expect(await pdfText(onePage({ dict: "<< /Filter /ASCIIHexDecode >>", data: hex }))).toBe("Hi");
    // ASCII85 of "BT /F1 9 Tf (A85) Tj ET"
    const a85 = toA85("BT /F1 9 Tf (A85) Tj ET");
    expect(await pdfText(onePage({ dict: "<< /Filter /ASCII85Decode >>", data: a85 }))).toBe("A85");
  });

  it("puts a space between separately positioned words on the same line", async () => {
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 10 Tf 1 0 0 1 72 700 Tm (Call) Tj 1 0 0 1 120 700 Tm (1145) Tj ET" });
    expect(await pdfText(pdf)).toBe("Call 1145");
  });

  it("never throws on garbage or truncated input", async () => {
    expect(await pdfText(new Uint8Array([1, 2, 3, 255, 0]))).toBe("");
    expect(await pdfText(enc("%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 9 0 R"))).toBe("");
    const full = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (Partial file 100) Tj ET" });
    const cut = full.subarray(0, full.length - 120); // xref/trailer gone
    expect(await pdfText(cut)).toBe("Partial file 100");
  });
});

function toA85(s: string): string {
  const b = enc(s);
  let out = "<~";
  for (let i = 0; i < b.length; i += 4) {
    const chunk = [b[i] ?? 0, b[i + 1] ?? 0, b[i + 2] ?? 0, b[i + 3] ?? 0];
    let v = ((chunk[0]! << 24) | (chunk[1]! << 16) | (chunk[2]! << 8) | chunk[3]!) >>> 0;
    const d: string[] = [];
    for (let k = 0; k < 5; k++) {
      d.unshift(String.fromCharCode((v % 85) + 33));
      v = Math.floor(v / 85);
    }
    out += d.slice(0, Math.min(5, b.length - i + 1)).join("");
  }
  return out + "~>";
}

// ---------------------------------------------------------------- text helpers

describe("normalise / html / hash", () => {
  it("normalises Devanagari digits, zero-width chars, NBSP and dashes", () => {
    expect(normalise("फोन\u00A0नं.  ११४५\u200D\u00AD — ok–x")).toBe("फोन नं. 1145 - ok-x");
  });

  it("turns HTML into visible text, dropping scripts/head and decoding entities", () => {
    const html = `<html><head><title>T</title><style>.a{}</style></head><body><script>var x="1145"</script>
      <h1>Hotline&nbsp;&amp;&#x20;Help</h1><p>Call <b>11</b><b>45</b></p><br><!-- 999 -->Done &#2407;</body></html>`;
    expect(htmlToText(html)).toBe("Hotline & Help\nCall 1145\nDone १");
  });

  it("detects a declared windows-1252 charset", async () => {
    const bytes = Uint8Array.from([...enc('<meta charset="windows-1252"><p>caf'), 0xe9, 0x20, 0x93, 0x31, 0x94, ...enc("</p>")]);
    expect(await extractText(bytes, "html")).toBe("café “1”");
  });

  it("FNV-1a 64 matches the reference vectors", () => {
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("foobar")).toBe("85944171f73967e8");
  });

  it("flags placeholders: tiny bodies and default pages", () => {
    expect(isPlaceholder("This is test", 13)).toBe(true);
    expect(isPlaceholder("Welcome to nginx! " + "x".repeat(300))).toBe(true);
    expect(isPlaceholder("Apache2 Ubuntu Default Page It works " + "y ".repeat(200))).toBe(true);
    expect(isPlaceholder("Nepal Water Supply Corporation. Call 1145 for leaks. ".repeat(10))).toBe(false);
  });
});

// ---------------------------------------------------------------- check()

const html = (body: string, init: ResponseInit = {}) =>
  new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const filler = "Official notice board of the authority with contact details and office hours. ".repeat(5);
const fakeFetch = (fn: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => fn(String(input), init)) as typeof fetch;

describe("check", () => {
  it("passes when the page still says it", async () => {
    const r = await check({ id: "nwc", url: "https://example.gov.np/", expect: "1145" }, { fetch: fakeFetch(() => html(`<p>${filler}</p><p>Toll free: 1145</p>`)) });
    expect(r.ok).toBe(true);
    expect(r.found).toBe(true);
    expect(r.kind).toBe("html");
    expect(r.matched).toEqual(["1145"]);
    expect(r.snippet).toContain("Toll free: 1145");
    expect(r.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("matches numbers as whole numbers only", async () => {
    const f = fakeFetch(() => html(`<p>${filler}</p><p>Call 11450 or 21145 today</p>`));
    const r = await check({ id: "x", url: "https://a.np/", expect: "1145" }, { fetch: f });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("not_found_text");
    expect(r.missing).toEqual(["1145"]);
  });

  it("matches Devanagari digits in page and expectation, case-insensitively", async () => {
    const f = fakeFetch(() => html(`<p>${filler}</p><p>हेल्पलाइन ११४५ HOTLINE</p>`));
    const r = await check({ id: "x", url: "https://a.np/", expect: ["११४५", "hotline", /हेल्पलाइन\s+1145/] }, { fetch: f });
    expect(r.ok).toBe(true);
    expect(r.matched).toEqual(["११४५", "hotline", "/हेल्पलाइन\\s+1145/"]);
  });

  it("supports match:any", async () => {
    const f = fakeFetch(() => html(`<p>${filler}</p><p>Dial 102</p>`));
    const r = await check({ id: "x", url: "https://a.np/", expect: ["101", "102"], match: "any" }, { fetch: f });
    expect(r.ok).toBe(true);
    expect(r.missing).toEqual(["101"]);
  });

  it("reports a 13-byte 'This is test' page as placeholder even when the text matches", async () => {
    const f = fakeFetch(() => new Response("This is test", { headers: { "content-type": "text/html" } }));
    const r = await check({ id: "neoc", url: "http://example.gov.np", expect: "test" }, { fetch: f });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("placeholder_page");
    expect(r.bytes).toBe(12);
    expect(r.found).toBe(true);
  });

  it("classifies 404 and 503 (and retries 5xx)", async () => {
    let calls = 0;
    const r404 = await check({ id: "a", url: "https://a.np/x", expect: "1" }, { fetch: fakeFetch(() => new Response("nope", { status: 404 })) });
    expect(r404).toMatchObject({ ok: false, status: 404, error: "http_4xx" });
    const r503 = await check(
      { id: "b", url: "https://a.np/y", expect: "1" },
      { retryDelayMs: 0, fetch: fakeFetch(() => (calls++, new Response("down", { status: 503 }))) },
    );
    expect(r503).toMatchObject({ ok: false, status: 503, error: "http_5xx" });
    expect(calls).toBe(2);
  });

  it("recovers on retry after a transient 5xx", async () => {
    let calls = 0;
    const f = fakeFetch(() => (++calls === 1 ? new Response("", { status: 502 }) : html(`<p>${filler} 100</p>`)));
    const r = await check({ id: "x", url: "https://a.np/", expect: "100" }, { fetch: f, retryDelayMs: 0 });
    expect(r.ok).toBe(true);
    expect(calls).toBe(2);
  });

  it("times out via AbortController on a fetch that never resolves", async () => {
    const f = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
      })) as typeof fetch;
    const t0 = Date.now();
    const r = await check({ id: "slow", url: "https://slow.np/", expect: "x" }, { fetch: f, timeoutMs: 50, retries: 0 });
    expect(r.error).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("times out even if the fetch ignores the signal", async () => {
    const f = (() => new Promise<Response>(() => undefined)) as typeof fetch;
    const r = await check({ id: "slow", url: "https://slow.np/", expect: "x" }, { fetch: f, timeoutMs: 30, retries: 0 });
    expect(r.error).toBe("timeout");
  });

  it("classifies TLS errors with an exact tlsKind", async () => {
    const tlsErr = (code: string) => fakeFetch(() => {
      throw Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error(code), { code }) });
    });
    const cases: [string, string][] = [
      ["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "chain"],
      ["UNABLE_TO_GET_ISSUER_CERT", "chain"],
      ["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "chain"],
      ["CERT_HAS_EXPIRED", "expired"],
      ["CERT_NOT_YET_VALID", "expired"],
      ["DEPTH_ZERO_SELF_SIGNED_CERT", "self_signed"],
      ["SELF_SIGNED_CERT_IN_CHAIN", "self_signed"],
      ["ERR_TLS_CERT_ALTNAME_INVALID", "hostname"],
      ["CERT_REVOKED", "other"],
      ["ERR_SSL_WRONG_VERSION_NUMBER", "other"],
    ];
    for (const [code, kind] of cases) {
      const r = await check({ id: code, url: "https://moe.gov.np", expect: "x" }, { fetch: tlsErr(code), retries: 0 });
      expect(r).toMatchObject({ ok: false, error: "tls", tlsKind: kind, detail: code });
    }
  });

  it("classifies DNS and generic network errors; tlsKind only on tls", () => {
    const dns = classifyError(Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } }));
    expect(dns).toEqual({ error: "dns", detail: "ENOTFOUND" });
    const agg = classifyError(Object.assign(new TypeError("fetch failed"), { cause: { errors: [{ code: "ECONNREFUSED" }] } }));
    expect(agg).toEqual({ error: "network", detail: "ECONNREFUSED" });
    expect(classifyError(new TypeError("Failed to fetch")).error).toBe("network");
  });

  it("does not retry TLS/DNS errors", async () => {
    let calls = 0;
    const f = fakeFetch(() => {
      calls++;
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "ENOTFOUND" } });
    });
    const r = await check({ id: "x", url: "https://nx.np/", expect: "x" }, { fetch: f, retries: 3, retryDelayMs: 0 });
    expect(r.error).toBe("dns");
    expect(calls).toBe(1);
  });

  it("sets changedSince from prevHash and keeps hashes stable across whitespace/digit-script changes", async () => {
    const a = await check({ id: "x", url: "https://a.np/", expect: "1145" }, { fetch: fakeFetch(() => html(`<p>${filler}</p><p>Call 1145</p>`)) });
    const b = await check(
      { id: "x", url: "https://a.np/", expect: "1145", prevHash: a.contentHash },
      { fetch: fakeFetch(() => html(`<p>${filler}</p>\n\n<p>Call&nbsp;   ११४५</p>`)) },
    );
    expect(b.changedSince).toBe(false);
    const c = await check(
      { id: "x", url: "https://a.np/", expect: "1145", prevHash: a.contentHash },
      { fetch: fakeFetch(() => html(`<p>${filler}</p><p>Call 1145 or 1146</p>`)) },
    );
    expect(c.changedSince).toBe(true);
    expect(a.changedSince).toBeUndefined();
  });

  it("stops reading at maxBytes on a streaming body and marks it truncated", async () => {
    let pulls = 0;
    const chunk = enc(`<p>${"Notice 100 ".repeat(90)}</p>`); // ~1 KB
    const f = fakeFetch(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(ctrl) {
              pulls++;
              ctrl.enqueue(chunk);
            },
          }),
          { headers: { "content-type": "text/html" } },
        ),
    );
    const r = await check({ id: "big", url: "https://a.np/", expect: "100" }, { fetch: f, maxBytes: 5000 });
    expect(r.truncated).toBe(true);
    expect(r.bytes).toBe(5000);
    expect(r.ok).toBe(true);
    expect(pulls).toBeLessThan(20);
  });

  it("reports too_large for a truncated PDF with no usable text", async () => {
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (Police 100) Tj ET" });
    const cut = pdf.subarray(0, 60);
    const f = fakeFetch(() => new Response(cut as unknown as BodyInit, { headers: { "content-type": "application/pdf" } }));
    const r = await check({ id: "p", url: "https://a.np/plan.pdf", expect: "100" }, { fetch: f, maxBytes: 40 });
    expect(r).toMatchObject({ ok: false, kind: "pdf", truncated: true, error: "too_large" });
  });

  it("auto-detects a PDF by magic bytes when served as octet-stream, and checks its text", async () => {
    const pdf = onePage({ dict: "<< >>", data: "BT /F1 12 Tf 72 700 Td (Police 100) Tj 0 -14 Td (Fire 101) Tj 0 -14 Td (Ambulance 102) Tj ET" });
    const f = fakeFetch(() => new Response(pdf as unknown as BodyInit, { headers: { "content-type": "application/octet-stream" } }));
    const r = await check({ id: "nta", url: "https://a.np/download?id=1", expect: ["100", "101", "102"] }, { fetch: f });
    expect(r).toMatchObject({ ok: true, kind: "pdf", matched: ["100", "101", "102"] });
  });

  it("reports unparseable for a PDF without extractable text", async () => {
    const f = fakeFetch(() => new Response(enc("%PDF-1.4\n%%EOF\n"), { headers: { "content-type": "application/pdf" } }));
    const r = await check({ id: "scan", url: "https://a.np/scan.pdf", expect: "1" }, { fetch: f });
    expect(r.error).toBe("unparseable");
  });

  it("sends a desktop browser User-Agent by default and allows overrides", async () => {
    let seen: Record<string, string> = {};
    const f = fakeFetch((_, init) => {
      seen = init?.headers as Record<string, string>;
      return html(`<p>${filler}</p>`);
    });
    await check({ id: "x", url: "https://a.np/", expect: "notice" }, { fetch: f, headers: { "x-test": "1" } });
    expect(seen["user-agent"]).toMatch(/Chrome\/\d+/);
    expect(seen["x-test"]).toBe("1");
  });
});

describe("checkAll / summarize", () => {
  it("preserves input order, caps concurrency and runs one request per host", async () => {
    let active = 0;
    let peak = 0;
    const perHost = new Map<string, number>();
    let hostViolation = false;
    const f = fakeFetch(async (url) => {
      const host = new URL(url).host;
      active++;
      perHost.set(host, (perHost.get(host) ?? 0) + 1);
      if (perHost.get(host)! > 1) hostViolation = true;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, url.includes("slow") ? 40 : 5));
      active--;
      perHost.set(host, perHost.get(host)! - 1);
      return html(`<p>${filler}</p><p>${url}</p>`);
    });
    const items: WatchItem[] = [
      { id: "0", url: "https://h1.np/slow", expect: "h1" },
      { id: "1", url: "https://h1.np/a", expect: "h1" },
      { id: "2", url: "https://h2.np/slow", expect: "h2" },
      { id: "3", url: "https://h3.np/a", expect: "h3" },
      { id: "4", url: "https://h4.np/a", expect: "h4" },
      { id: "5", url: "https://h5.np/a", expect: "nope" },
      { id: "6", url: "https://h2.np/b", expect: "h2" },
    ];
    const r = await checkAll(items, { fetch: f, concurrency: 3 });
    expect(r.map((x) => x.id)).toEqual(["0", "1", "2", "3", "4", "5", "6"]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
    expect(hostViolation).toBe(false);
    const s = summarize(r);
    expect(s).toEqual({ total: 7, ok: 6, failed: 1, changed: 0, byError: { not_found_text: 1 } });
  });

  it("handles an empty list", async () => {
    expect(await checkAll([])).toEqual([]);
  });
});

describe("textTransform", () => {
  // Stand-in for preetiToUnicode: Preeti digits !@#$%^&*() → ०-९; garbles Latin letters.
  const fakePreeti = (t: string) => t.replace(/[!@#$%^&*()]/g, (c) => "१२३४५६७८९०"["!@#$%^&*()".indexOf(c)]!).replace(/[a-z]/g, "क");
  const page = `<p>${filler}</p><p>Notice @)*# Police 100</p>`;

  it("matches converted text and still matches the raw text", async () => {
    const f = fakeFetch(() => html(page));
    const r = await check({ id: "x", url: "https://a.np/", expect: ["2083", "Police 100"], textTransform: fakePreeti }, { fetch: f });
    expect(r.ok).toBe(true);
    expect(r.matched).toEqual(["2083", "Police 100"]);
    const plain = await check({ id: "x", url: "https://a.np/", expect: "2083" }, { fetch: f });
    expect(plain.found).toBe(false);
    expect(plain.contentHash).toBe(r.contentHash); // hash stays on the raw text
  });

  it("option-level hook gets context; item hook wins; a throwing hook is reported", async () => {
    const f = fakeFetch(() => html(page));
    const seen: string[] = [];
    await check({ id: "a", url: "https://a.np/", expect: "x" }, { fetch: f, textTransform: (t, c) => (seen.push(`${c.id}:${c.kind}`), t) });
    expect(seen).toEqual(["a:html"]);
    const r = await check({ id: "b", url: "https://a.np/", expect: "2083", textTransform: fakePreeti }, { fetch: f, textTransform: () => "nothing" });
    expect(r.found).toBe(true);
    const bad = await check({ id: "c", url: "https://a.np/", expect: "x" }, { fetch: f, textTransform: () => { throw new Error("boom"); } });
    expect(bad).toMatchObject({ ok: false, error: "unparseable" });
    expect(bad.detail).toContain("boom");
  });
});
