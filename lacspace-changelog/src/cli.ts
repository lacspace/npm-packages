import { stdout, stderr, argv, exit, cwd, env } from "node:process";
import { realGit, isGitRepo } from "./git.js";
import {
  findPackageJson,
  analyze,
  buildSection,
  writeChangelog,
  readChangelog,
  bumpPackageVersion,
  commitRelease,
  createTag,
} from "./release.js";
import { prependChangelog, changelogHasVersion } from "./changelog.js";
import { loadConfig, resolveConfig } from "./config.js";
import type { BumpOptions } from "./bump.js";

const VERSION = "0.2.0";

const NO_COLOR = env.NO_COLOR !== undefined && env.NO_COLOR !== "";
const RAW = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof RAW, s: string): string =>
  NO_COLOR ? s : `${RAW[k]}${s}${RAW.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

type Command = "changelog" | "generate" | "version" | "notes" | "preview";

interface Args {
  command: Command;
  from?: string;
  to?: string;
  releaseAs?: string;
  preid?: string;
  repoUrl?: string;
  output: string;
  config?: string;
  contributors: boolean;
  allowDuplicate: boolean;
  dryRun: boolean;
  strict: boolean;
  always: boolean;
  pre1BreakingIsMinor: boolean;
  bump: boolean;
  tag: boolean;
  commit: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    command: "changelog",
    output: "CHANGELOG.md",
    contributors: false,
    allowDuplicate: false,
    dryRun: false,
    strict: false,
    always: false,
    pre1BreakingIsMinor: true,
    bump: false,
    tag: false,
    commit: false,
    json: false,
    help: false,
    version: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--from") a.from = nextVal();
    else if (arg === "--to") a.to = nextVal();
    else if (arg === "--release-as") a.releaseAs = nextVal();
    else if (arg === "--preid") a.preid = nextVal();
    else if (arg === "--repo-url") a.repoUrl = nextVal();
    else if (arg === "--config") a.config = nextVal();
    else if (arg === "--contributors") a.contributors = true;
    else if (arg === "--allow-duplicate") a.allowDuplicate = true;
    else if (arg === "--output" || arg === "-o") a.output = nextVal();
    else if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--strict") a.strict = true;
    else if (arg === "--always") a.always = true;
    else if (arg === "--no-pre-1-breaking-is-minor" || arg === "--pre-1-breaking-is-major")
      a.pre1BreakingIsMinor = false;
    else if (arg === "--pre-1-breaking-is-minor") a.pre1BreakingIsMinor = true;
    else if (arg === "--bump") a.bump = true;
    else if (arg === "--tag") a.tag = true;
    else if (arg === "--commit") a.commit = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  const cmd = positional[0];
  if (cmd === "version" || cmd === "notes" || cmd === "preview" || cmd === "generate")
    a.command = cmd;
  else if (cmd === "changelog") a.command = "changelog";
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-changelog"))} ${c("dim", "— Conventional Commits → CHANGELOG.md + next semver")}

${c("bold", "Usage")}
  npx lacspace-changelog [command] [options]

${c("bold", "Commands")}
  ${c("cyan", "(default)")}   Render the new version section and prepend it to CHANGELOG.md
  ${c("cyan", "generate")}    Alias of the default — read git and prepend the new section
  ${c("cyan", "version")}     Print ONLY the computed next version (great for CI)
  ${c("cyan", "notes")}       Print ONLY the new section (a GitHub release body)
  ${c("cyan", "preview")}     Show the plan: range, commits, bump and section — write nothing

${c("bold", "Options")}
      --from <ref>        Start ref (default: latest v* tag reachable from HEAD)
      --to <ref>          End ref (default: HEAD)
      --release-as <x>    Force major|minor|patch or an explicit version (e.g. 2.0.0)
      --preid <id>        Prerelease id, e.g. beta → 1.2.0-beta.0
      --repo-url <url>    Override the repo URL used for commit/PR/compare links
      --config <path>     Load a .changelogrc.json (type→section/bump/hidden). Default: cwd
      --contributors      Append a "Contributors" section from the commit authors
      --allow-duplicate   Prepend even if the version is already in the changelog
  -o, --output <file>     Changelog file to write/prepend (default CHANGELOG.md)
      --strict            Drop non-conventional commits instead of bucketing them
      --always            Bump patch even when nothing notable changed
      --pre-1-breaking-is-major   In 0.x, treat a breaking change as MAJOR (default: minor)
      --dry-run           Print the changelog to stdout; do not write any file
      --json              Machine-readable JSON output
${c("bold", "  Release (opt-in, mutate the repo — off by default, printed as a plan)")}
      --bump              Write the new version into package.json
      --commit            Make a chore(release): x.y.z commit (implies staging changes)
      --tag               Create an annotated git tag vX.Y.Z
  -h, --help              Show this help
  -v, --version           Print the tool version

${c("bold", "How the bump is chosen")}
  ${c("dim", "any BREAKING CHANGE → major (minor while 0.x) · any feat → minor · any fix/perf → patch")}

${c("bold", "Examples")}
  npx lacspace-changelog                       ${c("dim", "# prepend the new section to CHANGELOG.md")}
  npx lacspace-changelog generate --from v1.0.0 --to HEAD
  npx lacspace-changelog --dry-run             ${c("dim", "# preview the markdown, write nothing")}
  npx lacspace-changelog --contributors        ${c("dim", "# add a Contributors section")}
  npx lacspace-changelog --config .changelogrc.json ${c("dim", "# custom type→section/bump map")}
  VER=$(npx lacspace-changelog version)        ${c("dim", "# just the next version, for CI")}
  npx lacspace-changelog notes > NOTES.md      ${c("dim", "# a GitHub release body")}
  npx lacspace-changelog preview               ${c("dim", "# the full plan (range + commits + bump)")}
  npx lacspace-changelog --release-as minor --preid beta
  npx lacspace-changelog --bump --commit --tag ${c("dim", "# cut a release (never pushes)")}
`;

