import { describe, it, expect } from "vitest";
import { parseCommit, parseCommits } from "./commit.js";

describe("parseCommit — header", () => {
  it("parses type + subject", () => {
    const c = parseCommit("feat: add a widget");
    expect(c.type).toBe("feat");
    expect(c.scope).toBeUndefined();
    expect(c.subject).toBe("add a widget");
    expect(c.breaking).toBe(false);
    expect(c.conventional).toBe(true);
  });

  it("parses scope", () => {
    const c = parseCommit("fix(api): handle nulls");
    expect(c.type).toBe("fix");
    expect(c.scope).toBe("api");
    expect(c.subject).toBe("handle nulls");
  });

  it("lower-cases the type", () => {
    expect(parseCommit("FEAT: x").type).toBe("feat");
  });

  it("accepts custom types", () => {
    const c = parseCommit("wip(ui): sketch");
    expect(c.type).toBe("wip");
    expect(c.conventional).toBe(true);
  });
});

describe("parseCommit — breaking", () => {
  it("detects the ! marker", () => {
    const c = parseCommit("feat!: overhaul");
    expect(c.breaking).toBe(true);
  });
  it("detects ! with a scope", () => {
    const c = parseCommit("refactor(core)!: drop v1");
    expect(c.breaking).toBe(true);
    expect(c.scope).toBe("core");
  });
  it("detects a BREAKING CHANGE footer", () => {
    const c = parseCommit("feat: new api\n\nBREAKING CHANGE: the old one is gone");
    expect(c.breaking).toBe(true);
    expect(c.breakingDescription).toBe("the old one is gone");
  });
  it("detects BREAKING-CHANGE (hyphen)", () => {
    const c = parseCommit("feat: x\n\nBREAKING-CHANGE: y");
    expect(c.breaking).toBe(true);
  });
});

describe("parseCommit — body, footers, refs", () => {
  it("separates body from subject", () => {
    const c = parseCommit("feat: thing\n\nA longer explanation\nover two lines.");
    expect(c.subject).toBe("thing");
    expect(c.body).toBe("A longer explanation\nover two lines.");
  });

  it("parses Closes / Refs footers into references", () => {
    const c = parseCommit("fix: bug\n\nCloses #12\nRefs #34");
    const issues = c.references.map((r) => r.issue).sort();
    expect(issues).toEqual(["12", "34"]);
    expect(c.references.find((r) => r.issue === "12")?.action).toBe("closes");
  });

  it("parses inline references in the subject", () => {
    const c = parseCommit("fix: correct thing, fixes #99");
    expect(c.references.some((r) => r.issue === "99")).toBe(true);
  });

  it("parses co-authors", () => {
    const c = parseCommit(
      "feat: pair work\n\nCo-authored-by: Jane Doe <jane@example.com>",
    );
    expect(c.coAuthors).toEqual([{ name: "Jane Doe", email: "jane@example.com" }]);
  });

  it("keeps arbitrary footers", () => {
    const c = parseCommit("feat: x\n\nReviewed-by: Bob\nCloses #5");
    expect(c.footers.some((f) => f.key === "Reviewed-by" && f.value === "Bob")).toBe(true);
  });
});

describe("parseCommit — PR number", () => {
  it("extracts a trailing (#123)", () => {
    const c = parseCommit("feat(api): add pagination (#123)");
    expect(c.prNumber).toBe("123");
    expect(c.subject).toBe("add pagination");
    expect(c.scope).toBe("api");
  });
  it("does not treat mid-subject #n as a PR number", () => {
    const c = parseCommit("fix: issue #45 in the parser");
    expect(c.prNumber).toBeUndefined();
    expect(c.references.some((r) => r.issue === "45")).toBe(true);
  });
});

describe("parseCommit — revert & non-conventional", () => {
  it("flags revert type", () => {
    const c = parseCommit("revert: feat: add a widget");
    expect(c.revert).toBe(true);
    expect(c.type).toBe("revert");
  });
  it("flags a Revert \"...\" subject", () => {
    const c = parseCommit('Revert "feat: add a widget"');
    expect(c.revert).toBe(true);
  });
  it("buckets a non-conventional message", () => {
    const c = parseCommit("just did some stuff");
    expect(c.conventional).toBe(false);
    expect(c.type).toBe("");
    expect(c.subject).toBe("just did some stuff");
  });
  it("passes through metadata", () => {
    const c = parseCommit({
      message: "feat: x",
      hash: "abcdef1234",
      authorName: "A",
      authorEmail: "a@b.c",
      date: "2026-01-01T00:00:00Z",
    });
    expect(c.hash).toBe("abcdef1234");
    expect(c.authorName).toBe("A");
  });
});

describe("parseCommits", () => {
  it("parses an array", () => {
    const list = parseCommits(["feat: a", "fix: b", "chore: c"]);
    expect(list.map((c) => c.type)).toEqual(["feat", "fix", "chore"]);
  });
});
