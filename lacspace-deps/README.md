# lacspace-deps

**A keyless dependency & licence auditor for any Node/JS project.** Point it at a repo and it reads `package.json`, the lockfile and your local `node_modules` and tells you what your supply chain actually looks like: **licences** (allow/deny + `maxSeverity` policy, from flags or a `.depsrc.json`), **install size** on disk, **duplicate versions**, **unused & missing** dependencies, a **CycloneDX/SPDX SBOM** export, and — opt-in — **outdated** packages. It exits non-zero on policy violations, so it drops straight into CI.

```bash
npx lacspace-deps
```

**New in 0.2.0**

- **SBOM export** — emit a CycloneDX 1.5 or SPDX 2.3 JSON software bill of materials for the dependency tree: `lacspace-deps sbom --format cyclonedx|spdx`.
- **`.depsrc.json` policy file** — keep your allow/deny lists, `maxSeverity` and `failOn` gates in the repo; auto-discovered, with `--policy <path>` to point elsewhere. CLI flags override it.
- **`--max-severity`** — fail on anything stricter than a chosen licence category (`permissive` < `weak-copyleft` < `strong-copyleft` < `unknown`), no glob lists required.

```
◆ lacspace-deps  my-app@1.4.0
  lockfile: npm-v3  ·  18 declared  ·  312 installed (289 distinct)

  Health 78/100  — 1 licence violation(s), 2 unused, 3 duplicated

  Licences
    284 permissive  2 weak-copyleft  1 strong-copyleft  2 unknown/none
    MIT×241  ISC×18  Apache-2.0×14  BSD-3-Clause×9
    ✗ 1 policy violation(s)
      • some-lib@2.1.0 — GPL-3.0 (denied)

  Install size 214.6 MB · 41022 files
    22.5 MB   typescript 5.9.3
    …

  Duplicates 3 package(s) at multiple versions
    • tslib → 1.14.1, 2.6.2

  Unused & missing · scanned 96 source file(s)
    unused (2)  left-pad, moment
    missing (1) dotenv
```

Free, keyless, zero-dependency and **fully local** — no account, no telemetry, nothing leaves your machine. The only feature that touches the network is the opt-in `--outdated` check (it asks the npm registry for the latest versions); everything else is pure filesystem work.

## Install

```bash
# one-off, no install
npx lacspace-deps

# or globally
npm i -g lacspace-deps

# or as a library
npm i lacspace-deps
```

Requires **Node ≥ 20**.

## Why it exists

Most projects have no idea what they're actually shipping. `lacspace-deps` answers the questions that matter for supply-chain hygiene, all in one pass and all offline:

- **Are we allowed to ship these licences?** Classify every installed package (permissive / weak-copyleft / strong-copyleft / unknown) and fail the build on a `GPL-*` sneaking in.
- **What's making `node_modules` huge?** The heaviest packages by real on-disk size, with file counts.
- **Do we have the same library twice?** Duplicate versions are a classic source of bloat and "instanceof" bugs.
- **Are we carrying dead weight — or importing something we forgot to declare?** Unused and missing dependencies, scanned from your own source.
- **What's fallen behind?** Opt-in registry check for outdated majors.

## CLI

```
lacspace-deps [dir] [options]
lacspace-deps <licenses|size|duplicates|unused|outdated> [dir] [options]
lacspace-deps sbom [dir] --format cyclonedx|spdx
```

`dir` defaults to the current directory. The first positional may be a **focus** keyword to print just one section, or the `sbom` command to emit a bill of materials.

| Flag | Description |
| --- | --- |
| `--allow <list>` | Comma list of allowed licence globs, e.g. `"MIT,ISC,Apache-2.0,BSD-*"`. Anything outside the list is a violation. |
| `--deny <list>` | Comma list of denied licence globs, e.g. `"GPL-*,AGPL-*"`. Any match is a violation. |
| `--max-severity <cat>` | Strictest licence category tolerated: `permissive`, `weak-copyleft`, `strong-copyleft` or `unknown`. Anything stricter is a violation. |
| `--policy <path>` | Load an explicit `.depsrc.json` policy file (default: auto-discover one in `dir`). |
| `-f, --format <fmt>` | For `sbom`: `cyclonedx` (default) or `spdx`. Otherwise `md` for a Markdown report. |
| `--outdated` | Also check the npm registry for newer versions (**the only networked feature**). |
| `--registry <url>` | Registry base URL for `--outdated` (default `https://registry.npmjs.org`). |
| `--prod` | Ignore `devDependencies`. |
| `--gzip` | Add a rough gzip-size estimate to the size report. |
| `--top <n>` | Rows to show per section (default `10`). |
| `--ignore-unused <list>` | Names to never report as unused. |
| `--no-tooling-ignore` | Don't auto-ignore common build tooling in the unused check. |
| `--fail-on <list>` | Exit non-zero on any of: `unused,missing,license,outdated,duplicates`. |
| `--json` | Machine-readable JSON output. |
| `-h, --help` | Show help. |
| `-v, --version` | Print the version. |

