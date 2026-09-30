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

describe("matchName — SAFETY: different people must not collapse (1.0.1)", () => {
  const cases: [string, string][] = [
    ["Sita Sharma", "Gita Sharma"],
    ["Ram Poudel", "Shyam Poudel"],
    ["Hari Prasad Sharma", "Sharmila"],
    ["Gyanendra Shahi", "Gyanendra Shah"],
    ["Krishna Bahadur Shahi", "Shah"],
    ["Sushila Karki", "Sushil Karki"],
    ["Ram Chandra Poudel", "Ram Chandra Paudel said"], // an extra trailing token must not be accepted
  ];
  for (const [a, b] of cases) {
    it(`rejects "${a}" vs "${b}"`, () => {
      expect(matchName(a, b).match).toBe(false);
    });
  }
});

describe("matchName — still matches the same person (1.0.1)", () => {
  it("strips office titles before matching", () => {
    const r = matchName("President रामचन्द्र पौडेल", "Ram Chandra Poudel");
    expect(r.match).toBe(true);
    expect(r.score).toBeGreaterThan(0.8);
  });
  it("Prime Minister / मन्त्री compounds are stripped when leading", () => {
    expect(stripHonorifics("Prime Minister K P Sharma Oli")).toBe("K P Sharma Oli");
    expect(stripHonorifics("अर्थमन्त्री विष्णु पौडेल")).toBe("विष्णु पौडेल");
    expect(stripHonorifics("Chief Justice Sushila Karki")).toBe("Sushila Karki");
    expect(stripHonorifics("Baburam Bhattarai ji")).toBe("Baburam Bhattarai");
  });
  it("व ≈ b: देउवा matches Deuba", () => {
    expect(matchName("Sher Bahadur Deuba", "शेरबहादुर देउवा").match).toBe(true);
    expect(matchName("Arzu Rana Deuba", "आर्जु राणा देउवा").match).toBe(true);
  });
  it("ज्ञ romanizes to gy: ज्ञानेन्द्र matches Gyanendra", () => {
    expect(matchName("Gyanendra Shah", "ज्ञानेन्द्र शाह").match).toBe(true);
  });
  it("सिंह matches Singh", () => {
    expect(devanagariToLatin("सिंह")).toBe("singh");
    expect(matchName("Prithvi Narayan Singh", "पृथ्वी नारायण सिंह").match).toBe(true);
  });
  it("does not regress the canonical cross-script cases", () => {
    expect(matchName("Ram Chandra Poudel", "रामचन्द्र पौडेल").match).toBe(true);
    expect(matchName("Dr. K. P. Sharma Oli", "KP Sharma Oli").match).toBe(true);
    expect(matchName("Sher Bahadur Deuba", "Sher Bdr. Deuba").match).toBe(true);
    expect(matchName("Ram Chandra Poudel", "Sher Bahadur Deuba").match).toBe(false);
  });
});

describe("matchName — 1.0.2 fixes", () => {
  it("matches -y ↔ -i / -e surname spellings (final y is a vowel)", () => {
    for (const [a, b] of [
      ["Biswo Raj Adhikary", "Bishwo Raj Adhikari"],
      ["Chaudhary", "चौधरी"],
      ["Chaudhary", "Chaudhari"],
      ["Adhikary", "अधिकारी"],
      ["Tiwary", "तिवारी"],
      ["Bhandary", "Bhandari"],
      ["Pandey", "पाण्डे"],
      ["Upadhyay", "उपाध्याय"],
    ] as const) {
      expect(matchName(a, b).match, `${a} vs ${b}`).toBe(true);
    }
  });

  it("matches through medial schwa (आरजु राणा देउवा ↔ Arzu Rana Deuba)", () => {
    expect(matchName("Arzu Rana Deuba", "आरजु राणा देउवा").match).toBe(true);
  });

  it("strictSibilants keeps श/ष apart from स", () => {
    // Default: lenient (sh ≈ s).
    expect(matchName("Anil Shah", "Anil Sah").match).toBe(true);
    // Strict: शाह (Shah) and साह (Sah) are different surnames.
    expect(matchName("Anil Shah", "Anil Sah", { strictSibilants: true }).match).toBe(false);
    // Strict still matches like-for-like sibilants across scripts.
    expect(matchName("Shah", "शाह", { strictSibilants: true }).match).toBe(true);
    expect(matchName("Anil Sah", "अनिल साह", { strictSibilants: true }).match).toBe(true);
  });

  it("does not regress the safety rejects", () => {
    for (const [a, b] of [
      ["Sita Sharma", "Gita Sharma"],
      ["Ram Poudel", "Shyam Poudel"],
      ["Gyanendra Shahi", "Gyanendra Shah"],
      ["Sushila Karki", "Sushil Karki"],
    ] as const) {
      expect(matchName(a, b).match, `${a} vs ${b}`).toBe(false);
    }
  });
});

describe("dominantScript — safer defaults (1.0.1)", () => {
  it("does not zero out genuine Nepali prose mixed with a little English", () => {
    const text = "नेपालमा आज बजेट पेश भयो, GDP वृद्धिदर राम्रो रहेको छ र बजार सकारात्मक भयो।";
    const d = dominantScript(text);
    expect(d.adjustedRatio).toBeGreaterThan(0.5);
    expect(d.script).toBe("devanagari");
  });
  it("apostrophes are not treated as quotes", () => {
    const text = "Nepal's economy didn't shrink this year, officials said in Kathmandu.";
    const d = dominantScript(text);
    // The text between apostrophes must survive → still overwhelmingly Latin.
    expect(d.script).toBe("latin");
    expect(d.adjustedRatio).toBe(0);
  });
  it("gazetteer removal respects word boundaries (रु must not cut रुपैयाँ)", () => {
    const text = "यो रुपैयाँको कारोबार नेपालमा भयो र अर्थतन्त्र बलियो भयो।";
    const d = dominantScript(text, { gazetteer: ["रु"] });
    // रुपैयाँ must remain Devanagari; the article stays Nepali.
    expect(d.script).toBe("devanagari");
  });
  it("exposes a letters-only ratio", () => {
    const r = scriptRatio("Nepal नेपाल");
    expect(r.lettersRatio.devanagari).toBeCloseTo(3 / 8, 2); // 3 base letters न प ल of 8 letters
    expect(r.mark).toBe(2); // े ा
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
