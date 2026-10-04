import { describe, expect, it } from "vitest";
import { describe as describeApi, groupSouthAsian, marketWrap, rupeesInWords, signedPct } from "./index.js";

const FIXTURE = {
  index: { name: "NEPSE", close: 2587.25, change: -11.9, pct: -0.45 },
  breadth: { up: 95, down: 238, flat: 23 },
  turnoverRs: 4293774181,
  sectors: [{ name: "Mutual Fund", pct: 0.2 }, { name: "Trading", pct: -0.96 }],
  gainers: [{ symbol: "SBLD89", pct: 8.8 }],
  losers: [{ symbol: "SINDU", pct: -8.55 }],
};

describe("marketWrap", () => {
  it("ShareRocketPro fixture (English)", () => {
    expect(marketWrap(FIXTURE).en).toBe(
      "NEPSE fell 11.90 points (−0.45%) to 2,587.25. Decliners led 238 to 95. Turnover Rs 4.29 arba. Mutual Fund was the best sector (+0.20%), Trading the weakest (−0.96%).",
    );
  });
  it("ShareRocketPro fixture (Nepali)", () => {
    const ne = marketWrap(FIXTURE).ne;
    expect(ne.startsWith("नेप्से ११.९० अंक (−०.४५%) घटेर २,५८७.२५ मा बन्द भयो।")).toBe(true);
    expect(ne).toContain("रु ४.२९ अर्ब");
    expect(ne).toContain("म्युचुअल फन्ड (+०.२०%)");
    expect(ne).not.toMatch(/[0-9]/); // all digits Devanagari
  });
  it("movers are opt-in", () => {
    const w = marketWrap(FIXTURE, { parts: ["index", "movers"] });
    expect(w.en).toBe("NEPSE fell 11.90 points (−0.45%) to 2,587.25. SBLD89 was the top gainer (+8.80%) and SINDU the top loser (−8.55%).");
  });
  it("seeds rotate phrasing deterministically", () => {
    const days = ["2026-10-01", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"].map((d) => marketWrap(FIXTURE, { seed: d }).en);
    expect(new Set(days).size).toBeGreaterThan(2);
    expect(marketWrap(FIXTURE, { seed: "2026-10-04" }).en).toBe(days[1]);
    for (const t of days) {
      expect(t).toContain("11.90");
      expect(t).toContain("2,587.25");
      expect(t).not.toMatch(/\b(buy|sell|should|will|expect|predict)\b/i);
    }
  });
  it("up, flat, all-up / all-down sectors, level breadth", () => {
    const up = marketWrap({ index: { name: "NEPSE", close: 2600, change: 12.75 }, breadth: { up: 200, down: 100 }, sectors: [{ name: "Banking", pct: 1.2 }, { name: "Finance", pct: 0.1 }] });
    expect(up.en).toBe("NEPSE rose 12.75 points (+0.49%) to 2,600.00. Advancers led 200 to 100. All sectors gained; Banking led (+1.20%) and Finance rose least (+0.10%).");
    expect(up.headline.en).toBe("NEPSE up 12.75 points");
    const flat = marketWrap({ index: { name: "NEPSE", close: 2600, change: 0 }, breadth: { up: 50, down: 50, flat: 10 } });
    expect(flat.en).toBe("NEPSE was unchanged at 2,600.00. Advancers and decliners were level at 50 each, with 10 unchanged.");
    expect(flat.headline.ne).toBe("नेप्से २,६००.०० मा स्थिर");
    const down = marketWrap({ index: { name: "NEPSE", close: 2500, change: -50 }, sectors: [{ name: "Banking", pct: -0.5 }, { name: "Hydropower", pct: -2 }] });
    expect(down.sentences.en[1]).toBe("All sectors fell; Banking fell least (−0.50%) and Hydropower most (−2.00%).");
    expect(down.sentences.ne[1]).toContain("जलविद्युत");
  });
  it("number helpers", () => {
    expect(groupSouthAsian(4293774181, 0)).toBe("4,29,37,74,181");
    expect(signedPct(0)).toBe("0.00%");
    expect(rupeesInWords(25e7)).toEqual({ en: "Rs 25.00 crore", ne: "रु २५.०० करोड" });
    expect(rupeesInWords(85000)).toEqual({ en: "Rs 85,000", ne: "रु ८५,०००" });
  });
  it("describe()", () => {
    expect(describeApi().commands[0]!.name).toBe("marketWrap");
  });
});
