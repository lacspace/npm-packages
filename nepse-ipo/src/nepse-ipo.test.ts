import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isArchivable,
  lastRelevant,
  nptDate,
  parseNepaliPaisaIpos,
  parseSebonPipeline,
  readTables,
  resolveUrl,
} from "./index";

const iso = (d: Date | undefined) => d?.toISOString();

describe("nptDate", () => {
  it("converts 5:00 PM NPT to UTC", () => {
    expect(iso(nptDate("2026-09-10", "5:00 PM"))).toBe("2026-09-10T11:15:00.000Z");
  });
  it("accepts 24-hour time", () => {
    expect(iso(nptDate("2026-09-10", "17:00"))).toBe("2026-09-10T11:15:00.000Z");
  });
  it("accepts '5 PM' without minutes", () => {
    expect(iso(nptDate("2026-09-10", "5 PM"))).toBe("2026-09-10T11:15:00.000Z");
  });
  it("defaults to midnight NPT, which is the previous UTC day", () => {
    expect(iso(nptDate("2026-09-10"))).toBe("2026-09-09T18:15:00.000Z");
  });
  it("12:30 AM is 00:30", () => {
    expect(iso(nptDate("2026-09-10", "12:30 AM"))).toBe("2026-09-09T18:45:00.000Z");
  });
  it("12:00 PM is noon", () => {
    expect(iso(nptDate("2026-09-10", "12:00 PM"))).toBe("2026-09-10T06:15:00.000Z");
  });
  it("12 AM is midnight", () => {
    expect(iso(nptDate("2026-09-10", "12 AM"))).toBe("2026-09-09T18:15:00.000Z");
  });
  it("accepts seconds, lower-case and dotted meridiem", () => {
    expect(iso(nptDate("2026-09-10", "17:00:30"))).toBe("2026-09-10T11:15:30.000Z");
    expect(iso(nptDate("2026-09-10", "5:00:30 pm"))).toBe("2026-09-10T11:15:30.000Z");
    expect(iso(nptDate("2026-09-10", "5:00 p.m."))).toBe("2026-09-10T11:15:00.000Z");
  });
  it("takes the date part of YYYY-MM-DDT...", () => {
    expect(iso(nptDate("2026-09-10T00:00:00", "17:00"))).toBe("2026-09-10T11:15:00.000Z");
  });
  it("Feb 29 is valid only in leap years", () => {
    expect(iso(nptDate("2028-02-29", "10:00"))).toBe("2028-02-29T04:15:00.000Z");
    expect(nptDate("2027-02-29")).toBeUndefined();
    expect(nptDate("2000-02-29")).toBeDefined();
    expect(nptDate("2100-02-29")).toBeUndefined();
  });
  it("rejects invalid dates", () => {
    for (const bad of ["2026-13-01", "2026-01-32", "2026-02-30", "2026-04-31", "2026-00-10", "garbage", "", "2026-9-10", "10/09/2026"]) {
      expect(nptDate(bad)).toBeUndefined();
    }
    expect(nptDate(null as unknown as string)).toBeUndefined();
  });
  it("rejects invalid times", () => {
    for (const bad of ["25:00", "13:00 PM", "0:00 AM", "17:60", "17:00:60", "5", "noon", "5:00 XM"]) {
      expect(nptDate("2026-09-10", bad)).toBeUndefined();
    }
  });
});

const row = (over: Record<string, unknown> = {}) => ({
  stockSymbol: "ABCL",
  companyName: "ABC Hydropower Limited",
  shareType: "ordinary",
  sectorName: "Hydro Power",
  shareRegistrar: "Global IME Capital Limited",
  rating: "CARE-NP BB",
  units: 1000000,
  minUnits: 10,
  maxUnits: 50000,
  pricePerUnit: 100,
  openingDateAD: "2026-09-07",
  closingDateAD: "2026-09-10",
  closingDateClosingTime: "5:00 PM",
  extendedDateAD: "",
  status: "Open",
  mutualFundUnits: 0,
  ...over,
});
const wrap = (...rows: unknown[]) => ({ result: { data: rows } });

