import { describe, expect, it } from "vitest";
import { convertMixed, describe as describeApi, looksLikePreeti, preetiToUnicode, unicodeToPreeti } from "./index.js";

/** [Preeti, Unicode] pairs derived from the standard Preeti layout; each must convert both ways. (From the WeNepal app's suite.) */
const PAIRS: [string, string][] = [
  ["g]kfn", "नेपाल"],
  [";/sf/", "सरकार"],
  ["sf7df8f}+", "काठमाडौं"],
  ["k|wfgdGqL", "प्रधानमन्त्री"],
  ["lj1fg", "विज्ञान"],
  ["l;+x", "सिंह"],
  ["l:ylt", "स्थिति"],
  ["zflGt", "शान्ति"],
  ["lk|o", "प्रिय"],
  ["wd{", "धर्म"],
  ["sfo{", "कार्य"],
  ["cfly{s", "आर्थिक"],
  ["lgdf{0f", "निर्माण"],
  ["If]q", "क्षेत्र"],
  ["pQ/", "उत्तर"],
  ["ljBfno", "विद्यालय"],
  [">L", "श्री"],
  ["u'?", "गुरु"],
  ["O{Zj/", "ईश्वर"],
  ["pmhf{", "ऊर्जा"],
  ["P]g", "ऐन"],
  ["cf}iflw", "औषधि"],
  ["kmn", "फल"],
  ["emG8f", "झन्डा"],
  ["/fi6«", "राष्ट्र"],
  ["b'Mv", "दुःख"],
  ["rfFbL", "चाँदी"],
  ["ufpF", "गाउँ"],
  ["C0f", "ऋण"],
  ["@)*#", "२०८३"],
  ["5 .", "छ ।"],
];

describe("preetiToUnicode", () => {
  it.each(PAIRS)("%s → %s", (preeti, unicode) => expect(preetiToUnicode(preeti)).toBe(unicode));
  it("reads the ligature keys and alternate forms", () => {
    expect(preetiToUnicode("qmd")).toBe("क्रम");
    expect(preetiToUnicode("s|d")).toBe("क्रम");
    expect(preetiToUnicode("cf]v/")).toBe("ओखर");
    expect(preetiToUnicode("¿v")).toBe("रूख");
  });
  it("maps Preeti punctuation keys", () => {
    expect(preetiToUnicode("-s_")).toBe("(क)");
    expect(preetiToUnicode("xf] <")).toBe("हो ?");
    expect(preetiToUnicode("la=;+=")).toBe("बि.सं.");
  });
  it("passes unknown characters and whitespace through", () => {
    expect(preetiToUnicode("g]kfn\n\t ©")).toBe("नेपाल\n\t ©");
    expect(preetiToUnicode("")).toBe("");
  });
});

