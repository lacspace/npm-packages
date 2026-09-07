import { describe, it, expect } from "vitest";
import { generateLicense, fillTemplate } from "./generate.js";
import { resolveId, metaOf, supportedIds, templateOf } from "./spdx.js";

describe("generateLicense — placeholder fill", () => {
  it("fills author/year/holder for MIT", () => {
    const g = generateLicense("MIT", { holder: "Lacspace", year: 2026 });
    expect(g.id).toBe("MIT");
    expect(g.filled).toBe(true);
    expect(g.text).toContain("Copyright (c) 2026 Lacspace");
    expect(g.text).not.toContain("{{");
    expect(g.text.endsWith("\n")).toBe(true);
  });

  it("fills ISC and BSD-3 copyright lines", () => {
    expect(generateLicense("ISC", { holder: "Acme", year: 2020 }).text).toContain("Copyright 2020 Acme");
    expect(generateLicense("BSD-3-Clause", { holder: "Acme", year: 2021 }).text).toContain("Copyright (c) 2021 Acme");
  });

  it("defaults the year to the current year when omitted", () => {
    const y = String(new Date().getFullYear());
    expect(generateLicense("MIT", { holder: "X" }).text).toContain(`Copyright (c) ${y} X`);
  });

  it("fills the Apache-2.0 appendix boilerplate too", () => {
    const g = generateLicense("Apache-2.0", { holder: "Lacspace", year: 2026 });
    expect(g.text).toContain("Apache License");
    expect(g.text).toContain("Copyright 2026 Lacspace");
    expect(g.text).not.toContain("[yyyy]");
    expect(g.text).not.toContain("[name of copyright owner]");
  });

  it("fills the Lacspace Free Licence copyright line", () => {
    const g = generateLicense("LacspaceFree-1.0", { holder: "Lacspace", year: 2026 });
    expect(g.text).toContain("Lacspace Free Licence");
    expect(g.text).toContain("Copyright (c) 2026 Lacspace");
  });

  it("leaves fixed-text licences untouched (no fields)", () => {
    const un = metaOf("Unlicense");
    expect(un.hasFields).toBe(false);
    const g = generateLicense("Unlicense", { holder: "X", year: 2026 });
    expect(g.filled).toBe(false);
    expect(g.text).toContain("This is free and unencumbered software");
  });

  it("supports a year range string", () => {
    expect(generateLicense("MIT", { holder: "X", year: "2023-2026" }).text).toContain("Copyright (c) 2023-2026 X");
  });

  it("uses a placeholder when no holder is given", () => {
    expect(fillTemplate("Copyright {{year}} {{holder}}", { year: 2000 })).toBe(
      "Copyright 2000 <name of copyright holder>",
    );
  });
});

describe("spdx metadata", () => {
  it("resolves canonical ids, aliases and case", () => {
    expect(resolveId("mit")).toBe("MIT");
    expect(resolveId("Apache2")).toBe("Apache-2.0");
    expect(resolveId("GPL-3.0")).toBe("GPL-3.0-only");
    expect(resolveId("lacspace")).toBe("LacspaceFree-1.0");
    expect(resolveId("nope")).toBeNull();
  });

  it("exposes at least 12 licences, each with embedded text", () => {
    const ids = supportedIds();
    expect(ids.length).toBeGreaterThanOrEqual(12);
    for (const id of ids) {
      expect(templateOf(id).length).toBeGreaterThan(50);
    }
  });

  it("throws on an unsupported id", () => {
    expect(() => generateLicense("WTFPL")).toThrow(/Unsupported/);
  });
});
