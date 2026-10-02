import { describe, expect, it } from "vitest";
import type { BrandTheme } from "@lacspace/newscard";
import {
  aqiCategory, aqiFrom, cardFor, datacard, describe as describeApi, findStation, forexCard, goldCard, hourlyMeans, nepseFromJson, parseDhmWeather,
  parseFenegosida, parseNocHtml, parseNrbPayload, pickSeries, sparklineSvg, toMontage, weatherCard, withDeltas, worthPosting, fuelCard, aqiCard, dateLine,
} from "./index.js";
import type { FetchLike } from "./index.js";

const theme: BrandTheme = { bg: "#0b1f3a", fg: "#ffffff", accent: "#c8102e", fontFamily: "Mukta", footer: "WeNepal" };

const NRB = { data: { payload: [
  { date: "2026-09-30", rates: [{ currency: { iso3: "USD", name: "U.S. Dollar", unit: 1 }, buy: "152.80", sell: "153.40" }, { currency: { iso3: "INR", name: "Indian Rupee", unit: 100 }, buy: "160.00", sell: "160.15" }] },
  { date: "2026-10-01", rates: [{ currency: { iso3: "USD", name: "U.S. Dollar", unit: 1 }, buy: "153.04", sell: "153.64" }, { currency: { iso3: "INR", name: "Indian Rupee", unit: 100 }, buy: "160.00", sell: "160.15" }, { currency: { iso3: "AED", name: "UAE Dirham", unit: 1 }, buy: "41.60", sell: "41.80" }] },
] } };
const GOLD = [
  { rateType: "असली चाँदी दर (१ तोला)", todayDate: "2026-10-02T04:52:13Z", todayBaseRatePerGram: 4450, yestardayBaseRatePerGram: 4425 },
  { rateType: "असली चाँदी दर (१० ग्राम)", todayDate: "2026-10-02T04:52:13Z", todayBaseRatePerGram: 3815, yestardayBaseRatePerGram: 3794 },
  { rateType: "छापावाल सुन (१ तोला)", todayDate: "2026-10-02T04:52:13Z", todayBaseRatePerGram: 294800, yestardayBaseRatePerGram: 293300 },
  { rateType: "छापावाल सुन (१० ग्राम)", todayDate: "2026-10-02T04:52:13Z", todayBaseRatePerGram: 252745, yestardayBaseRatePerGram: 251460 },
];
const NOC = `<div><h4>Petrol/Ltr</h4><p>Rs 197.5 /Ltr</p><h4>Diesel/Ltr</h4><p>Rs 180.0 /Ltr</p><h4>LP Gas/Cylinder(14.2) K.g</h4><p>Rs 2060.0 /Cyl</p></div>`;
const DHM = { datetime: "2026-10-02T12:15:00.000Z", stations: [
  { id: 1, name: "Kathmandu", nepali_name: "काठमाडौं", manual_forecast: [
    { rain_probability: 20, from_temperature: 17, to_temperature: null, day: 2, weather: { id: 54, name: "Partly Cloudy", nepali_name: "आंशिक बादल" } },
    { rain_probability: 40, from_temperature: 27, to_temperature: null, day: 3, weather: { id: 57, name: "Light rain with thunderstorms", nepali_name: "मेघगर्जन सहित हल्का वर्षा" } },
  ], sunrise: "6:00 AM", sunset: "6:00 PM" },
  { id: 2, name: "Pokhara", nepali_name: "पोखरा", manual_forecast: [{ rain_probability: 60, from_temperature: 20, to_temperature: 29, day: 2, weather: { id: 60, name: "Rain", nepali_name: "वर्षा" } }] },
  { id: 3, name: "Dadeldhura", nepali_name: "डडेलधुरा", manual_forecast: [] },
] };
const STATIONS = [{ id: 147, name: "Ratnapark_NMS" }, { id: 3, name: "Ratnapark", meta_data: [{ name: "Nepali Name", value: "रत्नपार्क" }] }];
const SERIES = [{ id: 4, name: "PM2.5 Inst" }, { id: 72, name: "PM2.5 avg 1 hr" }, { id: 56, name: "PM10 avg 1 hr" }, { id: 307, name: "42i chamber pressure" }];
const OBS = { parameter_code: "PM2.5_1H_AVG", data: [
  { datetime: "2026-10-02T03:00:00+00:00", value: 30 }, { datetime: "2026-10-02T03:30:00+00:00", value: 34 },
  { datetime: "2026-10-02T04:00:00+00:00", value: 60 }, { datetime: "2026-10-02T04:20:00+00:00", value: 64 },
] };

