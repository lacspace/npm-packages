import { describe, it, expect } from "vitest";
import {
  configToGroups,
  configToHidden,
  configToBumpOptions,
  resolveConfig,
  parseConfig,
} from "./config.js";
import type { ChangelogConfig } from "./config.js";
import { parseCommits } from "./commit.js";
import { recommendBump } from "./bump.js";
import { renderSection } from "./changelog.js";

const config: ChangelogConfig = {
  types: {
    feat: { section: "✨ New", bump: "minor" },
    fix: { section: "🐛 Fixes", bump: "patch" },
    ui: { section: "✨ New", bump: "minor" }, // shares a section with feat
    breaking: { section: "💥 Overhaul", bump: "major" },
    internal: { hidden: true },
  },
};

describe("configToGroups", () => {
  it("builds ordered groups, merging types that share a section", () => {
    const groups = configToGroups(config);
    const New = groups.find((g) => g.title === "✨ New")!;
    expect(New.types).toEqual(["feat", "ui"]);
    expect(groups[0]!.title).toBe("✨ New"); // first-seen order
  });
});

describe("configToHidden", () => {
  it("collects `hidden: true` types", () => {
    expect(configToHidden(config)).toContain("internal");
  });
  it("merges explicit hiddenTypes", () => {
    expect(configToHidden({ hiddenTypes: ["docs"], types: {} })).toEqual(["docs"]);
  });
});

describe("configToBumpOptions", () => {
  it("maps per-type bump levels to major/minor/patch type lists", () => {
    const opts = configToBumpOptions(config);
    expect(opts.minorTypes).toEqual(["feat", "ui"]);
    expect(opts.patchTypes).toEqual(["fix"]);
    expect(opts.majorTypes).toEqual(["breaking"]);
  });
});

describe("config-driven bump (recommendBump honours it)", () => {
  it("a config `major` type forces a major bump", () => {
    const commits = parseCommits(["breaking: rip it out", "fix: small"]);
    const r = recommendBump(commits, "1.2.3", configToBumpOptions(config));
    expect(r.level).toBe("major");
    expect(r.next).toBe("2.0.0");
  });
  it("a custom minor type bumps minor", () => {
    const commits = parseCommits(["ui: new button"]);
    const r = recommendBump(commits, "1.2.3", configToBumpOptions(config));
    expect(r.level).toBe("minor");
    expect(r.next).toBe("1.3.0");
  });
});

describe("config-driven grouping (renderSection honours it)", () => {
  it("routes commits into the configured sections", () => {
    const commits = parseCommits(["feat: a", "ui: b", "fix: c", "internal: d"]);
    const resolved = resolveConfig(config);
    const md = renderSection(commits, {
      version: "1.3.0",
      groups: resolved.groups!,
      hiddenTypes: resolved.hiddenTypes!,
      includeOther: false,
    });
    expect(md).toContain("### ✨ New");
    expect(md).toContain("- a");
    expect(md).toContain("- b");
    expect(md).toContain("### 🐛 Fixes");
    expect(md).not.toContain("- d"); // internal is hidden
  });
});

describe("resolveConfig", () => {
  it("returns groups, hiddenTypes and bumpOptions together", () => {
    const r = resolveConfig(config);
    expect(r.groups?.length).toBeGreaterThan(0);
    expect(r.hiddenTypes).toContain("internal");
    expect(r.bumpOptions.majorTypes).toEqual(["breaking"]);
  });
  it("leaves bump rules default when no type declares a bump", () => {
    const r = resolveConfig({ types: { feat: { section: "Features" } } });
    expect(r.bumpOptions.minorTypes).toBeUndefined();
  });
});

describe("parseConfig", () => {
  it("parses valid JSON", () => {
    expect(parseConfig('{"contributors":true}').contributors).toBe(true);
  });
  it("throws on non-object JSON", () => {
    expect(() => parseConfig("42")).toThrow();
  });
});
