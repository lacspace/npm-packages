import { stdout, stderr, argv, exit, env } from "node:process";
import { resolve } from "node:path";
import { audit, shouldFail } from "./audit.js";
import type { AuditReport, AuditOptions, FailOn } from "./audit.js";
import { makeColor, renderHuman, renderMarkdown } from "./format.js";
import type { Colorize } from "./format.js";
import { formatBytes } from "./size.js";

const VERSION = "0.1.0";

const FOCUSES = ["licenses", "size", "duplicates", "unused", "outdated"] as const;
type Focus = (typeof FOCUSES)[number];

const colorEnabled = !env.NO_COLOR && stdout.isTTY !== false && !env.CI;
const c: Colorize = makeColor(!!colorEnabled);
const log = (s = ""): void => void stderr.write(s + "\n");
const out = (s = ""): void => void stdout.write(s + "\n");

interface Args {
  dir: string;
  focus: Focus | null;
  allow: string[];
  deny: string[];
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
    dir: ".", focus: null, allow: [], deny: [], outdated: false, prod: false,
    gzip: false, json: false, md: false, top: 10, ignoreUnused: [],
    noToolingIgnore: false, failOn: [], help: false, version: false,
  };
  const positionals: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--allow") a.allow.push(...splitList(nextVal()));
    else if (arg === "--deny") a.deny.push(...splitList(nextVal()));
    else if (arg === "--outdated") a.outdated = true;
    else if (arg === "--prod") a.prod = true;
    else if (arg === "--gzip") a.gzip = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-f" || arg === "--format") { if (nextVal() === "md") a.md = true; }
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
  // positional[0] may be a focus keyword; the remaining (or first) is the dir
  const rest = [...positionals];
  if (rest.length && FOCUSES.includes(rest[0] as Focus)) {
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

${c("bold", "What it checks")} ${c("dim", "(all offline except --outdated)")}
  ${c("dim", "· licences (allow/deny policy)   · install size on disk")}
  ${c("dim", "· duplicate versions            · unused & missing deps")}
  ${c("dim", "· outdated majors (opt-in, online)")}

${c("bold", "Options")}
  --allow <list>       Comma list of allowed licence globs (e.g. "MIT,ISC,BSD-*")
  --deny <list>        Comma list of denied licence globs (e.g. "GPL-*,AGPL-*")
  --outdated           Also check the npm registry for newer versions (network)
  --registry <url>     Registry base for --outdated (default registry.npmjs.org)
  --prod               Ignore devDependencies
  --gzip               Add a rough gzip-size estimate to the size report
  --top <n>            How many rows per section to show (default 10)
  --ignore-unused <l>  Names to never report as unused (comma list)
  --no-tooling-ignore  Don't auto-ignore build tooling in the unused check
  --fail-on <list>     Exit non-zero on any of: unused,missing,license,outdated,duplicates
  --json               Machine-readable JSON output
  -f, --format md      Markdown report (great for CI job summaries)
  -h, --help           Show this help
  -v, --version        Print the version

${c("bold", "Exit code")}
  ${c("dim", "Licence policy violations ALWAYS exit 1. --fail-on adds category gates. CI-ready.")}

${c("bold", "Examples")}
  npx lacspace-deps
  npx lacspace-deps ./my-app --allow "MIT,ISC,Apache-2.0,BSD-*" --deny "GPL-*,AGPL-*"
  npx lacspace-deps licenses --json
  npx lacspace-deps size --top 15 --gzip
  npx lacspace-deps unused --fail-on unused,missing
  npx lacspace-deps duplicates
  npx lacspace-deps outdated ./my-app
  npx lacspace-deps -f md > deps-report.md
`;

async function buildReport(a: Args): Promise<AuditReport> {
  const opts: AuditOptions = {
    prod: a.prod,
    gzip: a.gzip,
    policy: { allow: a.allow, deny: a.deny },
    usage: { ignoreUnused: a.ignoreUnused, noToolingIgnore: a.noToolingIgnore },
  };
  if (a.outdated) {
    opts.outdated = a.registry ? { registry: a.registry } : {};
  }
  return audit(resolve(a.dir), opts);
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

  let report: AuditReport;
  try {
    report = await buildReport(a);
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

  if (shouldFail(report!, a.failOn)) exit(1);
}

main().catch((err) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