function mockFetch(): FetchLike {
  return (async (url: string) => {
    const ok = (body: any, text = "") => ({ ok: true, status: 200, json: async () => body, text: async () => text });
    if (url.includes("nrb.org.np")) return ok(NRB);
    if (url.includes("fenegosida")) return ok(GOLD);
    if (url.includes("noc.org.np")) return ok({}, NOC);
    if (url.includes("mfd/api/weather")) return ok(DHM);
    if (url.includes("three-days-forecast-latest")) return ok([{ title: "आगामी तीन दिनको मौसम पूर्वानुमान", issue_date: "2026-10-02T12:15:00Z" }]);
    if (url.includes("gss/api/station/3/data-series")) return ok(SERIES);
    if (url.includes("gss/api/station")) return ok(STATIONS);
    if (url.includes("gss/api/observation?series_id=72")) return ok({ data: [] }); // 1-h series empty, like the live server
    if (url.includes("gss/api/observation")) return ok(OBS);
    return { ok: false, status: 404, json: async () => ({}), text: async () => "" };
  }) as FetchLike;
}

describe("sources", () => {
  it("parses NRB payload and computes deltas against the previous day", () => {
    const days = parseNrbPayload(NRB);
    expect(days.map((d) => d.date)).toEqual(["2026-09-30", "2026-10-01"]);
    const rates = withDeltas(days[1]!.rates, days[0]!.rates);
    expect(rates.find((r) => r.iso3 === "USD")!.delta).toBeCloseTo(0.24);
    expect(rates.find((r) => r.iso3 === "INR")!.delta).toBe(0);
    expect(rates.find((r) => r.iso3 === "AED")!.delta).toBeUndefined();
  });
  it("folds FENEGOSIDA tola/10g rows into one rate per metal with deltas", () => {
    const { date, rates } = parseFenegosida(GOLD);
    expect(date).toBe("2026-10-02");
    expect(rates.map((r) => r.key)).toEqual(["gold-hallmark", "silver"]);
    expect(rates[0]!.perTola).toBe(294800);
    expect(rates[0]!.per10g).toBe(252745);
    expect(rates[0]!.delta).toBe(1500);
  });
  it("scrapes NOC price tiles", () => {
    const p = parseNocHtml(NOC);
    expect(p.find((x) => x.key === "petrol")!.price).toBe(197.5);
    expect(p.find((x) => x.key === "lpg")!.price).toBe(2060);
    expect(p.find((x) => x.key === "diesel")!.price).toBe(180);
  });
  it("parses DHM stations, folds morning/afternoon rows and respects city order", () => {
    const { stations } = parseDhmWeather(DHM, ["Pokhara", "Kathmandu"]);
    expect(stations.map((s) => s.name)).toEqual(["Pokhara", "Kathmandu"]);
    const k = stations[1]!;
    expect(k.days).toHaveLength(1);
    expect(k.days[0]!.minTemp).toBe(17);
    expect(k.days[0]!.maxTemp).toBe(27);
    expect(k.days[0]!.rainProbability).toBe(40);
    expect(k.days[0]!.condition).toMatch(/thunder/i);
  });
  it("computes AQI (EPA 2024 PM2.5 breakpoints) and picks the 1-h series", () => {
    expect(aqiFrom(9)).toBe(50);
    expect(aqiFrom(35.4)).toBe(100);
    expect(aqiFrom(55.5)).toBe(151);
    expect(aqiCategory(aqiFrom(12))).toBe("moderate");
    expect(pickSeries(SERIES)!.id).toBe(72);
    expect(pickSeries(SERIES, "pm10")!.id).toBe(56);
    expect(findStation(STATIONS, "Ratnapark")!.id).toBe(3); // exact beats the noise station "Ratnapark_NMS"
    const h = hourlyMeans(OBS.data);
    expect(h.map((x) => x.mean)).toEqual([32, 62]);
  });
  it("normalises injected NEPSE json", () => {
    const s = nepseFromJson({ index: [{ index: "NEPSE Index", currentValue: 2650.12, change: -12.5, perChange: -0.47, turnover: 4500000000 }], gainers: [{ symbol: "NABIL", ltp: 540, percentageChange: 9.8 }], date: "2026-10-01" });
    expect(s.index).toBe(2650.12);
    expect(s.changePct).toBe(-0.47);
    expect(s.gainers![0]!.symbol).toBe("NABIL");
  });
});

