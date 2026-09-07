import { describe, it, expect } from "vitest";
import {
  classifyLicense,
  patternToRegExp,
  licenseMatches,
  splitExpression,
  evaluatePolicy,
  summarizeLicenses,
  severityRank,
  SEVERITY_ORDER,
} from "./licenses.js";
import type { InstalledPackage } from "./inventory.js";

const pkg = (name: string, version: string, license: string | null): InstalledPackage => ({
  name, version, path: `node_modules/${name}`, dir: `/x/${name}`, depth: 0,
  direct: true, dev: false, license, dependencies: [],
});

describe("classifyLicense", () => {
  it("classes common permissive licences", () => {
    for (const l of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "BSD-2-Clause", "0BSD", "Unlicense", "CC0-1.0"]) {
      expect(classifyLicense(l)).toBe("permissive");
    }
  });
  it("classes weak-copyleft", () => {
    for (const l of ["LGPL-3.0", "MPL-2.0", "EPL-2.0", "CDDL-1.0"]) {
      expect(classifyLicense(l)).toBe("weak-copyleft");
    }
  });
  it("classes strong-copyleft", () => {
    for (const l of ["GPL-3.0", "AGPL-3.0", "GPL-2.0-only", "OSL-3.0"]) {
      expect(classifyLicense(l)).toBe("strong-copyleft");
    }
  });
  it("treats null / UNLICENSED / SEE LICENSE as unknown", () => {
    expect(classifyLicense(null)).toBe("unknown");
    expect(classifyLicense("UNLICENSED")).toBe("unknown");
    expect(classifyLicense("SEE LICENSE IN LICENSE")).toBe("unknown");
    expect(classifyLicense("Weird-Custom-1.0")).toBe("unknown");
  });
  it("an OR expression takes the most permissive component", () => {
    expect(classifyLicense("(MIT OR GPL-3.0)")).toBe("permissive");
    expect(classifyLicense("(LGPL-3.0 OR GPL-3.0)")).toBe("weak-copyleft");
  });
});

describe("splitExpression", () => {
  it("splits OR / AND / WITH and strips parens", () => {
    expect(splitExpression("(MIT OR Apache-2.0)")).toEqual(["MIT", "Apache-2.0"]);
    expect(splitExpression("Apache-2.0 WITH LLVM-exception")).toEqual(["Apache-2.0", "LLVM-exception"]);
  });
});

describe("patternToRegExp / licenseMatches", () => {
  it("supports * globs case-insensitively", () => {
    expect(patternToRegExp("BSD-*").test("BSD-3-Clause")).toBe(true);
    expect(patternToRegExp("gpl-*").test("GPL-3.0")).toBe(true);
    expect(patternToRegExp("MIT").test("MITx")).toBe(false);
  });
  it("matches a compound licence when a component matches", () => {
    expect(licenseMatches("(MIT OR Apache-2.0)", ["Apache-2.0"])).toBe(true);
    expect(licenseMatches("GPL-3.0", ["GPL-*"])).toBe(true);
    expect(licenseMatches("MIT", ["GPL-*"])).toBe(false);
  });
});

describe("evaluatePolicy", () => {
  it("flags a denied licence", () => {
    expect(evaluatePolicy("GPL-3.0", { deny: ["GPL-*", "AGPL-*"] })).toBe("deny");
    expect(evaluatePolicy("MIT", { deny: ["GPL-*"] })).toBeNull();
  });
  it("flags a licence outside the allowlist", () => {
    expect(evaluatePolicy("GPL-3.0", { allow: ["MIT", "ISC", "BSD-*"] })).toBe("not-allowed");
    expect(evaluatePolicy("BSD-3-Clause", { allow: ["MIT", "ISC", "BSD-*"] })).toBeNull();
  });
  it("an unknown/null licence is not-allowed under an allowlist", () => {
    expect(evaluatePolicy(null, { allow: ["MIT"] })).toBe("not-allowed");
  });
  it("passes an OR licence when any component is allowed", () => {
    expect(evaluatePolicy("(MIT OR GPL-3.0)", { allow: ["MIT"] })).toBeNull();
  });
  it("deny takes precedence and empty policy passes everything", () => {
    expect(evaluatePolicy("MIT", {})).toBeNull();
    expect(evaluatePolicy("GPL-3.0", { allow: ["GPL-*"], deny: ["GPL-*"] })).toBe("deny");
  });
});

describe("severity gate (maxSeverity)", () => {
  it("ranks categories permissive < weak < strong < unknown", () => {
    expect(severityRank("permissive")).toBeLessThan(severityRank("weak-copyleft"));
    expect(severityRank("weak-copyleft")).toBeLessThan(severityRank("strong-copyleft"));
    expect(severityRank("strong-copyleft")).toBeLessThan(severityRank("unknown"));
    expect(SEVERITY_ORDER.permissive).toBe(0);
  });
  it("flags a licence stricter than maxSeverity", () => {
    expect(evaluatePolicy("GPL-3.0", { maxSeverity: "weak-copyleft" })).toBe("severity");
    expect(evaluatePolicy("LGPL-3.0", { maxSeverity: "weak-copyleft" })).toBeNull();
    expect(evaluatePolicy("MIT", { maxSeverity: "permissive" })).toBeNull();
  });
  it("treats unknown/null as the most severe", () => {
    expect(evaluatePolicy(null, { maxSeverity: "strong-copyleft" })).toBe("severity");
    expect(evaluatePolicy("MIT", { maxSeverity: "unknown" })).toBeNull();
  });
  it("deny still takes precedence over the severity gate", () => {
    expect(evaluatePolicy("GPL-3.0", { deny: ["GPL-*"], maxSeverity: "unknown" })).toBe("deny");
  });
  it("collects severity violations through summarizeLicenses", () => {
    const s = summarizeLicenses([pkg("b", "2.0.0", "GPL-3.0")], { maxSeverity: "weak-copyleft" });
    expect(s.violations).toHaveLength(1);
    expect(s.violations[0]!.reason).toBe("severity");
  });
});

describe("summarizeLicenses", () => {
  const installed = [
    pkg("a", "1.0.0", "MIT"),
    pkg("a", "1.0.0", "MIT"), // dup same version → deduped
    pkg("b", "2.0.0", "GPL-3.0"),
    pkg("c", "1.0.0", null),
  ];
  it("dedupes by name@version and tallies categories", () => {
    const s = summarizeLicenses(installed);
    expect(s.entries).toHaveLength(3);
    expect(s.totals.permissive).toBe(1);
    expect(s.totals["strong-copyleft"]).toBe(1);
    expect(s.totals.unknown).toBe(1);
    expect(s.byLicense["MIT"]).toBe(1);
    expect(s.byLicense["UNKNOWN"]).toBe(1);
  });
  it("collects policy violations", () => {
    const s = summarizeLicenses(installed, { deny: ["GPL-*"] });
    expect(s.violations).toHaveLength(1);
    expect(s.violations[0]!.name).toBe("b");
    expect(s.violations[0]!.reason).toBe("deny");
  });
});
