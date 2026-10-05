import { describe, expect, it } from "vitest";
import { describe as describeApi, numberDistractors, placeLevel, placePool, quizpoll, typedEntities } from "./index.js";

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

// Reported by WeNepal's app, 5 Oct 2026 (1.1.0).
const GOATS_NE = `दशैंका लागि खसीबोका बजारमा
डोल्पाबाट पोखरामा हिमाली भेडा र च्याङ्ग्रा ल्याइएको छ। प्रति पशुको मूल्य रु. २१,००० देखि रु. ४३,००० सम्म तोकिएको छ। व्यवसायी बुद्धिराम बोहराका अनुसार यस वर्ष १०,५०० वटा पशु बिक्रीको लक्ष्य छ।`;
const GOATS_EN = `Dashain
Traders have brought Himalayan sheep and mountain goats from Dolpa to Pokhara for the Dashain market. The animals came from Jagadulla Rural Municipality in Dolpa. According to businessman Buddhiram Bohara, about 10,500 animals will be sold this year. Prices range from Rs. 21,000 to Rs. 43,000 per animal.`;
const IMF_EN = `The International Monetary Fund said Nepal's economy will grow by 4.5 percent this year. A Sri Lankan delegation met officials of Nepal Rastra Bank in Kathmandu on Sunday. The Washington Post reported that El Niño could cut rice output across South Asia. Finance Minister Bishnu Paudel welcomed the forecast.`;

