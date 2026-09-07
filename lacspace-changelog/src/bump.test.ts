import { describe, it, expect } from "vitest";
import { parseCommits } from "./commit.js";
import { recommendBump } from "./bump.js";

const cx = (msgs: string[]) => parseCommits(msgs);

describe("recommendBump — decision matrix", () => {
  it("breaking → major (1.x)", () => {
    const r = recommendBump(cx(["feat!: x", "fix: y"]), "1.4.2");
    expect(r.level).toBe("major");
    expect(r.next).toBe("2.0.0");
  });

  it("feat → minor", () => {
    const r = recommendBump(cx(["feat: x", "fix: y", "docs: z"]), "1.4.2");
    expect(r.level).toBe("minor");
    expect(r.next).toBe("1.5.0");
  });

  it("fix/perf → patch", () => {
    const r = recommendBump(cx(["fix: x", "perf: y", "chore: z"]), "1.4.2");
    expect(r.level).toBe("patch");
    expect(r.next).toBe("1.4.3");
  });

  it("nothing notable → none", () => {
    const r = recommendBump(cx(["chore: x", "docs: y", "just words"]), "1.4.2");
    expect(r.level).toBe("none");
    expect(r.next).toBe("1.4.2");
  });

  it("--always bumps patch when nothing notable", () => {
    const r = recommendBump(cx(["chore: x"]), "1.4.2", { always: true });
    expect(r.level).toBe("patch");
    expect(r.next).toBe("1.4.3");
  });
});

describe("recommendBump — 0.x behaviour", () => {
  it("breaking in 0.x → minor by default", () => {
    const r = recommendBump(cx(["feat!: x"]), "0.3.1");
    expect(r.level).toBe("minor");
    expect(r.next).toBe("0.4.0");
  });
  it("breaking in 0.x → major when disabled", () => {
    const r = recommendBump(cx(["feat!: x"]), "0.3.1", { pre1BreakingIsMinor: false });
    expect(r.level).toBe("major");
    expect(r.next).toBe("1.0.0");
  });
  it("feat in 0.x → minor", () => {
    expect(recommendBump(cx(["feat: x"]), "0.3.1").next).toBe("0.4.0");
  });
});

describe("recommendBump — prerelease", () => {
  it("--preid starts a prerelease at the computed level", () => {
    const r = recommendBump(cx(["feat: x"]), "1.2.3", { preid: "beta" });
    expect(r.next).toBe("1.3.0-beta.0");
  });
  it("--preid on breaking rolls major prerelease", () => {
    const r = recommendBump(cx(["feat!: x"]), "1.2.3", { preid: "rc" });
    expect(r.next).toBe("2.0.0-rc.0");
  });
  it("continues an existing prerelease", () => {
    const r = recommendBump(cx(["feat: x"]), "1.3.0-beta.0", { preid: "beta" });
    expect(r.next).toBe("1.3.0-beta.1");
  });
});

describe("recommendBump — release-as override", () => {
  it("forces a level", () => {
    const r = recommendBump(cx(["chore: x"]), "1.2.3", { releaseAs: "major" });
    expect(r.overridden).toBe(true);
    expect(r.next).toBe("2.0.0");
  });
  it("forces an explicit version", () => {
    const r = recommendBump(cx(["feat: x"]), "1.2.3", { releaseAs: "3.0.0-rc.1" });
    expect(r.next).toBe("3.0.0-rc.1");
    expect(r.overridden).toBe(true);
  });
  it("release-as with preid makes a prerelease", () => {
    const r = recommendBump(cx(["feat: x"]), "1.2.3", { releaseAs: "minor", preid: "beta" });
    expect(r.next).toBe("1.3.0-beta.0");
  });
  it("throws on an invalid explicit version", () => {
    expect(() => recommendBump(cx([]), "1.2.3", { releaseAs: "not-a-version" })).toThrow();
  });
});

describe("recommendBump — custom majorTypes (config-driven)", () => {
  it("forces a major for a configured major type", () => {
    const r = recommendBump(cx(["breaking: rip", "fix: y"]), "1.4.2", {
      majorTypes: ["breaking"],
    });
    expect(r.level).toBe("major");
    expect(r.next).toBe("2.0.0");
  });
  it("does not treat the type as major without config", () => {
    const r = recommendBump(cx(["breaking: rip"]), "1.4.2");
    expect(r.level).toBe("none");
  });
  it("respects custom minor/patch type lists", () => {
    const r = recommendBump(cx(["ui: new"]), "1.4.2", { minorTypes: ["ui"] });
    expect(r.level).toBe("minor");
    expect(r.next).toBe("1.5.0");
  });
});

describe("recommendBump — stats", () => {
  it("counts contributions", () => {
    const r = recommendBump(
      cx(["feat: a", "feat: b", "fix: c", "perf: d", "feat!: e", "chore: f", "random"]),
      "1.0.0",
    );
    expect(r.stats.features).toBe(3);
    expect(r.stats.fixes).toBe(2);
    expect(r.stats.breaking).toBe(1);
    expect(r.stats.other).toBeGreaterThanOrEqual(1);
  });
});
