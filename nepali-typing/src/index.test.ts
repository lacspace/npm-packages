import { describe, expect, it } from "vitest";
import { buildLexicon, createTyper, describe as describeApi, devKey, latinKey, phonetic, suggest, toDevanagari } from "./index.js";

describe("loose keys", () => {
  it("fold the usual romanisation variance", () => {
    expect(latinKey("dhanyawad")).toBe(devKey("धन्यवाद"));
    expect(latinKey("nepaal")).toBe(devKey("नेपाल"));
    expect(latinKey("chha")).toBe(devKey("छ"));
    expect(latinKey("siksa")).toBe(latinKey("shiksha")); // sh ≈ s
    expect(latinKey("sambidhan")).toBe(devKey("संविधान"));
  });
});

describe("suggest", () => {
  const top = (w: string) => suggest(w)[0];
  it("puts the right word first for common words", () => {
    const cases: [string, string][] = [
      ["namaste", "नमस्ते"], ["nepal", "नेपाल"], ["sarkar", "सरकार"], ["kathmandu", "काठमाडौं"], ["pradhanmantri", "प्रधानमन्त्री"],
      ["chha", "छ"], ["garnuhunchha", "गर्नुहुन्छ"], ["bholi", "भोलि"], ["dhanyabad", "धन्यवाद"], ["dhanyawad", "धन्यवाद"], ["shiksha", "शिक्षा"],
      ["hamro", "हाम्रो"], ["sabai", "सबै"], ["janata", "जनता"], ["bidyalaya", "विद्यालय"], ["aaja", "आज"], ["sambidhan", "संविधान"],
      ["dashain", "दशैं"], ["pokhara", "पोखरा"], ["biratnagar", "विराटनगर"], ["samachar", "समाचार"], ["nirvachan", "निर्वाचन"],
      ["chunab", "चुनाव"], ["bhaneko", "भनेको"], ["prahari", "प्रहरी"], ["durghatana", "दुर्घटना"], ["mrityu", "मृत्यु"], ["janchu", "जान्छु"], ["jana", "जना"],
    ];
    for (const [r, d] of cases) expect([r, top(r)]).toEqual([r, d]);
  });
  it("offers several candidates", () => {
    const c = suggest("sarkar");
    expect(c.length).toBeGreaterThanOrEqual(3);
    expect(c).toContain("सरकारी");
  });
  it("splits typed case endings", () => {
    expect(top("ankale")).toBe("अंकले");
    expect(top("netaharulai")).toBe("नेताहरूलाई");
    expect(top("pokharabata")).toBe("पोखराबाट");
    expect(top("sarkarko")).toBe("सरकारको");
  });
  it("falls back to phonetics for unknown words, with ITRANS capitals for retroflex", () => {
    expect(top("ramesh")).toBe("रमेश");
    expect(phonetic("Tuki")).toBe("टुकी");
    expect(phonetic("DhuNgaa")).toBe("ढुण्गा");
    expect(top("facebook")).toBe("फेसबुक");
  });
});

describe("convert", () => {
  it("whole lines, digits, danda, acronyms kept", () => {
    expect(toDevanagari("mero desh nepal ho.")).toBe("मेरो देश नेपाल हो।");
    expect(toDevanagari("NEPSE aaja 20 ankale badhyo")).toBe("NEPSE आज २० अंकले बढ्यो");
    expect(toDevanagari("WeNepal app", { keep: ["WeNepal"] })).toBe("WeNepal एप");
    expect(toDevanagari("2083", { digits: false })).toBe("2083");
  });
});

describe("your own lexicon and learning", () => {
  it("buildLexicon counts Devanagari words; the typer ranks them", () => {
    const lex = buildLexicon(["बालेन शाहले भने। बालेन शाह काठमाडौंका मेयर हुन्।", "Balen"]);
    expect(lex["बालेन"]).toBe(2);
    expect(lex["Balen"]).toBeUndefined();
    const t = createTyper({ words: lex });
    expect(t.suggest("balen")[0]).toBe("बालेन");
  });
  it("learn() moves a pick to the top and round-trips through export", () => {
    const t = createTyper();
    const first = t.suggest("pani")[0];
    const other = first === "पनि" ? "पानी" : "पनि";
    t.learn("pani", other);
    expect(t.suggest("pani")[0]).toBe(other);
    const t2 = createTyper({ learned: t.exportLearned() });
    expect(t2.suggest("pani")[0]).toBe(other);
  });
  it("is fast enough per keystroke", () => {
    const t = createTyper();
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) t.suggest(["kath", "kathman", "sarkar", "pradhan", "nepalma"][i % 5]!);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it("describe()", () => expect(describeApi().name).toBe("@lacspace/nepali-typing"));
});
