import { describe, it, expect } from "vitest";
import { parseCommits } from "./commit.js";
import {
  renderSection,
  prependChangelog,
  parseVersionHeaders,
  changelogHasVersion,
  DEFAULT_GROUPS,
} from "./changelog.js";
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

describe("renderSection — contributors section", () => {
  const commits = parseCommits([
    { message: "feat: a", authorName: "Ann", authorEmail: "ann@x.com" },
    { message: "fix: b", authorName: "Bob", authorEmail: "bob@x.com" },
  ]);

  it("omits the Contributors section by default", () => {
    const md = renderSection(commits, { version: "1.0.0" });
    expect(md).not.toContain("Contributors");
  });

  it("appends a Contributors section when asked", () => {
    const md = renderSection(commits, { version: "1.0.0", contributors: true });
    expect(md).toContain("### Contributors");
    expect(md).toContain("- Ann");
    expect(md).toContain("- Bob");
  });

  it("honours a custom contributors title", () => {
    const md = renderSection(commits, {
      version: "1.0.0",
      contributors: true,
      contributorsTitle: "Thanks to",
    });
    expect(md).toContain("### Thanks to");
  });
});

describe("parseVersionHeaders / changelogHasVersion", () => {
  const md = [
    "# Changelog",
    "",
    "## [1.2.0](https://github.com/o/r/compare/v1.1.0...v1.2.0) (2026-09-07)",
    "",
    "### Features",
    "- x",
    "",
    "## 1.1.0 (2026-08-01)",
    "",
    "## [1.0.0] - 2026-01-01",
  ].join("\n");

  it("extracts every version, linked or plain, keep-a-changelog or not", () => {
    expect(parseVersionHeaders(md)).toEqual(["1.2.0", "1.1.0", "1.0.0"]);
  });

  it("changelogHasVersion normalises a leading v", () => {
    expect(changelogHasVersion(md, "1.1.0")).toBe(true);
    expect(changelogHasVersion(md, "v1.0.0")).toBe(true);
    expect(changelogHasVersion(md, "9.9.9")).toBe(false);
  });
});

describe("prependChangelog — dedupe on merge", () => {
  const existing =
    "# Changelog\n\n## 1.1.0 (2026-01-01)\n\n### Features\n\n- old\n";

  it("skips a version that already exists when skipIfExists is set", () => {
    const section = "## 1.1.0 (2026-09-07)\n\n### Features\n\n- dup\n";
    const out = prependChangelog(section, existing, {
      version: "1.1.0",
      skipIfExists: true,
    });
    expect(out).toBe(existing);
    expect(out).not.toContain("- dup");
  });

  it("still prepends a genuinely new version", () => {
    const section = "## 1.2.0 (2026-09-07)\n\n### Features\n\n- new\n";
    const out = prependChangelog(section, existing, {
      version: "1.2.0",
      skipIfExists: true,
    });
    expect(out.indexOf("## 1.2.0")).toBeLessThan(out.indexOf("## 1.1.0"));
    expect(out).toContain("- new");
  });

  it("prepends duplicates when skipIfExists is off (back-compat)", () => {
    const section = "## 1.1.0 (2026-09-07)\n\n### Features\n\n- dup\n";
    const out = prependChangelog(section, existing);
    expect(out).toContain("- dup");
    expect(out).toContain("- old");
  });
});
