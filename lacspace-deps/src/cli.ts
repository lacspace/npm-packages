import { stdout, stderr, argv, exit, env } from "node:process";
import { resolve } from "node:path";
import { audit, shouldFail } from "./audit.js";
import type { AuditReport, AuditOptions, FailOn } from "./audit.js";
import { makeColor, renderHuman, renderMarkdown } from "./format.js";
import type { Colorize } from "./format.js";
import { formatBytes } from "./size.js";
import { buildInventory } from "./inventory.js";
import { buildSbom } from "./sbom.js";
import type { SbomFormat } from "./sbom.js";
import { loadConfig, mergeConfig } from "./policy.js";
import type { DepsConfig } from "./policy.js";
import type { LicenseCategory } from "./licenses.js";

const VERSION = "0.2.0";

const FOCUSES = ["licenses", "size", "duplicates", "unused", "outdated"] as const;
type Focus = (typeof FOCUSES)[number];

const SEVERITIES = ["permissive", "weak-copyleft", "strong-copyleft", "unknown"] as const;

function parseSbomFormat(v: string): SbomFormat | null {
  const s = v.toLowerCase();
  if (s === "cyclonedx" || s === "cdx" || s === "cyclone") return "cyclonedx";
  if (s === "spdx") return "spdx";
  return null;
}

const colorEnabled = !env.NO_COLOR && stdout.isTTY !== false && !env.CI;
const c: Colorize = makeColor(!!colorEnabled);
const log = (s = ""): void => void stderr.write(s + "\n");
const out = (s = ""): void => void stdout.write(s + "\n");

interface Args {
  dir: string;
  focus: Focus | null;
  sbom: boolean;
  sbomFormat: SbomFormat;
  allow: string[];
  deny: string[];
  maxSeverity?: LicenseCategory;
  policyPath?: string;
  outdated: boolean;
  prod: boolean;
  gzip: boolean;
  json: boolean;
  md: boolean;
  top: number;
  registry?: string;
  ignoreUnused: string[];
  noToolingIgnore: boolean;
  failOn: FailOn[];
  help: boolean;
  version: boolean;
}

function splitList(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    dir: ".", focus: null, sbom: false, sbomFormat: "cyclonedx", allow: [], deny: [],
    outdated: false, prod: false, gzip: false, json: false, md: false, top: 10,
    ignoreUnused: [], noToolingIgnore: false, failOn: [], help: false, version: false,
  };
  const positionals: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--allow") a.allow.push(...splitList(nextVal()));
    else if (arg === "--deny") a.deny.push(...splitList(nextVal()));
    else if (arg === "--max-severity") {
      const v = nextVal();
      if (SEVERITIES.includes(v as LicenseCategory)) a.maxSeverity = v as LicenseCategory;
    }
    else if (arg === "--policy") a.policyPath = nextVal();
    else if (arg === "--outdated") a.outdated = true;
    else if (arg === "--prod") a.prod = true;
    else if (arg === "--gzip") a.gzip = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-f" || arg === "--format") {
      const v = nextVal();
      if (v === "md" || v === "markdown") a.md = true;
      else { const fmt = parseSbomFormat(v); if (fmt) a.sbomFormat = fmt; }
    }
    else if (arg === "--md") a.md = true;
    else if (arg === "--top") a.top = Math.max(1, Number(nextVal()) || 10);
    else if (arg === "--registry") a.registry = nextVal();
    else if (arg === "--ignore-unused") a.ignoreUnused.push(...splitList(nextVal()));
    else if (arg === "--no-tooling-ignore") a.noToolingIgnore = true;
    else if (arg === "--fail-on") {
      for (const g of splitList(nextVal())) {
        if (["unused", "missing", "license", "outdated", "duplicates"].includes(g)) {
          a.failOn.push(g as FailOn);
        }
      }
    } else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) positionals.push(arg);
  }
  // positional[0] may be a command (`sbom`) or focus keyword; the rest is the dir
  const rest = [...positionals];
  if (rest.length && rest[0] === "sbom") {
    a.sbom = true;
    rest.shift();
  } else if (rest.length && FOCUSES.includes(rest[0] as Focus)) {
    a.focus = rest.shift() as Focus;
  }
  if (rest.length) a.dir = rest[0]!;
  if (a.focus === "outdated") a.outdated = true;
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-deps"))} ${c("dim", "— keyless dependency & licence auditor for Node/JS projects")}

${c("bold", "Usage")}
  npx lacspace-deps [dir] [options]
  npx lacspace-deps <licenses|size|duplicates|unused|outdated> [dir] [options]
  npx lacspace-deps sbom [dir] --format cyclonedx|spdx

${c("bold", "What it checks")} ${c("dim", "(all offline except --outdated)")}
  ${c("dim", "· licences (allow/deny/max-severity policy)   · install size on disk")}
  ${c("dim", "· duplicate versions            · unused & missing deps")}
  ${c("dim", "· SBOM export (CycloneDX/SPDX)  · outdated majors (opt-in, online)")}

