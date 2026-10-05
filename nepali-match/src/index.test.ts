import { describe, expect, it } from "vitest";
import { contains, createMatcher, findTerms, near, normaliseNe, sentenceSpans, splitSuffix } from "./index.js";

const CHITWAN = { id: "chitwan", en: "Chitwan", ne: "चितवन" };
const JHAPA = { id: "jhapa", en: "Jhapa", ne: "झापा" };
const PARBAT = { id: "parbat", en: "Parbat", ne: "पर्वत" };
const KTM = { id: "kathmandu", en: "Kathmandu", ne: ["काठमाडौं", "काठमाण्डौ"] };
const SEE = { id: "see", en: "SEE", ne: "एसईई" };

describe("normaliseNe", () => {
  it("folds chandrabindu, half nasals and long/short vowels", () => {
    expect(normaliseNe("काठमाडौँ")).toBe(normaliseNe("काठमाडौं"));
    expect(normaliseNe("चन्द्र")).toBe(normaliseNe("चंद्र"));
    expect(normaliseNe("कीर्तिपुर")).toBe(normaliseNe("किर्तिपुर"));
    expect(normaliseNe("पूर्व")).toBe(normaliseNe("पुर्व"));
    expect(normaliseNe("गण्डकी")).toBe(normaliseNe("गंडकि"));
  });
  it("removes nukta, ZWJ/ZWNJ and maps digits; NFC first", () => {
    expect(normaliseNe("क़ख‍ग‌")).toBe("कखग");
    expect(normaliseNe("२०८२")).toBe("2082");
    expect(normaliseNe("२०८२", { digits: false })).toBe("२०८२");
    expect(normaliseNe("क़")).toBe("क"); // precomposed U+0958 decomposes under NFC? stays a consonant either way
  });
  it("keeps Latin case and collapses whitespace", () => {
    expect(normaliseNe("SEE   2082\n result")).toBe("SEE 2082 result");
  });
  it("loose mode folds sibilants and ba/va", () => {
    expect(normaliseNe("वैशाख", { loose: true })).toBe(normaliseNe("बैसाख", { loose: true }));
    expect(normaliseNe("वैशाख")).not.toBe(normaliseNe("बैसाख"));
  });
});

describe("Nepali whole-word matching with postpositions", () => {
  const m = createMatcher([CHITWAN, JHAPA, PARBAT, KTM]);
  it("चितवनमा → Chitwan", () => {
    const [hit] = m.find("चितवनमा बाढी आयो");
    expect(hit).toMatchObject({ id: "chitwan", lang: "ne", text: "चितवनमा", suffix: "मा", index: 0 });
  });
  it("झापाको → Jhapa", () => {
    expect(m.ids("झापाको मेचीनगरमा")).toEqual(["jhapa"]);
  });
  it("पर्वतारोही does not match Parbat, पर्वतमा does", () => {
    expect(m.test("दुई पर्वतारोही बेपत्ता")).toBe(false);
    expect(m.test("पर्वतको कुश्मा")).toBe(true);
    expect(m.test("पर्वती गाउँ")).toBe(false);
  });
  it("chains postpositions and folds spelling", () => {
    expect(m.find("काठमाण्डौबाटै आएका")[0]).toMatchObject({ id: "kathmandu", suffix: "बाटै" });
    expect(m.find("काठमाडौँका जिल्लाहरूमा")[0]!.id).toBe("kathmandu");
    expect(m.test("काठमाडौंहरूमाथि")).toBe(true);
  });
  it("needs a boundary before the word", () => {
    expect(m.test("उपचितवन")).toBe(false);
    expect(m.test("(चितवन)")).toBe(true);
    expect(m.test("चितवन, झापा")).toBe(true);
  });
  it("offsets point into the original text", () => {
    const text = "आज  काठमाडौँमा   पानी";
    const [hit] = m.find(text);
    expect(text.slice(hit!.index, hit!.end)).toBe("काठमाडौँमा");
  });
  it("postpositions can be switched off", () => {
    expect(contains("चितवनमा", CHITWAN, { postpositions: false })).toBe(false);
    expect(contains("चितवन मा", CHITWAN, { postpositions: false })).toBe(true);
  });
});

