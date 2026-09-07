import { describe, it, expect } from "vitest";
import { findDuplicates, compareVersions } from "./duplicates.js";
import type { InstalledPackage } from "./inventory.js";

const p = (name: string, version: string, path: string, depth = 0): InstalledPackage => ({
  name, version, path, dir: `/x/${path}`, depth, direct: depth === 0,
  dev: false, license: "MIT", dependencies: [],
});

describe("compareVersions", () => {
  it("orders numerically, not lexically", () => {
    expect(compareVersions("1.2.0", "1.10.0")).toBeLessThan(0);
    expect(compareVersions("2.0.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
  it("tolerates range prefixes", () => {
    expect(compareVersions("^1.0.0", "~1.0.0")).toBe(0);
  });
});

describe("findDuplicates", () => {
  it("flags packages installed at multiple versions with their locations", () => {
    const installed = [
      p("esbuild", "0.21.5", "node_modules/vite/node_modules/esbuild", 2),
      p("esbuild", "0.27.7", "node_modules/esbuild", 0),
      p("lodash", "4.17.21", "node_modules/lodash"),
    ];
    const dups = findDuplicates(installed);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.name).toBe("esbuild");
    expect(dups[0]!.versions).toEqual(["0.21.5", "0.27.7"]);
    expect(dups[0]!.copies).toBe(2);
    expect(dups[0]!.locations["0.27.7"]).toEqual(["node_modules/esbuild"]);
  });

  it("does not flag a package present twice at the SAME version", () => {
    const installed = [
      p("dupe", "1.0.0", "node_modules/dupe"),
      p("dupe", "1.0.0", "node_modules/x/node_modules/dupe", 2),
    ];
    expect(findDuplicates(installed)).toHaveLength(0);
  });

  it("returns empty when everything is single-version", () => {
    expect(findDuplicates([p("a", "1.0.0", "node_modules/a")])).toEqual([]);
  });
});