**Exit code:** a licence policy violation (from `--allow`/`--deny`) **always** exits `1`. `--fail-on` adds extra category gates. Everything else exits `0`. Colour is disabled automatically under `NO_COLOR`, `CI`, or when stdout is not a TTY.

### Examples

```bash
# Full audit of the current project
npx lacspace-deps

# Enforce a licence policy in CI (fails on a GPL/AGPL dependency)
npx lacspace-deps --allow "MIT,ISC,Apache-2.0,BSD-*" --deny "GPL-*,AGPL-*"

# Just the licence breakdown, as JSON
npx lacspace-deps licenses --json

# The heaviest 15 packages, with a gzip estimate
npx lacspace-deps size --top 15 --gzip

# Find dead + undeclared deps, and fail the build if any exist
npx lacspace-deps unused --fail-on unused,missing

# Which packages are installed at more than one version?
npx lacspace-deps duplicates

# Enforce a category ceiling instead of glob lists (fails on strong-copyleft/unknown)
npx lacspace-deps --max-severity weak-copyleft --fail-on license

# Export a CycloneDX SBOM
npx lacspace-deps sbom --format cyclonedx > bom.json

# Export an SPDX SBOM for a sub-project
npx lacspace-deps sbom ./my-app --format spdx > sbom.spdx.json

# Check the registry for outdated majors (opt-in, online)
npx lacspace-deps outdated ./my-app

# Write a Markdown report for a CI job summary
npx lacspace-deps -f md > deps-report.md
```

### Policy file (`.depsrc.json`)

Drop a `.depsrc.json` in your project root and it's picked up automatically (or point at one with `--policy <path>`). CLI flags override anything in the file.

```json
{
  "allow": ["MIT", "ISC", "Apache-2.0", "BSD-*"],
  "deny": ["GPL-*", "AGPL-*"],
  "maxSeverity": "weak-copyleft",
  "failOn": ["missing", "duplicates"],
  "ignoreUnused": ["some-cli-tool"],
  "prod": true
}
```

The licence keys may also be nested under a `"policy"` object (`{ "policy": { "allow": […] }, "failOn": […] }`). Unknown or wrong-typed fields are ignored.

Example — the licence gate failing in CI:

```bash
$ npx lacspace-deps --deny "GPL-*,AGPL-*"
  ✗ 1 policy violation(s)
      • some-lib@2.1.0 — GPL-3.0 (denied)
$ echo $?
1
```

## Library API

Everything the CLI does is available as a typed, dual ESM/CJS library.

```ts
import { audit } from "lacspace-deps";

const report = await audit(".", {
  policy: { allow: ["MIT", "ISC", "Apache-2.0", "BSD-*"], deny: ["GPL-*", "AGPL-*"] },
  gzip: true,
});

report.health;              // 0-100 hygiene score
report.licenses.violations; // packages that hit the policy
report.usage.unused;        // declared but never imported
report.usage.missing;       // imported but never declared
report.duplicates;          // installed at more than one version
report.size.totalBytes;     // total install size on disk
```