describe("WeNepal app reports (1.1.0)", () => {
  const all = (q: ReturnType<typeof quizpoll>) => q.quiz.flatMap((i) => [i.question, ...i.options.map((o) => o.text)]);
  it("never cuts a sentence after रु. — the item is the whole sentence", () => {
    for (let seed = 0; seed < 10; seed++) {
      const q = quizpoll(GOATS_NE, { seed });
      for (const s of all(q)) expect(s).not.toMatch(/(?:रु|रू)\.$/);
      const price = q.quiz.find((i) => i.source.includes("२१,०००") || i.source.includes("४३,०००"));
      if (price) expect(price.source).toBe("प्रति पशुको मूल्य रु. २१,००० देखि रु. ४३,००० सम्म तोकिएको छ।");
    }
  });
  it("entity options share the answer's type; no starters, outlets, truncations or newlines", () => {
    for (const text of [GOATS_EN, IMF_EN]) for (let seed = 0; seed < 10; seed++) {
      const q = quizpoll(text, { seed });
      for (const s of all(q)) expect(s).not.toMatch(/\n/);
      for (const it of q.quiz.filter((i) => i.kind === "entity")) {
        const opts = it.options.map((o) => o.text);
        for (const o of opts) {
          expect(o).not.toMatch(/^(?:According|Traders|The|Businessman)\b/);
          expect(o).not.toMatch(/Washington|Post|Sri Lankan|El Ni$/);
        }
      }
    }
    const ents = typedEntities(GOATS_EN, [], "en");
    expect(ents).toEqual([]); // sentences are required for English
  });
  it("types the entities in the reported stories", () => {
    const q = quizpoll(GOATS_EN, { seed: 1 });
    expect(q.quiz.some((i) => i.question.startsWith("Fill in the blank: Dashain Traders"))).toBe(false);
    const e = typedEntities(IMF_EN, ["The International Monetary Fund said Nepal's economy will grow.", "A Sri Lankan delegation met officials of Nepal Rastra Bank in Kathmandu on Sunday.", "The Washington Post reported that El Niño could cut rice output.", "Finance Minister Bishnu Paudel welcomed the forecast."], "en");
    expect(e).toEqual([
      { text: "International Monetary Fund", type: "org" },
      { text: "Nepal Rastra Bank", type: "org" },
      { text: "Kathmandu", type: "place", level: "district" },
      { text: "Bishnu Paudel", type: "person" },
    ]);
    const g = typedEntities(GOATS_EN, ["Traders have brought sheep from Dolpa to Pokhara.", "The animals came from Jagadulla Rural Municipality in Dolpa.", "According to businessman Buddhiram Bohara, about 10,500 animals will be sold."], "en");
    expect(g).toEqual([
      { text: "Dolpa", type: "place", level: "district" },
      { text: "Pokhara", type: "place", level: "city" },
      { text: "Jagadulla Rural Municipality", type: "place", level: "local" },
      { text: "Buddhiram Bohara", type: "person" },
    ]);
    const n = typedEntities(GOATS_NE, [], "ne");
    expect(n).toContainEqual({ text: "डोल्पा", type: "place", level: "district" });
    expect(n).toContainEqual({ text: "पोखरा", type: "place", level: "city" });
    expect(n).toContainEqual({ text: "बुद्धिराम बोहरा", type: "person" });
  });
  it("a wrong figure is never another figure from the article, and title lines are not items", () => {
    for (let seed = 0; seed < 10; seed++) {
      const q = quizpoll(GOATS_EN, { seed, maxQuiz: 6 });
      for (const it of q.quiz.filter((i) => i.kind === "number")) for (const o of it.options.filter((x) => !x.correct)) expect(GOATS_EN).not.toContain(o.text);
      expect(q.quiz.some((i) => i.source === "Dashain")).toBe(false);
    }
  });
  it("a place cloze gets same-type distractors", () => {
    for (let seed = 0; seed < 5; seed++) {
      const q = quizpoll(GOATS_EN, { seed, maxQuiz: 6 });
      for (const it of q.quiz.filter((i) => i.kind === "entity")) expect(it.options.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("WeNepal app reports, round 2 (1.2.0)", () => {
  const EN2 = [
    "The Nepali Congress General Convention will be held in Kathmandu next month.",
    "The Weather Forecasting Division said rain will continue in Koshi, Madhesh and Bagmati Provinces.",
    "Heavy rain is expected in Madhesh Province on Sunday, the division said.",
    "Spokesperson Devraj Chalise said the party had prepared well.",
    "Chalise added that delegates from Dolpa would attend.",
    "Traders brought goats from Jagadulla Rural Municipality to Pokhara.",
  ];
  const NE2 = "प्रमुख सहरी केन्द्र र प्रमुख स्थान दिइएको छ। बैठकले अध्यक्ष निर्णयहरू अनुमोदन गर्‍यो। प्रवक्ता देवराज चालिसेले भने। चालिसेका अनुसार डोल्पाबाट प्रतिनिधि आउनेछन्।";
  const en = typedEntities(EN2.join(" "), EN2, "en");
  const ne = typedEntities(NE2, [], "ne");
  it("(a) common phrases are never people", () => {
    const people = [...en, ...ne].filter((e) => e.type === "person").map((e) => e.text);
    expect(people).not.toContain("Convention");
    for (const bad of ["स्थान दिइए", "सहरी केन्द्र", "निर्णयहरू अनुमोदन", "स्थान", "सहरी"]) expect(people).not.toContain(bad);
    expect(people).toContain("Devraj Chalise");
    expect(people).toContain("देवराज चालिसे");
  });
  it("(b) a part of a longer name is dropped", () => {
    const texts = [...en, ...ne].map((e) => e.text);
    expect(texts).not.toContain("Chalise");
    expect(texts).not.toContain("चालिसे");
    expect(texts).not.toContain("Madhesh");
    expect(texts).toContain("Madhesh Province");
  });
  it("(c) and (d) no plural groups; divisions are orgs; place levels", () => {
    expect(en.find((e) => e.text === "Weather Forecasting Division")?.type).toBe("org");
    expect(en.map((e) => e.text)).not.toContain("Bagmati Provinces");
    expect(en.map((e) => e.text)).not.toContain("Provinces");
    expect(en.find((e) => e.text === "Jagadulla Rural Municipality")?.level).toBe("local");
  });
  it("(c) options share the answer's place level", () => {
    const text = EN2.join(" ");
    for (let seed = 0; seed < 15; seed++) {
      const q = quizpoll(text, { seed, maxQuiz: 8 });
      for (const it of q.quiz.filter((i) => i.kind === "entity")) {
        const ans = it.options[it.answerIndex!]!.text;
        const level = placeLevel(ans);
        if (["district", "province", "city", "country"].includes(level) && en.some((e) => e.text === ans && e.type === "place"))
          for (const o of it.options) expect([ans, o.text, placeLevel(o.text)]).toEqual([ans, o.text, level]);
        if (ans === "Jagadulla Rural Municipality") throw new Error("a local-level answer with no other municipality should be skipped");
      }
    }
    expect(placePool("Madhesh Province", "en")).toContain("Koshi Province");
  });
});
