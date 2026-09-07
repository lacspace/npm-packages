import { stdout, stderr, argv, exit, env } from "node:process";
import { writeFileSync } from "node:fs";
import { check, failingCategories } from "./check.js";
import type { FailCategory, I18nReport } from "./check.js";
import { loadLocales } from "./load.js";
import { sortLocales } from "./sort.js";
import { renderHuman, renderMarkdown, toJson } from "./report.js";
import type { Colorize } from "./report.js";

const VERSION = "0.1.0";

const NO_COLOR = !!env.NO_COLOR || !stdout.isTTY;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
} as const;
const c: Colorize = (k, s) => (NO_COLOR ? s : `${C[k as keyof typeof C] ?? ""}${s}${C.reset}`);
const log = (s = ""): void => void stderr.write(s + "\n");

const COMMANDS = new Set(["check", "missing", "unused", "coverage", "sort"]);

interface Args {
  command: string;
  dir: string;
  base?: string;
  src?: string;
  funcs?: string[];
  ignore: string[];
  format: "human" | "json" | "md";
  failOn?: FailCategory[];
  write: boolean;
  fill: boolean;
  fillMarker: string;
  prune: boolean;
  indent: number;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    command: "check", dir: "", ignore: [], format: "human",
    write: false, fill: false, fillMarker: "", prune: false, indent: 2,
    help: false, version: false,
  };
  const positional: string[] = [];
  for (let i = 0; i < list.length; i++) {
    let arg = list[i]!;
    let inlineVal: string | undefined;
    if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      inlineVal = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    const nextVal = (): string => inlineVal ?? list[++i] ?? "";
    if (arg === "--base" || arg === "-b") a.base = nextVal();
    else if (arg === "--src") a.src = nextVal();
    else if (arg === "--func") a.funcs = nextVal().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--ignore") a.ignore.push(...nextVal().split(",").map((s) => s.trim()).filter(Boolean));
    else if (arg === "--format" || arg === "-f") {
      const v = nextVal();
      a.format = v === "json" ? "json" : v === "md" || v === "markdown" ? "md" : "human";
    } else if (arg === "--json") a.format = "json";
    else if (arg === "--fail-on") a.failOn = nextVal().split(",").map((s) => s.trim()).filter(Boolean) as FailCategory[];
    else if (arg === "--write" || arg === "-w") a.write = true;
    else if (arg === "--fill") { a.fill = true; if (inlineVal !== undefined) a.fillMarker = inlineVal; }
    else if (arg === "--prune") a.prune = true;
    else if (arg === "--indent") a.indent = Math.max(0, Number(nextVal()) || 2);
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) positional.push(arg);
  }
  if (positional.length && COMMANDS.has(positional[0]!)) {
    a.command = positional[0]!;
    a.dir = positional[1] ?? "./locales";
  } else {
    a.command = "check";
    a.dir = positional[0] ?? "./locales";
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-i18n"))} ${c("dim", "— find missing/unused/untranslated locale keys, diff & lint i18n files")}

${c("bold", "Usage")}
  npx lacspace-i18n [dir] [options]              ${c("dim", "# default command: check")}
  npx lacspace-i18n <command> [dir] [options]

${c("bold", "Commands")}
  check      ${c("dim", "Full audit: coverage, missing/extra/empty, ICU & code scan (default)")}
  missing    ${c("dim", "List keys present in the base but missing per locale")}
  coverage   ${c("dim", "Per-locale translated-coverage table only")}
  unused     ${c("dim", "Dead (defined-not-used) + undefined (used-not-defined) keys — needs --src")}
  sort       ${c("dim", "Sort/normalize files; --fill adds missing, --prune drops extras")}

${c("bold", "Options")}
  -b, --base <locale>    Base locale to compare against (default: en, else first)
      --src <dir>        Scan a source tree for t()/Trans/\$t key usages
      --func <names>     Comma list of usage funcs/attrs (default: t,\$t,i18n.t,i18nKey)
      --ignore <globs>   Comma list of key prefixes/globs to treat as used
      --fail-on <list>   Exit non-zero on: missing,extra,empty,identical,icu,undefined,dead
  -f, --format <fmt>     human (default) | json | md      (--json = -f json)
      --write            (sort) write changes to disk instead of a dry-run
      --fill[=marker]    (sort) add base keys missing from a locale (marker, default "")
      --prune            (sort) remove keys not present in the base
      --indent <n>       (sort) indent width for JSON/YAML output (default 2)
  -h, --help             Show this help
  -v, --version          Print the version

${c("bold", "Layouts")}
  ${c("dim", "locales/{en,ne,fr}.json          · one file per locale")}
  ${c("dim", "locales/{en,ne}/common.json      · namespaced (keys become ns:key)")}
  ${c("dim", "JSON (nested or flat dotted) · YAML (subset) · .properties")}

${c("bold", "Examples")}
  npx lacspace-i18n ./locales --base en
  npx lacspace-i18n missing ./locales
  npx lacspace-i18n coverage ./locales -f md
  npx lacspace-i18n check ./locales --src ./src --ignore "admin.*,errors."
  npx lacspace-i18n check ./locales --fail-on missing,icu,undefined     ${c("dim", "# CI gate")}
  npx lacspace-i18n sort ./locales --fill=[TODO] --prune --write
`;

function outputReport(report: I18nReport, format: Args["format"]): void {
  if (format === "json") stdout.write(JSON.stringify(toJson(report), null, 2) + "\n");
  else if (format === "md") stdout.write(renderMarkdown(report));
  else log(renderHuman(report, c));
}

function gate(report: I18nReport, failOn: FailCategory[] | undefined, fallback: FailCategory[]): void {
  const categories = failOn ?? fallback;
  const failing = failingCategories(report, categories);
  if (failing.length) {
    log(c("dim", `\nfail-on triggered: ${failing.join(", ")}`));
    exit(1);
  }
}

function runSort(a: Args): void {
  const load = loadLocales(a.dir);
  const base = a.base ?? (load.locales.some((l) => l.code === "en") ? "en" : load.locales[0]!.code);
  const results = sortLocales(load, base, {
    indent: a.indent, fill: a.fill, fillMarker: a.fillMarker, prune: a.prune,
  });
  const changed = results.filter((r) => r.changed);

  if (a.format === "json") {
    stdout.write(JSON.stringify({
      base, write: a.write,
      files: results.map((r) => ({
        path: r.path, changed: r.changed, added: r.added, removed: r.removed, reordered: r.reordered,
      })),
    }, null, 2) + "\n");
    if (a.write) for (const r of changed) writeFileSync(r.path, r.after);
    return;
  }

  log(`\n${c("bold", c("magenta", "◆ lacspace-i18n sort"))}  ${c("dim", `${a.dir} · base ${base}${a.write ? "" : " · dry-run"}`)}`);
  if (!changed.length) {
    log(`  ${c("green", "✓ already sorted & in sync")}\n`);
    return;
  }
  for (const r of changed) {
    const tags: string[] = [];
    if (r.added.length) tags.push(c("green", `+${r.added.length}`));
    if (r.removed.length) tags.push(c("red", `-${r.removed.length}`));
    if (r.reordered) tags.push(c("cyan", "reordered"));
    log(`  ${c("bold", r.path)}  ${tags.join(" ")}`);
    if (r.added.length) log(`     ${c("green", "add")}    ${c("dim", r.added.slice(0, 10).join(", ") + (r.added.length > 10 ? " …" : ""))}`);
    if (r.removed.length) log(`     ${c("red", "remove")} ${c("dim", r.removed.slice(0, 10).join(", ") + (r.removed.length > 10 ? " …" : ""))}`);
    if (a.write) writeFileSync(r.path, r.after);
  }
  log("");
  log(`  ${a.write ? c("green", `✓ wrote ${changed.length} file(s)`) : c("yellow", `${changed.length} file(s) would change — re-run with --write`)}\n`);
}

function runMissing(a: Args): void {
  const report = check(a.dir, a.base ? { base: a.base } : {});
  if (a.format === "json") {
    const obj: Record<string, string[]> = {};
    for (const l of report.locales) obj[l.locale] = l.missing;
    stdout.write(JSON.stringify(obj, null, 2) + "\n");
  } else if (a.format === "md") {
    stdout.write(renderMarkdown(report));
  } else {
    log(`\n${c("bold", c("magenta", "◆ lacspace-i18n missing"))}  ${c("dim", `${a.dir} · base ${report.base}`)}\n`);
    for (const l of report.locales) {
      if (!l.missing.length) { log(`  ${c("green", "✓")} ${c("bold", l.locale)} ${c("dim", "complete")}`); continue; }
      log(`  ${c("red", "✗")} ${c("bold", l.locale)} ${c("dim", `(${l.missing.length} missing)`)}`);
      for (const k of l.missing) log(`      ${c("dim", k)}`);
    }
    log("");
  }
  gate(report, a.failOn, ["missing"]);
}

function runCoverage(a: Args): void {
  const report = check(a.dir, a.base ? { base: a.base } : {});
  if (a.format === "json") {
    const obj: Record<string, number> = {};
    for (const l of report.locales) obj[l.locale] = l.coverage;
    stdout.write(JSON.stringify({ base: report.base, total: report.baseTotal, coverage: obj }, null, 2) + "\n");
  } else if (a.format === "md") {
    stdout.write(renderMarkdown(report));
  } else {
    log(renderHuman({ ...report, placeholders: [], malformed: [], code: null }, c));
  }
  gate(report, a.failOn, []);
}

function runUnused(a: Args): void {
  if (!a.src) {
    log(c("red", "\n✗ unused needs --src <dir> to scan for key usages\n"));
    exit(1);
  }
  const report = check(a.dir, {
    ...(a.base ? { base: a.base } : {}),
    src: a.src,
    ...(a.funcs ? { funcs: a.funcs } : {}),
    ignore: a.ignore,
  });
  const code = report.code!;
  if (a.format === "json") {
    stdout.write(JSON.stringify({
      base: report.base, files: code.files, dynamic: code.dynamic,
      dead: code.dead, undefined: code.undefinedKeys,
    }, null, 2) + "\n");
  } else if (a.format === "md") {
    stdout.write(renderMarkdown(report));
  } else {
    log(`\n${c("bold", c("magenta", "◆ lacspace-i18n unused"))}  ${c("dim", `${a.dir} · base ${report.base} · scanned ${code.files} files`)}\n`);
    if (code.undefinedKeys.length) {
      log(`  ${c("red", `undefined — used in code, missing from ${report.base} (${code.undefinedKeys.length})`)}`);
      for (const k of code.undefinedKeys) log(`      ${c("dim", k)}`);
    }
    if (code.dead.length) {
      log(`  ${c("yellow", `dead — defined but never referenced (${code.dead.length})`)}`);
      for (const k of code.dead) log(`      ${c("dim", k)}`);
    }
    if (!code.undefinedKeys.length && !code.dead.length) log(`  ${c("green", "✓ every key is used and defined")}`);
    if (code.dynamic > 0) log(`\n  ${c("dim", `note: ${code.dynamic} dynamic t(var) usage(s) unresolved — 'dead' is advisory; use --ignore for computed prefixes`)}`);
    log("");
  }
  gate(report, a.failOn, ["dead", "undefined"]);
}

function main(): void {
  const a = parseArgs(argv.slice(2));
  if (a.version) { stdout.write(VERSION + "\n"); return; }
  if (a.help) { stdout.write(HELP + "\n"); return; }

  switch (a.command) {
    case "sort": runSort(a); return;
    case "missing": runMissing(a); return;
    case "coverage": runCoverage(a); return;
    case "unused": runUnused(a); return;
    case "check":
    default: {
      const report = check(a.dir, {
        ...(a.base ? { base: a.base } : {}),
        ...(a.src ? { src: a.src } : {}),
        ...(a.funcs ? { funcs: a.funcs } : {}),
        ignore: a.ignore,
      });
      outputReport(report, a.format);
      gate(report, a.failOn, ["missing", "empty", "icu", "undefined"]);
      return;
    }
  }
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
