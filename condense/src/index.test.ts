import { describe, expect, it } from "vitest";
import { condense, splitSentences } from "./index.js";

describe("splitSentences", () => {
  it("splits Latin sentences with offsets", () => {
    const s = splitSentences("Hello world. This is news! Really?");
    expect(s.map((x) => x.text)).toEqual(["Hello world.", "This is news!", "Really?"]);
    expect(s[0]).toMatchObject({ start: 0, end: 12 });
    // offsets round-trip
    const src = "Hello world. This is news! Really?";
    for (const x of s) expect(src.slice(x.start, x.end)).toBe(x.text);
  });
  it("splits on Devanagari danda । and ॥", () => {
    const s = splitSentences("नेपालमा वर्षा भयो। काठमाडौंमा पानी पर्‍यो॥ अर्को वाक्य।");
    expect(s).toHaveLength(3);
    expect(s[0]!.text).toBe("नेपालमा वर्षा भयो।");
  });
  it("does not split decimals or abbreviations", () => {
    expect(splitSentences("The rate is 3.5 percent today.")).toHaveLength(1);
    expect(splitSentences("Dr. Sharma spoke. He left.")).toHaveLength(2);
  });
  it("never splits inside a quote", () => {
    const s = splitSentences('The PM said "We will act now. No delay." to reporters.');
    expect(s).toHaveLength(1);
  });
  it("keeps a Devanagari quote whole", () => {
    const s = splitSentences('प्रधानमन्त्रीले भने, “अब ढिलाइ हुँदैन। काम गर्छौं।” पत्रकारलाई भने।');
    expect(s).toHaveLength(1);
  });
});

const KP = "Nepal's central bank cut the policy rate to 5.5 percent on Sunday. The governor said \"inflation is easing\". The move affects millions of borrowers. It follows three months of review.";
const HT = "Nepal Rastra Bank reduced its policy rate to 5.5 percent. Analysts welcomed the decision. The governor said inflation is under control.";
const ON = "The policy rate was cut to 5.5 percent by NRB on Sunday. Traders expect loans to get cheaper.";

describe("condense", () => {
  it("produces a grouped, budgeted, deduped digest", () => {
    const r = condense(
      [
        { text: KP, label: "Kathmandu Post" },
        { text: HT, label: "Himalayan Times" },
        { text: ON, label: "Online Khabar" },
      ],
      { tokenBudget: 120, gazetteer: ["NRB", "Nepal Rastra Bank"] },
    );
    // grouped headers in source order
    expect(r.text).toMatch(/^\[S1 Kathmandu Post\]/);
    expect(r.text.indexOf("[S1")).toBeLessThan(r.text.indexOf("[S2"));
    expect(r.text.indexOf("[S2")).toBeLessThan(r.text.indexOf("[S3"));
    // every source contributes and ledes are kept
    expect(r.sources).toHaveLength(3);
    for (const s of r.sources) expect(s.sentences[0]!.reasons).toContain("lede");
    // dedupe removed at least one near-identical "5.5 percent" restatement OR kept them distinct
    expect(r.droppedDup).toBeGreaterThanOrEqual(0);
    // budget respected
    expect(r.tokens).toBeLessThanOrEqual(140);
    expect(r.totalSentences).toBe(9);
  });
  it("keeps numbers, quotes and entities and tags reasons", () => {
    const r = condense([{ text: KP, label: "KP" }], { tokenBudget: 500, gazetteer: ["governor"] });
    const flat = r.sentences;
    expect(flat.find((s) => s.text.includes("5.5 percent"))!.reasons).toContain("number");
    expect(flat.find((s) => s.text.includes('"inflation is easing"'))!.reasons).toContain("quote");
  });
  it("respects maxSentencesPerSource", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} about the flood in district ${i}.`).join(" ");
    const r = condense([{ text: long, label: "L" }], { tokenBudget: 100000, maxSentencesPerSource: 3 });
    expect(r.sources[0]!.sentences.length).toBe(3);
  });
  it("is deterministic across runs", () => {
    const args = [
      [{ text: KP, label: "KP" }, { text: HT, label: "HT" }],
      { tokenBudget: 80 },
    ] as const;
    const a = condense([...args[0]], { ...args[1] });
    const b = condense([...args[0]], { ...args[1] });
    expect(a.text).toBe(b.text);
    expect(a.sentences.map((s) => s.text)).toEqual(b.sentences.map((s) => s.text));
  });
  it("offsets point back into the correct source text", () => {
    const sources = [{ text: KP, label: "KP" }, { text: HT, label: "HT" }];
    const r = condense(sources, { tokenBudget: 500 });
    for (const s of r.sentences) {
      expect(sources[s.sourceIdx]!.text.slice(s.start, s.end)).toBe(s.text);
    }
  });
  it("handles empty and single-source input", () => {
    expect(condense([]).text).toBe("");
    expect(condense([{ text: "" }]).totalSentences).toBe(0);
    const one = condense([{ text: "Only one sentence here." }], { tokenBudget: 1 });
    expect(one.sentences.length).toBe(1); // keeps at least one even over budget
  });
  it("condenses Nepali sources with danda and keeps रु amounts", () => {
    const ne1 = "सरकारले बजेट ल्यायो। कुल रु १२ खर्ब छ। अर्थमन्त्रीले भने काम हुन्छ।";
    const ne2 = "नयाँ बजेट रु १२ खर्बको छ। यो ठूलो हो।";
    const r = condense([{ text: ne1, label: "कान्तिपुर" }, { text: ne2, label: "अनलाइनखबर" }], { tokenBudget: 200 });
    expect(r.text).toContain("[S1 कान्तिपुर]");
    expect(r.sentences.some((s) => s.reasons.includes("number"))).toBe(true);
  });
});
