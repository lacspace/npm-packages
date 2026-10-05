import { describe, expect, it } from "vitest";
import { describe as describeApi, looksLikePreeti, preetiToUnicode, unicodeToPreeti } from "./index.js";

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
