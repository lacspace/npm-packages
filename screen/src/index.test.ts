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
  negations: ["no", "not", "denied", "-न", "-नन्"],
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
    const cfg: ScreenConfig = { dimensions: { minor: { terms: ["child"], weight: 0.5, forceReview: true } }, thresholds: { review: 1 } };
    const r = screenText("A child was seen at the fair.", cfg);
    expect(r.score).toBeLessThan(1);
    expect(r.decision).toBe("review");
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
