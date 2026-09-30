import { describe, expect, it } from "vitest";
import {
  devanagariToLatin, dominantScript, latinToDevanagari, matchName, nameVariants,
  normalizeName, phoneticKey, scriptRatio, stripHonorifics, transliterate,
} from "./index.js";

describe("devanagariToLatin", () => {
  it("romanizes common Nepali names phonetically", () => {
    expect(devanagariToLatin("राम")).toBe("raam"); // राम
    expect(devanagariToLatin("नेपाल")).toBe("nepaal"); // नेपाल
    expect(devanagariToLatin("काठमाडौं")).toContain("kaath"); // काठमाडौं
  });
  it("handles virama (half letters) and digits", () => {
    expect(devanagariToLatin("निर्वाचन")).toBe("nirwaachan"); // निर्वाचन
    expect(devanagariToLatin("१२३")).toBe("123"); // १२३
  });
});

describe("transliterate", () => {
  it("auto-detects and round-trips a name approximately", () => {
    const roman = transliterate("रामचन्द्र"); // रामचन्द्र
    expect(roman.toLowerCase()).toContain("raam");
    const back = transliterate("nepal", { from: "en", to: "ne" });
    expect(/[ऀ-ॿ]/.test(back)).toBe(true);
  });
  it("returns input unchanged when from === to", () => {
    expect(transliterate("hello", { from: "en", to: "en" })).toBe("hello");
  });
});

describe("honorifics", () => {
  it("strips Latin and Devanagari titles", () => {
    expect(stripHonorifics("Dr. Ram Chandra Poudel")).toBe("Ram Chandra Poudel");
    expect(stripHonorifics("श्री राम")).toBe("राम"); // श्री राम → राम
  });
});

describe("phoneticKey + nameVariants", () => {
  it("collapses spelling variants to one key", () => {
    expect(phoneticKey("Poudel")).toBe(phoneticKey("Paudel"));
    expect(phoneticKey("Shrestha")).toBe(phoneticKey("Shreshtha"));
    expect(phoneticKey("Adhikari")).not.toBe(phoneticKey("Poudel"));
  });
  it("generates plausible spelling variants", () => {
    const v = nameVariants("Poudel");
    expect(v.map((x) => x.toLowerCase())).toContain("paudel");
    expect(v.length).toBeGreaterThan(1);
  });
});

describe("matchName — the held-story blocker", () => {
  it("matches an English name to its Devanagari spelling", () => {
    const r = matchName("Ram Chandra Poudel", "रामचन्द्र पौडेल");
    expect(r.match).toBe(true);
    expect(r.score).toBeGreaterThan(0.8);
  });
  it("matches across spelling variants and honorifics", () => {
    expect(matchName("Dr. K. P. Sharma Oli", "KP Sharma Oli").match).toBe(true);
    expect(matchName("Sher Bahadur Deuba", "Sher Bdr. Deuba").match).toBe(true);
  });
  it("rejects clearly different names", () => {
    expect(matchName("Ram Chandra Poudel", "Sher Bahadur Deuba").match).toBe(false);
  });
  it("resolves a canonical spelling from a gazetteer", () => {
    const r = matchName("पौडेल रामचन्द्र", "Ramchandra Poudel", {
      gazetteer: ["Ram Chandra Poudel", "Sher Bahadur Deuba"],
    });
    expect(r.match).toBe(true);
    expect(r.canonical).toBe("Ram Chandra Poudel");
  });
  it("normalizeName romanizes + lowercases + strips titles", () => {
    expect(normalizeName("Dr. Baburam Bhattarai")).toBe("baburam bhattarai");
  });
});

describe("scriptRatio + dominantScript (#3 language-mix)", () => {
  it("counts scripts, ignoring whitespace and punctuation", () => {
    const r = scriptRatio("Nepal नेपाल 2026!");
    expect(r.latin).toBe(5);
    expect(r.devanagari).toBe(5);
    expect(r.digit).toBe(4);
  });
  it("adjusted ratio ignores a few Nepali names in an English article", () => {
    const article =
      "Prime Minister पुष्पकमल दाहाल met officials in Kathmandu today to discuss the budget and the economy at length.";
    const d = dominantScript(article, { gazetteer: ["पुष्पकमल दाहाल"] });
    expect(d.ratio).toBeGreaterThan(0); // raw sees some Devanagari
    expect(d.adjustedRatio).toBe(0); // after removing the name, it's pure English
    expect(d.script).toBe("latin");
  });
  it("still calls a genuinely Nepali article Devanagari", () => {
    const ne = "नेपालमा आज बजेट आयो र बजार सकारात्मक भयो।";
    expect(dominantScript(ne).script).toBe("devanagari");
  });
});

describe("latinToDevanagari", () => {
  it("produces Devanagari output (approximate)", () => {
    const d = latinToDevanagari("ram");
    expect(/[ऀ-ॿ]/.test(d)).toBe(true);
  });
});