function fail(msg: string, json: boolean): never {
  if (json) stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help) { stdout.write(HELP + "\n"); return; }

  const dir = cwd();
  const run = realGit(dir);

  if (!(await isGitRepo(run))) {
    fail("not a git repository (run this inside a repo with commits)", args.json);
  }

  const pkg = findPackageJson(dir);
  const currentVersion = pkg?.version ?? "0.0.0";

  // Custom commit-type config (.changelogrc.json) — from --config or the cwd.
  const rawConfig = loadConfig(args.config ?? dir);
  const config = rawConfig ? resolveConfig(rawConfig) : null;

  const bumpOpts: BumpOptions = {
    ...(config?.bumpOptions ?? {}),
    pre1BreakingIsMinor: args.pre1BreakingIsMinor,
    always: args.always,
  };
  if (args.releaseAs) bumpOpts.releaseAs = args.releaseAs;
  if (args.preid) bumpOpts.preid = args.preid;

  const analyzeOpts = { ...bumpOpts, strict: args.strict } as typeof bumpOpts & {
    strict: boolean;
    from?: string;
    to?: string;
  };
  if (args.from) analyzeOpts.from = args.from;
  if (args.to) analyzeOpts.to = args.to;

  let analysis;
  try {
    analysis = await analyze(run, currentVersion, analyzeOpts);
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), args.json);
  }

  const { bump, commits, from } = analysis!;

  // Guard: nothing to release.
  if (bump.level === "none" && !args.releaseAs && commits.length === 0) {
    if (args.command === "version") { stdout.write(currentVersion + "\n"); return; }
    if (args.json) {
      stdout.write(JSON.stringify({ ok: true, empty: true, current: currentVersion, ...analysisJson(analysis!) }) + "\n");
      return;
    }
    log(`\n${c("yellow", "•")} ${c("dim", `no commits since ${from ?? "the start of history"} — nothing to release`)}\n`);
    return;
  }

  const nextVersion = bump.next;
  const repoUrl = args.repoUrl ?? config?.repoUrl ?? analysis!.repositoryUrl ?? pkg?.repository;

  // --- version command --------------------------------------------------
  if (args.command === "version") {
    stdout.write(nextVersion + "\n");
    return;
  }

  const section = buildSection(commits, {
    version: nextVersion,
    ...(from ? { previousTag: from } : {}),
    ...(repoUrl ? { repositoryUrl: repoUrl } : {}),
    ...(args.repoUrl ? { repoUrlOverride: args.repoUrl } : {}),
    ...(config?.groups ? { groups: config.groups } : {}),
    ...(config?.hiddenTypes ? { hiddenTypes: config.hiddenTypes } : {}),
    ...(config?.includeOther !== undefined ? { includeOther: config.includeOther } : {}),
    ...(args.contributors || config?.contributors ? { contributors: true } : {}),
  });

  // --- notes command ----------------------------------------------------
  if (args.command === "notes") {
    if (args.json) {
      stdout.write(JSON.stringify({ ok: true, version: nextVersion, notes: section, ...analysisJson(analysis!) }) + "\n");
    } else {
      stdout.write(section);
    }
    return;
  }

  // --- preview command --------------------------------------------------
  if (args.command === "preview") {
    if (args.json) {
      stdout.write(JSON.stringify({ ok: true, preview: true, version: nextVersion, section, ...analysisJson(analysis!) }) + "\n");
      return;
    }
    printPlan(analysis!, args, nextVersion);
    log(c("dim", "  ── section ──────────────────────────────"));
    stdout.write(section + "\n");
    return;
  }

  // --- default: changelog (also the `generate` alias) -------------------
  const skipIfExists = !args.allowDuplicate;
  const writeOpts = { version: nextVersion, skipIfExists };
  const existingChangelog = readChangelog(args.output);
  const isDuplicate =
    skipIfExists && existingChangelog
      ? changelogHasVersion(existingChangelog, nextVersion)
      : false;

  if (args.json) {
    const merged = prependChangelog(section, existingChangelog, writeOpts);
    stdout.write(JSON.stringify({
      ok: true,
      version: nextVersion,
      output: args.output,
      wrote: !args.dryRun && !isDuplicate,
      duplicate: isDuplicate,
      section,
      changelog: args.dryRun ? merged : undefined,
      ...analysisJson(analysis!),
    }) + "\n");
    if (!args.dryRun) writeChangelog(args.output, section, writeOpts);
  } else if (args.dryRun) {
    printPlan(analysis!, args, nextVersion);
    log(c("dim", "  ── would prepend to " + args.output + " ──"));
    stdout.write(section + "\n");
  } else if (isDuplicate) {
    printPlan(analysis!, args, nextVersion);
    log(`  ${c("yellow", "•")} ${c("dim", `${nextVersion} is already in ${args.output} — skipped (use --allow-duplicate to force)`)}\n`);
  } else {
    writeChangelog(args.output, section, writeOpts);
    printPlan(analysis!, args, nextVersion);
    log(`  ${c("green", "✓")} prepended the ${c("bold", nextVersion)} section to ${c("bold", args.output)}\n`);
  }

  // --- opt-in mutations -------------------------------------------------
  if (args.dryRun) return;
  await applyReleaseActions(args, pkg, nextVersion, run);
}

