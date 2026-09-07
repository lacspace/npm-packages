import { describe, it, expect } from "vitest";
import { parseCommits } from "./commit.js";
import { collectContributors, renderContributors } from "./contributors.js";

function withAuthors(): ReturnType<typeof parseCommits> {
  return parseCommits([
    { message: "feat: a", authorName: "Ann", authorEmail: "ann@x.com" },
    { message: "fix: b", authorName: "Bob", authorEmail: "bob@x.com" },
    { message: "fix: c", authorName: "Ann", authorEmail: "ann@x.com" },
    // same person, different display name, same email → one contributor
    { message: "docs: d", authorName: "Ann M", authorEmail: "ann@x.com" },
  ]);
}

describe("collectContributors — dedupe & sort", () => {
  it("dedupes by email and counts commits", () => {
    const people = collectContributors(withAuthors());
    expect(people).toHaveLength(2);
    const ann = people.find((p) => p.email === "ann@x.com")!;
    expect(ann.count).toBe(3);
  });

  it("sorts by count desc, then name asc", () => {
    const people = collectContributors(withAuthors());
    expect(people[0]!.email).toBe("ann@x.com"); // 3 commits
    expect(people[1]!.email).toBe("bob@x.com"); // 1 commit
  });

  it("breaks count ties by name ascending", () => {
    const commits = parseCommits([
      { message: "feat: a", authorName: "Zed", authorEmail: "z@x.com" },
      { message: "feat: b", authorName: "Amy", authorEmail: "a@x.com" },
    ]);
    const people = collectContributors(commits);
    expect(people[0]!.name).toBe("Amy");
    expect(people[1]!.name).toBe("Zed");
  });

  it("credits co-authors by default", () => {
    const commits = parseCommits([
      {
        message: "feat: pair\n\nCo-authored-by: Cara <cara@x.com>",
        authorName: "Ann",
        authorEmail: "ann@x.com",
      },
    ]);
    const people = collectContributors(commits);
    expect(people.map((p) => p.email).sort()).toEqual(["ann@x.com", "cara@x.com"]);
  });

  it("can skip co-authors", () => {
    const commits = parseCommits([
      {
        message: "feat: pair\n\nCo-authored-by: Cara <cara@x.com>",
        authorName: "Ann",
        authorEmail: "ann@x.com",
      },
    ]);
    const people = collectContributors(commits, { includeCoAuthors: false });
    expect(people).toHaveLength(1);
  });

  it("excludes bots by rule", () => {
    const commits = parseCommits([
      { message: "chore: x", authorName: "dependabot[bot]", authorEmail: "bot@github.com" },
      { message: "feat: y", authorName: "Ann", authorEmail: "ann@x.com" },
    ]);
    const people = collectContributors(commits, { exclude: ["[bot]"] });
    expect(people).toHaveLength(1);
    expect(people[0]!.name).toBe("Ann");
  });

  it("falls back to name when there is no email", () => {
    const commits = parseCommits([{ message: "feat: a", authorName: "NoEmail" }]);
    const people = collectContributors(commits);
    expect(people[0]!.name).toBe("NoEmail");
    expect(people[0]!.email).toBeUndefined();
  });
});

describe("renderContributors", () => {
  it("renders a heading and a list, with counts for repeats", () => {
    const md = renderContributors(collectContributors(withAuthors()));
    expect(md).toContain("### Contributors");
    expect(md).toContain("- Ann (3)");
    expect(md).toContain("- Bob");
    expect(md).not.toContain("- Bob (1)"); // singletons show no count
  });

  it("returns empty string for no contributors", () => {
    expect(renderContributors([])).toBe("");
  });

  it("honours a custom title and heading level", () => {
    const md = renderContributors([{ name: "Ann", count: 1 }], {
      title: "Thanks",
      headingLevel: 2,
    });
    expect(md).toContain("## Thanks");
  });
});
