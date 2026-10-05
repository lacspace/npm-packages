import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SOURCES, cleanTitle, conditional, dedupe, fetchNotices, isResult, newSince, parseBsDate, parseDate,
  parseNotices, tag, titleLang, type Notice,
} from "./index.js";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const ISO = /^\d{4}-\d{2}-\d{2}$/;

describe("parseBsDate", () => {
  it("reads Devanagari and ASCII numeric forms", () => {
    expect(parseBsDate("२०८२/०६/१८")).toEqual({ bs: "2082-06-18", ad: "2025-10-04" });
    expect(parseBsDate("2082-06-18")).toEqual({ bs: "2082-06-18", ad: "2025-10-04" });
    expect(parseBsDate("2082.6.18")).toEqual({ bs: "2082-06-18", ad: "2025-10-04" });
    expect(parseBsDate("मिति: २०८३-०६-१९ गते")?.bs).toBe("2083-06-19");
  });

  it("reads month names in Devanagari and Roman", () => {
    expect(parseBsDate("२०८२ असोज १८")?.bs).toBe("2082-06-18");
    expect(parseBsDate("Asoj 18, 2082")?.bs).toBe("2082-06-18");
    expect(parseBsDate("१४ आश्विन २०८३, बुधबार")).toEqual({ bs: "2083-06-14", ad: "2026-09-30" });
    expect(parseBsDate("असोज ८, २०८३, बिहिबार १५:६")?.bs).toBe("2083-06-08");
    expect(parseBsDate("प्रकाशित मिति २०८३ आश्विन १५ गते बिहीबार")?.bs).toBe("2083-06-15");
    expect(parseBsDate("Baishakh 1, 2083")).toEqual({ bs: "2083-01-01", ad: "2026-04-14" });
    expect(parseBsDate("Chaitra 30 2082")?.bs).toBe("2082-12-30");
    expect(parseBsDate("२२ साउन, २०८३")?.bs).toBe("2083-04-22");
    expect(parseBsDate("Mangsir 5, 2083")?.bs).toBe("2083-08-05");
    expect(parseBsDate("२०८३ फागुन ३")?.bs).toBe("2083-11-03");
  });

  it("rejects days past the month's length and non-dates", () => {
    expect(parseBsDate("२०८२/०६/३३")).toBeNull();
    expect(parseBsDate("2083-13-01")).toBeNull();
    expect(parseBsDate("Asoj 40, 2082")).toBeNull();
    expect(parseBsDate("no date here")).toBeNull();
    expect(parseBsDate("")).toBeNull();
  });
});

describe("parseDate (AD vs BS)", () => {
  it("treats 2050+ numeric years as BS and 1990–2049 as AD", () => {
    expect(parseDate("2082-06-18")).toMatchObject({ ad: "2025-10-04", bs: "2082-06-18", calendar: "bs" });
    expect(parseDate("2025-10-04")).toMatchObject({ ad: "2025-10-04", bs: "2082-06-18", calendar: "ad" });
    expect(parseDate("2026/10/05")).toMatchObject({ ad: "2026-10-05", calendar: "ad" });
  });
  it("reads English month names as AD", () => {
    expect(parseDate("Sep 15, 2026")).toMatchObject({ ad: "2026-09-15", bs: "2083-05-30", calendar: "ad", raw: "Sep 15, 2026" });
    expect(parseDate("5 October 2026")).toMatchObject({ ad: "2026-10-05", calendar: "ad" });
  });
  it("keeps the raw text", () => {
    expect(parseDate("Published: २०८३/०६/१५ (Thursday)")?.raw).toBe("२०८३/०६/१५");
  });
  it("returns null for impossible AD days", () => {
    expect(parseDate("2026-02-30")).toBeNull();
  });
});