${c("bold", "Options")}
  --allow <list>       Comma list of allowed licence globs (e.g. "MIT,ISC,BSD-*")
  --deny <list>        Comma list of denied licence globs (e.g. "GPL-*,AGPL-*")
  --max-severity <c>   Strictest licence category tolerated: permissive|weak-copyleft|
                       strong-copyleft|unknown (anything stricter is a violation)
  --policy <path>      Load an explicit policy file (default: auto-discover .depsrc.json)
  --outdated           Also check the npm registry for newer versions (network)
  --registry <url>     Registry base for --outdated (default registry.npmjs.org)
  --prod               Ignore devDependencies
  --gzip               Add a rough gzip-size estimate to the size report
  --top <n>            How many rows per section to show (default 10)
  --ignore-unused <l>  Names to never report as unused (comma list)
  --no-tooling-ignore  Don't auto-ignore build tooling in the unused check
  --fail-on <list>     Exit non-zero on any of: unused,missing,license,outdated,duplicates
  --json               Machine-readable JSON output
  -f, --format <fmt>   Report format: md (Markdown) — or for sbom: cyclonedx|spdx
  -h, --help           Show this help
  -v, --version        Print the version

${c("bold", "Policy file")} ${c("dim", "(.depsrc.json, auto-discovered; CLI flags override it)")}
  ${c("dim", `{ "allow": ["MIT","ISC","BSD-*"], "deny": ["GPL-*"], "maxSeverity": "weak-copyleft",`)}
  ${c("dim", `  "failOn": ["missing","duplicates"], "ignoreUnused": ["some-tool"] }`)}

${c("bold", "Exit code")}
  ${c("dim", "Licence policy violations ALWAYS exit 1. --fail-on adds category gates. CI-ready.")}

${c("bold", "Examples")}
  npx lacspace-deps
  npx lacspace-deps ./my-app --allow "MIT,ISC,Apache-2.0,BSD-*" --deny "GPL-*,AGPL-*"
  npx lacspace-deps --max-severity weak-copyleft --fail-on license
  npx lacspace-deps --policy ./config/.depsrc.json
  npx lacspace-deps licenses --json
  npx lacspace-deps size --top 15 --gzip
  npx lacspace-deps unused --fail-on unused,missing
  npx lacspace-deps duplicates
  npx lacspace-deps sbom --format cyclonedx > bom.json
  npx lacspace-deps sbom ./my-app --format spdx > sbom.spdx.json
  npx lacspace-deps outdated ./my-app
  npx lacspace-deps -f md > deps-report.md
