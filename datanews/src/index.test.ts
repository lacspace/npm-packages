import { describe, expect, it } from "vitest";
import { DataNewsError, KINDS, describe as describeApi, formatBigMoney, formatNumber, render, renderBoth } from "./index.js";

const DATE = "2026-10-04";
const GOLD = { gold: { perTola: 294800, prev: 293300 }, silver: { perTola: 4425, prev: 4400 }, unit: "tola" as const, currency: "NPR" as const };
const FOREX = {
  rates: [
    { code: "USD", buy: 137.5, sell: 138.1, unit: 1, prevSell: 137.95 },
    { code: "INR", buy: 160, sell: 160.15, unit: 100, prevSell: 160.15 },
    { code: "EUR", buy: 160.21, sell: 160.92, prevSell: 159.8 },
    { code: "GBP", buy: 184.1, sell: 184.92, prevSell: 185.4 },
    { code: "JPY", buy: 9.31, sell: 9.35, unit: 10, prevSell: 9.36 },
    { code: "SAR", buy: 36.62, sell: 36.78, prevSell: 36.74 },
  ],
};
const NEPSE = { index: 2683, change: -12.4, changePct: -0.46, turnover: 4123456789, volume: 9876543, gainers: [{ symbol: "SBLD89", pct: 8.8 }, { symbol: "NIFRA", pct: 4.1 }], losers: [{ symbol: "SINDU", pct: -8.55 }] };
const WEATHER = {
  regions: [
    { name: { en: "Koshi Province", ne: "कोशी प्रदेश" }, forecast: { en: "partly cloudy with light rain in a few places", ne: "आंशिक बदली रहने र केही स्थानमा हल्का वर्षा" } },
    { name: { en: "Kathmandu Valley", ne: "काठमाडौं उपत्यका" }, forecast: { en: "mostly fair", ne: "मुख्यतया सफा" } },
  ],
  warnings: [{ en: "heavy rain likely in Gandaki and Lumbini", ne: "गण्डकी र लुम्बिनीमा भारी वर्षाको सम्भावना" }],
};
const FUEL = { petrol: 175, diesel: 160, kerosene: 160, lpg: 1910, prev: { petrol: 172, diesel: 158, kerosene: 160, lpg: 1910 } };

