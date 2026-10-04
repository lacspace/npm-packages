import { describe, expect, it } from "vitest";
import { compose, describe as describeApi, fitText, generate, slotTemplates } from "./index.js";
import type { Facts } from "./index.js";

const facts: Facts = {
  topic: "the rate cut",
  headline: "Nepal Rastra Bank cuts the policy rate",
  place: "Nepal",
  number: "4.5%",
  percent: "4.5%",
  hashtags: ["NRB", "economy", "Nepal"],
};

describe("generate", () => {
  it("produces several platform-fitted variants of a type", () => {
    const v = generate(facts, { type: "hook", platform: "instagram" });
    expect(v.length).toBeGreaterThan(2);
    expect(v.every((x) => x.length <= 125)).toBe(true); // IG hook limit
    expect(v.every((x) => x.text.includes("{") === false)).toBe(true); // all slots filled
  });

  it("skips templates whose slots are missing (never fabricates)", () => {
    const sparse: Facts = { headline: "Budget tabled in parliament" };
    const v = generate(sparse, { type: "hook", platform: "x" });
    // Only templates needing just {headline} (or none) survive — e.g. the plain {headline}
    expect(v.some((x) => x.text.includes("Budget tabled in parliament"))).toBe(true);
    expect(v.every((x) => !x.text.includes("{"))).toBe(true);
  });

  it("enforces the X 280-char limit", () => {
    const longHeadline = { headline: "x".repeat(400) };
    const v = generate(longHeadline, { type: "title", platform: "x" });
    expect(v.every((x) => x.length <= 280)).toBe(true);
    expect(v.some((x) => x.text.endsWith("…"))).toBe(true);
  });

  it("emits both languages when lang=both", () => {
    const v = generate(facts, { type: "hook", platform: "facebook", lang: "both" });
    expect(v.some((x) => x.lang === "en")).toBe(true);
    expect(v.some((x) => x.lang === "ne")).toBe(true);
    expect(v.some((x) => /[ऀ-ॿ]/.test(x.text))).toBe(true); // Devanagari present
  });

  it("filters by requested styles", () => {
    const v = generate(facts, { type: "hook", platform: "tiktok", styles: ["breaking"] });
    expect(v.every((x) => x.style === "breaking")).toBe(true);
  });
});

describe("compose", () => {
  it("assembles hook + caption + CTA + hashtags within the platform limit", () => {
    const c = compose(facts, { platform: "instagram", lang: "en" });
    expect(c.hook.length).toBeGreaterThan(0);
    expect(c.caption.length).toBeGreaterThan(0);
    expect(c.hashtags[0]).toMatch(/^#/);
    expect(c.text.length).toBeLessThanOrEqual(2200);
    expect(c.text).toContain("#NRB");
  });
  it("caps hashtags at 30 for Instagram", () => {
    const many = { ...facts, hashtags: Array.from({ length: 50 }, (_, i) => "tag" + i) };
    const c = compose(many, { platform: "instagram" });
    expect(c.hashtags.length).toBe(30);
  });
});

describe("slotTemplates + describe", () => {
  it("exposes raw templates with their slots for LLM slot-filling", () => {
    const st = slotTemplates("caption", "en");
    expect(st.length).toBeGreaterThan(0);
    const quote = st.find((t) => t.style === "quote");
    expect(quote!.slots).toEqual(expect.arrayContaining(["quote", "who", "headline"]));
  });
  it("describe() lists types, styles, platforms and command schema", () => {
    const d = describeApi();
    expect(d.types).toContain("hook");
    expect(d.platforms).toContain("youtube");
    expect(d.commands.find((c) => c.name === "generate")!.input.required).toContain("facts");
  });
});

describe("fitText", () => {
  it("trims at a word boundary with an ellipsis", () => {
    const r = fitText("the quick brown fox jumps over", 15);
    expect(r.length).toBeLessThanOrEqual(15);
    expect(r.endsWith("…")).toBe(true);
  });
  it("never says BREAKING unless urgency is breaking", () => {
    const routine = compose(facts, { platform: "facebook" });
    expect(routine.hook).not.toMatch(/BREAKING|Just in/);
    expect(generate(facts, { type: "hook", platform: "x" }).some((v) => v.style === "breaking")).toBe(false);
    expect(compose(facts, { platform: "facebook", lang: "ne" }).hook).not.toMatch(/ताजा खबर|भर्खरै/);
    const urgent = compose(facts, { platform: "facebook", urgency: "breaking" });
    expect(urgent.hook.startsWith("BREAKING:") || urgent.hook.startsWith("Just in")).toBe(true);
  });
});
