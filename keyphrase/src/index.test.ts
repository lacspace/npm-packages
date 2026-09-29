import { describe, expect, it } from "vitest";
import { keyphrase, toHashtag } from "./index.js";

describe("toHashtag", () => {
  it("CamelCases Latin, keeps Devanagari, strips punctuation", () => {
    expect(toHashtag("asian games")).toBe("#AsianGames");
    expect(toHashtag("#Nepal!")).toBe("#Nepal");
    expect(toHashtag("नेपाल")).toBe("#नेपाल");
    expect(toHashtag("महिला कबड्डी")).toBe("#महिलाकबड्डी");
    expect(toHashtag("a")).toBe("");
  });
});

describe("keyphrase (English)", () => {
  const text =
    "Nepal Rastra Bank cut the policy interest rate on Sunday. The policy rate cut will help borrowers. " +
    "Governor Maha Prasad Adhikari said inflation is easing. The central bank expects lower interest rates to boost lending.";
  const r = keyphrase(text, { topK: 8, gazetteer: ["Nepal Rastra Bank"], categories: { economy: ["rate", "inflation", "bank", "lending"], sports: ["match", "goal"] } });

  it("detects language and returns ranked phrases", () => {
    expect(r.language).toBe("en");
    expect(r.phrases.length).toBeGreaterThan(0);
    expect(r.phrases[0]!.score).toBeGreaterThanOrEqual(r.phrases[r.phrases.length - 1]!.score);
    // multiword key concept surfaces
    expect(r.tags.join(" ").toLowerCase()).toMatch(/policy|interest rate|rate/);
  });
  it("produces hashtags and does not include stopwords as tags", () => {
    expect(r.hashtags.every((h) => h.startsWith("#"))).toBe(true);
    expect(r.tags.map((t) => t.toLowerCase())).not.toContain("the");
  });
  it("extracts entities including the gazetteer", () => {
    expect(r.entities.some((e) => e.text === "Nepal Rastra Bank")).toBe(true);
    expect(r.entities.some((e) => e.text.includes("Maha Prasad Adhikari"))).toBe(true);
  });
  it("votes categories by term hits, economy over sports", () => {
    expect(r.categories[0]!.category).toBe("economy");
    expect(r.categories.find((c) => c.category === "sports")).toBeUndefined();
  });
  it("is deterministic", () => {
    const a = keyphrase(text, { topK: 8 });
    const b = keyphrase(text, { topK: 8 });
    expect(a).toEqual(b);
  });
});

describe("keyphrase (Nepali)", () => {
  const ne = "नेपाल राष्ट्र बैंकले ब्याजदर घटायो। ब्याजदर घटेपछि ऋणीलाई राहत हुने भएको छ। काठमाडौंमा महँगी घटेको छ।";
  const r = keyphrase(ne, { topK: 6, gazetteer: ["नेपाल राष्ट्र बैंक", "काठमाडौं"] });
  it("detects Nepali and uses Devanagari stopwords", () => {
    expect(r.language).toBe("ne");
    expect(r.phrases.length).toBeGreaterThan(0);
    // stopword छ must not be a tag
    expect(r.tags).not.toContain("छ");
  });
  it("keeps Devanagari hashtags whole with matras", () => {
    const withMatra = r.hashtags.find((h) => /[ऀ-ॿ]/.test(h));
    if (withMatra) expect(withMatra).toMatch(/^#[ऀ-ॿ]+$/);
  });
  it("surfaces Devanagari gazetteer entities", () => {
    expect(r.entities.some((e) => e.text === "काठमाडौं")).toBe(true);
  });
});

describe("edge cases", () => {
  it("handles empty input", () => {
    const r = keyphrase("");
    expect(r.phrases).toEqual([]);
    expect(r.tags).toEqual([]);
  });
  it("respects maxWords and topK", () => {
    const r = keyphrase("alpha beta gamma delta epsilon zeta eta theta", { maxWords: 2, topK: 3 });
    expect(r.phrases.length).toBeLessThanOrEqual(3);
    expect(r.phrases.every((p) => p.phrase.split(" ").length <= 2)).toBe(true);
  });
});
