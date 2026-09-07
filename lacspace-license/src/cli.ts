import { stdout, stderr, argv, exit, cwd } from "node:process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, relative, join } from "node:path";
import { generateLicense } from "./generate.js";
import { LICENSE_META, resolveId, supportedIds, metaOf } from "./spdx.js";
import {
  styleForFile, addHeader, updateHeader, removeHeader,
} from "./headers.js";
import type { HeaderFields } from "./headers.js";
import { scanDependencies, renderNotices } from "./notices.js";
import { checkProject } from "./check.js";
import { detectLicenseInfo } from "./detect.js";
import { checkCompatibility } from "./compat.js";
import { findPackageJson, expandGlobs, findLicenseFile } from "./pkg.js";

const VERSION = "0.2.0";

const NO_COLOR = Boolean(process.env.NO_COLOR) || !stdout.isTTY;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => (NO_COLOR ? s : `${C[k]}${s}${C.reset}`);
const log = (s = ""): void => void stderr.write(s + "\n");
const out = (s = ""): void => void stdout.write(s + "\n");

interface Args {
  positional: string[];
  author?: string;
  holder?: string;
  year?: string;
  id?: string;
  output?: string;
  src?: string;
  format?: string;
  template?: string;
  deps?: string;
  requireHeaders: boolean;
  prod: boolean;
  noText: boolean;
  force: boolean;
  dryRun: boolean;
  write: boolean;
  fix: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], requireHeaders: false, prod: false, noText: false,
    force: false, dryRun: false, write: false, fix: false, json: false, help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const val = (): string => list[++i] ?? "";
    if (arg === "--author" || arg === "-a") a.author = val();
    else if (arg === "--holder") a.holder = val();
    else if (arg === "--year" || arg === "-y") a.year = val();
    else if (arg === "--id" || arg === "--spdx") a.id = val();
    else if (arg === "--output" || arg === "-o") a.output = val();
    else if (arg === "--src") a.src = val();
    else if (arg === "--format" || arg === "-f") a.format = val();
    else if (arg === "--template") a.template = val();
    else if (arg === "--deps") a.deps = val();
    else if (arg === "--fix") a.fix = true;
    else if (arg === "--require-headers") a.requireHeaders = true;
    else if (arg === "--prod") a.prod = true;
    else if (arg === "--no-text") a.noText = true;
    else if (arg === "--force") a.force = true;
    else if (arg === "--dry-run") a.dryRun = true;
    else if (arg === "--write" || arg === "-w") a.write = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
    else { log(c("red", `\n✗ Unknown option: ${arg}\n`)); exit(2); }
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-license"))} ${c("dim", "— generate LICENSE files, manage headers & notices")}

${c("bold", "Usage")}
  npx lacspace-license <command> [args] [options]

${c("bold", "Commands")}
  init <spdx>          Write a filled LICENSE file for an SPDX id
  add <globs...>       Add a licence header to matching source files
  update <globs...>    Refresh the header (year/holder/id) on matching files
  remove <globs...>    Strip the licence header from matching files
  notices              Build THIRD-PARTY-NOTICES from node_modules
  detect [file]        Identify the SPDX id of a LICENSE file (default: ./LICENSE)
  compat [ids...]      Flag dependency licences incompatible with your project
  check                CI gate: LICENSE exists, matches package.json, headers
  list                 List supported SPDX ids

${c("bold", "Options")}
  -a, --author <name>    Author name (defaults to package.json author)
      --holder <name>    Copyright holder (defaults to author)
  -y, --year <year>      Copyright year or range (default: current year)
      --id, --spdx <id>  SPDX id for headers/check (default: package.json license)
  -o, --output <file>    Output path (init: LICENSE, notices: THIRD-PARTY-NOTICES.md)
      --src <dir>        Source dir for check --require-headers (default: src)
      --template <str>   Custom header template ({{year}}/{{holder}}/{{id}})
      --deps <ids>       compat: comma-separated dependency SPDX ids to test
      --require-headers  check: also require a header on every source file
      --fix              check: write a missing LICENSE, align package.json, add headers
      --prod             notices/compat: production dependencies only
      --no-text          notices: omit each dependency's bundled licence text
  -f, --format <fmt>     notices: md|txt · list/check: table|json
      --force            init: overwrite an existing LICENSE
      --dry-run          add/update/remove: preview, do not write
  -w, --write            add/update/remove: apply changes to disk
      --json             Machine-readable JSON output
  -h, --help             Show this help
  -v, --version          Print the version