| Export | Signature | Purpose |
| --- | --- | --- |
| `audit` | `(dir, opts?) => Promise<AuditReport>` | Full audit (offline; runs `--outdated` only if `opts.outdated` is set). |
| `healthScore` | `(report) => number` | The 0-100 hygiene score. |
| `shouldFail` | `(report, failOn[]) => boolean` | CI gate decision. |
| `buildInventory` | `(dir, opts?) => Inventory` | Parse `package.json` + lockfile + scan `node_modules`. |
| `summarizeLicenses` | `(installed, policy?) => LicenseSummary` | Classify + apply allow/deny. |
| `classifyLicense` | `(license) => LicenseCategory` | Categorise a single SPDX string. |
| `evaluatePolicy` | `(license, policy) => "deny" \| "not-allowed" \| "severity" \| null` | Test one licence against a policy (deny / allowlist / `maxSeverity`). |
| `severityRank` | `(category) => number` | Numeric severity of a licence category (permissive `0` → unknown `3`). |
| `loadConfig` | `(dir, explicit?) => { config, path }` | Read + normalise a `.depsrc.json` policy file. |
| `normalizeConfig` | `(raw) => DepsConfig` | Pure: validate an arbitrary object into a config. |
| `mergeConfig` | `(base, override) => DepsConfig` | Pure: layer CLI flags over a file config. |
| `configToAuditOptions` | `(config) => AuditOptions` | Turn a config into options for `audit()`. |
| `buildSbom` | `(inventory, { format, now?, serialNumber?, namespace? }) => CycloneDxDocument \| SpdxDocument` | Generate a CycloneDX/SPDX SBOM. |
| `buildCycloneDx` / `buildSpdx` | `(components, meta) => …Document` | Pure SBOM document builders. |
| `purlFor` | `(name, version) => string` | Build an npm Package-URL (`pkg:npm/name@version`). |
| `measureSizes` | `(installed, opts?) => SizeReport` | Per-package install size + totals. |
| `dirSize` | `(dir) => { bytes; files }` | Recursive size (skips nested `node_modules`). |
| `findDuplicates` | `(installed) => DuplicateEntry[]` | Packages at multiple versions. |
| `analyzeUsage` | `(dir, declared, opts?) => UsageReport` | Unused + missing from a source scan. |
| `scanImports` | `(dir) => UsageScan` | Just the imported package names. |
| `specifierToPackage` | `(spec) => string \| null` | `@scope/x/sub` → `@scope/x`; builtins/relative → null. |
| `checkOutdated` | `(installed, opts?) => Promise<OutdatedReport>` | Registry latest-version check (network; `fetchImpl` injectable). |
| `fetchLatest` | `(name, opts?) => Promise<string \| null>` | One package's `dist-tags.latest`. |
| `renderHuman` / `renderMarkdown` | `(report, …) => string` | The CLI's report renderers. |

Full types (`AuditReport`, `Inventory`, `InstalledPackage`, `LicenseSummary`, `SizeReport`, `DuplicateEntry`, `UsageReport`, `OutdatedReport`, …) are exported and bundled as `.d.ts`.

## How it works

- **Inventory** parses `package.json` (dependencies / devDependencies / peerDependencies / optionalDependencies) and detects the lockfile (`package-lock.json` v1/v2/v3, or best-effort `pnpm-lock.yaml` / `yarn.lock`). The ground truth for licences, size and duplicates is a recursive walk of `node_modules` (including scoped packages and nested `node_modules` left by npm's dedupe).
- **Licences** come from each installed package's own `license` / `licenses` field, normalised to an SPDX-ish string and classified. `--allow` / `--deny` accept glob patterns (`BSD-*`) and understand `A OR B` expressions.
- **Size** is the real sum of file bytes in each package directory (nested `node_modules` counted as their own packages, symlinks not followed).
- **Unused & missing** scans your own `.js/.jsx/.ts/.tsx/.mjs/.cjs` source (skipping `node_modules`, `dist`, `.next`, `build`, …) for `import` / `require` / dynamic-`import()` specifiers, maps them to package names, and diffs against what's declared.

## Limitations (honest)

- **Unused/missing is a heuristic.** A dependency used only in a config file, a shell script, a CLI binary, JSON, HTML, or purely for its types can look "unused". Common build tooling (`typescript`, `tsup`, `vitest`, `eslint`, …) and `@types/*` are auto-excluded, and you can add your own with `--ignore-unused`. A "missing" package may actually resolve transitively at runtime — it's flagged because it isn't *declared*, which is still worth fixing.
- **Size is on-disk install size**, not the published tarball or bundled size. It reflects what's in your `node_modules` right now.
- **Licence data is only as good as the package.** Packages with a missing, custom, or `SEE LICENSE IN …` field are reported as `unknown/none` — verify those by hand.
- **pnpm / yarn lockfiles are best-effort.** Full transitive resolution for those formats isn't parsed; the licence/size/duplicate scans still work off `node_modules`, which is what matters. npm lockfiles (v1/v2/v3) are fully understood.
- **`--outdated` needs the network** and the npm registry; it's the only online feature and is off by default. Without `node_modules`, licence/size/duplicate data is unavailable (run `npm install` first) — the report says so.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, permissive, Lacspace-branded.

---

Part of the [Lacspace](https://developer.lacspace.com/tools) free developer-tools suite — small, keyless, zero-dependency CLIs that do one job well.