function analysisJson(a: NonNullable<Awaited<ReturnType<typeof analyze>>>): Record<string, unknown> {
  return {
    from: a.from,
    to: a.to,
    current: a.current,
    level: a.bump.level,
    reason: a.bump.reason,
    stats: a.bump.stats,
    commitCount: a.commits.length,
  };
}

function printPlan(
  a: NonNullable<Awaited<ReturnType<typeof analyze>>>,
  args: Args,
  nextVersion: string,
): void {
  log(`\n${c("bold", c("magenta", "◆ lacspace-changelog"))}`);
  log(`  ${c("dim", "range")}   ${a.from ?? c("dim", "(start of history)")} ${c("dim", "→")} ${a.to}`);
  log(`  ${c("dim", "commits")} ${String(a.commits.length)}  ${c("dim", `(${a.bump.stats.breaking} breaking, ${a.bump.stats.features} feat, ${a.bump.stats.fixes} fix/perf, ${a.bump.stats.other} other)`)}`);
  const arrow = a.bump.level === "none" ? c("dim", "no change") : c("green", `${a.bump.level} bump`);
  log(`  ${c("dim", "bump")}    ${c("cyan", a.current)} ${c("dim", "→")} ${c("bold", c("green", nextVersion))}  ${c("dim", `(${arrow}: ${a.bump.reason})`)}`);
  if (args.command !== "preview" && !args.dryRun) log("");
  else log("");
}

async function applyReleaseActions(
  args: Args,
  pkg: ReturnType<typeof findPackageJson>,
  nextVersion: string,
  run: ReturnType<typeof realGit>,
): Promise<void> {
  if (!args.bump && !args.commit && !args.tag) return;
  log(c("dim", "  ── release actions ──"));
  if (args.bump) {
    if (!pkg) { log(c("yellow", "  ⚠ --bump skipped: no package.json found")); }
    else { bumpPackageVersion(pkg.path, nextVersion); log(`  ${c("green", "✓")} set version ${c("bold", nextVersion)} in ${c("dim", pkg.path)}`); }
  }
  if (args.commit) {
    const files = [args.output, ...(pkg && args.bump ? [pkg.path] : [])];
    try {
      await commitRelease(run, files, nextVersion);
      log(`  ${c("green", "✓")} committed ${c("dim", `chore(release): ${nextVersion}`)}`);
    } catch (err) {
      log(c("red", `  ✗ commit failed: ${err instanceof Error ? err.message : String(err)}`));
      exit(1);
    }
  }
  if (args.tag) {
    try {
      const tag = await createTag(run, nextVersion);
      log(`  ${c("green", "✓")} created annotated tag ${c("bold", tag)}`);
    } catch (err) {
      log(c("red", `  ✗ tag failed: ${err instanceof Error ? err.message : String(err)}`));
      exit(1);
    }
  }
  log(`  ${c("dim", "note: nothing was pushed — run `git push --follow-tags` yourself.")}\n`);
}

main().catch((err) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
