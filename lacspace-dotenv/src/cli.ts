import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, env as processEnv, exit } from "node:process";
import { parseEnv } from "./parse.js";
import { lintEnv } from "./lint.js";
import type { Issue } from "./lint.js";
import { diffEnvs, appendKeys } from "./diff.js";
import { genTypes } from "./types-gen.js";
import { checkEnv } from "./check.js";

const VERSION = "0.1.0";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  positional: string[];
  write: boolean;
  out?: string;
  name?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { positional: [], write: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--write" || arg === "--fix") a.write = true;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--name") a.name = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", "— lint, diff, sync & type your .env files")}

${c("bold", "Usage")}
  npx lacspace-dotenv <command> [args] [options]

${c("bold", "Commands")}
  ${c("cyan", "lint")}  [file]           Lint a .env file (default ${c("dim", ".env")})
                          duplicates, spacing, naming, empty values, secrets
  ${c("cyan", "diff")}  [a] [b]          Show keys missing in either file
                          (default ${c("dim", ".env")} vs ${c("dim", ".env.example")})
  ${c("cyan", "sync")}  [a] [b]          Add keys from <a> that are missing in <b>
                          dry-run unless ${c("dim", "--write")}; only writes placeholders
  ${c("cyan", "types")} [file]           Emit a typed Env accessor (TypeScript)
  ${c("cyan", "check")} [example]        Verify process.env has every example key (CI gate)

${c("bold", "Options")}
      --write, --fix     Actually mutate the target (sync)
  -o, --out <file>       Write output to a file (types); default stdout
      --name <Name>      Interface name for ${c("dim", "types")} (default ${c("dim", "Env")})
  -h, --help             Show this help
  -v, --version          Print version

${c("bold", "Examples")}
  npx lacspace-dotenv lint .env
  npx lacspace-dotenv diff .env .env.example
  npx lacspace-dotenv sync .env .env.example --write
  npx lacspace-dotenv types .env.example -o src/env.d.ts
  npx lacspace-dotenv check .env.example

${c("dim", "Zero dependencies. Secret values are always masked, never printed in full.")}
`;

function read(path: string): string {
  const full = resolve(path);
  if (!existsSync(full)) {
    log(c("red", `\n✗ File not found: ${path}\n`));
    exit(1);
  }
  return readFileSync(full, "utf8");
}

const LEVEL_MARK: Record<Issue["level"], string> = {
  error: c("red", "✗"),
  warn: c("yellow", "▲"),
};

function cmdLint(file: string): void {
  const text = read(file);
  const issues = lintEnv(text);
  log(`\n${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", `— linting ${file}`)}\n`);
  if (issues.length === 0) {
    log(`  ${c("green", "✔")} ${c("dim", "no issues found")}\n`);
    return;
  }
  for (const it of issues) {
    log(`  ${LEVEL_MARK[it.level]} ${c("dim", `L${it.line}`)} ${it.message} ${c("dim", `[${it.rule}]`)}`);
  }
  const errors = issues.filter((i) => i.level === "error").length;
  const warns = issues.length - errors;
  log(`\n  ${c("dim", `${errors} error(s) · ${warns} warning(s)`)}\n`);
  if (errors > 0) exit(1);
}

function cmdDiff(aFile: string, bFile: string): void {
  const a = read(aFile);
  const b = read(bFile);
  const { missingInA, missingInB } = diffEnvs(a, b);
  log(`\n${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", `— diff ${aFile} ↔ ${bFile}`)}\n`);
  if (missingInB.length === 0 && missingInA.length === 0) {
    log(`  ${c("green", "✔")} ${c("dim", "both files declare the same keys")}\n`);
    return;
  }
  if (missingInB.length) {
    log(`  ${c("yellow", "▲")} ${c("bold", `${missingInB.length}`)} ${c("dim", `key(s) in ${aFile} but missing from ${bFile}`)}`);
    for (const k of missingInB) log(`      ${c("green", "+")} ${k}`);
  }
  if (missingInA.length) {
    log(`  ${c("yellow", "▲")} ${c("bold", `${missingInA.length}`)} ${c("dim", `key(s) in ${bFile} but missing from ${aFile}`)}`);
    for (const k of missingInA) log(`      ${c("red", "-")} ${k}`);
  }
  log("");
  exit(1);
}

function cmdSync(aFile: string, bFile: string, write: boolean): void {
  const a = read(aFile);
  const b = read(bFile);
  const { missingInB } = diffEnvs(a, b);
  log(`\n${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", `— sync ${aFile} → ${bFile}`)}\n`);
  if (missingInB.length === 0) {
    log(`  ${c("green", "✔")} ${c("dim", `${bFile} already has every key in ${aFile}`)}\n`);
    return;
  }
  for (const k of missingInB) log(`      ${c("green", "+")} ${k}=`);
  if (write) {
    writeFileSync(resolve(bFile), appendKeys(b, missingInB));
    log(`\n  ${c("green", "✔")} ${c("dim", `added ${missingInB.length} placeholder(s) to ${bFile}`)}\n`);
  } else {
    log(`\n  ${c("dim", `${missingInB.length} key(s) would be added — re-run with --write to apply`)}\n`);
    exit(1);
  }
}

function cmdTypes(file: string, out: string | undefined, name: string | undefined): void {
  const text = read(file);
  const { map } = parseEnv(text);
  const src = genTypes(Object.keys(map), name ? { interfaceName: name } : {});
  if (out) {
    writeFileSync(resolve(out), src);
    log(`\n  ${c("green", "✔")} ${c("dim", `typed accessor → ${out}`)}\n`);
  } else {
    stdout.write(src);
  }
}

function cmdCheck(file: string): void {
  const text = read(file);
  const { ok, missing } = checkEnv(text, processEnv);
  log(`\n${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", `— check process.env against ${file}`)}\n`);
  if (ok) {
    log(`  ${c("green", "✔")} ${c("dim", "every required key is set")}\n`);
    return;
  }
  log(`  ${c("red", "✗")} ${c("bold", `${missing.length}`)} ${c("dim", "required key(s) missing from the environment:")}`);
  for (const k of missing) log(`      ${c("red", "-")} ${k}`);
  log("");
  exit(1);
}

function main(): void {
  const [cmd, ...rest] = argv.slice(2);
  const args = parseArgs(rest);

  if (args.version || cmd === "--version" || cmd === "-v") { stdout.write(VERSION + "\n"); return; }
  if (!cmd || args.help || cmd === "--help" || cmd === "-h") { stdout.write(HELP + "\n"); return; }

  switch (cmd) {
    case "lint":
      cmdLint(args.positional[0] ?? ".env");
      break;
    case "diff":
      cmdDiff(args.positional[0] ?? ".env", args.positional[1] ?? ".env.example");
      break;
    case "sync":
      cmdSync(args.positional[0] ?? ".env", args.positional[1] ?? ".env.example", args.write);
      break;
    case "types":
      cmdTypes(args.positional[0] ?? ".env", args.out, args.name);
      break;
    case "check":
      cmdCheck(args.positional[0] ?? ".env.example");
      break;
    default:
      log(c("red", `\n✗ Unknown command: ${cmd}`));
      log(c("dim", "  Run with --help to see available commands.\n"));
      exit(1);
  }
}

try {
  main();
} catch (err: unknown) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
