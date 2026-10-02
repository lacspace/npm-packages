import { describe, expect, it } from "vitest";
import {
  alignWordBoundaries, describe as describeApi, numberToWordsEn, numberToWordsNe, ordinalEn, ordinalNe, originalWordTimings, speakable, spokenText, syllables,
} from "./index.js";

const ne = (s: string, o = {}) => spokenText(s, { lang: "ne", ...o });
const en = (s: string, o = {}) => spokenText(s, { lang: "en", ...o });

describe("numbers", () => {
  it("Nepali 0–99 unique words, Indian scales, decimals, idioms", () => {
    expect(numberToWordsNe(16)).toBe("सोह्र");
    expect(numberToWordsNe(99)).toBe("उनान्सय");
    expect(numberToWordsNe(2083)).toBe("दुई हजार त्रियासी");
    expect(numberToWordsNe(294800)).toBe("दुई लाख चौरानब्बे हजार आठ सय");
    expect(numberToWordsNe(45000000000)).toBe("पैँतालीस अर्ब"); // 4,50,00,00,000 = 45 arab
    expect(numberToWordsNe(4500000000)).toBe("चार अर्ब पचास करोड");
    expect(numberToWordsNe(15.2)).toBe("पन्ध्र दशमलव दुई");
    expect(numberToWordsNe(1.5)).toBe("डेढ");
    expect(numberToWordsNe(2.5)).toBe("अढाई");
    expect(numberToWordsNe(3.5)).toBe("साढे तीन");
    expect(numberToWordsNe(-7)).toBe("माइनस सात");
  });
  it("English western/indian grouping, years, ordinals", () => {
    expect(numberToWordsEn(120000)).toBe("one hundred and twenty thousand");
    expect(numberToWordsEn(120000, { grouping: "indian" })).toBe("one lakh twenty thousand");
    expect(numberToWordsEn(2026, { year: true })).toBe("twenty twenty-six");
    expect(numberToWordsEn(2005, { year: true })).toBe("two thousand and five");
    expect(numberToWordsEn(0.47)).toBe("zero point four seven");
    expect(ordinalEn(16)).toBe("sixteenth");
    expect(ordinalEn(22)).toBe("twenty-second");
    expect(ordinalNe(1)).toBe("पहिलो");
    expect(ordinalNe(16)).toBe("सोह्रौँ");
  });
});

