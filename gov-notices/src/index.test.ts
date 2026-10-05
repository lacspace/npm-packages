import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SOURCES, VERSION, cleanTitle, completeTitle, completeTitles, conditional, dedupe, fetchNotices, isResult, isTruncated,
  needsDetail, newSince, parseBsDate, parseDate, parseDetail, parseNotices, tag, titleLang, type Notice,
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
    expect(seen["User-Agent"]).toMatch(/^lacspace-gov-notices\/1\.1 /);
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
  it("lists the boards and results lists with absolute URLs", () => {
    expect(VERSION).toBe("1.1.0");
    expect(SOURCES.map((s) => s.id).sort()).toEqual([
      "ctevt", "dotm", "mec", "neb", "nec", "nmc", "psc", "psc-recommendations", "psc-results", "see", "see-results", "tsc", "tsc-results", "tuexam",
    ]);
    expect(new Set(SOURCES.map((s) => s.id)).size).toBe(SOURCES.length);
    expect(SOURCES.find((s) => s.id === "dotm")!.url).toBe("https://dotm.gov.np/category/latest-news/");
    expect(SOURCES.find((s) => s.id === "tsc-results")!.url).toBe("https://tsc.gov.np/category/73/");
    for (const s of SOURCES) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.nameNe).toMatch(/[ऀ-ॿ]/);
    }
  });
});

// ---------------------------------------------------------------- 1.1.0

