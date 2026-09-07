import { describe, it, expect } from "vitest";
import {
  parseSemver,
  isValidSemver,
  formatSemver,
  compareSemver,
  gt,
  maxSemver,
  inc,
  incStr,
} from "./semver.js";

describe("parseSemver", () => {
  it("parses a plain version", () => {
    expect(parseSemver("1.2.3")).toEqual({
      major: 1, minor: 2, patch: 3, prerelease: [], build: [],
    });
  });

  it("tolerates a leading v", () => {
    expect(parseSemver("v2.0.0")?.major).toBe(2);
  });

  it("parses prerelease and build", () => {
    const v = parseSemver("1.2.0-beta.1+exp.sha")!;
    expect(v.prerelease).toEqual(["beta", 1]);
    expect(v.build).toEqual(["exp", "sha"]);
  });

  it("returns null for garbage", () => {
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("nope")).toBeNull();
    expect(parseSemver("01.2.3")).toBeNull();
  });
});

describe("isValidSemver / formatSemver", () => {
  it("validates", () => {
    expect(isValidSemver("0.0.1")).toBe(true);
    expect(isValidSemver("1.2")).toBe(false);
  });
  it("round-trips", () => {
    expect(formatSemver(parseSemver("1.2.3-rc.2")!)).toBe("1.2.3-rc.2");
  });
});

describe("compareSemver", () => {
  it("orders by major/minor/patch", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("1.2.0", "1.1.9")).toBe(1);
    expect(compareSemver("1.2.3", "1.2.3")).toBe(0);
  });
  it("a prerelease is lower than its release", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(gt("1.0.0", "1.0.0-alpha")).toBe(true);
  });
  it("orders prerelease identifiers", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-beta")).toBe(-1);
    expect(compareSemver("1.0.0-beta.2", "1.0.0-beta.11")).toBe(-1);
    expect(compareSemver("1.0.0-rc.1", "1.0.0")).toBe(-1);
  });
  it("ignores build metadata", () => {
    expect(compareSemver("1.0.0+a", "1.0.0+b")).toBe(0);
  });
});

describe("maxSemver", () => {
  it("finds the greatest, skipping invalid", () => {
    expect(maxSemver(["v1.2.0", "1.10.0", "bad", "1.3.0"])).toBe("1.10.0");
  });
  it("returns null on empty", () => {
    expect(maxSemver(["nope"])).toBeNull();
  });
});

describe("inc", () => {
  it("bumps major/minor/patch on a stable version", () => {
    expect(incStr("1.2.3", "major")).toBe("2.0.0");
    expect(incStr("1.2.3", "minor")).toBe("1.3.0");
    expect(incStr("1.2.3", "patch")).toBe("1.2.4");
  });
  it("dropping a prerelease releases the base", () => {
    expect(incStr("2.0.0-beta.1", "major")).toBe("2.0.0");
    expect(incStr("1.3.0-beta.1", "minor")).toBe("1.3.0");
    expect(incStr("1.2.4-beta.1", "patch")).toBe("1.2.4");
  });
  it("starts prereleases with a preid", () => {
    expect(incStr("1.2.3", "preminor", "beta")).toBe("1.3.0-beta.0");
    expect(incStr("1.2.3", "premajor", "rc")).toBe("2.0.0-rc.0");
    expect(incStr("1.2.3", "prepatch", "alpha")).toBe("1.2.4-alpha.0");
  });
  it("bumps an existing prerelease", () => {
    expect(incStr("1.3.0-beta.0", "prerelease", "beta")).toBe("1.3.0-beta.1");
    expect(incStr("1.3.0-beta.4", "prerelease", "beta")).toBe("1.3.0-beta.5");
  });
  it("switches preid when it changes", () => {
    expect(incStr("1.3.0-alpha.2", "prerelease", "beta")).toBe("1.3.0-beta.0");
  });
  it("prerelease on a stable version rolls patch", () => {
    expect(incStr("1.2.3", "prerelease", "beta")).toBe("1.2.4-beta.0");
  });
  it("returns a fresh object (no mutation)", () => {
    const v = parseSemver("1.2.3")!;
    inc(v, "major");
    expect(v).toEqual(parseSemver("1.2.3"));
  });
});