${c("bold", "Examples")}
  npx lacspace-license init MIT --author "Lacspace" --year 2026
  npx lacspace-license init Apache-2.0 -o LICENSE --force
  npx lacspace-license add "src/**/*.{ts,js}" --id MIT --write
  npx lacspace-license add "src/**/*.ts" --dry-run          ${c("dim", "# preview a diff")}
  npx lacspace-license update "src/**/*.ts" --year 2026 --write
  npx lacspace-license notices --prod -o THIRD-PARTY-NOTICES.md
  npx lacspace-license detect LICENSE                       ${c("dim", "# what licence is this?")}
  npx lacspace-license compat --id MIT --deps GPL-3.0,Apache-2.0
  npx lacspace-license compat --prod                        ${c("dim", "# scan node_modules")}
  npx lacspace-license check --require-headers --fix
  npx lacspace-license list
`;

function fail(msg: string, json: boolean, extra: Record<string, unknown> = {}): never {
  if (json) out(JSON.stringify({ ok: false, error: msg, ...extra }));
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

// ---- header field resolution -------------------------------------------------
function resolveHeaderFields(a: Args): HeaderFields {
  const pkg = findPackageJson(cwd());
  const id = a.id ?? pkg?.license;
  if (!id) fail("No SPDX id: pass --id <spdx> or set package.json license.", a.json);
  const canon = resolveId(id!);
  if (!canon) fail(`Unsupported SPDX id: "${id}". Run \`list\`.`, a.json);
  const holder = a.holder ?? a.author ?? pkg?.author;
  const fields: HeaderFields = { id: canon! };
  if (a.year) fields.year = a.year;
  if (holder) fields.holder = holder;
  if (a.template) fields.template = a.template;
  return fields;
}

// ---- init --------------------------------------------------------------------
function runInit(a: Args): void {
  const spdx = a.positional[1];
  if (!spdx) fail("init needs an SPDX id, e.g. `init MIT`. Run `list`.", a.json);
  const canon = resolveId(spdx!);
  if (!canon) fail(`Unsupported SPDX id: "${spdx}". Run \`list\`.`, a.json);
  const pkg = findPackageJson(cwd());
  const author = a.author ?? pkg?.author;
  const holder = a.holder ?? author;
  const fields: { year?: string; holder?: string } = {};
  if (a.year) fields.year = a.year;
  if (holder) fields.holder = holder;
  const gen = generateLicense(canon!, fields);

  const target = resolve(cwd(), a.output ?? "LICENSE");
  if (a.json) {
    out(JSON.stringify({ ok: true, id: gen.id, name: gen.name, output: target, filled: gen.filled, text: gen.text }));
    return;
  }
  if (existsSync(target) && !a.force) {
    fail(`${relative(cwd(), target)} already exists. Use --force to overwrite.`, a.json);
  }
  writeFileSync(target, gen.text);
  log(`\n${c("green", "✓")} wrote ${c("bold", relative(cwd(), target))} ${c("dim", `· ${gen.name}`)}`);
  if (!gen.filled) log(c("dim", "  (this licence has no author/year fields to fill)"));
  else if (!holder) log(c("yellow", "  ⚠ no holder given — filled a placeholder; pass --author/--holder"));
  log("");
}

// ---- header commands ---------------------------------------------------------
type HeaderAction = "add" | "update" | "remove";

