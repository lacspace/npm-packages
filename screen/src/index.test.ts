import { describe, expect, it } from "vitest";
import { createScreen, screenText, type ScreenConfig } from "./index.js";

const config: ScreenConfig = {
  dimensions: {
    death: { terms: ["died", "killed", "death", "मृत्यु"], weight: 1 },
    court: { terms: ["court", "verdict", "अदालत"], weight: 1 },
    minor: { terms: ["child", "minor", "बालबालिका"], weight: 2, forceReview: true },
    hate: { terms: ["slur-word"], weight: 3, forceBlock: true },
    election: { terms: ["election", "vote", "निर्वाचन"], weight: 1, forceReview: true },
  },
  negations: ["no", "not", "denied", "-ेन", "-ैन", "-एन", "-िएन", "-ेनन्", "-ैनन्"],
  contextWindow: 4,
  gazetteer: ["Kathmandu", "Sher Bahadur Deuba", "काठमाडौं"],
  gazetteerBoost: 0.5,
  thresholds: { clear: 0, review: 1, block: 5 },
};

describe("screen", () => {
  const screen = createScreen(config);

  it("clears clearly-clean text", () => {
    const r = screen("The weather in the valley was pleasant and markets stayed calm.");
    expect(r.decision).toBe("clear");
    expect(r.score).toBe(0);
    expect(r.hits).toHaveLength(0);
  });

  it("scores term hits and flags review", () => {
    const r = screen("A person died after the court gave its verdict.");
    expect(r.decision).toBe("review");
    expect(r.scores.death!).toBe(1);
    expect(r.scores.court!).toBe(2); // court + verdict
    expect(r.hits.some((h) => h.term === "died")).toBe(true);
  });

  it("adds a gazetteer boost when a named entity is present", () => {
    const plain = screen("A person died yesterday.");
    const withEntity = screen("A person died in Kathmandu yesterday.");
    expect(withEntity.entity).toBe(true);
    expect(withEntity.scores.death!).toBeGreaterThan(plain.scores.death!);
  });

  it("negation cancels a nearby hit", () => {
    const r = screen("No one died in the incident, police said.");
    const hit = r.hits.find((h) => h.term === "died")!;
    expect(hit.negated).toBe(true);
    expect(r.scores.death!).toBe(0);
  });

  it("forceReview lifts a below-threshold text to review", () => {
    // A dimension that scores below the review threshold on its own.
    const cfg: ScreenConfig = { dimensions: { minor: { terms: ["child"], weight: 0.5, forceReview: true } }, thresholds: { clear: 0.5, review: 2 } };
    const r = screenText("A child was seen at the fair.", cfg);
    expect(r.score).toBeLessThanOrEqual(0.5); // at/below the clear ceiling
    expect(r.decision).toBe("review");        // lifted by force-review, not the score
    expect(r.reasons.join(" ")).toMatch(/minor/);
  });

  it("forceBlock blocks regardless of score", () => {
    const r = screen("He used a slur-word.");
    expect(r.decision).toBe("block");
  });

  it("blocks when the total crosses the block threshold", () => {
    const r = screen("Death, death, killed, court verdict about the election vote death.");
    expect(r.score).toBeGreaterThanOrEqual(5);
    expect(r.decision).toBe("block");
  });

  it("handles Devanagari terms, entities and suffix negation", () => {
    const r = screen("काठमाडौंमा अदालतले निर्वाचन सम्बन्धी फैसला सुनायो।");
    expect(r.entity).toBe(true);
    expect(r.scores.court!).toBeGreaterThan(0);
    expect(r.decision === "review" || r.decision === "block").toBe(true);
    // suffix negation: मरेनन् (did not die) should negate मृत्यु-type hits nearby
    const neg = screen("त्यहाँ कोही मरेनन् भनी मृत्यु सम्बन्धी अफवाह अदालतले अस्वीकार गर्‍यो।");
    expect(neg.hits.some((h) => h.term === "मृत्यु")).toBe(true);
  });

  it("is deterministic and orders hits by position", () => {
    const a = screen("The court said a child died in the election.");
    const b = screen("The court said a child died in the election.");
    expect(a).toEqual(b);
    const positions = a.hits.map((h) => h.pos);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
  });

  it("exposes config and screenText one-shot works", () => {
    expect(screen.config.contextWindow).toBe(4);
    expect(screenText("A person was killed.", config).scores.death!).toBe(1);
  });

  it("multi-word Latin phrases match as a unit", () => {
    const cfg: ScreenConfig = { dimensions: { vip: { terms: ["prime minister"] } }, thresholds: { review: 1 } };
    expect(screenText("The prime minister spoke.", cfg).scores.vip!).toBe(1);
    expect(screenText("The minister spoke.", cfg).scores.vip!).toBe(0);
  });
});

