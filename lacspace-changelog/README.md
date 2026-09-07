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

### New in 0.2.0

- **`generate` command + first-class git range** — `lacspace-changelog generate --from v1.0.0 --to HEAD` reads the log directly.
- **Contributors section** — `--contributors` aggregates unique authors (and co-authors) into a de-duplicated, sorted list.
- **Custom commit-type config** — drop a `.changelogrc.json` to remap `type → section title`, decide which types bump (`major`/`minor`/`patch`) and hide the noise; `renderSection` and `recommendBump` both honour it.
- **Breaking-change highlighting** — a dedicated `⚠ BREAKING CHANGES` section from both `type!:` and `BREAKING CHANGE:` footers, forcing a major bump. New `collectBreaking` helper.
- **Compare / issue / SHA links** — `buildCompareLink()` plus `linkifyRefs()` to turn `#123` and bare commit SHAs into markdown links.
- **Duplicate-safe merge** — re-running won't double-prepend a version already in `CHANGELOG.md` (parses the existing `## [x.y.z]` headers); `--allow-duplicate` overrides.

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
| `generate` | Alias of the default — read git and prepend the new section. |
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
npx lacspace-changelog generate --from v1.2.0 --to HEAD

# Add a Contributors section
npx lacspace-changelog --contributors

# Use a custom commit-type config
npx lacspace-changelog --config .changelogrc.json

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
| `--config <path>` | Load a `.changelogrc.json` (type → section / bump / hidden). Default: the cwd. |
| `--contributors` | Append a **Contributors** section aggregated from the commit authors. |
| `--allow-duplicate` | Prepend even when the computed version is already in the changelog. |
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

### Custom commit-type config (`.changelogrc.json`)

Drop a `.changelogrc.json` at your repo root (or point `--config` at one) to remap types to section titles, decide which types bump the version, and hide noise:

```json
{
  "types": {
    "feat":  { "section": "✨ Features",  "bump": "minor" },
    "fix":   { "section": "🐛 Bug Fixes", "bump": "patch" },
    "perf":  { "section": "⚡ Performance", "bump": "patch" },
    "deps":  { "section": "📦 Dependencies", "bump": "patch" },
    "wip":   { "hidden": true }
  },
  "contributors": true
}
```

Both the rendered sections **and** the recommended semver bump honour it (a type with `"bump": "major"` forces a major).

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
| `prependChangelog` | `(section, existing?, opts?) => string` | Insert a section into (or create) a changelog body; `opts.skipIfExists` avoids duplicating a version. |
| `parseVersionHeaders` / `changelogHasVersion` | `(md) => string[]` / `(md, version) => boolean` | Read the `## [x.y.z]` headers already in a changelog. |
| `collectBreaking` / `hasBreaking` | `(commits) => BreakingChange[]` / `boolean` | Collect breaking changes from both `type!:` and `BREAKING CHANGE:` syntaxes. |
| `collectContributors` / `renderContributors` | `(commits, opts?) => Contributor[]` / `(people, opts?) => string` | Aggregate & render the unique authors (de-duped, sorted). |
| `loadConfig` / `resolveConfig` / `configToGroups` / `configToHidden` / `configToBumpOptions` | — | Read a `.changelogrc.json` and turn it into render/bump inputs. |
| `buildCompareLink` / `linkifyRefs` / `linkifyIssues` / `linkifyShas` | — | Pure link builders: compare links, and `#123` / SHA linkifying. |
| `parseSemver` / `compareSemver` / `inc` | — | The tiny built-in semver engine (parse / compare / increment). |
| `parseRepository` / `urlTemplates` | — | Turn a `repository` field into commit / issue / compare URL builders. |
| `readCommits` / `latestVersionTag` / `realGit` | — | The injectable git layer (pass your own `GitRunner` in tests). |
| `analyze` | `(run, current, opts?) => Promise<Analysis>` | End-to-end: detect tag → read commits → recommend a bump. |
| `findPackageJson` / `writeChangelog` / `bumpPackageVersion` | — | The fs helpers the CLI uses. |

Types (`ParsedCommit`, `BumpResult`, `BumpOptions`, `RenderOptions`, `CommitGroup`, `SemVer`, `RepoInfo`, `GitRunner`, `Analysis`, …) are all exported.

## Limitations

- **Needs a git repository with history** — the CLI reads `git log`. In a fresh repo with no commits it exits cleanly with a message. (The pure library functions have no such requirement.)
- **Groups by commit type, not by monorepo package** — it changelogs the whole range you give it. Scope per-package by passing `--from`/`--to`, or by calling the library per directory.
- **Skips known versions by default** — re-running won't double-prepend a version already in the changelog (it parses the existing `## [x.y.z]` headers). Pass `--allow-duplicate` to force it.
- **Commit URLs assume GitHub / GitLab / Bitbucket layouts** — other hosts fall back to plain hashes unless you pass `--repo-url`.
- **`--commit`/`--tag` never push**, on purpose.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, keyless, no telemetry.
