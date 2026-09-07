/**
 * lacspace-changelog — turn Conventional Commits into a grouped CHANGELOG.md,
 * compute the next semver bump from the commit types, and print release notes.
 * Keyless, local, and zero runtime dependencies: git is read through Node's
 * `child_process`, and every parser/renderer is pure and testable without git.
 *
 * ```ts
 * import { parseCommit, recommendBump, renderSection } from "lacspace-changelog";
 *
 * const commits = [
 *   "feat(api): add pagination (#12)",
 *   "fix: correct off-by-one",
 *   "refactor!: drop the legacy client\n\nBREAKING CHANGE: the v1 client is gone",
 * ].map((m) => parseCommit(m));
 *
 * recommendBump(commits, "1.4.2").next;   // "2.0.0" (a breaking change)
 * renderSection(commits, { version: "2.0.0" }); // grouped markdown section
 * ```
 *
 * The pure core (parse → bump → render) needs no git at all — feed it raw
 * commit strings. The git layer ({@link readCommits}, {@link analyze}) is
 * opt-in and injectable via a {@link GitRunner}.
 */

// commit parsing
export { parseCommit, parseCommits, KNOWN_TYPES } from "./commit.js";
export type {
  RawCommit,
  ParsedCommit,
  Footer,
  Reference,
  CoAuthor,
} from "./commit.js";

// semver engine
export {
  parseSemver,
  mustParseSemver,
  isValidSemver,
  formatSemver,
  compareSemver,
  gt,
  maxSemver,
  inc,
  incStr,
} from "./semver.js";
export type { SemVer, ReleaseType, IncrementType } from "./semver.js";

// bump decision
export { recommendBump } from "./bump.js";
export type { BumpOptions, BumpResult, BumpLevel } from "./bump.js";

// changelog rendering
export {
  renderSection,
  prependChangelog,
  parseVersionHeaders,
  changelogHasVersion,
  DEFAULT_GROUPS,
  DEFAULT_HIDDEN,
} from "./changelog.js";
export type { RenderOptions, CommitGroup, PrependOptions } from "./changelog.js";

// breaking-change collection
export {
  collectBreaking,
  hasBreaking,
  hasBreakingFooter,
  hasBangBreaking,
} from "./breaking.js";
export type { BreakingChange } from "./breaking.js";

// contributors aggregation
export { collectContributors, renderContributors } from "./contributors.js";
export type {
  Contributor,
  ContributorsOptions,
  RenderContributorsOptions,
} from "./contributors.js";

// custom commit-type configuration
export {
  loadConfig,
  parseConfig,
  resolveConfig,
  configToGroups,
  configToHidden,
  configToBumpOptions,
  CONFIG_FILENAMES,
} from "./config.js";
export type { ChangelogConfig, TypeConfig, ResolvedConfig } from "./config.js";

// repository URL templating
export { parseRepository, urlTemplates } from "./repo.js";
export type { RepoInfo, RepoHost, UrlTemplates } from "./repo.js";

// link builders (compare links + linkify)
export {
  buildCompareLink,
  linkifyRefs,
  linkifyIssues,
  linkifyShas,
} from "./links.js";

// git integration (injectable)
export {
  realGit,
  isGitRepo,
  latestVersionTag,
  remoteUrl,
  readCommits,
  parseGitLog,
  headHash,
  commitRelease,
  createTag,
} from "./git.js";
export type { GitRunner, LogOptions } from "./git.js";

// high-level orchestration
export {
  findPackageJson,
  analyze,
  buildSection,
  readChangelog,
  writeChangelog,
  bumpPackageVersion,
} from "./release.js";
export type {
  PackageInfo,
  AnalyzeOptions,
  Analysis,
  BuildSectionOptions,
} from "./release.js";
