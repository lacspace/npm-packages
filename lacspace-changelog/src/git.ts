/**
 * Git integration. All shelling out uses `execFile` with an argument array —
 * never a shell string — so commit messages and refs can never be interpreted
 * by a shell. Every function accepts an injectable `run` provider, so tests
 * (and the pure library path) never touch a real repository.
 */
import { execFile } from "node:child_process";
import type { RawCommit } from "./commit.js";

/** A function that runs `git <args>` and returns stdout. Injectable for tests. */
export type GitRunner = (args: string[]) => Promise<string>;

/** The default runner: spawns the real `git` binary in `cwd`. */
export function realGit(cwd = process.cwd()): GitRunner {
  return (args: string[]) =>
    new Promise<string>((resolve, reject) => {
      execFile(
        "git",
        args,
        { cwd, maxBuffer: 64 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            const e = err as NodeJS.ErrnoException & { stderr?: string };
            e.stderr = stderr;
            reject(err);
            return;
          }
          resolve(stdout);
        },
      );
    });
}

// Control characters unlikely to appear in commit text.
const REC = String.fromCharCode(30); // record separator (RS)
const FLD = String.fromCharCode(31); // unit separator (US)

/** True when `run` points at a working git repository. */
export async function isGitRepo(run: GitRunner): Promise<boolean> {
  try {
    const out = await run(["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * The latest reachable `vX.Y.Z` (or `X.Y.Z`) tag, or null when there are no
 * matching tags. Uses `git describe` then falls back to a sorted tag list.
 */
export async function latestVersionTag(run: GitRunner): Promise<string | null> {
  try {
    const out = await run([
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      "v[0-9]*",
    ]);
    const tag = out.trim();
    if (tag) return tag;
  } catch {
    // no match — fall through to a full sorted list
  }
  try {
    const out = await run(["tag", "--list", "--sort=-v:refname", "v*"]);
    const first = out.split("\n").map((s) => s.trim()).find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}

/** The remote origin URL, or null. */
export async function remoteUrl(run: GitRunner): Promise<string | null> {
  try {
    const out = await run(["config", "--get", "remote.origin.url"]);
    return out.trim() || null;
  } catch {
    return null;
  }
}

export interface LogOptions {
  /** Start ref (exclusive), e.g. a tag. When omitted, from the repo root. */
  from?: string;
  /** End ref (inclusive), default HEAD. */
  to?: string;
}

/**
 * Read commits in `(from, to]` as {@link RawCommit}s. Uses a custom `--pretty`
 * format delimited by control characters, so multi-line bodies survive intact.
 */
export async function readCommits(
  run: GitRunner,
  opts: LogOptions = {},
): Promise<RawCommit[]> {
  const range =
    opts.from && opts.to
      ? `${opts.from}..${opts.to}`
      : opts.from
        ? `${opts.from}..${opts.to ?? "HEAD"}`
        : (opts.to ?? "HEAD");
  const format = ["%H", "%an", "%ae", "%aI", "%B"].join(FLD) + REC;
  const args = ["log", `--pretty=format:${format}`, range];
  const out = await run(args);
  return parseGitLog(out);
}

/**
 * Parse the delimited output of {@link readCommits}'s `git log` format into
 * {@link RawCommit}s. Exported so it can be unit-tested without git.
 */
export function parseGitLog(stdout: string): RawCommit[] {
  const records = stdout.split(REC).map((r) => r.replace(/^\n/, "")).filter((r) => r.trim() !== "");
  const commits: RawCommit[] = [];
  for (const rec of records) {
    const parts = rec.split(FLD);
    if (parts.length < 5) continue;
    const [hash, authorName, authorEmail, date, ...rest] = parts;
    commits.push({
      hash: (hash ?? "").trim(),
      authorName: (authorName ?? "").trim(),
      authorEmail: (authorEmail ?? "").trim(),
      date: (date ?? "").trim(),
      message: rest.join(FLD).trim(),
    });
  }
  return commits;
}

/** Read the current `HEAD` short hash. */
export async function headHash(run: GitRunner): Promise<string | null> {
  try {
    const out = await run(["rev-parse", "--short", "HEAD"]);
    return out.trim() || null;
  } catch {
    return null;
  }
}

// --- mutating operations (opt-in from the CLI) --------------------------

/** Stage a file and commit it as `chore(release): <version>`. */
export async function commitRelease(
  run: GitRunner,
  files: string[],
  version: string,
): Promise<void> {
  await run(["add", "--", ...files]);
  await run(["commit", "-m", `chore(release): ${version}`]);
}

/** Create an annotated tag `v<version>`. */
export async function createTag(
  run: GitRunner,
  version: string,
  message?: string,
): Promise<string> {
  const tag = `v${version}`;
  await run(["tag", "-a", tag, "-m", message ?? tag]);
  return tag;
}