describe("WeNepal sample paragraphs (ne)", () => {
  it("reads times, dates, counts and units as expected", () => {
    expect(ne("बुधबार दिउँसो १ बजेदेखि यातायात सेवा")).toBe("बुधबार दिउँसो एक बजेदेखि यातायात सेवा");
    expect(ne("१ अक्टोबर २०२६ मा सार्वजनिक")).toBe("एक अक्टोबर दुई हजार छब्बिस मा सार्वजनिक");
    expect(ne("१५ सदस्यीय टोली")).toBe("पन्ध्र सदस्यीय टोली");
    expect(ne("आगामी ७ अक्टोबरदेखि ओमानमा")).toBe("आगामी सात अक्टोबरदेखि ओमानमा");
    expect(ne("आगामी मङ्सिर १ गतेदेखि सबै")).toBe("आगामी मंसिर एक गतेदेखि सबै");
    expect(ne("२४ घण्टा अनलाइनबाटै")).toBe("चौबिस घण्टा अनलाइनबाटै");
    expect(ne("दुई वटा २० मिलिमिटरका डोरीले")).toBe("दुई वटा बीस मिलिमिटरका डोरीले");
    expect(ne("पल्सर एनएस शृङ्खला")).toBe("पल्सर एन एस शृङ्खला"); // Devanagari initialism spaced
    expect(ne("२०८३")).toBe("दुई हजार त्रियासी");
  });
  it("BS dates in every common shape", () => {
    expect(ne("२०८३ असोज १६ गते")).toBe("दुई हजार त्रियासी साल असोज सोह्र गते");
    expect(ne("२०८३ साल असोज १६ गते")).toBe("दुई हजार त्रियासी साल असोज सोह्र गते");
    expect(ne("16 Asoj 2083")).toBe("दुई हजार त्रियासी साल असोज सोह्र गते");
    expect(ne("वि.सं. २०८३/०६/१६")).toBe("विक्रम संवत् दुई हजार त्रियासी साल असोज सोह्र गते");
    expect(ne("असोज १६ गतेसम्म")).toBe("असोज सोह्र गतेसम्म");
    expect(ne("2026-10-02")).toBe("दुई अक्टोबर दुई हजार छब्बिस"); // AD by year
  });
  it("currency, percent, scales, time, phone, plate, ordinal, acronyms, abbreviations, units", () => {
    expect(ne("रु. १ लाख ५० हजार")).toBe("एक लाख पचास हजार रुपैयाँ");
    expect(ne("NPR 1,20,000 तथा")).toBe("एक लाख बीस हजार रुपैयाँ तथा");
    expect(ne("Rs 197.5")).toBe("एक सय सन्तानब्बे रुपैयाँ पचास पैसा");
    expect(ne("$120 million")).toBe("बाह्र करोड डलर"); // western scale re-expressed in Nepali scales
    expect(ne("१५.२% वृद्धि")).toBe("पन्ध्र दशमलव दुई प्रतिशत वृद्धि");
    expect(ne("१.५ लाख")).toBe("डेढ लाख");
    expect(ne("१.३ लाख")).toBe("एक लाख तीस हजार");
    expect(ne("२.५ करोड")).toBe("अढाई करोड");
    expect(ne("समय १३:३८")).toBe("समय दिउँसो एक बजेर अठतिस मिनेट");
    expect(ne("बिहान ८:००")).toBe("बिहान बिहान आठ बजे".replace("बिहान बिहान", "बिहान बिहान")); // period word + explicit word both present
    expect(ne("फोन ९८४१२३४५६७")).toBe("फोन नौ आठ चार एक, दुई तीन, चार पाँच, छ सात");
    expect(ne("+977-9841234567")).toMatch(/^प्लस नौ सात सात, नौ आठ/);
    expect(ne("बा १२ प ३४५६")).toBe("बा बाह्र प तीन चार पाँच छ");
    expect(ne("१६औँ")).toBe("सोह्रौँ");
    expect(ne("NEPSE २,६५०.१२")).toBe("नेप्से दुई हजार छ सय पचास दशमलव एक दुई");
    expect(ne("NRB र KMC")).toBe("एन आर बी र के एम सी");
    expect(ne("डा. राम")).toBe("डाक्टर राम");
    expect(ne("५ किलोमिटर, 25°C, 200 MW")).toBe("पाँच किलोमिटर, पच्चिस डिग्री सेल्सियस, दुई सय मेगावाट");
    expect(ne("१०-१५ जना")).toBe("दश देखि पन्ध्र जना");
  });
  it("reads Latin names natively and honours overrides", () => {
    expect(ne("Sandeep Lamichhane")).toMatch(/^[ऀ-ॿ]+ [ऀ-ॿ]+$/);
    expect(ne("Lamichhane", { pronunciations: { Lamichhane: { ne: "लामिछाने" } } })).toBe("लामिछाने");
    expect(ne("Lamichhane", { foreignWords: "keep" })).toBe("Lamichhane");
    expect(ne("UNESCO")).toMatch(/^[ऀ-ॿ]+$/); // pronounceable 5+ letters → word
  });
});

describe("English", () => {
  it("reads the CAN squad paragraph with a pronunciation override", () => {
    const s = en("The Cricket Association of Nepal named a 15-member squad led by Sandeep Lamichhane. The series starts on 7 October in Oman.", { pronunciations: { Lamichhane: "Lah-mi-chha-nay" } });
    expect(s).toBe("The Cricket Association of Nepal named a fifteen-member squad led by Sandeep Lah-mi-chha-nay. The series starts on the seventh of October in Oman.");
  });
  it("numbers, currency, dates, times, phones, acronyms", () => {
    expect(en("NEPSE rose 12.5 points (0.47%) to 2,650.12 on 1 October 2026")).toBe("nepsay rose twelve point five points (zero point four seven percent) to two thousand six hundred and fifty point one two on the first of October, twenty twenty-six");
    expect(en("turnover Rs 4.5 billion")).toBe("turnover four billion five hundred million rupees");
    expect(en("Rs 1,20,000")).toBe("one lakh twenty thousand rupees"); // रु/Rs context → Indian grouping
    expect(en("1.5 lakh people")).toBe("one lakh fifty thousand people");
    expect(en("by 6:30 PM. Dr. Shrestha said")).toBe("by six thirty p m. Doctor Shrestha said");
    expect(en("Call 01-4412345")).toBe("Call zero one four, four one two, three four five");
    expect(en("2083-06-16")).toBe("sixteenth of Asoj, two thousand and eighty-three");
    expect(en("October 2, 2026", { dateStyle: "american" })).toBe("October second, twenty twenty-six");
    expect(en("NRB and KMC and WHO")).toBe("N R B and K M C and W H O");
    expect(en("25°C and 120 km")).toBe("twenty-five degrees Celsius and one hundred and twenty kilometres");
    expect(en("काठमाडौं")).toMatch(/^Kathmandau|^Kathmadau|^K/); // romanised, capitalised
  });
});

