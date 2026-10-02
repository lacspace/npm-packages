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
