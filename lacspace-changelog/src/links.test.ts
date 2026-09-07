import { describe, it, expect } from "vitest";
import {
  buildCompareLink,
  linkifyIssues,
  linkifyShas,
  linkifyRefs,
} from "./links.js";
import { parseRepository, urlTemplates } from "./repo.js";

const gh = urlTemplates(parseRepository("https://github.com/o/r"));
const gl = urlTemplates(parseRepository("https://gitlab.com/o/r"));

describe("buildCompareLink", () => {
  it("builds a github compare link from a repo url", () => {
    expect(buildCompareLink("https://github.com/o/r.git", "v1.0.0", "v1.1.0")).toBe(
      "https://github.com/o/r/compare/v1.0.0...v1.1.0",
    );
  });
  it("builds a gitlab compare link with /-/ path", () => {
    expect(buildCompareLink("git@gitlab.com:o/r.git", "v1", "v2")).toBe(
      "https://gitlab.com/o/r/-/compare/v1...v2",
    );
  });
  it("returns empty string for an unparseable repo", () => {
    expect(buildCompareLink(null, "a", "b")).toBe("");
    expect(buildCompareLink("not a url", "a", "b")).toBe("");
  });
});

describe("linkifyIssues", () => {
  it("linkifies a bare #123 reference", () => {
    expect(linkifyIssues("fixes #123 today", gh)).toBe(
      "fixes [#123](https://github.com/o/r/issues/123) today",
    );
  });
  it("linkifies at the start of a string", () => {
    expect(linkifyIssues("#7 done", gh)).toBe(
      "[#7](https://github.com/o/r/issues/7) done",
    );
  });
  it("uses gitlab issue paths", () => {
    expect(linkifyIssues("see #9", gl)).toContain("/-/issues/9");
  });
  it("leaves an already-bracketed reference alone", () => {
    const already = "[#12](https://github.com/o/r/issues/12)";
    expect(linkifyIssues(already, gh)).toBe(already);
  });
  it("no-ops without a base url", () => {
    const none = urlTemplates(null);
    expect(linkifyIssues("fix #1", none)).toBe("fix #1");
  });
});

describe("linkifyShas", () => {
  it("linkifies a bare sha and shortens the label", () => {
    expect(linkifyShas("in abcdef1234567 fixed", gh)).toBe(
      "in [abcdef1](https://github.com/o/r/commit/abcdef1234567) fixed",
    );
  });
  it("ignores all-decimal words", () => {
    expect(linkifyShas("issue 1234567", gh)).toBe("issue 1234567");
  });
  it("no-ops without a base url", () => {
    const none = urlTemplates(null);
    expect(linkifyShas("abcdef1", none)).toBe("abcdef1");
  });
});

describe("linkifyRefs", () => {
  it("linkifies both issues and shas in one pass", () => {
    const out = linkifyRefs("fix #5 in deadbeef", gh);
    expect(out).toContain("[#5](https://github.com/o/r/issues/5)");
    expect(out).toContain("[deadbee](https://github.com/o/r/commit/deadbeef)");
  });
});
