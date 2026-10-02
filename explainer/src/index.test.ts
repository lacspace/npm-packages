import { describe, expect, it } from "vitest";
import { describe as describeApi, explain, pickCategory, polish } from "./index.js";

const NE = `नेपाल राष्ट्र बैंकले आज नयाँ मौद्रिक नीति सार्वजनिक गरेको छ। नीतिअनुसार बैंकहरूले कर्जामा लिने ब्याजदर १२ प्रतिशतभन्दा माथि लैजान पाउने छैनन्। यसले गर्दा साना व्यवसायीलाई सस्तो कर्जा पाउन सजिलो हुने गभर्नर महाप्रसाद अधिकारीले बताए। गत वर्ष ब्याजदर १५ प्रतिशतसम्म पुगेको थियो। नयाँ व्यवस्था आगामी कात्तिक १ गतेदेखि लागू हुनेछ। रु. ५० अर्बको पुनर्कर्जा कोष पनि घोषणा गरिएको छ।`;
const EN = `The Cricket Association of Nepal named a 15-member squad for the tri-series in Oman on Friday. Captain Rohit Paudel said the team's main concern is batting depth because the top order collapsed in the last tournament. Nepal last played Oman in 2024 and lost the series 2-1. The series starts on 7 October in Muscat and the final is scheduled for 14 October. Sandeep Lamichhane returns after a year.`;

describe("explain (ne)", () => {
  const ex = explain(NE, { brand: "WeNepal" });
  it("detects language and category, builds the slide structure in order", () => {
    expect(ex.lang).toBe("ne");
    expect(ex.category).toBe("economy");
    expect(ex.slides.map((s) => s.kind)).toEqual(["title", "what", "why", "numbers", "who", "background", "next", "cta"].filter((k) => ex.slides.some((s) => s.kind === k)));
    expect(ex.slides[0]!.body).toMatch(/मौद्रिक नीति/);
    expect(ex.slides.find((s) => s.kind === "why")!.body).toMatch(/यसले गर्दा/);
    expect(ex.slides.find((s) => s.kind === "next")!.body).toMatch(/लागू हुनेछ/);
    expect(ex.slides.find((s) => s.kind === "background")!.body).toMatch(/गत वर्ष/);
    expect(ex.slides[ex.slides.length - 1]!.body).toContain("WeNepal");
  });
  it("numbers slide shows figures exactly as written and the carousel maps to newscard types", () => {
    const num = ex.slides.find((s) => s.kind === "numbers")!;
    expect(["१२ प्रतिशत", "रु. ५० अर्ब", "१५ प्रतिशत"].some((v) => num.stat!.value.includes(v.split(" ")[0]!))).toBe(true);
    expect(num.bullets!.length).toBeGreaterThanOrEqual(2);
    expect(ex.carousel.find((c) => c.type === "stat")!.stat!.value).toBe(num.stat!.value);
    expect(ex.carousel[0]).toMatchObject({ type: "headline", kicker: "Economy" });
  });
  it("script scenes have bounded voiceovers, durations, visuals and overlays; FAQ in Nepali", () => {
    expect(ex.script.scenes.length).toBeGreaterThanOrEqual(3);
    expect(ex.script.scenes.length).toBeLessThanOrEqual(5);
    for (const s of ex.script.scenes) {
      expect(s.voiceover.split(/\s+/).length).toBeLessThanOrEqual(31);
      expect(s.durationSec).toBeGreaterThanOrEqual(4);
      expect(s.visualQueries.length).toBeGreaterThan(0);
    }
    expect(ex.script.scenes[0]!.overlay).toBe("stinger");
    expect(ex.script.scenes.find((s) => s.heading === "मुख्य तथ्याङ्क")!.overlay).toBe("stat");
    expect(ex.script.totalSec).toBeGreaterThan(15);
    expect(ex.faq[0]!.q).toBe("के भयो?");
    expect(ex.faq.some((f) => f.q === "अब के हुन्छ?")).toBe(true);
    expect(ex.hashtags.length).toBeGreaterThan(0);
  });
});

describe("explain (en) + polish + describe", () => {
  it("builds an English explainer with entities, background and next", () => {
    const ex = explain(EN, { slides: 6 });
    expect(ex.lang).toBe("en");
    expect(ex.category).toBe("sports");
    expect(ex.slides.length).toBeLessThanOrEqual(6);
    expect(ex.slides.map((s) => s.kind)).toContain("why");
    expect(ex.slides.find((s) => s.kind === "why")!.body).toMatch(/because/);
    expect(ex.slides.find((s) => s.kind === "next")!.body).toMatch(/scheduled|starts/);
    expect(ex.faq.find((f) => f.q === "Who is involved?")!.a).toMatch(/Paudel|Lamichhane|Oman|Nepal/);
    expect(ex.script.scenes.some((s) => s.visualQueries.some((v) => /cricket/i.test(v)))).toBe(true);
    expect(ex.warnings).toEqual([]);
  });
  it("polish keeps the deterministic line when the LLM invents a number, accepts a clean rewrite", async () => {
    const ex = explain(EN);
    const bad = await polish(ex, async () => "Nepal named a 16-member squad for Oman.");
    expect(bad.script.scenes[0]!.voiceover).toBe(ex.script.scenes[0]!.voiceover);
    const good = await polish(ex, async (p) => (p.includes("15-member") ? "Nepal has picked a 15-member squad for the tri-series in Oman." : "ok line here"));
    expect(good.script.scenes[0]!.voiceover).toBe("Nepal has picked a 15-member squad for the tri-series in Oman.");
    const thrown = await polish(ex, async () => { throw new Error("quota"); });
    expect(thrown.script.scenes[0]!.voiceover).toBe(ex.script.scenes[0]!.voiceover);
  });
  it("pickCategory + describe", () => {
    expect(pickCategory("भारी वर्षाका कारण बाढी र पहिरोको जोखिम बढेको छ")).toBe("weather");
    expect(pickCategory("lorem ipsum dolor")).toBe("general");
    expect(describeApi().commands.map((c) => c.name)).toContain("explain");
  });
});