const checkFirst = (ns: Notice[], host: string) => {
  expect(ns.length).toBeGreaterThan(0);
  const n = ns[0]!;
  expect(n.title.length).toBeGreaterThan(3);
  expect(n.date).toMatch(ISO);
  expect(n.dateBs).toMatch(ISO);
  expect(n.url).toMatch(/^https?:\/\//);
  expect(new URL(n.url!).hostname.endsWith(host) || n.attachments.length > 0).toBe(true);
  expect(n.id).toMatch(/^[0-9a-f]{16}$/);
  for (const a of n.attachments) {
    expect(a.url).toMatch(/^https?:\/\//);
    expect(["pdf", "image", "doc", "other"]).toContain(a.type);
  }
  return n;
};

describe("site adapters on real (trimmed) fixtures", () => {
  it("neb: tabbed tables + highlight PDFs", () => {
    const ns = parseNotices(fixture("neb.html"), { baseUrl: "https://neb.gov.np/" });
    const n = checkFirst(ns, "neb.gov.np");
    expect(n).toMatchObject({ sourceId: "neb", date: "2026-10-01", dateBs: "2083-06-15", url: "https://neb.gov.np/detail/235", category: "सुचना तथा समाचार" });
    expect(n.dateRaw).toBe("२०८३ आश्विन १५");
    expect(n.attachments[0]).toMatchObject({ type: "pdf" });
    expect(isResult(n)).toBe(true);
    expect(ns.some((x) => x.category === "नतिजा प्रकाशन")).toBe(true);
  });

  it("tsc: GIWMS category table", () => {
    const ns = parseNotices(fixture("tsc.html"), { baseUrl: "https://tsc.gov.np/category/73/" });
    const n = checkFirst(ns, "tsc.gov.np");
    expect(ns).toHaveLength(3);
    expect(n.sourceId).toBe("tsc");
    expect(n.url).toMatch(/^https:\/\/tsc\.gov\.np\/content\/\d+\//);
    expect(n.attachments[0]?.type).toBe("pdf");
    expect(n.dateRaw).toMatch(/असोज/);
    expect(n.tags).toContain("result");
  });

  it("see: GIWMS category cards", () => {
    const ns = parseNotices(fixture("see.html"), { baseUrl: "https://see.gov.np/category/notice/" });
    const n = checkFirst(ns, "see.gov.np");
    expect(ns).toHaveLength(3);
    expect(n).toMatchObject({ sourceId: "see", dateBs: "2083-06-01", date: "2026-09-17", category: "Notices" });
  });

  it("dotm: GIWMS homepage blocks, attachments merged by url", () => {
    const ns = parseNotices(fixture("dotm.html"), { baseUrl: "https://dotm.gov.np/" });
    const n = checkFirst(ns, "dotm.gov.np");
    expect(n.sourceId).toBe("dotm");
    expect(ns.filter((x) => x.attachments.some((a) => a.type === "pdf")).length).toBeGreaterThan(0);
    expect(new Set(ns.map((x) => x.url)).size).toBe(ns.length);
  });

  it("mec: listing cards with tags and PDFs", () => {
    const ns = parseNotices(fixture("mec.html"), { baseUrl: "https://mec.gov.np/np/category/notice" });
    const n = checkFirst(ns, "mec.gov.np");
    expect(n).toMatchObject({ sourceId: "mec", dateBs: "2083-06-14", date: "2026-09-30" });
    expect(n.url).toMatch(/^https:\/\/mec\.gov\.np\/detail\//);
    expect(n.attachments[0]?.type).toBe("pdf");
    expect(n.category).toMatch(/सूचना/);
  });

  it("ctevt: list with AD dates", () => {
    const ns = parseNotices(fixture("ctevt.html"), { baseUrl: "https://ctevt.org.np/documents/list/notice-board" });
    const n = checkFirst(ns, "ctevt.org.np");
    expect(n).toMatchObject({ sourceId: "ctevt", date: "2026-09-15", dateBs: "2083-05-30", dateRaw: "Sep 15, 2026" });
    expect(n.title).toBe("कामकाज एंव जिम्मेवारी सम्बन्धमा");
    expect(n.category).toBe("Admin");
    expect(ns.find((x) => /Third year/.test(x.title))).toMatchObject({ title: "Examination Notice for Third year students", category: "Exam" });
  });

  it("psc: JSON feed behind the Vue app", () => {
    const ns = parseNotices(fixture("psc.json"), { sourceId: "psc", baseUrl: "https://psc.gov.np/category/notice" });
    const n = checkFirst(ns, "psc.gov.np");
    expect(ns).toHaveLength(3);
    expect(n).toMatchObject({ date: "2026-10-01", dateBs: "2083-06-15", category: "सूचना", titleLang: "ne" });
    expect(n.attachments[0]).toMatchObject({ type: "pdf" });
  });

  it("nec: tRPC JSON feed, timestamps read as the Nepal calendar day", () => {
    const ns = parseNotices(fixture("nec.json"), { baseUrl: "https://nec.gov.np/notices" });
    const n = checkFirst(ns, "nec.gov.np");
    expect(n.sourceId).toBe("nec");
    expect(n.url).toMatch(/^https:\/\/nec\.gov\.np\/notices\/[0-9a-f]+$/);
    expect(n.dateBs).toBe("2083-06-19");
    expect(n.attachments.map((a) => a.type)).toContain("pdf");
    expect(n.attachments.every((a) => !a.url.includes(" "))).toBe(true);
    expect(isResult(n)).toBe(true);
  });
});

describe("generic fallback", () => {
  it("finds a notice table and skips the nav", () => {
    const html = `<html><body>
      <nav><ul><li><a href="/">Home</a></li><li><a href="/about">About 2025-01-01</a></li><li><a href="/x">X 2025-01-02</a></li></ul></nav>
      <h2>सूचनाहरू</h2>
      <table class="notice-table"><thead><tr><th>क्र.सं.</th><th>शीर्षक</th><th>मिति</th><th>फाइल</th></tr></thead>
      <tbody>
        <tr><td>१</td><td><a href="/notice/12">कक्षा १२ को नतिजा प्रकाशन सम्बन्धी सूचना नयाँ</a></td><td>२०८३/०६/१५</td><td><a href="/files/result.pdf">डाउनलोड</a></td></tr>
        <tr><td>२</td><td><a href="/notice/11">Exam routine published (PDF)</a></td><td>2083-06-10</td><td><a href="/files/routine.jpg">View</a></td></tr>
        <tr><td>३</td><td><a href="/notice/10">दरखास्त आह्वान सम्बन्धी विज्ञापन</a></td><td>2083-06-01</td><td></td></tr>
      </tbody></table>
      <footer><a href="/privacy">Privacy 2025-02-02</a><a href="/t">Terms 2025-02-02</a></footer>
    </body></html>`;
    const ns = parseNotices(html, { baseUrl: "https://example.gov.np/notices" });
    expect(ns).toHaveLength(3);
    expect(ns[0]).toMatchObject({
      sourceId: "example.gov.np", title: "कक्षा १२ को नतिजा प्रकाशन सम्बन्धी सूचना", url: "https://example.gov.np/notice/12",
      date: "2026-10-01", dateBs: "2083-06-15", titleLang: "ne",
    });
    expect(ns[0]!.attachments).toEqual([{ url: "https://example.gov.np/files/result.pdf", type: "pdf", label: "डाउनलोड" }]);
    expect(ns[1]).toMatchObject({ title: "Exam routine published", titleLang: "en", tags: ["exam", "schedule"] });
    expect(ns[1]!.attachments[0]?.type).toBe("image");
    expect(ns[2]!.tags).toEqual(["vacancy"]);
  });

  it("finds a list of links with dates", () => {
    const html = `<div class="menu"><ul><li><a href="/a">A</a></li><li><a href="/b">B</a></li></ul></div>
      <div class="latest-notice"><h3>Latest Notice</h3><ul>
        <li><a href="/n/3">SEE 2082 result published</a> <span>Asoj 18, 2082</span></li>
        <li><a href="/n/2">प्रवेश पत्र वितरण सम्बन्धी सूचना</a> <span>२०८२-०६-१०</span></li>
        <li><a href="docs/syllabus.docx">Revised syllabus 2082</a> <span>2082/05/30</span></li>
      </ul></div>`;
    const ns = parseNotices(html, { baseUrl: "https://board.example.org/home/" });
    expect(ns).toHaveLength(3);
    expect(ns[0]).toMatchObject({ title: "SEE 2082 result published", dateBs: "2082-06-18", date: "2025-10-04", url: "https://board.example.org/n/3" });
    expect(ns[1]!.tags).toContain("admit-card");
    expect(ns[2]).toMatchObject({ url: "https://board.example.org/home/docs/syllabus.docx", tags: ["syllabus"] });
    expect(ns[2]!.attachments[0]?.type).toBe("doc");
  });

  it("returns nothing for a page with no notice list", () => {
    const html = `<nav><a href="/">Home</a><a href="/about">About</a></nav><p>Loading notices…</p>`;
    expect(parseNotices(html, { baseUrl: "https://nmc.org.np/latest-notice" })).toEqual([]);
  });
});

describe("dedupe / newSince", () => {
  const mk = (title: string, url?: string, date?: string): Notice => ({ id: `${title}|${url}`, sourceId: "x", title, titleLang: "en", attachments: [], ...(url ? { url } : {}), ...(date ? { date } : {}) });
  it("dedupes by url then by normalised title + date", () => {
    const out = dedupe([
      mk("Result notice", "https://a/1", "2026-10-01"),
      { ...mk("Result notice (copy)", "https://a/1"), attachments: [{ url: "https://a/1.pdf", type: "pdf" }] },
      mk("Exam  Routine.", undefined, "2026-10-02"),
      mk("exam routine", undefined, "2026-10-02"),
      mk("exam routine", undefined, "2026-10-03"),
    ]);
    expect(out.map((n) => n.title)).toEqual(["Result notice", "Exam  Routine.", "exam routine"]);
    expect(out[0]!.attachments).toHaveLength(1);
  });
  it("newSince keeps only unseen ids", () => {
    const ns = parseNotices(fixture("tsc.html"), { baseUrl: "https://tsc.gov.np/category/73/" });
    const prev = new Set(ns.slice(1).map((n) => n.id));
    expect(newSince(ns, prev)).toEqual([ns[0]]);
    expect(newSince(ns, [])).toHaveLength(ns.length);
  });
  it("ids are stable across parses", () => {
    const a = parseNotices(fixture("mec.html"), { baseUrl: "https://mec.gov.np/np/category/notice" });
    const b = parseNotices(fixture("mec.html"), { baseUrl: "https://mec.gov.np/np/category/notice" });
    expect(a.map((n) => n.id)).toEqual(b.map((n) => n.id));
    expect(new Set(a.map((n) => n.id)).size).toBe(a.length);
  });
});

describe("tags / titles", () => {
  it("tags results and exams", () => {
    const n = { title: "माध्यमिक शिक्षा परीक्षा (SEE) २०८२ को नतिजा प्रकाशन" };
    expect(tag(n)).toEqual(["result", "exam"]);
    expect(isResult(n)).toBe(true);
    expect(tag({ title: "Admit card for written exam" })).toEqual(["exam", "admit-card"]);
    expect(tag({ title: "परीक्षा तालिका" })).toEqual(["exam", "schedule"]);
    expect(isResult({ title: "Office closed notice" })).toBe(false);
  });
  it("cleans titles", () => {
    expect(cleanTitle("  1.   Exam   routine   (PDF) ")).toBe("Exam routine");
    expect(cleanTitle("१. नतिजा सम्बन्धी सूचना नयाँ")).toBe("नतिजा सम्बन्धी सूचना");
    expect(cleanTitle("New Result of class 12")).toBe("Result of class 12");
    expect(cleanTitle("क्र.सं. ३) सूचना प्रकाशन")).toBe("सूचना प्रकाशन");
    expect(cleanTitle("2083.05.30 सम्बन्धन सूचना")).toBe("2083.05.30 सम्बन्धन सूचना");
  });
  it("detects title language", () => {
    expect(titleLang("कक्षा १२ को नतिजा")).toBe("ne");
    expect(titleLang("Class 12 result")).toBe("en");
    expect(titleLang("SEE २०८२ को नतिजा published today")).toBe("mixed");
  });
});

describe("conditional / fetchNotices", () => {
  it("builds conditional headers", () => {
    expect(conditional({ etag: '"abc"', lastModified: "Mon, 05 Oct 2026 10:00:00 GMT" })).toEqual({
      "If-None-Match": '"abc"', "If-Modified-Since": "Mon, 05 Oct 2026 10:00:00 GMT",
    });
    expect(conditional(null)).toEqual({});
  });

  it("304 → notModified, no parsing", async () => {
    let seen: Record<string, string> = {};
    let calls = 0;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      calls++;
      seen = init?.headers as Record<string, string>;
      return new Response(null, { status: 304, headers: { etag: '"v2"' } });
    }) as unknown as typeof fetch;
    const r = await fetchNotices("tsc", { fetch: fakeFetch, etag: '"v1"', lastModified: "Sun, 04 Oct 2026 00:00:00 GMT" });
    expect(calls).toBe(1);
    expect(r).toMatchObject({ status: 304, notModified: true, notices: [], etag: '"v2"' });
    expect(seen["If-None-Match"]).toBe('"v1"');
    expect(seen["If-Modified-Since"]).toBe("Sun, 04 Oct 2026 00:00:00 GMT");
    expect(seen["User-Agent"]).toMatch(/^lacspace-gov-notices\/1\.0 /);
  });

  it("200 → parses with the source's adapter; feed URL + headers for JSON sources", async () => {
    let url = "";
    let headers: Record<string, string> = {};
    const fakeFetch = (async (u: string, init?: RequestInit) => {
      url = u;
      headers = init?.headers as Record<string, string>;
      return new Response(fixture("psc.json"), { status: 200, headers: { "content-type": "application/json", "last-modified": "Mon, 05 Oct 2026 10:00:00 GMT" } });
    }) as unknown as typeof fetch;
    const r = await fetchNotices("psc", { fetch: fakeFetch, userAgent: "Mozilla/5.0 test" });
    expect(url).toBe("https://psc.gov.np/front/category/notice");
    expect(headers["User-Agent"]).toBe("Mozilla/5.0 test");
    expect(headers["X-Requested-With"]).toBe("XMLHttpRequest");
    expect(r.notModified).toBe(false);
    expect(r.lastModified).toBe("Mon, 05 Oct 2026 10:00:00 GMT");
    expect(r.notices).toHaveLength(3);
    expect(r.notices[0]!.sourceId).toBe("psc");
    expect(r.contentHash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("caps the body at maxBytes and rejects unknown sources", async () => {
    const fakeFetch = (async () => new Response(fixture("ctevt.html"), { status: 200 })) as unknown as typeof fetch;
    const r = await fetchNotices("https://ctevt.org.np/documents/list/notice-board", { fetch: fakeFetch, maxBytes: 200 });
    expect(r.notices).toEqual([]);
    await expect(fetchNotices("nope", { fetch: fakeFetch })).rejects.toThrow(/unknown source/);
  });
});

describe("SOURCES", () => {
  it("lists the ten boards with absolute URLs", () => {
    expect(SOURCES.map((s) => s.id).sort()).toEqual(["ctevt", "dotm", "mec", "neb", "nec", "nmc", "psc", "see", "tsc", "tuexam"]);
    for (const s of SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.nameNe).toMatch(/[ऀ-ॿ]/);
    }
  });
});
