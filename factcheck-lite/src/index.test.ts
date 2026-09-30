import { describe, expect, it } from "vitest";
import { extractClaims, extractNumeric, extractDates, normalizeDigits, verify } from "./index.js";

describe("normalizeDigits + extractNumeric", () => {
  it("reads Devanagari digits and scale words", () => {
    expect(normalizeDigits("१२३")).toBe("123");
    const n = extractNumeric("बजेट रु १२ खर्ब छ");
    const amt = n.find((c) => c.kind === "amount")!;
    expect(amt.value).toBe(12 * 1e11);
    expect(amt.currency).toBe("NPR");
  });
  it("parses lakh/crore and grouped numbers", () => {
    expect(extractNumeric("12 lakh people")[0]!.value).toBe(1_200_000);
    expect(extractNumeric("1,200,000 people")[0]!.value).toBe(1_200_000);
    expect(extractNumeric("Rs 2.5 crore")[0]!.value).toBe(2.5 * 1e7);
  });
  it("detects percentages incl. प्रतिशत", () => {
    expect(extractNumeric("rate cut to 5.5 percent")[0]).toMatchObject({ kind: "percentage", value: 5.5 });
    expect(extractNumeric("महँगी ७ प्रतिशत")[0]).toMatchObject({ kind: "percentage", value: 7 });
  });
});

describe("extractDates", () => {
  it("parses ISO, long-form and BS dates", () => {
    expect(extractDates("on 2026-09-30 the")[0]).toMatchObject({ value: "2026-09-30", calendar: "AD" });
    expect(extractDates("September 30, 2026")[0]).toMatchObject({ value: "2026-09-30", calendar: "AD" });
    expect(extractDates("30 Sep 2026")[0]).toMatchObject({ value: "2026-09-30", calendar: "AD" });
    expect(extractDates("२०८२ साल")[0]).toMatchObject({ value: "2082", calendar: "BS" });
  });
});

describe("extractClaims", () => {
  it("buckets numbers, amounts, percentages, dates and entities", () => {
    const c = extractClaims("Nepal Rastra Bank cut the rate to 5.5 percent on 2026-09-30, freeing Rs 12 crore.", {
      gazetteer: ["Nepal Rastra Bank"],
    });
    expect(c.percentages[0]!.value).toBe(5.5);
    expect(c.amounts[0]!.value).toBe(12 * 1e7);
    expect(c.dates[0]!.value).toBe("2026-09-30");
    expect(c.entities.some((e) => e.value === "Nepal Rastra Bank")).toBe(true);
  });
});

describe("verify — the anti-hallucination gate", () => {
  const sources = [
    "Nepal Rastra Bank reduced its policy rate to 5.5 percent on 2026-09-30. The relief totals Rs 12 crore for borrowers.",
    "Governor Maha Prasad Adhikari announced the decision.",
  ];

  it("passes when every figure is supported", () => {
    const r = verify("NRB cut the rate to 5.5 percent, a relief of Rs 12 crore, on 2026-09-30.", sources, { numberTolerance: 0 });
    expect(r.ok).toBe(true);
    expect(r.mismatches).toHaveLength(0);
    expect(r.checked).toBeGreaterThan(0);
  });

  it("flags a fabricated / drifted number", () => {
    const r = verify("NRB cut the rate to 6.5 percent, a relief of Rs 20 crore.", sources);
    const pct = r.mismatches.find((m) => m.type === "percentage")!;
    expect(pct.value).toBe(6.5);
    expect(pct.nearest).toBe(5.5);
    const amt = r.mismatches.find((m) => m.type === "amount")!;
    expect(amt.value).toBe(20 * 1e7);
    expect(r.ok).toBe(false);
  });

  it("treats लाख/करोड equivalents as derivable (12 crore == 120000000)", () => {
    const r = verify("राहत १२ करोड बराबर छ।", ["The relief is 120,000,000 rupees."], {});
    expect(r.ok).toBe(true);
  });

  it("honours numberTolerance", () => {
    expect(verify("about 100 people", ["99 people attended"]).ok).toBe(false);
    expect(verify("about 100 people", ["99 people attended"], { numberTolerance: 0.02 }).ok).toBe(true);
  });

  it("verifies an entity across scripts via translit", () => {
    // Article names the person in Devanagari; the source uses Latin.
    const r = verify("रामचन्द्र पौडेलले उद्घाटन गरे।", ["President Ram Chandra Poudel inaugurated the event."], { checkEntities: true });
    const entMiss = r.mismatches.filter((m) => m.type === "entity");
    expect(entMiss).toHaveLength(0);
  });

  it("flags an entity that appears nowhere in the sources", () => {
    const r = verify("Sher Bahadur Deuba spoke.", ["President Ram Chandra Poudel inaugurated the event."], { checkEntities: true });
    expect(r.mismatches.some((m) => m.type === "entity" && /Deuba/.test(m.value as string))).toBe(true);
  });

  it("handles empty inputs", () => {
    expect(verify("", ["x"]).ok).toBe(true);
    expect(verify("no facts here", []).ok).toBe(true);
  });
});