/** A fake fetch that serves fixtures by URL and records calls (and overlap). */
function routes(map: Record<string, string | number>) {
  const calls: string[] = [];
  let active = 0;
  let maxActive = 0;
  const f = (async (u: string) => {
    calls.push(u);
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise((r) => setTimeout(r, 2));
    active--;
    const v = map[u];
    if (v === undefined) return new Response("not found", { status: 404 });
    if (typeof v === "number") return new Response(null, { status: v });
    return new Response(v, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
  return { f, calls, get maxActive() { return maxActive; } };
}

const CTEVT_LIST = "https://ctevt.org.np/documents/list/notice-board";
const CTEVT_DETAIL = "https://ctevt.org.np/documents/2083-5-22-research-call-for-papers-for-journal-of-technical-and-vocational-education-and-training";
const DOTM_111 = "https://dotm.gov.np/content/111/-b--written-examination-questions-for-class-2082-83/";

describe("truncated titles (issue 9)", () => {
  it("flags list titles cut with '...' and keeps them as printed", () => {
    const ns = parseNotices(fixture("ctevt.html"), { baseUrl: CTEVT_LIST });
    const cut = ns.find((n) => n.url === CTEVT_DETAIL)!;
    expect(cut).toMatchObject({ title: "Call for Papers for Journal of Technical and Vocational E...", truncated: true, category: "Research", date: "2026-09-07" });
    expect(ns.filter((n) => n.truncated)).toHaveLength(1);
    expect(isTruncated("नतिजा सम्बन्धी सूचना…")).toBe(true);
    expect(isTruncated("Result notice")).toBe(false);
  });

  it("uses a title attribute when the list provides one", () => {
    const html = `<div class="list-links"><ul>
      <li><div class="notice-link"><a href="/documents/a" title="2083-5-22 - Research - Call for Papers for Journal of Technical and Vocational Education and Training">2083-5-22 - Research - Call for Papers for Journal of Technical and Vocational E...</a><p class="des">Sep 07, 2026</p></div></li>
      <li><div class="notice-link"><a href="/documents/b">2083-5-20 - Exam - Short title</a><p class="des">Sep 05, 2026</p></div></li>
    </ul></div>`;
    const ns = parseNotices(html, { baseUrl: CTEVT_LIST });
    expect(ns[0]).toMatchObject({ title: "Call for Papers for Journal of Technical and Vocational Education and Training", category: "Research" });
    expect(ns[0]!.truncated).toBeUndefined();
    const g = parseNotices(`<h2>Notices</h2><ul>
      <li><a href="/n/1" title="कक्षा १२ को नतिजा प्रकाशन सम्बन्धी सूचना">कक्षा १२ को नतिजा प्रकाशन…</a> <span>२०८३-०६-१५</span></li>
      <li><a href="/n/2">Exam routine</a> <span>२०८३-०६-१०</span></li>
      <li><a href="/n/3">Admit card</a> <span>२०८३-०६-०१</span></li></ul>`, { baseUrl: "https://board.example.gov.np/" });
    expect(g[0]).toMatchObject({ title: "कक्षा १२ को नतिजा प्रकाशन सम्बन्धी सूचना", tags: ["result"] });
  });

  it("completeTitle needs the visible stem and drops a site suffix", () => {
    expect(completeTitle("Call for Papers for Journal of Technical and Vocational E...", [
      "Something else entirely",
      "2083-5-22 - Research - Call for Papers for Journal of Technical and Vocational Education and Training | CTEVT",
    ])).toBe("Call for Papers for Journal of Technical and Vocational Education and Training");
    expect(completeTitle("Exam notice for…", ["Unrelated heading"])).toBeUndefined();
    expect(completeTitle("Exam notice for…", ["Exam notice for…"])).toBeUndefined();
  });

  it("parseDetail reads the full title, AD date and files from a CTEVT detail page", () => {
    const d = parseDetail(fixture("ctevt-detail.html"), CTEVT_DETAIL);
    expect(d).toMatchObject({ title: "Call for Papers for Journal of Technical and Vocational Education and Training", date: "2026-09-07", dateBs: "2083-05-22" });
    expect(d.attachments.map((a) => a.url)).toEqual([
      "https://ctevt.org.np/public/uploads/kcfinder/files/call_for_papers_vol_21.pdf",
      "https://ctevt.org.np/public/uploads/kcfinder/files/author_declaration_form_jtvet.pdf",
    ]);
  });

  it("completeTitles fetches only cut, unknown items; ids stay stable", async () => {
    const ns = parseNotices(fixture("ctevt.html"), { baseUrl: CTEVT_LIST });
    const before = ns.map((n) => n.id);
    const r = routes({ [CTEVT_DETAIL]: fixture("ctevt-detail.html") });
    const out = await completeTitles(ns, { fetch: r.f, delayMs: 0 });
    expect(out).toBe(ns);
    expect(r.calls).toEqual([CTEVT_DETAIL]);
    const n = ns.find((x) => x.url === CTEVT_DETAIL)!;
    expect(n.title).toBe("Call for Papers for Journal of Technical and Vocational Education and Training");
    expect(n.truncated).toBeUndefined();
    expect(n.titleLang).toBe("en");
    expect(n.attachments.map((a) => a.type)).toEqual(["pdf", "pdf"]);
    expect(ns.map((x) => x.id)).toEqual(before);

    // Known ids are skipped entirely.
    const again = parseNotices(fixture("ctevt.html"), { baseUrl: CTEVT_LIST });
    const r2 = routes({ [CTEVT_DETAIL]: fixture("ctevt-detail.html") });
    await completeTitles(again, { fetch: r2.f, delayMs: 0, knownIds: before });
    expect(r2.calls).toEqual([]);
    expect(again.find((x) => x.url === CTEVT_DETAIL)!.truncated).toBe(true);
  });

  it("is sequential, capped by maxDetails, and keeps truncated on failure", async () => {
    const mk = (i: number): Notice => ({ id: `id${i}`, sourceId: "x", title: `Long notice number ${i} about something...`, titleLang: "en", truncated: true, date: "2026-10-01", url: `https://x.gov.np/n/${i}`, attachments: [] });
    const ns = [1, 2, 3, 4, 5, 6, 7].map(mk);
    const page = (i: number) => `<h1>Long notice number ${i} about something important</h1>`;
    const r = routes({ "https://x.gov.np/n/1": page(1), "https://x.gov.np/n/2": 500, "https://x.gov.np/n/3": page(3) });
    await completeTitles(ns, { fetch: r.f, delayMs: 1, maxDetails: 3 });
    expect(r.calls).toEqual(["https://x.gov.np/n/1", "https://x.gov.np/n/2", "https://x.gov.np/n/3"]);
    expect(r.maxActive).toBe(1);
    expect(ns[0]).toMatchObject({ title: "Long notice number 1 about something important" });
    expect(ns[0]!.truncated).toBeUndefined();
    expect(ns[1]!.truncated).toBe(true);
    expect(ns[3]!.truncated).toBe(true);
    // Completed items drop out; file URLs are never candidates.
    expect(needsDetail([...ns, { ...mk(9), url: "https://x.gov.np/f.pdf" }]).map((n) => n.id)).toEqual(["id2", "id4", "id5", "id6", "id7"]);
  });
});

describe("undated items and dotm (issue 10)", () => {
  it("flags list items with no date as undated", () => {
    const ns = parseNotices(fixture("dotm.html"), { baseUrl: "https://dotm.gov.np/" });
    const n = ns.find((x) => x.url === DOTM_111)!;
    expect(n).toMatchObject({ undated: true, category: "ताजा समाचार" });
    expect(n.date).toBeUndefined();
    expect(ns.filter((x) => x.date).every((x) => !x.undated)).toBe(true);
  });

  it("dotm: the latest-news category lists dated items", () => {
    const ns = parseNotices(fixture("dotm-latest.html"), { sourceId: "dotm", baseUrl: "https://dotm.gov.np/category/latest-news/" });
    expect(ns).toHaveLength(5);
    expect(ns.every((n) => n.date && !n.undated)).toBe(true);
    expect(ns[0]).toMatchObject({ url: DOTM_111, date: "2026-10-05", dateBs: "2083-06-19", dateRaw: "१९ असोज, २०८३", tags: ["exam"] });
  });

  it("parseDetail reads the GIWMS detail date, not dates in the header slider", () => {
    const d = parseDetail(fixture("dotm-detail.html"), DOTM_111);
    expect(d).toMatchObject({ title: "(B) वर्गको सवारी चालक अनुमतिपत्रका लागि लिखित परीक्षाका प्रश्नहरू २०८२-८३", date: "2026-10-05", dateBs: "2083-06-19" });
    expect(d.attachments[0]?.url).toMatch(/^https:\/\/giwmscdnone\.gov\.np\/media\/files\/.+\.pdf$/);
  });

  it("fetchNotices: one request by default; details: true fills the date from the detail page", async () => {
    const plain = routes({ "https://dotm.gov.np/": fixture("dotm.html") });
    const a = await fetchNotices("https://dotm.gov.np/", { fetch: plain.f });
    expect(plain.calls).toHaveLength(1);
    expect(a.detailsFetched).toBeUndefined();
    expect(a.notices.find((n) => n.url === DOTM_111)!.undated).toBe(true);

    const r = routes({ "https://dotm.gov.np/": fixture("dotm.html"), [DOTM_111]: fixture("dotm-detail.html") });
    const b = await fetchNotices("https://dotm.gov.np/", { fetch: r.f, details: true, detailDelayMs: 0 });
    expect(r.calls).toEqual(["https://dotm.gov.np/", DOTM_111]);
    expect(b.detailsFetched).toBe(1);
    const n = b.notices.find((x) => x.url === DOTM_111)!;
    expect(n).toMatchObject({ date: "2026-10-05", dateBs: "2083-06-19", dateRaw: "१९ असोज, २०८३" });
    expect(n.undated).toBeUndefined();
    expect(n.id).toBe(a.notices.find((x) => x.url === DOTM_111)!.id);
  });
});

describe("results sources (issue 11)", () => {
  it("psc-results: written results JSON, linked to the site's detail route", () => {
    const ns = parseNotices(fixture("psc-results.json"), { sourceId: "psc-results", baseUrl: "https://psc.gov.np/category/result/all" });
    const n = checkFirst(ns, "psc.gov.np");
    expect(ns).toHaveLength(3);
    expect(n).toMatchObject({ sourceId: "psc-results", url: "https://psc.gov.np/category/written_result/5512", date: "2026-10-04", dateBs: "2083-06-18", category: "लिखित नतिजा", titleLang: "ne" });
    expect(n.title).toMatch(/लिखित नतिजा$/);
    expect(n.tags).toEqual(["result"]);
    expect(n.attachments[0]).toMatchObject({ type: "pdf", url: expect.stringMatching(/^https:\/\/psc\.gov\.np\/site_uploads\/.+\.pdf$/) });
    expect(ns.every(isResult)).toBe(true);
  });

  it("psc-recommendations: recommendation (final result) JSON", () => {
    const ns = parseNotices(fixture("psc-recommendations.json"), { sourceId: "psc-recommendations", baseUrl: "https://psc.gov.np/category/recommended/all" });
    const n = checkFirst(ns, "psc.gov.np");
    expect(ns).toHaveLength(3);
    expect(n).toMatchObject({ url: "https://psc.gov.np/category/recommendation/8321", date: "2026-09-30", dateBs: "2083-06-14", category: "सिफारिस" });
    expect(n.tags).toEqual(["recommendation", "result"]);
    expect(ns.every(isResult)).toBe(true);
  });

  it("fetchNotices('psc-results') reads the branch-details feed", async () => {
    const r = routes({ "https://psc.gov.np/front/branch-details/all/written_result?page=1&pageNum=20": fixture("psc-results.json") });
    const res = await fetchNotices("psc-results", { fetch: r.f });
    expect(res.status).toBe(200);
    expect(res.notices).toHaveLength(3);
    expect(res.source?.id).toBe("psc-results");
  });

  it("tsc-results: GIWMS results table (category 73)", () => {
    const ns = parseNotices(fixture("tsc-results.html"), { sourceId: "tsc-results", baseUrl: "https://tsc.gov.np/category/73/" });
    const n = checkFirst(ns, "tsc.gov.np");
    expect(ns).toHaveLength(4);
    expect(n).toMatchObject({ sourceId: "tsc-results", category: "नतिजा", date: "2026-09-30", dateBs: "2083-06-14" });
    expect(ns.every((x) => x.tags?.includes("result"))).toBe(true);
  });

  it("see-results: GIWMS publication category, where SEE posts results", () => {
    const ns = parseNotices(fixture("see-results.html"), { sourceId: "see-results", baseUrl: "https://see.gov.np/category/publication/" });
    const n = checkFirst(ns, "see.gov.np");
    expect(ns).toHaveLength(4);
    expect(n).toMatchObject({ sourceId: "see-results", category: "प्रकाशन", dateBs: "2083-04-22" });
    expect(ns.filter(isResult).length).toBe(3);
  });

  it("does not read a PSC advertisement number as a vacancy", () => {
    expect(tag({ title: "बिज्ञापन नं. १२०२०/०८२-८३ को लिखित नतिजा" })).toEqual(["result"]);
    expect(tag({ title: "दरखास्त आह्वान सम्बन्धी विज्ञापन" })).toEqual(["vacancy"]);
  });
});
