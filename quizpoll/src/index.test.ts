import { describe, expect, it } from "vitest";
import { describe as describeApi, numberDistractors, quizpoll } from "./index.js";

const NE = `नेपाल राष्ट्र बैंकले नयाँ मौद्रिक नीति सार्वजनिक गरेको छ। बैंकहरूले कर्जामा लिने ब्याजदर १२ प्रतिशतभन्दा माथि लैजान पाउने छैनन्। रु. ५० अर्बको पुनर्कर्जा कोष पनि घोषणा गरिएको छ। नयाँ व्यवस्था आगामी कात्तिक १ गतेदेखि लागू हुनेछ।`;
const EN = `The Cricket Association of Nepal named a 15-member squad for the tri-series in Oman. Captain Rohit Paudel said batting depth is the main concern. Sandeep Lamichhane returns after a year and Asif Sheikh will keep wicket. Nepal lost the last series to Oman 2-1 in 2024.`;

describe("numberDistractors", () => {
  it("keeps script, scale words, decimals and separators", () => {
    expect(numberDistractors("१२ प्रतिशत")).toEqual(["१३ प्रतिशत", "१४ प्रतिशत", "११ प्रतिशत"]);
    expect(numberDistractors("५० अर्ब")).toEqual(["२५ अर्ब", "७५ अर्ब", "१०० अर्ब"]);
    expect(numberDistractors("15-member")).toEqual(["16-member", "17-member", "14-member"]);
    expect(numberDistractors("1,20,000")).toEqual(["60,000", "180,000", "240,000"]);
    expect(numberDistractors("12.5%")).toEqual(["6.3%", "18.8%", "25.0%"]);
    expect(numberDistractors("2024")).toEqual(["2025", "2023", "2026"]); // years step by ±1/±2
    expect(numberDistractors("२०८३")).toEqual(["२०८४", "२०८२", "२०८५"]);
    expect(numberDistractors("no digits")).toEqual([]);
  });
});

describe("quizpoll", () => {
  it("builds Nepali number cloze, true/false, polls and did-you-know with platform fit", () => {
    const q = quizpoll(NE, { seed: 7 });
    expect(q.lang).toBe("ne");
    const cloze = q.quiz.find((i) => i.kind === "number")!;
    expect(cloze.question.startsWith("खाली ठाउँ भर्नुहोस्: ")).toBe(true);
    expect(cloze.question).toContain("____");
    expect(cloze.options).toHaveLength(4);
    expect(cloze.options[cloze.answerIndex!]!.correct).toBe(true);
    expect(cloze.fits["instagram-quiz"]).toBe(true);
    expect(cloze.fits["instagram-poll"]).toBe(false);
    expect(cloze.fits.youtube).toBe(true);
    const tf = q.quiz.filter((i) => i.kind === "truefalse");
    expect(tf.length).toBeGreaterThanOrEqual(1);
    expect(tf[0]!.options.map((o) => o.text).sort()).toEqual(["गलत", "सही"]);
    expect(q.polls).toHaveLength(2);
    expect(q.polls[0]!.fits["instagram-poll"]).toBe(false); // 3 options
    expect(q.polls[0]!.question).toBe("यसबारे तपाईंको धारणा के छ?");
    expect(q.didYouKnow[0]!.question.startsWith("थाहा छ? ")).toBe(true);
    expect(q.warnings).toEqual([]);
  });
  it("builds English entity cloze with distractors from the article and is deterministic per seed", () => {
    const q = quizpoll(EN, { seed: 1, maxQuiz: 4 });
    const ent = q.quiz.find((i) => i.kind === "entity");
    expect(ent).toBeDefined();
    expect(ent!.options.length).toBeGreaterThanOrEqual(3);
    expect(ent!.options.every((o) => /[A-Z]/.test(o.text))).toBe(true);
    expect(ent!.explanation).toMatch(/^Answer: /);
    const again = quizpoll(EN, { seed: 1, maxQuiz: 4 });
    expect(again.quiz.map((i) => i.options.map((o) => o.text))).toEqual(q.quiz.map((i) => i.options.map((o) => o.text)));
    const other = quizpoll(EN, { seed: 2, maxQuiz: 4 });
    expect(other.quiz.length).toBe(q.quiz.length);
    expect(new Set(q.quiz.map((i) => i.kind)).size).toBeGreaterThanOrEqual(3); // number + entity + true/false in a 4-item quiz
  });
  it("false statement perturbs a figure and marks False as correct; custom opinion templates first", () => {
    const q = quizpoll(EN, { seed: 3, opinionTemplates: { en: [{ q: "Will Nepal win the series?", options: ["Yes", "No"] }] } });
    const falseTf = q.quiz.find((i) => i.kind === "truefalse" && i.options[i.answerIndex!]!.text === "False");
    expect(falseTf).toBeDefined();
    expect(falseTf!.question).not.toBe("True or false? " + falseTf!.source);
    expect(q.polls[0]!.question).toBe("Will Nepal win the series?");
    expect(q.polls[0]!.fits["instagram-poll"]).toBe(true);
    expect(describeApi().commands[0]!.name).toBe("quizpoll");
  });
});