describe("Devanagari tokenization regression (1.0.1)", () => {
  const cfg: ScreenConfig = {
    dimensions: {
      death: { terms: ["मृत्यु", "मारिए"], weight: 1 },
      election: { terms: ["निर्वाचन", "मतदान"], forceReview: true },
      court: { terms: ["अदालत"], weight: 1 },
    },
    negations: ["-ेन", "-ैन", "-एन", "-िएन", "-ेनन्", "-ैनन्"],
    thresholds: { clear: 0, review: 1 },
  };
  const screen = createScreen(cfg);

  it("keeps matras inside words so full terms match (not clear)", () => {
    // Before 1.0.1 these came back CLEAR because words split at every matra.
    const a = screen("निर्वाचन आयोगले मिति तोक्यो।");
    expect(a.decision).toBe("review"); // electionSensitive force-review fires
    const b = screen("तीन जनाको मृत्यु भयो।");
    expect(b.decision).toBe("review"); // death term scores
    expect(b.scores.death).toBe(1);
  });

  it("suffix negation matches whole verb endings, and force-review still trips on a mention", () => {
    // मरेनन् (did not die) is a real negation; the election mention still forces review.
    const r = screen("निर्वाचन भएन भनी कसैले भनेन।");
    expect(r.hits.some((h) => h.dim === "election")).toBe(true);
    expect(r.decision).toBe("review"); // force-review on any mention, even if negated
  });

  it("a clean Nepali sentence with no listed terms stays clear", () => {
    expect(screen("आज मौसम राम्रो छ र बजार शान्त छ।").decision).toBe("clear");
  });
});

describe("context rules (1.1.0) — word-sense disambiguation", () => {
  const cfg: ScreenConfig = {
    dimensions: {
      security: {
        terms: [
          { term: "सीमा", requiresNear: ["नाका", "क्षेत्र", "विवाद", "सुरक्षा"], excludeNear: ["दर", "मूल्य", "रकम", "अवधि"] },
        ],
        weight: 1,
      },
    },
    thresholds: { clear: 0, review: 1 },
  };
  const screen = createScreen(cfg);

  it("counts सीमा (border) near नाका/विवाद", () => {
    // "सीमा नाका मा विवाद" — border-crossing dispute → security hit
    expect(screen("सीमा नाकामा विवाद भयो।").decision).toBe("review");
  });
  it("ignores सीमा (limit) near दर/रकम", () => {
    // "माथिल्लो सीमा दर" — upper limit rate → NOT security
    expect(screen("माथिल्लो सीमा दर तोकियो।").decision).toBe("clear");
    expect(screen("रकमको सीमा बढ्यो।").scores.security).toBe(0);
  });
  it("requiresNear: no required context means no hit", () => {
    expect(screen("सीमा एक शब्द हो।").decision).toBe("clear");
  });
  it("Latin requiresNear/excludeNear and per-term weight", () => {
    const c = createScreen({
      dimensions: { risk: { terms: [{ term: "strike", requiresNear: ["workers", "union"], excludeNear: ["air", "drone"], weight: 2 }] } },
      thresholds: { clear: 0, review: 1 },
    });
    expect(c("the workers went on strike today").scores.risk).toBe(2);
    expect(c("an air strike was reported").decision).toBe("clear");
    expect(c("a strike happened").decision).toBe("clear"); // no required context
  });
});
