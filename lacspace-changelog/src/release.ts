/**
 * High-level release orchestration used by the CLI. Reads package.json + git
 * history, runs the pure engine (parse → bump → render), and can optionally
 * mutate the repo (bump/tag/commit). Every git call goes through an injectable
 * {@link GitRunner}, so this can be driven in tests without a real repo.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseCommits } from "./commit.js";
import type { ParsedCommit } from "./commit.js";
import { recommendBump } from "./bump.js";
import type { BumpOptions, BumpResult } from "./bump.js";
import { renderSection, prependChangelog, changelogHasVersion, DEFAULT_GROUPS, DEFAULT_HIDDEN } from "./changelog.js";
import type { RenderOptions } from "./changelog.js";
import { parseRepository, urlTemplates } from "./repo.js";
import {
  isGitRepo,
  latestVersionTag,
  readCommits,
  remoteUrl,
  headHash,
  commitRelease,
  createTag,
} from "./git.js";
import type { GitRunner } from "./git.js";

export interface PackageInfo {
  path: string;
  dir: string;
  version: string;
  repository?: string;
}

/** Find the nearest package.json walking up from `start`. */
export function findPackageJson(start: string): PackageInfo | null {
  let dir = start;
  for (let i = 0; i < 40; i++) {
    const p = join(dir, "package.json");
    if (existsSync(p)) {
      try {
        const json = JSON.parse(readFileSync(p, "utf8")) as {
          version?: string;
          repository?: string | { url?: string };
        };
        const repo =
          typeof json.repository === "string"
            ? json.repository
            : json.repository?.url;
        return {
          path: p,
          dir,
          version: json.version ?? "0.0.0",
          ...(repo ? { repository: repo } : {}),
        };
      } catch {
        return null;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export interface AnalyzeOptions extends BumpOptions {
  /** Explicit start ref (default: latest version tag). */
  from?: string;
  /** Explicit end ref (default: HEAD). */
  to?: string;
  /** Fallback current version when no package.json is found. */
  currentVersion?: string;
  /** Drop non-conventional commits entirely. */
  strict?: boolean;
}

export interface Analysis {
  current: string;
  from: string | null;
  to: string;
  commits: ParsedCommit[];
  bump: BumpResult;
  repositoryUrl: string | null;
}

/**
 * Read commits and compute the recommended bump. Pure of fs beyond the given
 * `currentVersion`/`repositoryUrl`; git access is via `run`.
 */
export async function analyze(
  run: GitRunner,
  currentVersion: string,
  opts: AnalyzeOptions = {},
): Promise<Analysis> {
  const from = opts.from ?? (await latestVersionTag(run));
  const to = opts.to ?? "HEAD";
  const logOpts: { from?: string; to?: string } = { to };
  if (from) logOpts.from = from;
  let commits = parseCommits(await readCommits(run, logOpts));
  if (opts.strict) commits = commits.filter((c) => c.conventional);
  const bump = recommendBump(commits, currentVersion, opts);
  const repositoryUrl = (await remoteUrl(run)) ?? null;
  return { current: currentVersion, from, to, commits, bump, repositoryUrl };
}

export interface BuildSectionOptions {
  version: string;
  previousTag?: string | null;
  repositoryUrl?: string | null;
  repoUrlOverride?: string;
  groups?: RenderOptions["groups"];
  hiddenTypes?: string[];
  date?: string;
  includeOther?: boolean;
  /** Append a Contributors section. Default false. */
  contributors?: boolean;
}

/** Render the markdown section for a set of commits + a target version. */
export function buildSection(
  commits: ParsedCommit[],
  opts: BuildSectionOptions,
): string {
  const repo = parseRepository(opts.repoUrlOverride ?? opts.repositoryUrl ?? undefined);
  const urls = urlTemplates(repo);
  const renderOpts: RenderOptions = {
    version: opts.version,
    urls,
    groups: opts.groups ?? DEFAULT_GROUPS,
    hiddenTypes: opts.hiddenTypes ?? DEFAULT_HIDDEN,
    includeOther: opts.includeOther ?? true,
  };
  if (opts.date) renderOpts.date = opts.date;
  if (opts.previousTag) renderOpts.previousTag = opts.previousTag;
  if (opts.contributors) renderOpts.contributors = true;
  return renderSection(commits, renderOpts);
}

/** Read a CHANGELOG file if present, else undefined. */
export function readChangelog(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  return readFileSync(path, "utf8");
}

/**
 * Prepend a section to a changelog file (creating it when missing). Pass
 * `opts.version` + `skipIfExists` to avoid writing a release that is already
 * documented. Returns true when the file was changed, false when a duplicate
 * was skipped.
 */
export function writeChangelog(
  path: string,
  section: string,
  opts: { version?: string; skipIfExists?: boolean } = {},
): boolean {
  const existing = readChangelog(path);
  if (
    opts.skipIfExists &&
    opts.version &&
    existing &&
    changelogHasVersion(existing, opts.version)
  ) {
    return false;
  }
  const prependOpts: { version?: string; skipIfExists?: boolean } = {};
  if (opts.version) prependOpts.version = opts.version;
  if (opts.skipIfExists) prependOpts.skipIfExists = opts.skipIfExists;
  writeFileSync(path, prependChangelog(section, existing, prependOpts));
  return true;
}

/** Write a new `version` into a package.json file, preserving formatting. */
export function bumpPackageVersion(pkgPath: string, version: string): void {
  const raw = readFileSync(pkgPath, "utf8");
  // Replace only the top-level "version" string to preserve the rest verbatim.
  const updated = raw.replace(
    /("version"\s*:\s*")[^"]*(")/,
    `$1${version}$2`,
  );
  writeFileSync(pkgPath, updated);
}

// Re-export the mutating git ops so the CLI has one import surface.
export { isGitRepo, headHash, commitRelease, createTag };