describe("segmentation, SSML, timing, alignment", () => {
  const text = "नेपाल क्रिकेट संघले शुक्रबार विज्ञप्ति जारी गर्‍यो। टोलीमा १५ खेलाडी छन्।\n\nखेल ७ अक्टोबरदेखि सुरु हुनेछ।";
  it("splits sentences on danda with pauses, slows numeric sentences, estimates duration", () => {
    const r = speakable(text, { lang: "ne" });
    expect(r.segments.length).toBe(3);
    expect(r.segments[0]!.pauseAfter).toBe(400);
    expect(r.segments[1]!.pauseAfter).toBe(700); // paragraph break
    expect(r.segments[1]!.rate).toBeLessThan(1);
    expect(r.segments[1]!.text).toBe("टोलीमा पन्ध्र खेलाडी छन्।");
    expect(r.estimatedDurationMs).toBeGreaterThan(4000);
    expect(r.ssml).toContain('xml:lang="ne-NP"');
    expect(r.ssml).toContain('<break time="700ms"/>');
    expect(r.text).toContain("\n\n");
    expect(syllables("काठमाडौं")).toBe(4);
    expect(syllables("Lamichhane")).toBe(3);
  });
  it("aligns engine WordBoundary events back to ORIGINAL spans", () => {
    const r = speakable("रु. १ लाख जम्मा भयो।", { lang: "ne" });
    // spoken: "एक लाख रुपैयाँ जम्मा भयो।" — engine returns timings for the spoken words
    const words = r.segments[0]!.text.split(" ");
    const events = words.map((w, i) => ({ text: w.replace(/।$/, ""), offsetMs: i * 300, durationMs: 280 }));
    const aligned = alignWordBoundaries(r.tokens, r.segments, events);
    const ow = originalWordTimings(aligned);
    const money = ow.find((w) => w.orig === "रु. १ लाख")!; // one original span covers three spoken words
    expect(money).toBeDefined();
    expect(money.startMs).toBe(0);
    expect(money.endMs).toBe(2 * 300 + 280);
    expect(ow[ow.length - 1]!.orig).toBe("भयो।");
  });
  it("tolerates split/merged engine words", () => {
    const r = speakable("twenty-six people", { lang: "en" });
    const events = [{ text: "twenty", offsetMs: 0, durationMs: 200 }, { text: "six", offsetMs: 210, durationMs: 200 }, { text: "people", offsetMs: 500, durationMs: 300 }];
    const a = alignWordBoundaries(r.tokens, r.segments, events);
    expect(a[0]!.words.map((w) => w.spoken)).toEqual(["twenty-six", "people"]);
    expect(a[0]!.words[1]!.startMs).toBe(500);
  });
  it("describe()", () => {
    expect(describeApi().commands.map((c) => c.name)).toContain("alignWordBoundaries");
  });
});

describe("WeNepal production edge-tts fixture (ne-NP-HemkalaNeural, raw text)", async () => {
  const fx = (await import("./fixture.edge.json", { with: { type: "json" } })).default as { text: string; events: Array<{ text: string; offsetMs: number; durationMs: number }> };
  it("alignRaw maps every raw token incl. digit tokens and the stalled 'रु.' to engine time", async () => {
    const { alignRaw } = await import("./index.js");
    const a = alignRaw(fx.text, fx.events);
    expect(a.length).toBe(fx.text.split(/\s+/).length);
    expect(a.find((w) => w.orig === "२४")!.startMs).toBe(8712.5);
    const ru = a.find((w) => w.orig === "रु.")!;
    expect(ru.startMs).toBe(14337.5);
    expect(ru.endMs).toBe(14512.5);
    expect(a[a.length - 1]!.orig).toBe("छ।");
    expect(a[a.length - 1]!.endMs).toBe(17700);
    // the engine stalled 1.2 s before "१" after "रु." — visible as a gap, not a drift
    expect(a.find((w, i) => w.orig === "१" && a[i - 1]!.orig === "रु.")!.startMs - ru.endMs).toBeGreaterThan(1000);
  });
  it("the same sentence through speakable has no digit/abbreviation tokens for the engine to stall on", async () => {
    const { speakable } = await import("./index.js");
    const r = speakable(fx.text, { lang: "ne" });
    expect(r.text).not.toMatch(/[0-9०-९]|रु\./);
    expect(r.text).toContain("मंसिर एक गतेदेखि");
    expect(r.text).toContain("चौबिस घण्टा");
    expect(r.text).toContain("एक लाख पचास हजार रुपैयाँ खर्च");
    expect(r.segments.length).toBe(2);
  });
});