describe("cards", () => {
  it("forexCard builds a bilingual table with BS+AD date, deltas, caption and facts", () => {
    const days = parseNrbPayload(NRB);
    const snap = { kind: "forex" as const, date: "2026-10-01", rates: withDeltas(days[1]!.rates, days[0]!.rates), source: "Nepal Rastra Bank", url: "", fetchedAt: "" };
    const c = forexCard(snap, { theme, history: [152, 152.5, 153.64] });
    expect(c.spec.type).toBe("table");
    const rows = c.spec.table!.rows;
    expect(rows[0]!.cells[0]).toBe("USD");
    expect(rows[0]!.cells[3]).toBe("+0.24");
    expect(rows[0]!.tone).toBe("up");
    expect(rows.find((r) => r.cells[0]!.startsWith("INR"))!.cells[0]).toBe("INR (100)");
    expect((c.spec.headline as any).en).toMatch(/2083/); // BS year
    expect((c.spec.headline as any).ne).toMatch(/२०८३/);
    expect(c.caption.en).toMatch(/153\.64/);
    expect(c.caption.ne).toMatch(/१५३\.६४/);
    expect(c.spec.chart!.src.startsWith("data:image/svg+xml")).toBe(true);
    expect(c.facts.usdSell).toBe(153.64);
    expect(c.hashtags).toContain("NRB");
  });
  it("goldCard uses lakh wording and Nepali numerals", () => {
    const c = goldCard({ kind: "gold", ...parseFenegosida(GOLD), source: "FENEGOSIDA", url: "", fetchedAt: "" }, { theme });
    expect(c.caption.en).toMatch(/2\.95 lakh/);
    expect(c.caption.ne).toMatch(/२\.९५ लाख/);
    expect(c.spec.table!.rows[0]!.tone).toBe("up");
  });
  it("fuelCard reports changed items only in the caption", () => {
    const prices = parseNocHtml(NOC).map((p) => (p.key === "petrol" ? { ...p, delta: 2.5 } : { ...p, delta: 0 }));
    const c = fuelCard({ kind: "fuel", date: "2026-10-02", prices, source: "NOC", url: "", fetchedAt: "" }, { theme });
    expect(c.caption.en).toMatch(/Petrol \+2\.5 to Rs 197\.5/);
    expect(c.caption.en).not.toMatch(/Diesel/);
  });
  it("weatherCard renders a table with icons, or a breaking alert for special bulletins", () => {
    const { stations } = parseDhmWeather(DHM, ["Kathmandu", "Pokhara"]);
    const normal = weatherCard({ kind: "weather", issuedAt: "2026-10-02T12:15:00Z", stations, source: "DHM", url: "", fetchedAt: "" }, { theme });
    expect(normal.spec.type).toBe("table");
    expect(normal.spec.table!.rows[0]!.icon!.startsWith("data:image/svg")).toBe(true);
    expect(normal.spec.table!.rows[0]!.cells[1]).toBe("17° / 27°");
    expect(normal.caption.en).toMatch(/Kathmandu/);
    const alert = weatherCard({ kind: "weather", issuedAt: "2026-10-02T12:15:00Z", stations, bulletin: { title: "विशेष मौसम बुलेटिन: भारी वर्षाको सम्भावना", issuedAt: "", special: true }, source: "DHM", url: "", fetchedAt: "" }, { theme });
    expect(alert.spec.type).toBe("breaking");
    expect(alert.hashtags).toContain("WeatherAlert");
  });
  it("aqiCard colours by category and includes a bar sparkline", () => {
    const c = aqiCard({ kind: "aqi", readings: [{ stationId: 3, station: "Ratnapark", parameter: "PM2.5_1H_AVG", value: 62, aqi: aqiFrom(62), category: aqiCategory(aqiFrom(62)), at: "", history: [30, 40, 62] }], source: "DoEnv", url: "", fetchedAt: "" }, { theme });
    expect(c.spec.table!.rows[0]!.tone).toBe("down");
    expect(c.caption.en).toMatch(/Unhealthy/);
    expect(c.spec.chart).toBeDefined();
  });
  it("dateLine gives BS and AD in both languages", () => {
    const d = dateLine("2026-10-02");
    expect(d.en).toMatch(/16 Ash?win 2083 BS · 2 October 2026/);
    expect(d.ne).toMatch(/२०८३ असोज १६/);
  });
});

