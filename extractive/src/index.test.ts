import { describe, expect, it } from "vitest";
import { brief, describe as describeApi, headlineCandidates, keyFacts, splitSentences, summarize, textrank } from "./index.js";

const EN = "Nepal's central bank cut the policy rate today. The move follows slowing inflation. " +
  "Inflation fell to 4.5 percent in the last quarter. Businesses welcomed the decision. " +
  "The bank said it would review rates again in three months. Markets rose modestly after the announcement.";
const NE = "नेपाल राष्ट्र बैंकले आज नीतिगत दर घटायो। मुद्रास्फीति सुस्ताएपछि यो निर्णय गरिएको हो। " +
  "गत त्रैमासमा मुद्रास्फीति ४.५ प्रतिशतमा झर्यो। व्यवसायीहरूले यस निर्णयलाई स्वागत गरे।";

describe("splitSentences", () => {
  it("splits English on . ! ?", () => {
    expect(splitSentences("One. Two! Three?").length).toBe(3);
  });
  it("splits Nepali on danda ।", () => {
    expect(splitSentences("पहिलो वाक्य। दोस्रो वाक्य। तेस्रो वाक्य।").length).toBe(3);
  });
  it("does not split a decimal point", () => {
    expect(splitSentences("Inflation is 4.5 percent today.").length).toBe(1);
  });
});

describe("textrank", () => {
  it("scores the most connected sentence highest", () => {
    const sets = [["bank", "rate", "cut"], ["rate", "cut", "today"], ["weather", "rain"]];
    const scores = textrank(sets);
    expect(scores[0]! + scores[1]!).toBeGreaterThan(scores[2]! * 2); // the two rate sentences dominate
  });
  it("handles a single sentence", () => {
    expect(textrank([["x", "y"]])).toEqual([1]);
  });
});

describe("summarize", () => {
  it("returns fewer sentences, in original order", () => {
    const r = summarize(EN, { maxSentences: 2 });
    expect(r.sentences.length).toBe(2);
    const idx = r.sentences.map((s) => s.index);
    expect(idx).toEqual([...idx].sort((a, b) => a - b)); // original order preserved
    expect(r.summary.length).toBeLessThan(EN.length);
    expect(r.ranked.length).toBe(6);
  });
  it("works on Nepali", () => {
    const r = summarize(NE, { maxSentences: 2 });
    expect(r.sentences.length).toBe(2);
    expect(r.summary).toMatch(/[।ऀ-ॿ]/);
  });
  it("empty text → empty summary", () => {
    expect(summarize("").summary).toBe("");
  });
});

describe("keyFacts", () => {
  it("extracts numbers, percentages and entities", () => {
    const f = keyFacts(EN);
    expect(f.percentages.length).toBeGreaterThan(0); // 4.5 percent
    expect(f.entities.some((e) => /Nepal/i.test(e))).toBe(true);
  });
});

describe("headlineCandidates", () => {
  it("returns short, de-duplicated candidates", () => {
    const h = headlineCandidates(EN, { max: 3 });
    expect(h.length).toBeGreaterThan(0);
    expect(h.length).toBeLessThanOrEqual(3);
    expect(new Set(h).size).toBe(h.length);
    expect(h.every((x) => !/[.।]$/.test(x))).toBe(true); // trailing terminator stripped
  });
});

describe("brief", () => {
  it("bundles a compact brief for the writer", () => {
    const b = brief(EN);
    expect(b.summary.length).toBeGreaterThan(0);
    expect(b.summary.length).toBeLessThan(EN.length);
    expect(b.headlineCandidates.length).toBeGreaterThan(0);
    expect(Array.isArray(b.keyphrases)).toBe(true);
    expect(b.hashtags.every((h) => h.startsWith("#"))).toBe(true);
    expect(b.keyFacts.percentages.length).toBeGreaterThan(0);
  });
});

describe("describe()", () => {
  it("exposes a conductor-friendly command schema", () => {
    const d = describeApi();
    expect(d.name).toBe("@lacspace/extractive");
    expect(d.commands.map((c) => c.name)).toContain("summarize");
    expect(d.commands.find((c) => c.name === "summarize")!.input.required).toContain("text");
  });
});

describe("scrubSources (1.1.0)", async () => {
  const { scrubSources, mentionsOutlet } = await import("./index.js");
  it("removes English attributions, datelines and credit lines", () => {
    const r = scrubSources("KATHMANDU (Reuters) - Prices rose 5%, according to the Kathmandu Post. The Himalayan Times reported that fuel will rise.\nPhoto: Getty Images\nSource: Setopati");
    expect(r.text).toBe("KATHMANDU Prices rose 5%. Fuel will rise.");
    expect(r.clean).toBe(true);
    expect(r.removed.length).toBeGreaterThanOrEqual(4);
  });
  it("removes Nepali attributions and credits", () => {
    const r = scrubSources("कान्तिपुरका अनुसार पेट्रोलको मूल्य बढेको छ। मूल्य १० रुपैयाँले बढेको अनलाइनखबरले जनाएको छ।\nतस्बिर: रासस");
    expect(r.text).toBe("पेट्रोलको मूल्य बढेको छ। मूल्य १० रुपैयाँले बढेको छ।");
    expect(r.clean).toBe(true);
  });
  it("reports names it couldn't remove; keeps own brand and common words", () => {
    const r = scrubSources("We spoke with BBC Nepali staff. नागरिकले सडकमा प्रदर्शन गरे। WeNepal brings you this.", { keep: ["WeNepal"] });
    expect(r.remaining).toContain("BBC Nepali");
    expect(r.clean).toBe(false);
    expect(r.text).toContain("नागरिकले"); // common word "citizen", not the outlet
    expect(mentionsOutlet("Pexels photo")).toEqual(["Pexels"]);
  });
});