function runHeaders(a: Args, action: HeaderAction): void {
  const globs = a.positional.slice(1);
  if (!globs.length) fail(`${action} needs file globs, e.g. \`${action} "src/**/*.ts"\`.`, a.json);
  const files = expandGlobs(globs, cwd());
  if (!files.length) fail(`No files matched: ${globs.join(", ")}`, a.json);

  const fields = action === "remove" ? null : resolveHeaderFields(a);
  const doWrite = a.write && !a.dryRun;

  const results: Array<{ file: string; changed: boolean; skipped?: string }> = [];
  for (const file of files) {
    const style = styleForFile(file);
    if (!style) { results.push({ file, changed: false, skipped: "unknown file type" }); continue; }
    let content: string;
    try { content = readFileSync(file, "utf8"); }
    catch { results.push({ file, changed: false, skipped: "unreadable" }); continue; }

    const res = action === "add" ? addHeader(content, style, fields!)
      : action === "update" ? updateHeader(content, style, fields!)
      : removeHeader(content, style);

    results.push({ file, changed: res.changed });
    if (res.changed && doWrite) writeFileSync(file, res.content);
    if (res.changed && a.dryRun && !a.json) printDiff(file, content, res.content);
  }

  const changed = results.filter((r) => r.changed).length;
  if (a.json) {
    out(JSON.stringify({
      ok: true, action, written: doWrite, changed,
      files: results.map((r) => ({ file: relative(cwd(), r.file), changed: r.changed, ...(r.skipped ? { skipped: r.skipped } : {}) })),
    }));
    return;
  }
  log(`\n${c("bold", c("magenta", `◆ lacspace-license ${action}`))} ${c("dim", `· ${files.length} file${files.length === 1 ? "" : "s"} matched`)}`);
  for (const r of results) {
    const rel = relative(cwd(), r.file);
    if (r.skipped) log(`  ${c("dim", "•")} ${rel} ${c("dim", `(${r.skipped})`)}`);
    else if (r.changed) log(`  ${c("green", doWrite ? "✎" : "±")} ${rel}`);
    else log(`  ${c("dim", "=")} ${c("dim", rel)} ${c("dim", "(no change)")}`);
  }
  const verb = action === "remove" ? "to strip" : action === "update" ? "to refresh" : "to add a header";
  if (!doWrite) log(`\n  ${c("yellow", `${changed} file${changed === 1 ? "" : "s"} ${verb}`)} ${c("dim", "· run again with --write to apply")}\n`);
  else log(`\n  ${c("green", `✓ ${changed} file${changed === 1 ? "" : "s"} updated`)}\n`);
}

function printDiff(file: string, before: string, after: string): void {
  const b = before.split(/\r\n|\n/);
  const aft = after.split(/\r\n|\n/);
  const bSet = new Set(b);
  const aSet = new Set(aft);
  log(c("dim", `  --- ${relative(cwd(), file)}`));
  const window = Math.min(10, Math.max(b.length, aft.length));
  for (let i = 0; i < window; i++) {
    if (b[i] !== undefined && !aSet.has(b[i]!)) log(c("red", `  - ${b[i]}`));
    if (aft[i] !== undefined && !bSet.has(aft[i]!)) log(c("green", `  + ${aft[i]}`));
  }
}

// ---- notices -----------------------------------------------------------------
function runNotices(a: Args): void {
  const modulesDir = join(cwd(), "node_modules");
  if (!existsSync(modulesDir)) fail("No node_modules directory found — run `npm install` first.", a.json);
  const pkg = findPackageJson(cwd());
  const opts: Parameters<typeof scanDependencies>[0] = {
    modulesDir,
    prod: a.prod,
    includeText: !a.noText,
  };
  if (pkg) opts.rootPackage = pkg.path;
  const deps = scanDependencies(opts);
  const format = (a.format === "txt" ? "txt" : "md") as "md" | "txt";

  if (a.json) {
    out(JSON.stringify({ ok: true, count: deps.length, dependencies: deps.map((d) => ({ ...d, licenseText: undefined })) }));
    return;
  }
  const doc = renderNotices(deps, { format, includeText: !a.noText });
  if (a.output) {
    const target = resolve(cwd(), a.output);
    writeFileSync(target, doc);
    log(`\n${c("green", "✓")} wrote ${c("bold", relative(cwd(), target))} ${c("dim", `· ${deps.length} dependenc${deps.length === 1 ? "y" : "ies"}`)}\n`);
  } else {
    stdout.write(doc);
  }
}

