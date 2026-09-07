import { describe, expect, it } from "vitest";
import { assignVariant, isInRollout, rolloutBucket, validateVariants } from "./experiments";

const users = Array.from({ length: 20000 }, (_, i) => `user-${i}`);

describe("isInRollout — stability", () => {
  it("is deterministic: same (flag,user,pct) → same answer", () => {
    for (const u of ["a", "b", "user-42", "xyz"]) {
      const first = isInRollout("feat", u, 37);
      for (let i = 0; i < 5; i++) expect(isInRollout("feat", u, 37)).toBe(first);
    }
  });

  it("clamps the ends", () => {
    expect(isInRollout("feat", "anyone", 0)).toBe(false);
    expect(isInRollout("feat", "anyone", -5)).toBe(false);
    expect(isInRollout("feat", "anyone", 100)).toBe(true);
    expect(isInRollout("feat", "anyone", 150)).toBe(true);
  });

  it("is monotonic: a user in at a low % stays in as it ramps", () => {
    for (const u of users.slice(0, 2000)) {
      let wasIn = false;
      for (const pct of [1, 5, 10, 25, 50, 75, 99]) {
        const inNow = isInRollout("ramp", u, pct);
        if (wasIn) expect(inNow).toBe(true); // never drops anyone
        wasIn = inNow;
      }
    }
  });
});

describe("isInRollout — distribution is unbiased", () => {
  for (const pct of [10, 25, 50, 80]) {
    it(`~${pct}% of users are included`, () => {
      const inCount = users.filter((u) => isInRollout("dist-flag", u, pct)).length;
      const actual = (inCount / users.length) * 100;
      expect(Math.abs(actual - pct)).toBeLessThan(2); // within 2 points
    });
  }

  it("different flags bucket the same user independently", () => {
    // correlation between two flags' inclusion at 50% should be near zero
    let both = 0;
    let one = 0;
    for (const u of users) {
      const a = isInRollout("flag-a", u, 50);
      const b = isInRollout("flag-b", u, 50);
      if (a && b) both++;
      if (a) one++;
    }
    // if independent, P(b|a) ≈ 0.5 → both ≈ one/2
    expect(Math.abs(both / one - 0.5)).toBeLessThan(0.05);
  });

  it("rolloutBucket stays in [0,100)", () => {
    for (const u of users.slice(0, 500)) {
      const b = rolloutBucket("x", u);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(100);
    }
  });
});

describe("assignVariant — stability & distribution", () => {
  const variants = [
    { key: "control", weight: 1 },
    { key: "b", weight: 1 },
    { key: "c", weight: 1 },
  ];

  it("is deterministic per user", () => {
    for (const u of ["a", "b", "user-7"]) {
      const first = assignVariant("exp", u, variants);
      for (let i = 0; i < 5; i++) expect(assignVariant("exp", u, variants)).toBe(first);
    }
  });

  it("only ever returns a defined variant key", () => {
    const keys = new Set(variants.map((v) => v.key));
    for (const u of users.slice(0, 1000)) expect(keys.has(assignVariant("exp", u, variants))).toBe(true);
  });

  it("splits roughly evenly across equal weights", () => {
    const counts: Record<string, number> = { control: 0, b: 0, c: 0 };
    for (const u of users) counts[assignVariant("exp", u, variants)]!++;
    for (const key of Object.keys(counts)) {
      const share = (counts[key]! / users.length) * 100;
      expect(Math.abs(share - 100 / 3)).toBeLessThan(2);
    }
  });

  it("respects unequal weights (control 80 / treatment 20)", () => {
    const weighted = [
      { key: "control", weight: 80 },
      { key: "treatment", weight: 20 },
    ];
    let treatment = 0;
    for (const u of users) if (assignVariant("w", u, weighted) === "treatment") treatment++;
    const share = (treatment / users.length) * 100;
    expect(Math.abs(share - 20)).toBeLessThan(2);
  });

  it("excludes weight-0 variants (a paused treatment)", () => {
    const withPaused = [
      { key: "control", weight: 1 },
      { key: "paused", weight: 0 },
    ];
    for (const u of users.slice(0, 500)) expect(assignVariant("p", u, withPaused)).toBe("control");
  });

  it("returns '' when there is nothing to assign", () => {
    expect(assignVariant("z", "u", [])).toBe("");
  });
});

describe("validateVariants — sum check", () => {
  it("accepts positive weights", () => {
    expect(validateVariants([{ key: "a" }, { key: "b" }])).toEqual({ ok: true, total: 2 });
  });

  it("enforces expectedTotal", () => {
    const ok = validateVariants([{ key: "a", weight: 70 }, { key: "b", weight: 30 }], 100);
    expect(ok.ok).toBe(true);
    const bad = validateVariants([{ key: "a", weight: 70 }, { key: "b", weight: 40 }], 100);
    expect(bad.ok).toBe(false);
    expect(bad.total).toBe(110);
  });

  it("rejects empty, duplicate, negative and zero-sum", () => {
    expect(validateVariants([]).ok).toBe(false);
    expect(validateVariants([{ key: "a" }, { key: "a" }]).ok).toBe(false);
    expect(validateVariants([{ key: "a", weight: -1 }, { key: "b" }]).ok).toBe(false);
    expect(validateVariants([{ key: "a", weight: 0 }]).ok).toBe(false);
  });
});