`;

/** Build a DepsConfig from CLI flags (used as the override over a file config). */
function cliToConfig(a: Args): DepsConfig {
  const cfg: DepsConfig = {};
  if (a.allow.length) cfg.allow = a.allow;
  if (a.deny.length) cfg.deny = a.deny;
  if (a.maxSeverity) cfg.maxSeverity = a.maxSeverity;
  if (a.prod) cfg.prod = true;
  if (a.gzip) cfg.gzip = true;
  if (a.ignoreUnused.length) cfg.ignoreUnused = a.ignoreUnused;
  if (a.failOn.length) cfg.failOn = a.failOn;
  return cfg;
}

async function buildReport(dir: string, merged: DepsConfig, a: Args): Promise<AuditReport> {
  const opts: AuditOptions = {
    prod: !!merged.prod,
    gzip: !!merged.gzip,
    policy: {
      ...(merged.allow ? { allow: merged.allow } : {}),
      ...(merged.deny ? { deny: merged.deny } : {}),
      ...(merged.maxSeverity ? { maxSeverity: merged.maxSeverity } : {}),
    },
    usage: { ignoreUnused: merged.ignoreUnused ?? [], noToolingIgnore: a.noToolingIgnore },
  };
  if (a.outdated) {
    opts.outdated = a.registry ? { registry: a.registry } : {};
  }
  return audit(dir, opts);
}

function focusJson(r: AuditReport, focus: Focus): unknown {
  switch (focus) {
    case "licenses": return { licenses: r.licenses };
    case "size": return { size: r.size };
    case "duplicates": return { duplicates: r.duplicates };
    case "unused": return { usage: r.usage };
    case "outdated": return { outdated: r.outdated ?? null };
  }
}

function renderFocus(r: AuditReport, focus: Focus, top: number): string {
  const L: string[] = [""];
  const push = (s = ""): void => void L.push(s);
  switch (focus) {
    case "licenses": {
      const t = r.licenses.totals;
      push(`${c("bold", c("magenta", "◆ licences"))}`);
      push(`  ${c("green", `${t.permissive} permissive`)}  ${c("yellow", `${t["weak-copyleft"]} weak`)}  ${c("red", `${t["strong-copyleft"]} strong`)}  ${c("gray", `${t.unknown} unknown`)}`);
      for (const e of r.licenses.entries) {
        const col = e.category === "permissive" ? "green" : e.category === "unknown" ? "gray" : e.category === "weak-copyleft" ? "yellow" : "red";
        push(`  ${c(col, "•")} ${e.name} ${c("dim", e.version)}  ${c("dim", e.license ?? "UNKNOWN")}`);
      }
      if (r.licenses.violations.length) {
        push(`  ${c("red", `✗ ${r.licenses.violations.length} violation(s)`)}`);
      }
      break;
    }
    case "size": {
      const gz = r.size.gzipEstimateBytes ? `  ${c("dim", `≈${formatBytes(r.size.gzipEstimateBytes)} gzip est.`)}` : "";
      push(`${c("bold", c("magenta", "◆ install size"))} ${c("cyan", formatBytes(r.size.totalBytes))} ${c("dim", `· ${r.size.totalFiles} files`)}${gz}`);
      for (const e of r.size.entries.slice(0, top)) {
        push(`  ${c("cyan", formatBytes(e.bytes).padEnd(9))} ${e.name} ${c("dim", e.version)} ${c("dim", `(${e.files} files)`)}`);
      }
      break;
    }
    case "duplicates": {
      push(`${c("bold", c("magenta", "◆ duplicates"))} ${c("dim", `· ${r.duplicates.length} package(s)`)}`);
      for (const d of r.duplicates) {
        push(`  ${c("yellow", "•")} ${d.name} ${c("dim", `→ ${d.versions.join(", ")}`)}`);
        for (const v of d.versions) {
          for (const loc of d.locations[v] ?? []) push(`      ${c("dim", `${v}  ${loc}`)}`);
        }
      }
      if (!r.duplicates.length) push(`  ${c("green", "none — every package resolves to a single version")}`);
      break;
    }
    case "unused": {
      push(`${c("bold", c("magenta", "◆ unused & missing"))} ${c("dim", `· scanned ${r.usage.files} file(s)`)}`);
      push(`  ${c("yellow", `unused (${r.usage.unused.length})`)} ${c("dim", r.usage.unused.join(", ") || "none")}`);
      push(`  ${c("red", `missing (${r.usage.missing.length})`)} ${c("dim", r.usage.missing.join(", ") || "none")}`);
      if (r.usage.ignoredTooling.length) push(`  ${c("dim", `ignored tooling: ${r.usage.ignoredTooling.join(", ")}`)}`);
      break;
    }
    case "outdated": {
      const o = r.outdated;
      push(`${c("bold", c("magenta", "◆ outdated"))} ${c("dim", o ? `· ${o.behind} behind, ${o.majors} major(s)` : "")}`);
      if (!o) { push(`  ${c("dim", "no data")}`); break; }
      for (const e of o.entries) {
        const col = e.level === "major" ? "red" : e.level === "minor" ? "yellow" : e.level === "up-to-date" ? "green" : "cyan";
        push(`  ${c(col, e.level.padEnd(11))} ${e.name} ${c("dim", `${e.current} → ${e.latest ?? "?"}`)}`);
      }
      break;
    }
  }
  push("");
  return L.join("\n");
}

async function main(): Promise<void> {
  const a = parseArgs(argv.slice(2));
  if (a.version) { out(VERSION); return; }
  if (a.help) { out(HELP); return; }

  const dir = resolve(a.dir);

  // sbom command: emit a CycloneDX / SPDX document and exit (no policy gate).
  if (a.sbom) {
    try {
      const inv = buildInventory(dir, a.prod ? { prod: true } : {});
      const doc = buildSbom(inv, { format: a.sbomFormat });
      out(JSON.stringify(doc, null, 2));
    } catch (err) {
      if (a.json) out(JSON.stringify({ ok: false, error: (err as Error).message }));
      else log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
      exit(1);
    }
    return;
  }

  // Layer CLI flags over an optional .depsrc.json (CLI wins).
  let merged: DepsConfig;
  let effectiveFailOn: FailOn[];
  try {
    const { config: fileConfig } = loadConfig(dir, a.policyPath);
    merged = mergeConfig(fileConfig, cliToConfig(a));
    effectiveFailOn = [...new Set([...(fileConfig.failOn ?? []), ...a.failOn])];
  } catch (err) {
    if (a.json) out(JSON.stringify({ ok: false, error: (err as Error).message }));
    else log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
    exit(1);
  }

  let report: AuditReport;
  try {
    report = await buildReport(dir, merged!, a);
  } catch (err) {
    if (a.json) out(JSON.stringify({ ok: false, error: (err as Error).message }));
    else log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
    exit(1);
  }

  if (a.json) {
    const payload = a.focus ? focusJson(report!, a.focus) : report!;
    out(JSON.stringify(payload, null, 2));
  } else if (a.md) {
    out(renderMarkdown(report!));
  } else if (a.focus) {
    log(renderFocus(report!, a.focus, a.top));
  } else {
    log(renderHuman(report!, c, a.top));
  }

  if (shouldFail(report!, effectiveFailOn!)) exit(1);
}

main().catch((err) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
