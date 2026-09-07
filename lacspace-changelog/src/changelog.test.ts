import { describe, it, expect } from "vitest";
import { parseCommits } from "./commit.js";
import { renderSection, prependChangelog, DEFAULT_GROUPS } from "./changelog.js";
import { parseRepository, urlTemplates } from "./repo.js";

const ghUrls = urlTemplates(parseRepository("git+https://github.com/lacspace/npm-packages.git"));

describe("renderSection — grouping & order", () => {
  const commits = parseCommits([
    { message: "feat(api): add pagination (#12)", hash: "aaaaaaa1" },
    { message: "fix: correct off-by-one", hash: "bbbbbbb2" },
    { message: "perf: cache results", hash: "ccccccc3" },
    { message: "docs: update readme", hash: "ddddddd4" },
    { message: "chore: bump deps", hash: "eeeeeee5" },
  ]);

  it("renders a version title with the date", () => {
    const md = renderSection(commits, { version: "1.2.0", date: "2026-09-07" });
    expect(md).toContain("## 1.2.0 (2026-09-07)");
  });

  it("groups Features before Bug Fixes before Performance", () => {
    const md = renderSection(commits, { version: "1.2.0", date: "2026-09-07" });
    const iFeat = md.indexOf("### Features");
    const iFix = md.indexOf("### Bug Fixes");
    const iPerf = md.indexOf("### Performance");
    expect(iFeat).toBeGreaterThan(-1);
    expect(iFeat).toBeLessThan(iFix);
    expect(iFix).toBeLessThan(iPerf);
  });

  it("renders scope + subject", () => {
    const md = renderSection(commits, { version: "1.2.0" });
    expect(md).toContain("**api:** add pagination");
  });

  it("hides chore/docs by default", () => {
    const md = renderSection(commits, { version: "1.2.0" });
    expect(md).not.toContain("bump deps");
    expect(md).not.toContain("### Documentation");
  });

  it("can un-hide docs via hiddenTypes", () => {
    const md = renderSection(commits, { version: "1.2.0", hiddenTypes: [] });
    expect(md).toContain("### Documentation");
    expect(md).toContain("update readme");
  });
});

describe("renderSection — URL templating", () => {
  const commits = parseCommits([{ message: "feat(api): add x (#12)", hash: "abcdef1234" }]);

  it("links hash and PR on GitHub", () => {
    const md = renderSection(commits, { version: "1.2.0", urls: ghUrls });
    expect(md).toContain("[abcdef1](https://github.com/lacspace/npm-packages/commit/abcdef1234)");
    expect(md).toContain("[#12](https://github.com/lacspace/npm-packages/issues/12)");
  });

  it("adds a compare link when previousTag is set", () => {
    const md = renderSection(commits, { version: "1.2.0", urls: ghUrls, previousTag: "v1.1.0" });
    expect(md).toContain("[1.2.0](https://github.com/lacspace/npm-packages/compare/v1.1.0...v1.2.0)");
  });

  it("falls back to plain text without urls", () => {
    const md = renderSection(commits, { version: "1.2.0" });
    expect(md).toContain("(abcdef1, #12)");
    expect(md).not.toContain("http");
  });

  it("uses GitLab paths for a gitlab repo", () => {
    const gl = urlTemplates(parseRepository("https://gitlab.com/group/proj.git"));
    const md = renderSection(commits, { version: "1.2.0", urls: gl });
    expect(md).toContain("/-/commit/abcdef1234");
    expect(md).toContain("/-/issues/12");
  });
});

describe("renderSection — breaking & other", () => {
  it("renders a BREAKING CHANGES section first, using the footer description", () => {
    const commits = parseCommits([
      "feat: shiny\n\nBREAKING CHANGE: config format changed",
      "fix: small",
    ]);
    const md = renderSection(commits, { version: "2.0.0" });
    const iBreak = md.indexOf("BREAKING CHANGES");
    const iFix = md.indexOf("### Bug Fixes");
    expect(iBreak).toBeGreaterThan(-1);
    expect(iBreak).toBeLessThan(iFix);
    expect(md).toContain("config format changed");
  });

  it("buckets non-conventional commits under Other Changes", () => {
    const commits = parseCommits(["random work done", "feat: real"]);
    const md = renderSection(commits, { version: "1.1.0" });
    expect(md).toContain("### Other Changes");
    expect(md).toContain("random work done");
  });

  it("respects a custom group set", () => {
    const commits = parseCommits(["feat: a", "fix: b"]);
    const md = renderSection(commits, {
      version: "1.0.0",
      groups: [{ title: "What's New", types: ["feat", "fix"] }],
      hiddenTypes: [],
    });
    expect(md).toContain("### What's New");
    expect(md).toContain("- a");
    expect(md).toContain("- b");
  });
});

describe("prependChangelog", () => {
  const section = "## 1.1.0 (2026-09-07)\n\n### Features\n\n- new\n";

  it("creates a new changelog with a header", () => {
    const out = prependChangelog(section);
    expect(out).toContain("# Changelog");
    expect(out).toContain("## 1.1.0");
  });

  it("inserts above a prior entry, below the header", () => {
    const existing = "# Changelog\n\nintro text\n\n## 1.0.0 (2026-01-01)\n\n### Features\n\n- old\n";
    const out = prependChangelog(section, existing);
    const iHeader = out.indexOf("# Changelog");
    const iNew = out.indexOf("## 1.1.0");
    const iOld = out.indexOf("## 1.0.0");
    expect(iHeader).toBeLessThan(iNew);
    expect(iNew).toBeLessThan(iOld);
    expect(out).toContain("intro text");
    expect(out).toContain("- old");
  });

  it("appends when the existing file has no version entries", () => {
    const out = prependChangelog(section, "# Changelog\n\njust a header\n");
    expect(out).toContain("just a header");
    expect(out).toContain("## 1.1.0");
  });
});

describe("DEFAULT_GROUPS", () => {
  it("puts Features first", () => {
    expect(DEFAULT_GROUPS[0]!.title).toBe("Features");
  });
});
