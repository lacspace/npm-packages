import { describe, it, expect } from "vitest";
import { parseCommits } from "./commit.js";
import {
  collectBreaking,
  hasBreaking,
  hasBreakingFooter,
  hasBangBreaking,
} from "./breaking.js";

describe("collectBreaking — detection from both syntaxes", () => {
  it("detects the `type!:` bang", () => {
    const [c] = parseCommits(["feat!: drop the legacy client"]);
    const found = collectBreaking([c!]);
    expect(found).toHaveLength(1);
    expect(found[0]!.syntax).toContain("bang");
    expect(found[0]!.description).toBe("drop the legacy client");
  });

  it("detects a `BREAKING CHANGE:` footer and uses its description", () => {
    const [c] = parseCommits([
      "feat: shiny thing\n\nBREAKING CHANGE: the config format changed",
    ]);
    const found = collectBreaking([c!]);
    expect(found).toHaveLength(1);
    expect(found[0]!.syntax).toContain("footer");
    expect(found[0]!.description).toBe("the config format changed");
  });

  it("detects the `BREAKING-CHANGE:` hyphen spelling too", () => {
    const [c] = parseCommits(["fix: x\n\nBREAKING-CHANGE: gone"]);
    expect(hasBreakingFooter(c!)).toBe(true);
    expect(collectBreaking([c!])[0]!.description).toBe("gone");
  });

  it("reports both syntaxes when a commit uses bang AND footer", () => {
    const [c] = parseCommits([
      "refactor(api)!: rework\n\nBREAKING CHANGE: signatures changed",
    ]);
    const found = collectBreaking([c!]);
    expect(found[0]!.syntax).toEqual(expect.arrayContaining(["bang", "footer"]));
    expect(found[0]!.scope).toBe("api");
  });

  it("carries the scope and hash through", () => {
    const c = parseCommits([{ message: "feat(core)!: boom", hash: "deadbee" }])[0]!;
    const bc = collectBreaking([c])[0]!;
    expect(bc.scope).toBe("core");
    expect(bc.hash).toBe("deadbee");
  });

  it("ignores non-breaking commits", () => {
    const commits = parseCommits(["feat: a", "fix: b", "chore: c"]);
    expect(collectBreaking(commits)).toHaveLength(0);
    expect(hasBreaking(commits)).toBe(false);
  });

  it("hasBreaking is true when any commit breaks", () => {
    const commits = parseCommits(["fix: a", "feat!: b"]);
    expect(hasBreaking(commits)).toBe(true);
  });

  it("hasBangBreaking distinguishes a bang from a footer", () => {
    const [bang, footer] = parseCommits([
      "feat!: x",
      "feat: y\n\nBREAKING CHANGE: z",
    ]);
    expect(hasBangBreaking(bang!)).toBe(true);
    expect(hasBangBreaking(footer!)).toBe(false);
  });
});
