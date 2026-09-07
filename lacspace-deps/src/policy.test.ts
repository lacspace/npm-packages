import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  normalizeConfig,
  mergeConfig,
  configToPolicy,
  configToAuditOptions,
  findConfigPath,
  loadConfig,
} from "./policy.js";
import type { DepsConfig } from "./policy.js";

const tmpDirs: string[] = [];
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true });
});
function tmp(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "lacdeps-cfg-"));
  tmpDirs.push(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return dir;
}

describe("normalizeConfig", () => {
  it("accepts the flat form", () => {
    expect(normalizeConfig({
      allow: ["MIT", "BSD-*"], deny: ["GPL-*"], maxSeverity: "weak-copyleft",
      failOn: ["missing", "duplicates"], ignoreUnused: ["tool"], prod: true, gzip: true,
    })).toEqual({
      allow: ["MIT", "BSD-*"], deny: ["GPL-*"], maxSeverity: "weak-copyleft",
      failOn: ["missing", "duplicates"], ignoreUnused: ["tool"], prod: true, gzip: true,
    });
  });
  it("accepts a nested policy object for the licence bits", () => {
    const c = normalizeConfig({ policy: { allow: ["MIT"], maxSeverity: "permissive" }, failOn: ["license"] });
    expect(c.allow).toEqual(["MIT"]);
    expect(c.maxSeverity).toBe("permissive");
    expect(c.failOn).toEqual(["license"]);
  });
  it("drops invalid / wrong-typed fields", () => {
    const c = normalizeConfig({
      allow: [1, "MIT", ""], deny: "GPL-*", maxSeverity: "banana",
      failOn: ["missing", "nope"], prod: "yes",
    });
    expect(c.allow).toEqual(["MIT"]);
    expect(c.deny).toBeUndefined();
    expect(c.maxSeverity).toBeUndefined();
    expect(c.failOn).toEqual(["missing"]);
    expect(c.prod).toBeUndefined();
  });
  it("returns {} for non-objects", () => {
    expect(normalizeConfig(null)).toEqual({});
    expect(normalizeConfig("x")).toEqual({});
    expect(normalizeConfig(42)).toEqual({});
  });
  it("dedupes failOn", () => {
    expect(normalizeConfig({ failOn: ["missing", "missing", "license"] }).failOn).toEqual(["missing", "license"]);
  });
});

describe("mergeConfig", () => {
  it("lets the override win, falling back to base", () => {
    const base: DepsConfig = { allow: ["MIT"], deny: ["GPL-*"], prod: true };
    const over: DepsConfig = { deny: ["AGPL-*"], maxSeverity: "permissive" };
    const m = mergeConfig(base, over);
    expect(m.allow).toEqual(["MIT"]);        // from base
    expect(m.deny).toEqual(["AGPL-*"]);      // override wins
    expect(m.maxSeverity).toBe("permissive");
    expect(m.prod).toBe(true);
  });
  it("keeps base arrays when override omits them", () => {
    expect(mergeConfig({ allow: ["MIT"] }, {}).allow).toEqual(["MIT"]);
  });
});

describe("configToPolicy / configToAuditOptions", () => {
  it("extracts only the licence policy", () => {
    expect(configToPolicy({ allow: ["MIT"], deny: ["GPL-*"], maxSeverity: "weak-copyleft", prod: true }))
      .toEqual({ allow: ["MIT"], deny: ["GPL-*"], maxSeverity: "weak-copyleft" });
  });
  it("maps prod/gzip/ignoreUnused into audit options", () => {
    const o = configToAuditOptions({ deny: ["GPL-*"], prod: true, gzip: true, ignoreUnused: ["t"] });
    expect(o.prod).toBe(true);
    expect(o.gzip).toBe(true);
    expect(o.usage).toEqual({ ignoreUnused: ["t"] });
    expect(o.policy).toEqual({ deny: ["GPL-*"] });
  });
  it("omits optional flags when absent", () => {
    const o = configToAuditOptions({ allow: ["MIT"] });
    expect(o.prod).toBeUndefined();
    expect(o.usage).toBeUndefined();
  });
});

describe("findConfigPath / loadConfig", () => {
  it("auto-discovers .depsrc.json", () => {
    const dir = tmp({ ".depsrc.json": JSON.stringify({ allow: ["MIT"] }) });
    expect(findConfigPath(dir)).toBe(join(dir, ".depsrc.json"));
    const { config, path } = loadConfig(dir);
    expect(config.allow).toEqual(["MIT"]);
    expect(path).toBe(join(dir, ".depsrc.json"));
  });
  it("returns an empty config + null path when nothing is present", () => {
    const dir = tmp({});
    expect(findConfigPath(dir)).toBeNull();
    expect(loadConfig(dir)).toEqual({ config: {}, path: null });
  });
  it("resolves an explicit relative path", () => {
    const dir = tmp({ "custom.json": JSON.stringify({ deny: ["GPL-*"] }) });
    const { config } = loadConfig(dir, "custom.json");
    expect(config.deny).toEqual(["GPL-*"]);
  });
  it("throws when an explicit path is missing", () => {
    const dir = tmp({});
    expect(() => loadConfig(dir, "nope.json")).toThrow(/not found/);
  });
  it("throws on invalid JSON in a discovered file", () => {
    const dir = tmp({ ".depsrc.json": "{ not json" });
    expect(() => loadConfig(dir)).toThrow(/Invalid JSON/);
  });
});