const all = (s: ReturnType<typeof render>) => [s.headline, s.deck, s.summary, ...s.body, ...s.bullets, ...s.numbers.map((n) => n.value)].join("\n");
const BAD = /N\/A|undefined|NaN|null|Infinity|\$\{/;
const OUTLETS = /Kantipur|Setopati|Onlinekhabar|Kathmandu Post|Himalayan Times|Ratopati|कान्तिपुर|सेतोपाटी|अनलाइनखबर/;

describe("formatting", () => {
  it("groups numbers per language", () => {
    expect(formatNumber(294800, "en")).toBe("294,800");
    expect(formatNumber(294800, "ne")).toBe("२,९४,८००");
    expect(formatNumber(9876543, "ne", 0)).toBe("९८,७६,५४३");
    expect(formatNumber(12.4, "en")).toBe("12.4");
  });
  it("big money", () => {
    expect(formatBigMoney(4123456789, "en")).toBe("Rs 4.12 billion");
    expect(formatBigMoney(4123456789, "ne")).toBe("४.१२ अर्ब रुपैयाँ");
    expect(formatBigMoney(85_000_000, "ne")).toBe("८.५ करोड रुपैयाँ");
  });
});

describe("gold_silver", () => {
  it("WeNepal example headline (EN)", () => {
    expect(render("gold_silver", GOLD, { lang: "en", seed: 0 }).headline).toBe("Gold rises Rs 1,500 to Rs 294,800 per tola; silver at Rs 4,425");
  });
  it("WeNepal example headline (NE) with Devanagari and Nepali grouping", () => {
    expect(render("gold_silver", GOLD, { lang: "ne", seed: 0, maxHeadline: 120 }).headline).toBe("सुनको भाउ तोलामा १,५०० रुपैयाँले बढेर २,९४,८०० रुपैयाँ पुग्यो, चाँदी तोलाको ४,४२५ रुपैयाँ");
  });
  it("no-change day", () => {
    const s = render("gold_silver", { gold: { perTola: 294800, prev: 294800 }, silver: { perTola: 4425, prev: 4425 } }, { lang: "en" });
    expect(s.headline).toBe("Gold steady at Rs 294,800 per tola; silver at Rs 4,425");
    expect(all(s)).not.toMatch(/\(\+0\)|change of/);
    expect(render("gold_silver", { gold: { perTola: 294800, prev: 294800 } }, { lang: "ne" }).body[0]).toContain("यथावत्");
  });
  it("missing silver and missing prev drop their sentences", () => {
    const s = render("gold_silver", { gold: { perTola: 294800 } }, { lang: "en", date: DATE });
    expect(s.headline).toBe("Gold at Rs 294,800 per tola");
    expect(all(s)).not.toMatch(/silver at|price of silver|silver:|previous/i);
    expect(all(s)).not.toMatch(BAD);
  });
  it("defaults attribution to the gold dealers' federation (EN starts with 'the')", () => {
    const en = render("gold_silver", GOLD, { lang: "en" });
    expect(en.body).toContain("The prices are set by the Federation of Nepal Gold and Silver Dealers' Association.");
    expect(render("gold_silver", GOLD, { lang: "ne" }).body.at(-1)).toBe("नेपाल सुनचाँदी व्यवसायी महासंघले यो भाउ तोकेको हो।");
    expect(render("gold_silver", GOLD, { lang: "en", source: "the dealers" }).body.at(-1)).toBe("The prices are set by the dealers.");
  });
  it("headline fits the 80-char budget by shortening the silver part", () => {
    for (let seed = 0; seed < 4; seed++) for (const lang of ["en", "ne"] as const) {
      expect(render("gold_silver", GOLD, { lang, seed }).headline.length).toBeLessThanOrEqual(80);
    }
    expect(render("gold_silver", GOLD, { lang: "ne", seed: 0 }).headline).toBe("सुनको भाउ तोलामा १,५०० रुपैयाँले बढेर २,९४,८०० रुपैयाँ पुग्यो, चाँदी ४,४२५");
    expect(render("gold_silver", GOLD, { lang: "ne", seed: 0, maxHeadline: 120 }).headline).toContain("चाँदी तोलाको ४,४२५ रुपैयाँ");
  });
  it("Nepali date gets its postposition from the template", () => {
    const ne = render("gold_silver", GOLD, { lang: "ne", dateLabel: { ne: "असोज १९" } });
    expect(ne.body[0]).toMatch(/^असोज १९मा सुन/);
  });
  it("a Nepali-only dateLabel never leaks into English", () => {
    const en = render("gold_silver", GOLD, { lang: "en", date: "2026-10-05", dateLabel: { ne: "असोज १९" } });
    expect(all(en)).not.toMatch(/[\u0900-\u097F]/);
    expect(en.body[0]).toContain("5 October 2026");
  });
  it("throws when nothing is usable", () => {
    expect(() => render("gold_silver", {}, {})).toThrow(DataNewsError);
  });
});

describe("forex_nrb", () => {
  it("INR first, attributed to Nepal Rastra Bank, max 5 currencies", () => {
    const s = render("forex_nrb", FOREX, { lang: "en", date: DATE });
    expect(s.body[0]).toMatch(/^Nepal Rastra Bank has set the Indian rupee at Rs 160\.00 buying and Rs 160\.15 selling per 100/);
    expect(s.numbers.map((n) => n.label)).toEqual(["INR (100)", "USD", "EUR", "GBP", "SAR"]);
    expect(s.headline).toMatch(/US dollar .*15 paisa.*Rs 138\.10/);
  });
  it("movers ranked by absolute % change", () => {
    const s = render("forex_nrb", FOREX, { lang: "en" });
    expect(s.body[2]).toMatch(/euro at Rs 160\.92 \(up Rs 1\.12\), the British pound at Rs 184\.92 \(down 48 paisa\) and the Saudi riyal/);
  });
  it("Nepali reads native", () => {
    const s = render("forex_nrb", FOREX, { lang: "ne" });
    expect(s.body[0]).toContain("नेपाल राष्ट्र बैंकले भारतीय रुपैयाँ (प्रति १००) को खरिददर १६०.०० रुपैयाँ र बिक्रीदर १६०.१५ रुपैयाँ तोकेको छ।");
    expect(s.body[1]).toMatch(/^अमेरिकी डलरको खरिददर/);
  });
  it("Nepali headlines fit 80 chars, including unchanged days", () => {
    const flat = { rates: FOREX.rates.map((r) => ({ ...r, prevSell: r.sell })) };
    const noPrev = { rates: FOREX.rates.map(({ prevSell, ...r }) => r) };
    for (const d of [FOREX, flat, noPrev]) for (let seed = 0; seed < 6; seed++) {
      expect(render("forex_nrb", d, { lang: "ne", seed }).headline.length).toBeLessThanOrEqual(80);
    }
    expect(render("forex_nrb", flat, { lang: "ne" }).headline).toBe("अमेरिकी डलरको बिक्रीदर १३८.१० रुपैयाँमा यथावत्");
    expect(render("forex_nrb", flat, { lang: "en" }).headline).toBe("US dollar steady at Rs 138.10 selling");
  });
  it("no previous rates: majors order, no movement words", () => {
    const s = render("forex_nrb", { rates: FOREX.rates.map(({ prevSell, ...r }) => r) }, { lang: "en" });
    expect(s.headline).toBe("NRB sets US dollar at Rs 137.50 buying, Rs 138.10 selling");
    expect(all(s)).not.toMatch(/\bup\b|\bdown\b|unchanged/);
  });
});

describe("nepse_close", () => {
  it("WeNepal example headline", () => {
    expect(render("nepse_close", NEPSE, { lang: "en", seed: 0 }).headline).toBe("NEPSE falls 12.4 points to 2,683 as turnover crosses Rs 4 billion");
    expect(render("nepse_close", NEPSE, { lang: "ne", seed: 0 }).headline).toBe("नेप्से १२.४ अंकले घटेर २,६८३ मा, कारोबार ४ अर्ब नाघ्यो");
  });
  it("singular mover grammar", () => {
    const en = render("nepse_close", NEPSE, { lang: "en", seed: 0 });
    expect(en.body.join(" ")).toMatch(/The top loser was SINDU \(−8\.55%\)\./);
    expect(render("nepse_close", NEPSE, { lang: "ne" }).body.join(" ")).toContain("घटुवामा SINDU (−८.५५%) अग्रस्थानमा रह्यो।");
  });
  it("flat day and missing turnover/movers", () => {
    const s = render("nepse_close", { index: 2683, change: 0 }, { lang: "en" });
    expect(s.headline).toBe("NEPSE unchanged at 2,683");
    expect(s.body).toHaveLength(1);
    expect(all(s)).not.toMatch(/turnover|gainer|loser/i);
  });
});

describe("weather_dhm", () => {
  it("warning leads, DHM attribution", () => {
    const s = render("weather_dhm", WEATHER, { lang: "en", date: DATE });
    expect(s.headline).toBe("Weather alert: Heavy rain likely in Gandaki and Lumbini");
    expect(s.body[0]).toMatch(/^The Department of Hydrology and Meteorology has issued a warning/);
    expect(render("weather_dhm", WEATHER, { lang: "ne" }).body[0]).toMatch(/^जल तथा मौसम विज्ञान विभागले/);
  });
  it("no warnings", () => {
    const s = render("weather_dhm", { regions: WEATHER.regions }, { lang: "en", seed: 0 });
    expect(s.headline).toBe("Weather outlook: Partly cloudy with light rain in a few places");
    expect(all(s)).not.toMatch(/warning/i);
  });
});

describe("fuel_price", () => {
  it("changes lead, Nepal Oil Corporation attribution", () => {
    const s = render("fuel_price", FUEL, { lang: "en" });
    expect(s.headline).toBe("Petrol up Rs 3 to Rs 175 a litre; diesel up Rs 2");
    expect(all(s)).toContain("Nepal Oil Corporation");
    expect(s.body.at(-1)).toBe("The price of LPG remains Rs 1,910 per cylinder.");
  });
  it("no-change day", () => {
    const s = render("fuel_price", { petrol: 175, diesel: 160, prev: { petrol: 175, diesel: 160 } }, { lang: "ne" });
    expect(s.headline).toBe("इन्धनको मूल्य यथावत्, पेट्रोल लिटरको १७५ रुपैयाँ");
    expect(s.body.join(" ")).toContain("लिटरको १७५ रुपैयाँमा यथावत् छ।");
  });
  it("missing fields omitted", () => {
    const s = render("fuel_price", { petrol: 175 }, { lang: "en" });
    expect(all(s)).not.toMatch(/diesel|kerosene|LPG/);
  });
});

describe("every kind, both languages", () => {
  const DATA = { gold_silver: GOLD, forex_nrb: FOREX, nepse_close: NEPSE, weather_dhm: WEATHER, fuel_price: FUEL } as const;
  for (const k of KINDS) {
    it(`${k}: shape, no placeholders, no outlet names, numbers from input`, () => {
      const { en, ne } = renderBoth(k, DATA[k] as never, { date: DATE });
      for (const s of [en, ne]) {
        expect(s.body.length).toBeGreaterThanOrEqual(1);
        expect(s.body.length).toBeLessThanOrEqual(5);
        expect(s.bullets.length).toBeLessThanOrEqual(3);
        expect(all(s)).not.toMatch(BAD);
        expect(all(s)).not.toMatch(OUTLETS);
      }
      // Nepali uses Devanagari digits everywhere except inside stock symbols like SBLD89
      expect(all(ne).replace(/\b[A-Z][A-Z0-9]*\b/g, "")).not.toMatch(/[0-9]/);
    });
  }
  it("phrasing varies across dates", () => {
    const heads = new Set(["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05"].map((date) => render("gold_silver", GOLD, { date }).body.join(" ")));
    expect(heads.size).toBeGreaterThan(1);
  });
  it("describe()", () => {
    expect(describeApi().name).toBe("@lacspace/datanews");
  });
});