describe("English matching", () => {
  const m = createMatcher([CHITWAN, KTM, SEE, { id: "neb", en: "NEB" }]);
  it("whole words, case-insensitive for names", () => {
    expect(m.ids("Floods hit chitwan and Kathmandu-based teams")).toEqual(["chitwan", "kathmandu"]);
    expect(m.test("Kathmanduite")).toBe(false);
    expect(m.test("Chitwan's parks")).toBe(true);
  });
  it("'Come and see' is not SEE; short acronyms are exact-case", () => {
    expect(m.test("Come and see the show")).toBe(false);
    expect(m.ids("SEE results published by NEB")).toEqual(["see", "neb"]);
    expect(m.test("the neb said")).toBe(false);
    expect(m.test("एसईई परीक्षा")).toBe(true);
  });
  it("case rule can be overridden", () => {
    expect(contains("come and see", { en: "SEE", caseSensitive: false })).toBe(true);
    expect(contains("chitwan", "Chitwan", { caseSensitive: true })).toBe(false);
  });
  it("multi-word terms tolerate extra whitespace; longest overlap wins", () => {
    const mm = createMatcher(["Nawalparasi", "Nawalparasi West", "नवलपरासी", "नवलपरासी पश्चिम"]);
    expect(mm.find("Nawalparasi  West floods").map((x) => x.id)).toEqual(["Nawalparasi West"]);
    expect(mm.find("नवलपरासी पश्चिममा").map((x) => x.id)).toEqual(["नवलपरासी पश्चिम"]);
    expect(createMatcher(["Nawalparasi", "Nawalparasi West"], { overlaps: true }).find("Nawalparasi West")).toHaveLength(2);
  });
});

describe("near", () => {
  const EXAM = ["परीक्षा", "नतिजा", "विज्ञापन", "exam", "result"];
  it("लोकसेवा आयोगले निजामती विधेयकमा राय दियो is not exam news", () => {
    expect(near("लोकसेवा आयोगले निजामती विधेयकमा राय दियो", "लोकसेवा", EXAM, 60)).toBeNull();
  });
  it("finds the pair when an exam word is close", () => {
    const r = near("लोकसेवा आयोगको खरिदार परीक्षाको नतिजा प्रकाशित", "लोकसेवा", EXAM, 60);
    expect(r).not.toBeNull();
    expect(r!.b.term).toBe("परीक्षा");
  });
  it("respects sentence boundaries unless told not to", () => {
    const text = "लोकसेवा आयोगले राय दियो। परीक्षा भने सरेको छैन";
    expect(near(text, "लोकसेवा", EXAM, 60)).toBeNull();
    expect(near(text, "लोकसेवा", EXAM, 60, false)).not.toBeNull();
    expect(near("PSC said. Exam dates later", "PSC", "exam", { maxChars: 40 })).toBeNull();
  });
  it("respects maxChars and works in either order", () => {
    expect(near("नतिजा आज लोकसेवाले सार्वजनिक गर्‍यो", "लोकसेवा", "नतिजा", 10)).not.toBeNull();
    expect(near("नतिजा " + "क ".repeat(40) + "लोकसेवा", "लोकसेवा", "नतिजा", { maxChars: 20, sameSentence: false })).toBeNull();
  });
});

describe("helpers", () => {
  it("sentenceSpans keeps dotted abbreviations and decimals together", () => {
    expect(sentenceSpans("ने.क.पा. का नेता। 1.5 kg sold. Done")).toHaveLength(3);
  });
  it("splitSuffix", () => {
    expect(splitSuffix("जिल्लाहरूमा")).toEqual({ stem: "जिल्ला", suffixes: ["हरु", "मा"] });
    expect(splitSuffix("झापाको")).toEqual({ stem: "झापा", suffixes: ["को"] });
    expect(splitSuffix("पर्वत")).toEqual({ stem: "पर्वत", suffixes: [] });
  });
  it("findTerms accepts a single term", () => {
    expect(findTerms("Jhapa, झापाको", JHAPA)).toHaveLength(2);
  });
});

describe("districtTerms", async () => {
  const { districtTerms } = await import("./index.js");
  const all = districtTerms();
  const m = createMatcher(all);
  it("has all 77 with slugs", () => {
    expect(all).toHaveLength(77);
    expect(all.find((d) => d.id === "nawalparasi-east")).toBeTruthy();
    expect(all.find((d) => d.id === "parbat")!.ambiguous).toBe(true);
  });
  it("matches variant spellings in both scripts", () => {
    expect(m.ids("काठमाण्डौ, काभ्रेमा र मोरंगको बाढी")).toEqual(["kathmandu", "kavrepalanchok", "morang"]);
    expect(m.ids("Rukum East and Kapilbastu")).toEqual(["eastern-rukum", "kapilvastu"]);
    expect(m.ids("नवलपरासी पश्चिममा")).toEqual(["nawalparasi-west"]);
  });
  it("English district names are exact-case", () => {
    expect(m.test("dang it")).toBe(false);
    expect(m.ids("Dang and Bara")).toEqual(["dang", "bara"]);
  });
});
