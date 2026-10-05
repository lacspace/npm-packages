import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { classify, describe as describeApi } from "./index.js";

describe("Nepali", () => {
  it("court case about a person: certain", () => {
    const r = classify({ lang: "ne", title: "व्यवसायी अग्रवाल विशेष अदालतबाट थुनामा, धरौटीको आदेश उल्टियो", text: "विशेष अदालतले मुद्दामा व्यवसायी शंकर अग्रवाललाई पुर्पक्षका लागि थुनामा पठाउने फैसला गरेको छ।" });
    expect(r.categories).toContain("court");
    expect(r.confidence).toBe("certain");
  });
  it("death in the headline: death", () => {
    const r = classify({ lang: "ne", title: "कपिलवस्तुमा ट्याङ्कर दुर्घटना, सहचालकको मृत्यु", text: "दुर्घटनामा परी सहचालकको घटनास्थलमै मृत्यु भएको प्रहरीले जनाएको छ। शव पोस्टमार्टमका लागि पठाइएको छ।" });
    expect(r.categories).toEqual(["death"]);
    expect(r.confidence).toBe("certain");
  });
  it("routine parliament story: certain none", () => {
    const r = classify({ lang: "ne", title: "राष्ट्रपतिद्वारा संघीय संसदको चालू अधिवेशन अन्त्य", text: "राष्ट्रपतिले मन्त्रिपरिषद्को सिफारिसमा संघीय संसदको चालू अधिवेशन अन्त्य गरेका छन्।" });
    expect(r).toMatchObject({ categories: [], confidence: "certain" });
  });
  it("मुद्दा meaning 'issue' and N वर्षका meaning 'for N years' are not hits", () => {
    const r = classify({ lang: "ne", title: "सरकारले राष्ट्रिय मुद्दालाई बेवास्ता गर्‍यो", text: "आयोजना पाँच वर्षका लागि सम्झौता भएको हो।" });
    expect(r.hits.filter((h) => h.cat === "court" || h.cat === "minor")).toHaveLength(0);
  });
  it("a child is only sensitive with a harm context", () => {
    expect(classify({ lang: "ne", title: "विद्यालयमा बालबालिकालाई खोप", text: "बालबालिकालाई नियमित खोप लगाइयो।" }).categories).toEqual([]);
    expect(classify({ lang: "ne", title: "१४ वर्षीया किशोरी बेपत्ता", text: "किशोरी बेपत्ता भएको उजुरी प्रहरीमा परेको छ।" }).categories).toContain("minor");
  });
  it("election", () => {
    const r = classify({ lang: "ne", title: "कांग्रेस महाधिवेशन: निर्वाचनमा उम्मेदवारी दर्ता सुरु", text: "केन्द्रीय निर्वाचन समितिले उम्मेदवारी दर्ता गराउने कार्यतालिका सार्वजनिक गरेको छ।" });
    expect(r.categories).toContain("election");
  });
});

describe("English", () => {
  it("policy ruling is unsure, not certain court", () => {
    const r = classify({ lang: "en", title: "Supreme Court Orders Strict Enforcement of Plastic Bag Ban Nationwide", text: "The Supreme Court has issued a mandamus order in the name of the government to strictly implement the ban. The verdict was delivered by a division bench of justices." });
    expect(r.confidence).toBe("unsure");
  });
  it("death overs, deadline and climate justice are not hits", () => {
    const r = classify({ lang: "en", title: "Nepal bowlers shine in the death overs", text: "The deadline for climate justice pledges passed. Nepal won by 12 runs." });
    expect(r.hits).toHaveLength(0);
    expect(r.confidence).toBe("certain");
  });
  it("allegation needs a person", () => {
    const r = classify({ lang: "en", title: "MP Ansari Highlights Irregularities at National Medical College", text: "MP Rahabar Ansari alleged that rackets were operating at the college, citing irregularities in admissions." });
    expect(r.categories).toContain("named_individual");
    expect(r.confidence).toBe("certain");
  });
  it("committee chair 'election' is not a certain election story", () => {
    expect(classify({ lang: "en", title: "Parliamentary special committee chair election set for Wednesday", text: "The election for the chairperson of the committee will be held on Wednesday." }).confidence).toBe("unsure");
  });
  it("words deep in a scraped page (sidebars) are noise", () => {
    const junk = "x ".repeat(400);
    const r = classify({ lang: "en", title: "Both Houses of Federal Parliament to meet today", text: `Both houses meet today to discuss bills. ${junk} Related: Bodies recovered in Himlung.` });
    expect(r).toMatchObject({ categories: [], confidence: "certain" });
  });
  it("ages under 18", () => {
    expect(classify({ lang: "en", title: "Police rescue 14-year-old girl from traffickers", text: "A 14-year-old girl was rescued." }).categories).toContain("minor");
  });
  it("describe()", () => expect(describeApi().name).toBe("@lacspace/sensitivity"));
});

// Real WeNepal stories with their model's verdicts stay out of this public repo (they quote
// third-party text). Drop the file in src/fixtures/ to run these locally.
const FILE = new URL("./fixtures/wenepal-5oct2026.jsonl", import.meta.url);
const FX: { lang: "en" | "ne"; title: string; text: string; entities: string[]; ai: { categories: string[] } }[] = existsSync(FILE)
  ? readFileSync(FILE, "utf8").trim().split("\n").map((l) => JSON.parse(l))
  : [];

describe.skipIf(!FX.length)("WeNepal 200 real stories (5 Oct 2026)", () => {
  const MAP: Record<string, string> = { death_or_graphic: "death", hate: "communal" };
  const rows = FX.map((x) => ({ x, r: classify(x), ai: x.ai.categories.map((c) => MAP[c] ?? c).filter((c) => c !== "unverified_claim") }));
  it("settles at least 70% without the model", () => {
    expect(rows.filter((o) => o.r.confidence === "certain").length / rows.length).toBeGreaterThanOrEqual(0.7);
  });
  it("a certain 'nothing sensitive' disagrees with the model at most once in 200", () => {
    expect(rows.filter((o) => o.r.confidence === "certain" && !o.r.categories.length && o.ai.length).length).toBeLessThanOrEqual(1);
  });
  it("every certain 'sensitive' is one the model also flagged", () => {
    for (const o of rows.filter((o) => o.r.confidence === "certain" && o.r.categories.length)) expect(o.ai.length).toBeGreaterThan(0);
  });
});