describe("scrubSources (1.2.0) — Nepali case endings", async () => {
  const { scrubSources, mentionsOutlet } = await import("./index.js");
  it("WeNepal fixture: inflected attribution removed, sentence stays grammatical", () => {
    const r = scrubSources("कान्तिपुरको रिपोर्ट अनुसार सरकारले नयाँ नियम ल्याएको छ।");
    expect(r.text).toBe("सरकारले नयाँ नियम ल्याएको छ।");
    expect(r.clean).toBe(true);
  });
  it("handles मा प्रकाशित, ले जनाएअनुसार, लाई बताए, का संवाददाता, द्वारा प्रसारित", () => {
    const cases: Array<[string, string]> = [
      ["रातोपाटीमा प्रकाशित समाचार अनुसार बजेट बढ्यो।", "बजेट बढ्यो।"],
      ["अनलाइनखबरले जनाएअनुसार भाडा बढ्यो।", "भाडा बढ्यो।"],
      ["उनले कान्तिपुरलाई बताए।", "उनले बताए।"],
      ["सेतोपाटीका संवाददाताले बताए।", "संवाददाताले बताए।"],
      ["सेतोपाटीद्वारा प्रसारित भिडियो अनुसार आगो लाग्यो।", "आगो लाग्यो।"],
      ["कान्तिपुरसँगको कुराकानीमा मन्त्रीले भने।", "मन्त्रीले भने।"],
      ["Kantipur ko report anusar sarkar le niyam lyayo.", "Sarkar le niyam lyayo."],
      ["Setopati ma prakashit samachar anusar bajet badhyo.", "Bajet badhyo."],
    ];
    for (const [input, want] of cases) expect(scrubSources(input).text).toBe(want);
  });
  it("detects bare inflected mentions in both scripts", () => {
    for (const t of ["कान्तिपुरको", "कान्तिपुरका", "सेतोपाटीका", "अनलाइनखबरले", "रातोपाटीमा", "कान्तिपुरलाई"]) {
      expect(mentionsOutlet(`यो ${t} विषय हो।`).length).toBe(1);
    }
    expect(mentionsOutlet("as Kantipur ko team says")).toEqual(["Kantipur"]);
    expect(mentionsOutlet("Setopatima chha")).toEqual(["Setopati"]);
  });
  it("keeps the common-word guard", () => {
    expect(mentionsOutlet("नागरिकले सडकमा प्रदर्शन गरे। नागरिकको अधिकार।")).toEqual([]);
    expect(mentionsOutlet("उज्यालोमा पढ्नुहोस्। शिलापत्र अनावरण।")).toEqual([]);
    expect(mentionsOutlet("नागरिक दैनिकको समाचार")).toEqual(["नागरिक दैनिक"]);
    expect(scrubSources("स्रोत: उज्यालो").text).toBe("");
  });
  it("neutralize swaps survivors for a neutral noun, keeping the case ending", () => {
    const r = scrubSources("सेतोपाटीका कर्मचारीहरू र रातोपाटीमा काम गर्नेहरू आए। Staff at Kathmandu Post agreed.", { neutralize: true });
    expect(r.text).toBe("सञ्चारमाध्यमका कर्मचारीहरू र सञ्चारमाध्यममा काम गर्नेहरू आए। Staff at local media agreed.");
    expect(r.clean).toBe(true);
  });
});

describe("scrubSources (1.2.1) — inflected nouns after the outlet", async () => {
  const { scrubSources } = await import("./index.js");
  it("keeps the noun and its case ending instead of leaving a stray suffix", () => {
    const cases: Array<[string, string]> = [
      ["सेतोपाटीमा प्रकाशित लेखमा उल्लेख छ।", "एक लेखमा उल्लेख छ।"],
      ["कान्तिपुरमा प्रकाशित समाचारमा भनिएको छ।", "एक समाचारमा भनिएको छ।"],
      ["रातोपाटीमा प्रकाशित रिपोर्टमा तथ्यांक छ।", "एक रिपोर्टमा तथ्यांक छ।"],
      ["अनलाइनखबरबाट प्रसारित भिडियोमा देखिन्छ।", "एक भिडियोमा देखिन्छ।"],
      ["कान्तिपुर टेलिभिजनद्वारा प्रसारित कार्यक्रममा मन्त्री बोले।", "एक कार्यक्रममा मन्त्री बोले।"],
      ["कान्तिपुरको रिपोर्टमा यस्तो लेखिएको छ।", "एक रिपोर्टमा यस्तो लेखिएको छ।"],
      ["सेतोपाटीको समाचारले चर्चा पायो।", "एक समाचारले चर्चा पायो।"],
      ["सेतोपाटीमा प्रकाशित लेख अनुसार कर बढ्यो।", "कर बढ्यो।"],
    ];
    for (const [input, want] of cases) {
      const r = scrubSources(input);
      expect(r.text).toBe(want);
      expect(r.clean).toBe(true);
    }
  });
});