describe("parseNepaliPaisaIpos", () => {
  it("maps a full ordinary row", () => {
    const [issue] = parseNepaliPaisaIpos(wrap(row()));
    expect(issue).toMatchObject({
      symbol: "ABCL",
      companyName: "ABC Hydropower Limited",
      type: "ipo",
      eligibility: "general",
      sector: "Hydro Power",
      issueManager: "Global IME Capital Limited",
      rating: "CARE-NP BB",
      units: 1000000,
      minUnits: 10,
      maxUnits: 50000,
      pricePerUnit: 100,
      status: "Open",
    });
    expect(iso(issue?.openDate)).toBe("2026-09-07T04:15:00.000Z");
    expect(iso(issue?.closeDate)).toBe("2026-09-10T11:15:00.000Z");
    expect(issue?.extendedCloseDate).toBeUndefined();
  });

  it("accepts a bare array", () => {
    expect(parseNepaliPaisaIpos([row()])).toHaveLength(1);
  });

  it("returns [] for garbage input", () => {
    for (const bad of [null, undefined, 42, "x", {}, { result: null }, { result: { data: "nope" } }]) {
      expect(parseNepaliPaisaIpos(bad)).toEqual([]);
    }
  });

  it("maps eligibility case-insensitively and trimmed", () => {
    const out = parseNepaliPaisaIpos([
      row({ stockSymbol: "A1", shareType: " ORDINARY " }),
      row({ stockSymbol: "A2", shareType: "Local" }),
      row({ stockSymbol: "A3", shareType: "migrant workers" }),
      row({ stockSymbol: "A4", shareType: "Something New" }),
      row({ stockSymbol: "A5", shareType: null }),
    ]);
    const bySym = Object.fromEntries(out.map((i) => [i.symbol, i.eligibility]));
    expect(bySym).toEqual({ A1: "general", A2: "locals", A3: "foreign_employment", A4: "general", A5: "general" });
  });

  it("dedupes by symbol + opening date, preferring the ordinary tranche", () => {
    const out = parseNepaliPaisaIpos([
      row({ shareType: "Local", units: 100 }),
      row({ shareType: "Migrant Workers", units: 200 }),
      row({ shareType: "ordinary", units: 300 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.eligibility).toBe("general");
    expect(out[0]?.units).toBe(300);
  });

  it("keeps the first non-ordinary tranche when no ordinary exists", () => {
    const out = parseNepaliPaisaIpos([row({ shareType: "Local", units: 1 }), row({ shareType: "Migrant Workers", units: 2 })]);
    expect(out).toHaveLength(1);
    expect(out[0]?.eligibility).toBe("locals");
  });

  it("keeps separate issues for the same symbol on different opening dates", () => {
    const out = parseNepaliPaisaIpos([
      row({ shareType: "Local", openingDateAD: "2026-08-01", closingDateAD: "2026-08-04" }),
      row(),
    ]);
    expect(out).toHaveLength(2);
    expect(out.map((i) => i.eligibility)).toEqual(["general", "locals"]);
  });

  it("detects mutual funds by sector", () => {
    const [i] = parseNepaliPaisaIpos([row({ sectorName: "Mutual Fund", companyName: "Something Plain" })]);
    expect(i?.type).toBe("mutual_fund");
  });

  it("detects mutual funds by name: Yojana, Fund, Scheme", () => {
    const out = parseNepaliPaisaIpos([
      row({ stockSymbol: "M1", sectorName: "", companyName: "NIBL Sahabhagita Yojana" }),
      row({ stockSymbol: "M2", sectorName: null, companyName: "Kumari Equity Fund" }),
      row({ stockSymbol: "M3", sectorName: "Others", companyName: "Sunrise Bluechip Scheme" }),
      row({ stockSymbol: "M4", sectorName: "Others", companyName: "Fundamental Hydro Ltd" }),
    ]);
    const bySym = Object.fromEntries(out.map((i) => [i.symbol, i.type]));
    expect(bySym).toEqual({ M1: "mutual_fund", M2: "mutual_fund", M3: "mutual_fund", M4: "ipo" });
  });

  it("does not use mutualFundUnits to detect mutual funds", () => {
    const [i] = parseNepaliPaisaIpos([row({ mutualFundUnits: 50000 })]);
    expect(i?.type).toBe("ipo");
  });

  it("parses numeric strings with commas", () => {
    const [i] = parseNepaliPaisaIpos([
      row({ units: "1,23,45,000", minUnits: " 10 ", maxUnits: "50,000", pricePerUnit: "100.00" }),
    ]);
    expect(i).toMatchObject({ units: 12345000, minUnits: 10, maxUnits: 50000, pricePerUnit: 100 });
  });

  it("drops non-numeric number fields instead of failing", () => {
    const [i] = parseNepaliPaisaIpos([row({ units: "N/A", minUnits: null, maxUnits: {}, pricePerUnit: NaN })]);
    expect(i?.units).toBeUndefined();
    expect(i?.minUnits).toBeUndefined();
    expect(i?.maxUnits).toBeUndefined();
    expect(i?.pricePerUnit).toBeUndefined();
  });

  it("sets extendedCloseDate at the closing time when later than close", () => {
    const [i] = parseNepaliPaisaIpos([row({ extendedDateAD: "2026-09-14" })]);
    expect(iso(i?.extendedCloseDate)).toBe("2026-09-14T11:15:00.000Z");
  });

  it("ignores an extended date that is empty, null, equal or earlier", () => {
    const out = parseNepaliPaisaIpos([
      row({ stockSymbol: "E1", extendedDateAD: null }),
      row({ stockSymbol: "E2", extendedDateAD: "2026-09-10" }),
      row({ stockSymbol: "E3", extendedDateAD: "2026-09-08" }),
      row({ stockSymbol: "E4", extendedDateAD: "not a date" }),
    ]);
    expect(out).toHaveLength(4);
    for (const i of out) expect(i.extendedCloseDate).toBeUndefined();
  });

  it("defaults the closing time to 17:00 when missing or invalid", () => {
    const out = parseNepaliPaisaIpos([
      row({ stockSymbol: "T1", closingDateClosingTime: null }),
      row({ stockSymbol: "T2", closingDateClosingTime: "whenever" }),
      row({ stockSymbol: "T3", closingDateClosingTime: "2:00 PM" }),
    ]);
    const bySym = Object.fromEntries(out.map((i) => [i.symbol, iso(i.closeDate)]));
    expect(bySym).toEqual({
      T1: "2026-09-10T11:15:00.000Z",
      T2: "2026-09-10T11:15:00.000Z",
      T3: "2026-09-10T08:15:00.000Z",
    });
  });

  it("skips malformed rows", () => {
    const out = parseNepaliPaisaIpos([
      null,
      "row",
      42,
      row({ stockSymbol: "" }),
      row({ stockSymbol: null }),
      row({ stockSymbol: "X1", openingDateAD: "" }),
      row({ stockSymbol: "X2", closingDateAD: "2026-02-30" }),
      row({ stockSymbol: "OK" }),
    ]);
    expect(out.map((i) => i.symbol)).toEqual(["OK"]);
  });

  it("tolerates missing optional fields and accepts ISO datetimes", () => {
    const [i] = parseNepaliPaisaIpos([
      { stockSymbol: "min", openingDateAD: "2026-09-07T00:00:00", closingDateAD: "2026-09-10T00:00:00" },
    ]);
    expect(i).toBeDefined();
    expect(i?.symbol).toBe("MIN");
    expect(i?.companyName).toBe("MIN");
    expect(i?.eligibility).toBe("general");
    expect(i?.sector).toBeUndefined();
    expect(iso(i?.closeDate)).toBe("2026-09-10T11:15:00.000Z");
  });

  it("sorts by openDate descending, then symbol", () => {
    const out = parseNepaliPaisaIpos([
      row({ stockSymbol: "OLD", openingDateAD: "2026-08-01", closingDateAD: "2026-08-04" }),
      row({ stockSymbol: "ZED" }),
      row({ stockSymbol: "ALP" }),
    ]);
    expect(out.map((i) => i.symbol)).toEqual(["ALP", "ZED", "OLD"]);
  });
});

const fixture = readFileSync(new URL("./fixtures/sebon-ipo-pipeline.html", import.meta.url), "utf8");

describe("parseSebonPipeline", () => {
  it("reads the live page fixture (captured 2026-10-07)", () => {
    expect(parseSebonPipeline(fixture)).toEqual({
      title: "List of Application for IPO (2083-06-20)",
      date: "2026-10-06",
      url: "https://www.sebon.gov.np/uploads/2026/10/06/I6dDlWSkOfrzwOhaqIiJyA1IxyqnKz05Espq1HND.pdf",
    });
  });

  const table = (rows: string) =>
    `<table><thead><tr><th>Title</th><th>Date</th><th>English</th><th>Nepali</th></tr></thead><tbody>${rows}</tbody></table>`;

  it("resolves root-relative and relative links against baseUrl", () => {
    const rel = table(`<tr><td>A</td><td>2026-10-06</td><td><a href="/uploads/a.pdf">English</a></td><td></td></tr>`);
    expect(parseSebonPipeline(rel)?.url).toBe("https://www.sebon.gov.np/uploads/a.pdf");
    const rel2 = table(`<tr><td>A</td><td>2026-10-06</td><td><a href="../files/b.pdf">English</a></td><td></td></tr>`);
    expect(parseSebonPipeline(rel2, "https://example.org/x/y/page")?.url).toBe("https://example.org/x/files/b.pdf");
    const proto = table(`<tr><td>A</td><td>2026-10-06</td><td><a href='//cdn.example.org/c.PDF'>EN</a></td><td></td></tr>`);
    expect(parseSebonPipeline(proto)?.url).toBe("https://cdn.example.org/c.PDF");
  });

  it("keeps absolute links as-is", () => {
    const abs = table(`<tr><td>A</td><td>2026-10-06</td><td><a href="https://files.example.com/x.pdf">English</a></td><td></td></tr>`);
    expect(parseSebonPipeline(abs)?.url).toBe("https://files.example.com/x.pdf");
  });

  it("picks English over Nepali when both are present, in either column order", () => {
    const both = table(
      `<tr><td>A</td><td>2026-10-06</td><td><a href="/en.pdf">English</a></td><td><a href="/ne.pdf">नेपाली</a></td></tr>`,
    );
    expect(parseSebonPipeline(both)?.url).toBe("https://www.sebon.gov.np/en.pdf");
    const swapped =
      `<table><tr><th>Title</th><th>Date</th><th>Nepali</th><th>English</th></tr>` +
      `<tr><td>A</td><td>2026-10-06</td><td><a href="/ne.pdf">Nepali</a></td><td><a href="/en.pdf">EN</a></td></tr></table>`;
    expect(parseSebonPipeline(swapped)?.url).toBe("https://www.sebon.gov.np/en.pdf");
  });

  it("uses the header to pick English when link text is generic", () => {
    const generic = table(
      `<tr><td>A</td><td>2026-10-06</td><td><a href="/1.pdf">Download</a></td><td><a href="/2.pdf">Download</a></td></tr>`,
    );
    expect(parseSebonPipeline(generic)?.url).toBe("https://www.sebon.gov.np/1.pdf");
    const genericSwapped =
      `<table><tr><th>Title</th><th>Date</th><th>Nepali</th><th>English</th></tr>` +
      `<tr><td>A</td><td>2026-10-06</td><td><a href="/ne.pdf">Download</a></td><td><a href="/en.pdf">Download</a></td></tr></table>`;
    expect(parseSebonPipeline(genericSwapped)?.url).toBe("https://www.sebon.gov.np/en.pdf");
  });

  it("decodes entities and collapses whitespace in the title", () => {
    const t = table(
      `<tr><td>\n  List of Application &amp; IPO&nbsp;&#40;2083-06-20&#x29;\n </td><td> 2026-10-06 </td><td><a href="/a.pdf?v=1">English</a></td></tr>`,
    );
    expect(parseSebonPipeline(t)).toEqual({
      title: "List of Application & IPO (2083-06-20)",
      date: "2026-10-06",
      url: "https://www.sebon.gov.np/a.pdf?v=1",
    });
  });

  it("only reads the first data row", () => {
    const two = table(
      `<tr><td>First</td><td>2026-10-06</td><td><a href="/1.pdf">English</a></td></tr>` +
        `<tr><td>Second</td><td>2026-09-01</td><td><a href="/2.pdf">English</a></td></tr>`,
    );
    expect(parseSebonPipeline(two)?.title).toBe("First");
  });

  it("tolerates unclosed cells and rows", () => {
    const sloppy = `<TABLE class=x><TR><TH>Title<TH>Date<TH>English<TR><TD>Sloppy<TD>2026-10-06<TD><A HREF=/s.pdf>English</A></TABLE>`;
    expect(parseSebonPipeline(sloppy)).toEqual({ title: "Sloppy", date: "2026-10-06", url: "https://www.sebon.gov.np/s.pdf" });
  });

  it("returns null when there is no table, no data row, or no PDF/date", () => {
    expect(parseSebonPipeline("<html><body><p>Nothing here</p></body></html>")).toBeNull();
    expect(parseSebonPipeline(table(""))).toBeNull();
    expect(parseSebonPipeline(table(`<tr><td>A</td><td>2026-10-06</td><td><a href="/a.html">English</a></td></tr>`))).toBeNull();
    expect(parseSebonPipeline(table(`<tr><td>A</td><td>not a date</td><td><a href="/a.pdf">English</a></td></tr>`))).toBeNull();
    expect(parseSebonPipeline(table(`<tr><td>A</td><td>2026-02-30</td><td><a href="/a.pdf">English</a></td></tr>`))).toBeNull();
    expect(parseSebonPipeline("")).toBeNull();
    expect(parseSebonPipeline(undefined as unknown as string)).toBeNull();
  });

  it("ignores tables inside scripts and comments", () => {
    const html = `<script>"<table><tr><td>Fake</td><td>2026-10-06</td><td><a href='/f.pdf'>English</a></td></tr></table>"</script><!-- <table></table> -->`;
    expect(parseSebonPipeline(html)).toBeNull();
  });
});

describe("html helpers", () => {
  it("readTables handles nested tables", () => {
    const tables = readTables(`<table><tr><td>outer<table><tr><td>inner</td></tr></table></td></tr></table>`);
    expect(tables).toHaveLength(2);
    expect(tables[0]?.[0]?.[0]?.text).toBe("inner");
    expect(tables[1]?.[0]?.[0]?.text).toBe("outer inner");
  });
  it("resolveUrl rejects non-http schemes", () => {
    expect(resolveUrl("javascript:alert(1)", "https://a.b/")).toBeUndefined();
    expect(resolveUrl("./x.pdf", "https://a.b/c/d")).toBe("https://a.b/c/x.pdf");
  });
});

describe("lastRelevant / isArchivable", () => {
  const close = new Date("2026-09-10T11:15:00.000Z");
  const DAY = 86_400_000;

  it("returns the max of close, extended and listing", () => {
    expect(lastRelevant({ closeDate: close })).toBe(close.getTime());
    expect(lastRelevant({ closeDate: close, extendedCloseDate: "2026-09-14T11:15:00Z" })).toBe(Date.parse("2026-09-14T11:15:00Z"));
    expect(lastRelevant({ closeDate: close, extendedCloseDate: close.getTime() + 5, listingDate: close.getTime() + 10 * DAY })).toBe(
      close.getTime() + 10 * DAY,
    );
  });

  it("reads bare YYYY-MM-DD strings as NPT midnight", () => {
    expect(lastRelevant({ closeDate: "2026-09-10" })).toBe(Date.parse("2026-09-09T18:15:00Z"));
  });

  it("ignores invalid dates", () => {
    expect(lastRelevant({ closeDate: "garbage", listingDate: close })).toBe(close.getTime());
    expect(lastRelevant({ closeDate: close, extendedCloseDate: new Date("nope"), listingDate: NaN })).toBe(close.getTime());
    expect(Number.isNaN(lastRelevant({ closeDate: "x", extendedCloseDate: Infinity }))).toBe(true);
  });

  it("isArchivable boundaries: strictly more than `days` days after", () => {
    const t = close.getTime();
    expect(isArchivable({ closeDate: close }, t + 30 * DAY)).toBe(false);
    expect(isArchivable({ closeDate: close }, t + 30 * DAY + 1)).toBe(true);
    expect(isArchivable({ closeDate: close }, new Date(t + 31 * DAY))).toBe(true);
    expect(isArchivable({ closeDate: close }, t + 7 * DAY + 1, 7)).toBe(true);
    expect(isArchivable({ closeDate: close }, t + 7 * DAY, 7)).toBe(false);
  });

  it("isArchivable uses the latest of the three dates", () => {
    const t = close.getTime();
    expect(isArchivable({ closeDate: close, listingDate: t + 20 * DAY }, t + 40 * DAY)).toBe(false);
    expect(isArchivable({ closeDate: close, listingDate: t + 20 * DAY }, t + 51 * DAY)).toBe(true);
  });

  it("isArchivable is false when every date is invalid", () => {
    expect(isArchivable({ closeDate: "bad", extendedCloseDate: NaN }, Date.now() + 1e12)).toBe(false);
  });

  it("isArchivable defaults now to Date.now()", () => {
    expect(isArchivable({ closeDate: "2000-01-01" })).toBe(true);
    expect(isArchivable({ closeDate: Date.now() + DAY })).toBe(false);
  });
});