describe("pipeline", () => {
  it("datacard() fetches + builds for every fetchable kind (mock fetch)", async () => {
    const f = mockFetch();
    for (const kind of ["forex", "gold", "fuel", "weather", "aqi"] as const) {
      const c = await datacard(kind, { theme }, { fetch: f });
      expect(c.kind).toBe(kind);
      expect(c.caption.en.length).toBeGreaterThan(10);
      expect(c.snapshot.source).toBeTruthy();
    }
    const w = await datacard("weather", { theme }, { fetch: f, cities: ["Kathmandu"] });
    expect((w.snapshot as any).bulletin.special).toBe(false);
    const a = await datacard("aqi", { theme }, { fetch: f });
    expect((a.snapshot as any).readings[0].aqi).toBe(aqiFrom(62));
    expect((a.snapshot as any).readings[0].parameter).toBe("PM2.5 Inst"); // fell through from the empty 1-h series
  });
  it("worthPosting gates repeats", () => {
    const g = { kind: "gold" as const, ...parseFenegosida(GOLD), source: "", url: "", fetchedAt: "" };
    expect(worthPosting(g).post).toBe(true);
    expect(worthPosting(g, g).post).toBe(false);
    const g2 = { ...g, rates: g.rates.map((r) => ({ ...r, perTola: r.perTola + 100 })) };
    expect(worthPosting(g2, g).post).toBe(true);
  });
  it("toMontage builds a timeline with sting, stills and kinetic captions", () => {
    const days = parseNrbPayload(NRB);
    const c = cardFor({ kind: "forex", date: "2026-10-01", rates: days[1]!.rates, source: "", url: "", fetchedAt: "" }, { theme });
    const t = toMontage([c, c], { images: ["a.png", "b.png"], fontFile: "f.ttf", output: "o.mp4", sting: { src: "s.mp4", duration: 1.5 }, perCard: 4, lang: "ne" });
    expect(t.segments).toHaveLength(3);
    expect(t.captions![0]!.start).toBeCloseTo(1.9);
    expect(t.captions![0]!.text).toMatch(/राष्ट्र बैंक/);
    expect(t.preset).toBe("fb-feed");
  });
  it("sparklineSvg and describe()", () => {
    expect(sparklineSvg([1, 2, 3], { baseline: 2 })).toMatch(/^data:image\/svg\+xml;base64,/);
    const d = describeApi();
    expect(d.commands.map((c) => c.name)).toContain("datacard");
    expect(d.sources.forex).toBe("nrb.org.np");
  });
});