describe("unicodeToPreeti", () => {
  it.each(PAIRS)("%s ← %s", (preeti, unicode) => expect(unicodeToPreeti(unicode)).toBe(preeti));
  it("writes Western digits as Preeti numerals so they do not turn into letters", () => expect(unicodeToPreeti("2083")).toBe("@)*#"));
  it("writes a final halant explicitly instead of a half letter", () => {
    expect(unicodeToPreeti("वाक्")).toBe("jfs\\");
    expect(preetiToUnicode("jfs\\")).toBe("वाक्");
  });
  it("passes Latin letters through", () => expect(unicodeToPreeti("WeNepal")).toBe("WeNepal"));
  it("never leaks the private-use reph placeholder", () => {
    for (const [p, u] of PAIRS) {
      expect(preetiToUnicode(p)).not.toMatch(//);
      expect(unicodeToPreeti(u)).not.toMatch(//);
    }
  });
});

describe("round trip", () => {
  const PARAGRAPH = [
    "काठमाडौं, २०८३ असोज १९ । प्रधानमन्त्रीले आज मन्त्रिपरिषद्को बैठकमा आर्थिक वर्षको बजेट निर्माणबारे छलफल गर्नुभयो ।",
    "विद्यालय क्षेत्रमा राष्ट्रिय शिक्षा नीति लागू गर्ने निर्णय भएको छ । श्री ऊर्जा मन्त्रालयले विद्युत् उत्पादन बढेको जनाएको छ ।",
    "गाउँका किसानहरू खुसी छन्, तर स्वास्थ्य सेवा अझै पुगेको छैन ।",
  ].join("\n");
  it("Unicode → Preeti → Unicode returns the same paragraph", () => expect(preetiToUnicode(unicodeToPreeti(PARAGRAPH))).toBe(PARAGRAPH));
  it("every pair round-trips from the Preeti side", () => { for (const [p] of PAIRS) expect(unicodeToPreeti(preetiToUnicode(p))).toBe(p); });
  it("converts a sentence both ways", () => {
    const preeti = "g]kfn ;/sf/sf k|wfgdGqLn] cfly{s ;'wf/sf] 3f]if0ff ug'{eof] .";
    const unicode = "नेपाल सरकारका प्रधानमन्त्रीले आर्थिक सुधारको घोषणा गर्नुभयो ।";
    expect(preetiToUnicode(preeti)).toBe(unicode);
    expect(unicodeToPreeti(unicode)).toBe(preeti);
  });
  it("converts a full page quickly", () => {
    const page = PARAGRAPH.repeat(20);
    const t0 = Date.now();
    preetiToUnicode(unicodeToPreeti(page));
    expect(Date.now() - t0).toBeLessThan(250);
  });
});

describe("looksLikePreeti", () => {
  it("spots legacy text, not English or Unicode", () => {
    expect(looksLikePreeti("g]kfn ;/sf/sf k|wfgdGqLn] cfly{s ;'wf/sf] 3f]if0ff ug'{eof] .")).toBe(true);
    expect(looksLikePreeti("The government announced economic reforms today.")).toBe(false);
    expect(looksLikePreeti("नेपाल सरकार")).toBe(false);
    expect(looksLikePreeti("")).toBe(false);
  });
  it("describe()", () => expect(describeApi().name).toBe("@lacspace/preeti"));
});

describe("1.1.0 high-range glyphs", () => {
  /** [Preeti, Unicode] words using the Latin-1 / Windows-1252 glyph slots. */
  const WORDS: [string, string][] = [
    ["OlGhlgol/Ë", "इन्जिनियरिङ्ग"], // Ë ङ्ग (from a public exam-result PDF)
    ["åf/f", "द्वारा"], // å द्व
    ["kß", "पद्म"], // ß द्म
    ["cÍ", "अङ्क"], // Í ङ्क
    ["zÎ", "शङ्ख"], // Î ङ्ख
    ["n‹g", "लङ्घन"], // ‹ ङ्घ
    ["p¢f6g", "उद्घाटन"], // ¢ द्घ
    ["e›", "भद्र"], // › द्र
    ["„'j", "ध्रुव"], // „ ध्र
    ["k§L", "पट्टी"], // § ट्ट
    ["uÝf", "गट्ठा"], // Ý ट्ठ
    ["c¶fO{;", "अठ्ठाईस"], // ¶ ठ्ठ
    ["v•f", "खड्डा"], // • ड्ड
    ["a'°f", "बुड्ढा"], // ° ड्ढ
    ["cÌ", "अन्न"], // Ì न्न
    ["Åbo", "हृदय"], // Å हृ
    ["gf6Ø", "नाट्य"], // Ø ्य
    ["´", "झ"], ["‰", "झ्"], ["¤", "झ्"], ["£", "घ्"], ["¡", "ज्ञ्"], ["ˆ", "फ्"],
    ["¥", "र्‍"], ["‘", "ॅ"], ["˜", "ऽ"],
    ["8Þ", "ड़"], ["9Þ", "ढ़"], // Þ nukta after ड / ढ
  ];
  it.each(WORDS)("%s → %s", (preeti, unicode) => expect(preetiToUnicode(preeti)).toBe(unicode));
  it("maps the punctuation glyph slots", () => {
    expect(preetiToUnicode("\u00d6\u00d9\u00da\u00db\u00dc\u00b1\u00d7\u2026\u00e6\u00c6")).toBe("=;’!%+×‘“”");
  });
  it("reads Windows-1252 glyphs that a PDF extractor emitted as C1 control codes", () => {
    expect(preetiToUnicode("\u0084'j")).toBe("ध्रुव");
    expect(preetiToUnicode("\u008b \u0095 \u0098 \u009b \u0088 \u0089 \u0091 \u0085")).toBe("ङ्घ ड्ड ऽ द्र फ् झ् ॅ ‘");
  });
  it("still passes © through (the copyright sign is far more common than the Preeti alt-र glyph)", () => {
    expect(preetiToUnicode("©")).toBe("©");
  });
});

describe("convertMixed", () => {
  it("keeps an English prefix glued to Preeti with a hyphen", () => {
    expect(convertMixed("Pre-/fli6«o k/LIff af]8{")).toBe("Pre-राष्ट्रिय परीक्षा बोर्ड");
  });
  it("keeps acronyms and converts Preeti numerals next to Preeti words", () => {
    expect(convertMixed("SEE @)*@ sf] glthf")).toBe("SEE २०८२ को नतिजा");
    expect(convertMixed("Notice: SEE Result 2082 sf] glthf k|sflzt")).toBe("Notice: SEE Result 2082 को नतिजा प्रकाशित");
  });
  it("leaves a plain English sentence unchanged", () => {
    const lines = [
      "The Board published the results of the Grade 12 examination on 2026-10-05. Please visit www.example.org or email info@example.org.",
      "Applicants must upload scanned copies of transcripts, citizenship and character certificate before Friday.",
      "The Institute of Engineering announces the entrance examination schedule for BE/BArch programmes.",
      "Candidates who fail to appear will be disqualified; don't call 01-4412345 after 5 pm (PDF).",
      "Rural Municipality Office, Ward No. 5, Lalitpur",
      "Page 5 of 12",
    ];
    for (const l of lines) expect(convertMixed(l)).toBe(l);
  });
  it("converts a plain Preeti line exactly like preetiToUnicode", () => {
    const lines = [
      "g]kfn ;/sf/sf k|wfgdGqLn] cfly{s ;'wf/sf] 3f]if0ff ug'{eof] .",
      unicodeToPreeti("काठमाडौं, २०८३ असोज १९ । प्रधानमन्त्रीले आज मन्त्रिपरिषद्को बैठकमा आर्थिक वर्षको बजेट निर्माणबारे छलफल गर्नुभयो ।"),
      unicodeToPreeti("विद्यालय क्षेत्रमा राष्ट्रिय शिक्षा नीति तय गर्ने निर्णय भएको छ । म त न ता हो र छ ।"),
      "u'? 5 .",
    ];
    for (const l of lines) expect(convertMixed(l)).toBe(preetiToUnicode(l));
  });
  it("handles English and Preeti in one sentence", () => {
    expect(convertMixed("Class 10 sf] k/LIff ldlt @)*@ ;fpg ! ut] b]lv z'? x'g] 5 ."))
      .toBe("Class 10 को परीक्षा मिति २०८२ साउन १ गते देखि शुरु हुने छ ।");
  });
  it("works line by line and leaves Unicode Devanagari alone", () => {
    expect(convertMixed("NEB Notice\nk/LIff sf] glthf\nनेपाल Board")).toBe("NEB Notice\nपरीक्षा को नतिजा\nनेपाल Board");
    expect(convertMixed("")).toBe("");
  });
  it("is available as preetiToUnicode(text, { keepEnglish: true }); the default still converts everything", () => {
    expect(preetiToUnicode("Pre-/fli6«o", { keepEnglish: true })).toBe("Pre-राष्ट्रिय");
    expect(preetiToUnicode("Pre-/fli6«o")).toBe("एचभ(राष्ट्रिय");
  });
});

describe("looksLikePreeti on other legacy fonts", () => {
  it("returns false for ASCII that breaks Preeti's key grammar", () => {
    expect(looksLikePreeti("tqrf, (<zFT< Rrm+- tqrf sf] (<zFT< Rrm+ kmn")).toBe(false);
    // Real Preeti that uses the m tail (झ फ ऊ क्र फ्र) is still recognised.
    expect(looksLikePreeti("sf7df8f}+, @)*# c;f]h !( . k|wfgdGqLn] cfly{s jif{sf] ah]6 lgdf{0faf/] 5nkmn ug'{eof] . emG8f kmn pmhf{ s|d k|mfG;")).toBe(true);
  });
});
