import { describe, expect, it } from "vitest";
import { assColor, assTime, captions, describe as describeApi, estimateWidth, fromSpeakable, layoutCaptions, CANVASES, srtTime } from "./index.js";

const longNe = "नयाँ अवरोध उत्पन्न नभएमा पृथ्वी राजमार्गमा बुधबार दिउँसो एक बजेदेखि यातायात सेवा सामान्य रूपमा सुचारु हुने अनुमान गरिएको छ।";

describe("layout", () => {
  it("never breaks inside a word; ≤2 lines per cue; fits the reels safe width", () => {
    const r = captions([{ text: longNe, startMs: 0, endMs: 8000 }], { canvas: "reels" });
    expect(r.stats.maxLines).toBeLessThanOrEqual(2);
    const words = longNe.split(" ");
    for (const c of r.layout.cues) for (const l of c.lines) for (const w of l.words) expect(words).toContain(w.text);
    const avail = 1080 - 60 - 180 - Math.round(1080 * 0.04);
    expect(r.stats.longestLinePx).toBeLessThanOrEqual(avail);
    expect(r.stats.cues).toBeGreaterThan(1); // long sentence → several cues
    // cues are contiguous and ordered
    for (let i = 1; i < r.layout.cues.length; i++) expect(r.layout.cues[i]!.startMs).toBeGreaterThanOrEqual(r.layout.cues[i - 1]!.endMs - 1);
  });
  it("shrinks the font when a single word is wider than the line, down to the minimum", () => {
    const r = captions([{ text: "अन्तर्राष्ट्रियकरणप्रक्रियाहरूमार्फत", startMs: 0, endMs: 2000 }], { canvas: "tiktok", fontSize: 80, minFontSize: 50 });
    expect(r.stats.fontSize).toBeLessThan(80);
    expect(r.stats.fontSize).toBeGreaterThanOrEqual(50);
  });
  it("prefers breaking after punctuation and avoids a one-word orphan line", () => {
    const seg = { text: "नेप्से बढ्यो, लगानीकर्ता फर्किए र कारोबार उच्च भयो", startMs: 0, endMs: 4000 };
    const r = layoutCaptions([seg], { canvas: CANVASES["fb-feed"]!, fontSize: 64 });
    const firstLine = r.cues[0]!.lines[0]!.text;
    expect(firstLine.endsWith(",") || firstLine.split(" ").length >= 2).toBe(true);
    for (const c of r.cues) for (const l of c.lines) expect(l.words.length >= 2 || c.lines.length === 1).toBe(true);
  });
  it("applies cue duration bounds and butt-joins tiny gaps", () => {
    const r = layoutCaptions([{ text: "छोटो", startMs: 0, endMs: 200 }, { text: "अर्को वाक्य यहाँ", startMs: 260, endMs: 9000 }], { canvas: CANVASES.square!, minCueMs: 1000, maxCueMs: 5000 });
    expect(r.cues[0]!.endMs).toBe(260); // extended to the next cue, no overlap
    expect(r.cues[1]!.endMs - r.cues[1]!.startMs).toBe(5000);
  });
  it("estimateWidth: Devanagari wider than Latin, matras nearly free", () => {
    expect(estimateWidth("काठमाडौं", 10)).toBeLessThan(estimateWidth("कखगघङचछज", 10));
    expect(estimateWidth("abc", 10)).toBeLessThan(estimateWidth("ABC", 10));
  });
});

describe("formats", () => {
  const words = [
    { text: "रु.", startMs: 0, endMs: 300 }, { text: "१", startMs: 300, endMs: 500 }, { text: "लाख", startMs: 500, endMs: 900 }, { text: "जम्मा", startMs: 1000, endMs: 1400 }, { text: "भयो।", startMs: 1400, endMs: 1900 },
  ];
  it("ASS has PlayRes, safe margins, a style and fade; karaoke emits \\kf per word with gaps", () => {
    const plain = captions([{ text: words.map((w) => w.text).join(" "), startMs: 0, endMs: 1900, words }], { canvas: "shorts", fontName: "Mukta", assPath: "/tmp/a b.ass", fontsDir: "/fonts" });
    expect(plain.ass).toContain("PlayResX: 1080");
    expect(plain.ass).toContain("PlayResY: 1920");
    expect(plain.ass).toMatch(/Style: Caption,Mukta,\d+,&H00FFFFFF&/);
    expect(plain.ass).toContain(",2,40,150,380,1"); // alignment bottom-centre + safe margins L/R/V
    expect(plain.ass).toContain("Dialogue: 0,0:00:00.00,0:00:01.90,Caption,,0,0,0,,{\\fad(120,120)}रु. १ लाख जम्मा भयो।");
    expect(plain.filter).toBe("subtitles='/tmp/a b.ass':fontsdir='/fonts'");
    const k = captions([{ text: "", startMs: 0, endMs: 1900, words }], { canvas: "shorts", karaoke: "fill" });
    expect(k.ass).toContain("{\\kf30}रु. {\\kf20}१ {\\kf40}लाख {\\kf10}{\\kf40}जम्मा {\\kf50}भयो।");
    expect(k.ass).toMatch(/Style: Caption,Mukta,\d+,&H0000D4FF&,&H00FFFFFF&/); // highlight as primary, white as secondary
  });
  it("SRT/VTT timestamps and colours", () => {
    const r = captions([{ text: "Hello world", startMs: 61005, endMs: 63500 }], { canvas: "youtube" });
    expect(r.srt).toContain("00:01:01,005 --> 00:01:03,500");
    expect(r.vtt).toContain("WEBVTT");
    expect(r.vtt).toContain("00:01:01.005 --> 00:01:03.500 line:90% align:center");
    expect(assTime(3661234)).toBe("1:01:01.23");
    expect(srtTime(5)).toBe("00:00:00,005");
    expect(assColor("#FFD400")).toBe("&H0000D4FF&");
    expect(assColor("#000000@0.55")).toBe("&H73000000&");
  });
  it("montage drawtext fallback carries cue text/times/position", () => {
    const r = captions([{ text: "A short line", startMs: 500, endMs: 2500 }], { canvas: "square", position: "top" });
    expect(r.montageCaptions[0]).toMatchObject({ text: "A short line", start: 0.5, end: 2.5, position: "top", box: true });
  });
  it("fromSpeakable groups original-token timings into sentence segments with words", () => {
    const segs = fromSpeakable([
      { orig: "रु. १ लाख", startMs: 0, endMs: 880, segment: 0 }, { orig: "जम्मा", startMs: 900, endMs: 1200, segment: 0 }, { orig: "भयो।", startMs: 1200, endMs: 1500, segment: 0 },
      { orig: "अर्को", startMs: 1900, endMs: 2200, segment: 1 },
    ]);
    expect(segs).toHaveLength(2);
    expect(segs[0]!.words![0]!.text).toBe("रु. १ लाख");
    expect(segs[0]!.text).toBe("रु. १ लाख जम्मा भयो।");
    expect(describeApi().canvases).toContain("reels");
  });
});

describe("escapeFilterPath (1.0.1)", async () => {
  const { escapeFilterPath } = await import("./formats.js");
  it("survives quotes, colons and brackets inside subtitles='…'", () => {
    expect(escapeFilterPath("/tmp/Font's: [dir], x/cap.ass")).toBe("/tmp/Font\\'\\''s\\: [dir], x/cap.ass");
  });
});
