import { describe, it, expect } from "vitest";
import {
  parseGitLog,
  readCommits,
  latestVersionTag,
  isGitRepo,
} from "./git.js";
import type { GitRunner } from "./git.js";
import { analyze } from "./release.js";
import { parseRepository, urlTemplates } from "./repo.js";

const FLD = String.fromCharCode(31);
const REC = String.fromCharCode(30);

function record(hash: string, name: string, email: string, date: string, msg: string): string {
  return [hash, name, email, date, msg].join(FLD) + REC;
}

describe("parseGitLog", () => {
  it("parses delimited records including multi-line bodies", () => {
    const out =
      record("h1", "Ann", "a@x.com", "2026-01-01T00:00:00Z", "feat: one\n\nbody line") +
      record("h2", "Bob", "b@x.com", "2026-01-02T00:00:00Z", "fix: two");
    const commits = parseGitLog(out);
    expect(commits).toHaveLength(2);
    expect(commits[0]!.hash).toBe("h1");
    expect(commits[0]!.authorName).toBe("Ann");
    expect(commits[0]!.message).toContain("body line");
    expect(commits[1]!.message).toBe("fix: two");
  });

  it("ignores empty output", () => {
    expect(parseGitLog("")).toEqual([]);
  });
});

function fakeRunner(map: Record<string, string>, calls: string[][] = []): GitRunner {
  return async (args: string[]) => {
    calls.push(args);
    const key = args.join(" ");
    for (const k of Object.keys(map)) {
      if (key.startsWith(k)) return map[k]!;
    }
    throw new Error(`no fake for: ${key}`);
  };
}

describe("readCommits (injected runner)", () => {
  it("builds a from..to range and parses output", async () => {
    const calls: string[][] = [];
    const out = record("abc1234", "Ann", "a@x.com", "2026-01-01T00:00:00Z", "feat: hi");
    const run = fakeRunner({ log: out }, calls);
    const commits = await readCommits(run, { from: "v1.0.0", to: "HEAD" });
    expect(commits[0]!.message).toBe("feat: hi");
    const logArgs = calls.find((c) => c[0] === "log")!;
    expect(logArgs).toContain("v1.0.0..HEAD");
  });
});

describe("latestVersionTag (injected runner)", () => {
  it("uses git describe when a tag matches", async () => {
    const run = fakeRunner({ "describe": "v1.2.3\n" });
    expect(await latestVersionTag(run)).toBe("v1.2.3");
  });
  it("falls back to a sorted tag list", async () => {
    const run: GitRunner = async (args) => {
      if (args[0] === "describe") throw new Error("no names found");
      if (args[0] === "tag") return "v2.0.0\nv1.9.0\n";
      throw new Error("x");
    };
    expect(await latestVersionTag(run)).toBe("v2.0.0");
  });
  it("returns null with no tags", async () => {
    const run: GitRunner = async () => "";
    expect(await latestVersionTag(run)).toBeNull();
  });
});

describe("isGitRepo", () => {
  it("true inside a worktree", async () => {
    const run = fakeRunner({ "rev-parse": "true\n" });
    expect(await isGitRepo(run)).toBe(true);
  });
  it("false when git errors", async () => {
    const run: GitRunner = async () => { throw new Error("not a repo"); };
    expect(await isGitRepo(run)).toBe(false);
  });
});

describe("analyze (end-to-end with a fake runner)", () => {
  it("detects the tag, reads commits and recommends a bump", async () => {
    const log =
      record("aaa1111", "Ann", "a@x.com", "2026-01-03T00:00:00Z", "feat(api): add x (#7)") +
      record("bbb2222", "Bob", "b@x.com", "2026-01-02T00:00:00Z", "fix: y");
    const run = fakeRunner({
      describe: "v1.0.0\n",
      log,
      "config --get remote.origin.url": "git@github.com:lacspace/npm-packages.git\n",
    });
    const a = await analyze(run, "1.0.0");
    expect(a.from).toBe("v1.0.0");
    expect(a.commits).toHaveLength(2);
    expect(a.bump.level).toBe("minor");
    expect(a.bump.next).toBe("1.1.0");
    expect(a.repositoryUrl).toContain("github.com");
  });

  it("strict mode drops non-conventional commits", async () => {
    const log =
      record("aaa1111", "Ann", "a@x.com", "2026-01-03T00:00:00Z", "feat: x") +
      record("bbb2222", "Bob", "b@x.com", "2026-01-02T00:00:00Z", "merge branch main");
    const run = fakeRunner({ describe: "v1.0.0\n", log, "config": "" });
    const a = await analyze(run, "1.0.0", { strict: true });
    expect(a.commits).toHaveLength(1);
  });
});

describe("repo templates integration", () => {
  it("scp url normalises to github web url", () => {
    const info = parseRepository("git@github.com:owner/repo.git")!;
    expect(info.host).toBe("github");
    expect(urlTemplates(info).baseUrl).toBe("https://github.com/owner/repo");
  });
});
