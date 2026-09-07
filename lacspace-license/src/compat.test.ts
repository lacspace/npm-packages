import { describe, it, expect } from "vitest";
import { checkCompatibility, verdictFor } from "./compat.js";

describe("checkCompatibility — permissive project", () => {
  it("accepts permissive & public-domain dependencies", () => {
    const r = checkCompatibility("MIT", ["Apache-2.0", "ISC", "BSD-3-Clause", "Unlicense", "CC0-1.0"]);
    expect(r.ok).toBe(true);
    expect(r.incompatible).toEqual([]);
    expect(r.issues.every((i) => i.verdict === "compatible")).toBe(true);
  });

  it("flags a GPL dependency in an MIT project as incompatible", () => {
    const r = checkCompatibility("MIT", ["Apache-2.0", "GPL-3.0-only"]);
    expect(r.ok).toBe(false);
    expect(r.incompatible).toEqual(["GPL-3.0-only"]);
    const gpl = r.issues.find((i) => i.canonical === "GPL-3.0-only")!;
    expect(gpl.verdict).toBe("incompatible");
    expect(gpl.reason).toMatch(/strong copyleft/i);
  });

  it("flags an AGPL dependency in a permissive project as incompatible", () => {
    const r = checkCompatibility("Apache-2.0", ["AGPL-3.0-only"]);
    expect(r.ok).toBe(false);
    expect(r.incompatible).toEqual(["AGPL-3.0-only"]);
  });

  it("marks weak-copyleft deps (LGPL, MPL) for review, not failure", () => {
    const r = checkCompatibility("MIT", ["LGPL-3.0-only", "MPL-2.0"]);
    expect(r.ok).toBe(true); // review does not fail the gate
    expect(r.review.sort()).toEqual(["LGPL-3.0-only", "MPL-2.0"]);
    expect(r.issues.every((i) => i.verdict === "review")).toBe(true);
  });
});

describe("checkCompatibility — copyleft project", () => {
  it("absorbs permissive and weak-copyleft deps", () => {
    const r = checkCompatibility("GPL-3.0-only", ["MIT", "Apache-2.0", "LGPL-3.0-only", "MPL-2.0"]);
    expect(r.ok).toBe(true);
    expect(r.issues.every((i) => i.verdict === "compatible")).toBe(true);
  });

  it("treats an identical GPL dep as compatible", () => {
    const r = checkCompatibility("GPL-3.0-only", ["GPL-3.0-only"]);
    expect(r.issues[0]!.verdict).toBe("compatible");
  });

  it("marks an AGPL dep in a GPL project for review (stronger licence)", () => {
    const r = checkCompatibility("GPL-3.0-only", ["AGPL-3.0-only"]);
    expect(r.ok).toBe(true);
    expect(r.review).toEqual(["AGPL-3.0-only"]);
    expect(r.issues[0]!.reason).toMatch(/stronger/i);
  });

  it("lets an AGPL project absorb a GPL dependency", () => {
    const r = checkCompatibility("AGPL-3.0-only", ["GPL-3.0-only"]);
    expect(r.issues[0]!.verdict).toBe("compatible");
  });
});

describe("checkCompatibility — resolution & unknowns", () => {
  it("resolves aliases on both sides", () => {
    const r = checkCompatibility("mit", ["gpl-3.0"]);
    expect(r.project).toBe("MIT");
    expect(r.incompatible).toEqual(["gpl-3.0"]);
    expect(r.issues[0]!.canonical).toBe("GPL-3.0-only");
  });

  it("reports unknown project or dependency ids", () => {
    expect(checkCompatibility("WTFPL", ["MIT"]).issues[0]!.verdict).toBe("unknown");
    const r = checkCompatibility("MIT", ["MIT", "Nonsense-9.9"]);
    expect(r.unknown).toEqual(["Nonsense-9.9"]);
    expect(r.ok).toBe(true); // unknown alone doesn't fail
  });

  it("preserves input order and echoes the raw dep string", () => {
    const r = checkCompatibility("MIT", ["Apache-2.0", "GPL-3.0-only"]);
    expect(r.issues.map((i) => i.dep)).toEqual(["Apache-2.0", "GPL-3.0-only"]);
  });
});

describe("verdictFor — single pairing", () => {
  it("same licence is always compatible", () => {
    expect(verdictFor("Apache-2.0", "Apache-2.0").verdict).toBe("compatible");
  });
  it("MPL into MIT needs review, MPL into GPL is compatible", () => {
    expect(verdictFor("MIT", "MPL-2.0").verdict).toBe("review");
    expect(verdictFor("GPL-3.0-only", "MPL-2.0").verdict).toBe("compatible");
  });
});