// ---- check -------------------------------------------------------------------
function runCheck(a: Args): void {
  const checkOpts: Parameters<typeof checkProject>[0] = { cwd: cwd(), requireHeaders: a.requireHeaders, fix: a.fix };
  if (a.src) checkOpts.src = a.src;
  if (a.holder) checkOpts.holder = a.holder;
  else if (a.author) checkOpts.holder = a.author;
  if (a.year) checkOpts.year = a.year;
  const r = checkProject(checkOpts);
  if (a.json) {
    out(JSON.stringify({
      ok: r.ok,
      licenseFile: r.licenseFile ? relative(cwd(), r.licenseFile) : null,
      detected: r.detected ?? null,
      declared: r.declared ?? null,
      licenseMatches: r.licenseMatches ?? null,
      headersChecked: r.headersChecked,
      missingHeaders: r.missingHeaders.map((f) => relative(cwd(), f)),
      fixed: r.fixed,
      issues: r.issues.map((i) => ({ ...i, file: i.file ? relative(cwd(), i.file) : undefined })),
    }));
    if (!r.ok) exit(1);
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-license check"))}`);
  log(`  ${r.licenseFile ? c("green", "✓") : c("red", "✗")} LICENSE file ${r.licenseFile ? c("dim", relative(cwd(), r.licenseFile)) : c("red", "not found")}`);
  if (r.detected) log(`  ${c("green", "✓")} detected licence ${c("cyan", r.detected)}`);
  if (r.declared) {
    const okm = r.licenseMatches !== false;
    log(`  ${okm ? c("green", "✓") : c("red", "✗")} package.json declares ${c("cyan", r.declared)}${okm ? "" : c("red", " (mismatch)")}`);
  }
  if (a.requireHeaders) {
    const okh = r.missingHeaders.length === 0;
    log(`  ${okh ? c("green", "✓") : c("red", "✗")} headers ${c("dim", `· ${r.headersChecked} file${r.headersChecked === 1 ? "" : "s"} checked, ${r.missingHeaders.length} missing`)}`);
    for (const f of r.missingHeaders.slice(0, 15)) log(`      ${c("red", "•")} ${relative(cwd(), f)}`);
    if (r.missingHeaders.length > 15) log(`      ${c("dim", `…and ${r.missingHeaders.length - 15} more`)}`);
  }
  if (r.fixed.length) {
    log(`  ${c("green", "✎")} fixed ${c("dim", `· ${r.fixed.length} repair${r.fixed.length === 1 ? "" : "s"}`)}`);
    for (const f of r.fixed.slice(0, 15)) log(`      ${c("green", "+")} ${f}`);
    if (r.fixed.length > 15) log(`      ${c("dim", `…and ${r.fixed.length - 15} more`)}`);
  }
  log("");
  if (r.ok) log(`  ${c("green", "✓ all checks passed")}\n`);
  else { log(`  ${c("red", `✗ ${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}`)}\n`); exit(1); }
}

// ---- detect ------------------------------------------------------------------
function runDetect(a: Args): void {
  const file = a.positional[1] ?? findLicenseFile(cwd()) ?? "LICENSE";
  const target = resolve(cwd(), file);
  if (!existsSync(target)) fail(`No such file: ${relative(cwd(), target)}`, a.json);
  let text: string;
  try { text = readFileSync(target, "utf8"); }
  catch { return fail(`Could not read ${relative(cwd(), target)}`, a.json); }
  const info = detectLicenseInfo(text);
  if (a.json) {
    out(JSON.stringify({ ok: info.spdx !== null, file: relative(cwd(), target), spdx: info.spdx, confidence: info.confidence, name: info.name }));
    if (info.spdx === null) exit(1);
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-license detect"))} ${c("dim", `· ${relative(cwd(), target)}`)}`);
  if (info.spdx) {
    const pct = `${Math.round(info.confidence * 100)}%`;
    log(`  ${c("green", "✓")} ${c("cyan", info.spdx)} ${c("dim", `· ${info.name} · ${pct} confidence`)}\n`);
  } else {
    log(`  ${c("yellow", "?")} could not identify this licence ${c("dim", `(best confidence ${Math.round(info.confidence * 100)}%)`)}\n`);
    exit(1);
  }
}

// ---- compat ------------------------------------------------------------------
function runCompat(a: Args): void {
  const pkg = findPackageJson(cwd());
  const projectId = a.id ?? pkg?.license;
  if (!projectId) fail("No project licence: pass --id <spdx> or set package.json license.", a.json);
  const canon = resolveId(projectId!);
  if (!canon) fail(`Unsupported project SPDX id: "${projectId}". Run \`list\`.`, a.json);

  // dependency ids: explicit --deps / positional list, else scan node_modules
  let depIds: string[] = [];
  const explicit = [
    ...(a.deps ? a.deps.split(",") : []),
    ...a.positional.slice(1),
  ].map((s) => s.trim()).filter(Boolean);
  if (explicit.length) {
    depIds = explicit;
  } else {
    const modulesDir = join(cwd(), "node_modules");
    if (!existsSync(modulesDir)) fail("No dependency ids given and no node_modules found — pass --deps or install deps.", a.json);
    const scanOpts: Parameters<typeof scanDependencies>[0] = { modulesDir, prod: a.prod, includeText: false };
    if (pkg) scanOpts.rootPackage = pkg.path;
    depIds = [...new Set(scanDependencies(scanOpts).map((d) => d.license))].sort();
  }
  if (!depIds.length) fail("No dependency licences to check.", a.json);

  const r = checkCompatibility(canon!, depIds);
  if (a.json) {
    out(JSON.stringify(r));
    if (!r.ok) exit(1);
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-license compat"))} ${c("dim", `· project ${r.project} · ${r.issues.length} licence${r.issues.length === 1 ? "" : "s"}`)}`);
  const mark: Record<string, [keyof typeof C, string]> = {
    compatible: ["green", "✓"], incompatible: ["red", "✗"], review: ["yellow", "⚠"], unknown: ["dim", "?"],
  };
  for (const i of r.issues) {
    const [col, sym] = mark[i.verdict]!;
    log(`  ${c(col, sym)} ${c("cyan", i.canonical.padEnd(18))} ${c(col, i.verdict.padEnd(12))} ${c("dim", i.reason)}`);
  }
  log("");
  if (r.ok) {
    if (r.review.length) log(`  ${c("yellow", `⚠ compatible, but ${r.review.length} need review`)}\n`);
    else log(`  ${c("green", "✓ all dependency licences are compatible")}\n`);
  } else {
    log(`  ${c("red", `✗ ${r.incompatible.length} incompatible: ${r.incompatible.join(", ")}`)}\n`);
    exit(1);
  }
}

// ---- list --------------------------------------------------------------------
function runList(a: Args): void {
  const ids = supportedIds();
  if (a.json) {
    out(JSON.stringify({ ok: true, licenses: ids.map((id) => metaOf(id)) }));
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-license"))} ${c("dim", `— ${ids.length} supported licences`)}\n`);
  const catColor: Record<string, keyof typeof C> = {
    permissive: "green", "weak-copyleft": "yellow", copyleft: "red", "public-domain": "cyan",
  };
  for (const id of ids) {
    const m = LICENSE_META[id]!;
    const pad = id.padEnd(18);
    log(`  ${c("cyan", pad)} ${c(catColor[m.category] ?? "dim", m.category.padEnd(14))} ${c("dim", m.name)}`);
  }
  log("");
}

function main(): void {
  const a = parseArgs(argv.slice(2));
  if (a.version) { out(VERSION); return; }
  const command = a.positional[0];
  if (a.help || !command) { out(HELP); return; }

  switch (command) {
    case "init": return runInit(a);
    case "add": return runHeaders(a, "add");
    case "update": return runHeaders(a, "update");
    case "remove": return runHeaders(a, "remove");
    case "notices": return runNotices(a);
    case "detect": return runDetect(a);
    case "compat": return runCompat(a);
    case "check": return runCheck(a);
    case "list": return runList(a);
    default:
      fail(`Unknown command: "${command}". Run --help.`, a.json);
  }
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
