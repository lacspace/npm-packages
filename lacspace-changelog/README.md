# lacspace-changelog

**Turn [Conventional Commits](https://www.conventionalcommits.org) into a grouped `CHANGELOG.md`, compute the next [semver](https://semver.org) bump from the commit types, and print release notes.** Keyless, local, and **zero runtime dependencies** — git history is read through Node's `child_process`, and every parser, semver calculation and markdown renderer is pure (and unit-tested without git).

```bash
npx lacspace-changelog preview
#
# ◆ lacspace-changelog
#   range   v1.2.0 → HEAD
#   commits 4  (0 breaking, 1 feat, 2 fix/perf, 1 other)
#   bump    1.2.0 → 1.3.0  (minor bump: 1 feature)
```

## Why it exists

- **Free & keyless** — no account, no service, no telemetry. It reads your local git log and writes a local file.
- **Zero dependencies** — no `conventional-changelog` tree, no `semver` package. One small, auditable install.
- **CI-friendly** — `version` prints just the next number, `notes` prints just the release body, every command has `--json`, and it exits non-zero on failure.
- **Safe by default** — the changelog is generated read-only. The steps that mutate your repo (bump / commit / tag) are opt-in flags, printed as a plan first, and it **never pushes**.
- **Testable core** — the whole `parse → bump → render` path is pure. Feed it raw commit strings; no git required.

## Install

```bash
# one-off, no install
npx lacspace-changelog

# or globally
npm i -g lacspace-changelog

# or as a library
npm i lacspace-changelog
```

## How the version is chosen

| Commits since the last tag | Bump |
| --- | --- |
| any `BREAKING CHANGE` / `type!:` | **major** (**minor** while `0.x`) |
| any `feat:` | **minor** |
| any `fix:` / `perf:` | **patch** |
| nothing notable | **none** (or patch with `--always`) |

Override any time with `--release-as major|minor|patch|<version>`, and cut a prerelease with `--preid beta` (→ `1.3.0-beta.0`, then `…beta.1`).

## CLI

```
lacspace-changelog [command] [options]
```

### Commands

| Command | What it does |
| --- | --- |
| _(default)_ | Render the new version section and **prepend** it to `CHANGELOG.md`. |
| `version` | Print **only** the computed next version — `VER=$(lacspace-changelog version)`. |
| `notes` | Print **only** the new section — a ready-to-paste GitHub release body. |
| `preview` | Print the plan (range, commit counts, bump) and the section, writing nothing. |

### Examples

```bash
# Prepend the new section to CHANGELOG.md (creates it if missing)
npx lacspace-changelog

# Preview the markdown without writing anything
npx lacspace-changelog --dry-run

# Just the next version — perfect for a CI step
VER=$(npx lacspace-changelog version)
echo "Releasing $VER"

# A GitHub release body
npx lacspace-changelog notes > RELEASE_NOTES.md

# Notes for an explicit commit range
npx lacspace-changelog notes --from v1.2.0 --to HEAD

# A beta prerelease
npx lacspace-changelog version --preid beta      # 1.3.0-beta.0

# Force a major regardless of the commits
npx lacspace-changelog --release-as major

# Cut a release: write the version, commit and tag (never pushes)
npx lacspace-changelog --bump --commit --tag
```

Example generated section (GitHub repo):

```markdown
## [1.3.0](https://github.com/you/repo/compare/v1.2.0...v1.3.0) (2026-09-07)

### Features

- **api:** add pagination ([71b7bca](https://github.com/you/repo/commit/71b7bca), [#12](https://github.com/you/repo/issues/12))

### Bug Fixes

- correct off-by-one error ([1f3e1dc](https://github.com/you/repo/commit/1f3e1dc))
```

### Options

| Flag | Purpose |
| --- | --- |
| `--from <ref>` | Start ref (default: the latest `v*` tag reachable from HEAD). |
| `--to <ref>` | End ref (default: `HEAD`). |
| `--release-as <x>` | Force `major` / `minor` / `patch`, or an explicit version like `2.0.0`. |
| `--preid <id>` | Prerelease identifier, e.g. `beta` → `1.3.0-beta.0`. |
| `--repo-url <url>` | Override the repo URL used for commit / PR / compare links. |
| `-o, --output <file>` | Changelog file to write / prepend (default `CHANGELOG.md`). |
| `--strict` | Drop non-conventional commits instead of bucketing them under "Other". |
| `--always` | Bump the patch even when nothing notable changed. |
| `--pre-1-breaking-is-major` | In `0.x`, treat a breaking change as **major** (default: minor). |
| `--dry-run` | Print the result to stdout; write no file and run no release actions. |
| `--json` | Machine-readable JSON output. |
| `--bump` | **(mutates)** Write the new version into `package.json`. |
| `--commit` | **(mutates)** Make a `chore(release): x.y.z` commit. |
| `--tag` | **(mutates)** Create an annotated git tag `vX.Y.Z`. |
| `-h, --help` | Show help. |
| `-v, --version` | Print the tool version. |

Respects `NO_COLOR`. Data goes to **stdout**, diagnostics to **stderr**, so `notes`/`version` pipe cleanly.

The release actions (`--bump`, `--commit`, `--tag`) are the only things that change your working tree, and they are all off by default. Nothing is ever pushed — run `git push --follow-tags` yourself when you're happy.

## Library API

Everything the CLI does is exported. The core is pure — hand it commit strings and it needs no git.

```ts
import { parseCommit, recommendBump, renderSection } from "lacspace-changelog";

const commits = [
  "feat(api): add pagination (#12)",
  "fix: correct off-by-one",
  "refactor!: drop the legacy client\n\nBREAKING CHANGE: the v1 client is gone",
].map((m) => parseCommit(m));

recommendBump(commits, "1.4.2").next;          // "2.0.0"
renderSection(commits, { version: "2.0.0" });  // grouped markdown
```

| Export | Signature | Purpose |
| --- | --- | --- |
| `parseCommit` | `(raw: RawCommit \| string) => ParsedCommit` | Parse one Conventional Commit (type/scope/breaking/refs/PR/co-authors). |
| `parseCommits` | `(raws: Array<RawCommit \| string>) => ParsedCommit[]` | Parse many. |
| `recommendBump` | `(commits, current, opts?) => BumpResult` | Decide the next version from the commits. |
| `renderSection` | `(commits, opts) => string` | Render one changelog section (grouped markdown). |
| `prependChangelog` | `(section, existing?) => string` | Insert a section into (or create) a changelog body. |
| `parseSemver` / `compareSemver` / `inc` | — | The tiny built-in semver engine (parse / compare / increment). |
| `parseRepository` / `urlTemplates` | — | Turn a `repository` field into commit / issue / compare URL builders. |
| `readCommits` / `latestVersionTag` / `realGit` | — | The injectable git layer (pass your own `GitRunner` in tests). |
| `analyze` | `(run, current, opts?) => Promise<Analysis>` | End-to-end: detect tag → read commits → recommend a bump. |
| `findPackageJson` / `writeChangelog` / `bumpPackageVersion` | — | The fs helpers the CLI uses. |

Types (`ParsedCommit`, `BumpResult`, `BumpOptions`, `RenderOptions`, `CommitGroup`, `SemVer`, `RepoInfo`, `GitRunner`, `Analysis`, …) are all exported.

## Limitations

- **Needs a git repository with history** — the CLI reads `git log`. In a fresh repo with no commits it exits cleanly with a message. (The pure library functions have no such requirement.)
- **Groups by commit type, not by monorepo package** — it changelogs the whole range you give it. Scope per-package by passing `--from`/`--to`, or by calling the library per directory.
- **Prepends on every run** — running the default command twice prepends twice. Run it once per release (or use `--dry-run` / `notes` to preview).
- **Commit URLs assume GitHub / GitLab / Bitbucket layouts** — other hosts fall back to plain hashes unless you pass `--repo-url`.
- **`--commit`/`--tag` never push**, on purpose.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, keyless, no telemetry.
