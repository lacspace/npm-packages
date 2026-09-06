import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, extname, basename } from "node:path";
import { stdout, stderr, argv, env as processEnv, exit } from "node:process";
import { parseEnv } from "./parse.js";
import { lintEnv } from "./lint.js";
import type { Issue } from "./lint.js";
import { diffEnvs, appendKeys } from "./diff.js";
import { genTypes } from "./types-gen.js";
import { checkEnv } from "./check.js";
import { resolveEnv } from "./interpolate.js";
import { encryptEnv, decryptEnv } from "./crypto.js";
import { envMatrix } from "./matrix.js";
import { toExample, redactEnv } from "./example.js";
import { toJSON, fromJSON, toYAML, fromYAML, renderEnv } from "./convert.js";
import { mergeEnv, runWith } from "./run.js";
import { installHook } from "./hook.js";

const VERSION = "0.2.0";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");
const brand = (tail: string): string => `\n${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", `— ${tail}`)}\n`;

interface Args {
  positional: string[];
  write: boolean;
  out?: string;
  name?: string;
  key?: string;
  envFiles: string[];
  allow: string[];
  json: boolean;
  yaml: boolean;
  expand: boolean;
  denySecrets: boolean;
  noOverride: boolean;
  force: boolean;
  help: boolean;
  version: boolean;
  /** Everything after a literal `--` (used by `run`). */
  rest: string[];
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], write: false, envFiles: [], allow: [], json: false, yaml: false,
    expand: false, denySecrets: false, noOverride: false, force: false, help: false, version: false, rest: [],
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--") { a.rest = list.slice(i + 1); break; }
    else if (arg === "--write" || arg === "--fix") a.write = true;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--name") a.name = next();
    else if (arg === "-k" || arg === "--key") a.key = next();
    else if (arg === "-e" || arg === "--env") a.envFiles.push(next());
    else if (arg === "--allow") a.allow.push(next());
    else if (arg === "--json") a.json = true;
    else if (arg === "--yaml" || arg === "--yml") a.yaml = true;
    else if (arg === "--expand") a.expand = true;
    else if (arg === "--deny-secrets" || arg === "--strict") a.denySecrets = true;
    else if (arg === "--no-override") a.noOverride = true;
    else if (arg === "--force" || arg === "-f") a.force = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-dotenv"))} ${c("dim", "— lint, diff, sync, type, run & protect your .env files")}

${c("bold", "Usage")}
  npx lacspace-dotenv <command> [args] [options]

${c("bold", "Commands")}
  ${c("cyan", "lint")}    [file]            Lint a .env (duplicates, spacing, naming, secrets,
                            undefined & circular \${refs}); ${c("dim", "--expand")} prints resolved
  ${c("cyan", "diff")}    [a] [b]           Show keys missing in either file
  ${c("cyan", "sync")}    [a] [b]           Add keys from <a> missing in <b> (placeholders only)
  ${c("cyan", "types")}   [file]            Emit a typed Env accessor (TypeScript)
  ${c("cyan", "check")}   [example]         Verify process.env has every example key (CI gate)
  ${c("cyan", "run")}     -e .env -- <cmd>  Load env file(s) then run a command with them
  ${c("cyan", "encrypt")} <file>            Encrypt a .env → .env.enc (AES-256-GCM), needs ${c("dim", "--key")}
  ${c("cyan", "decrypt")} <file.enc>        Decrypt a .env.enc back to plaintext, needs ${c("dim", "--key")}
  ${c("cyan", "matrix")}  <a> <b> [c...]    Table of which keys exist in which environment
  ${c("cyan", "init")}    [file]            Generate a .env.example from a .env (values blanked)
  ${c("cyan", "redact")}  [file]            Print the file with every value masked (safe to paste)
  ${c("cyan", "export")}  <file>            Print the env as ${c("dim", "--json")} or ${c("dim", "--yaml")}
  ${c("cyan", "import")}  <file.json|yaml>  Convert JSON/YAML back to .env
  ${c("cyan", "install-hook")}              Install a git pre-commit hook that blocks secrets

${c("bold", "Options")}
      --write, --fix     Actually mutate the target (sync, init)
  -o, --out <file>       Write output to a file instead of stdout
      --name <Name>      Interface name for ${c("dim", "types")} (default ${c("dim", "Env")})
  -k, --key <pass>       Passphrase for ${c("dim", "encrypt")} / ${c("dim", "decrypt")}
  -e, --env <file>       Env file for ${c("dim", "run")} (repeatable; later files win)
      --allow <KEY>      Silence a known-safe value for the secret scanner (repeatable)
      --json / --yaml    Output format for ${c("dim", "export")}
      --expand           ${c("dim", "lint")}: print the fully-resolved file; ${c("dim", "run")}: expand \${refs}
      --deny-secrets     ${c("dim", "lint")}: exit non-zero if any secret is found (used by the hook)
      --no-override      ${c("dim", "run")}: keep existing process.env over file values
  -f, --force            Overwrite an existing file / git hook
  -h, --help             Show this help
  -v, --version          Print version

${c("bold", "Examples")}
  npx lacspace-dotenv lint .env --allow PUBLIC_KEY
  npx lacspace-dotenv run -e .env -e .env.local -- node server.js
  npx lacspace-dotenv encrypt .env --key "$DOTENV_KEY"
  npx lacspace-dotenv matrix .env.development .env.staging .env.production
  npx lacspace-dotenv export .env --yaml > env.yaml

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

function cmdLint(file: string, args: Args): void {
  const text = read(file);
  if (args.expand) {
    const { resolved } = resolveEnv(parseEnv(text).map);
    stdout.write(renderEnv(resolved));
    return;
  }
  const issues = lintEnv(text, { allow: args.allow });
  log(brand(`linting ${file}`));
  if (issues.length === 0) {
    log(`  ${c("green", "✔")} ${c("dim", "no issues found")}\n`);
    return;
  }
  for (const it of issues) {
    log(`  ${LEVEL_MARK[it.level]} ${c("dim", `L${it.line}`)} ${it.message} ${c("dim", `[${it.rule}]`)}`);
  }
  const errors = issues.filter((i) => i.level === "error").length;
  const secrets = issues.filter((i) => i.rule === "secret").length;
  const warns = issues.length - errors;
  log(`\n  ${c("dim", `${errors} error(s) · ${warns} warning(s)`)}\n`);
  if (errors > 0 || (args.denySecrets && secrets > 0)) exit(1);
}

function cmdDiff(aFile: string, bFile: string): void {
  const a = read(aFile);
  const b = read(bFile);
  const { missingInA, missingInB } = diffEnvs(a, b);
  log(brand(`diff ${aFile} ↔ ${bFile}`));
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
  log(brand(`sync ${aFile} → ${bFile}`));
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
  log(brand(`check process.env against ${file}`));
  if (ok) {
    log(`  ${c("green", "✔")} ${c("dim", "every required key is set")}\n`);
    return;
  }
  log(`  ${c("red", "✗")} ${c("bold", `${missing.length}`)} ${c("dim", "required key(s) missing from the environment:")}`);
  for (const k of missing) log(`      ${c("red", "-")} ${k}`);
  log("");
  exit(1);
}

function cmdRun(args: Args): void {
  const files = args.envFiles.length ? args.envFiles : [".env"];
  const cmd = args.rest;
  if (cmd.length === 0) {
    log(c("red", "\n✗ run needs a command after `--`, e.g.  run -e .env -- node server.js\n"));
    exit(1);
  }
  const maps = files.map((f) => parseEnv(read(f)).map);
  const env = mergeEnv(maps, processEnv, { override: !args.noOverride, expand: args.expand });
  const { code } = runWith(cmd[0]!, cmd.slice(1), env);
  exit(code);
}

function cmdEncrypt(file: string, args: Args): void {
  if (!args.key) { log(c("red", "\n✗ encrypt needs a passphrase: --key <pass>\n")); exit(1); }
  const text = read(file);
  const enc = encryptEnv(text, args.key);
  const out = args.out ?? `${file}.enc`;
  writeFileSync(resolve(out), enc);
  log(brand(`encrypt ${file}`));
  log(`  ${c("green", "✔")} ${c("dim", `wrote ${out} — safe to commit (AES-256-GCM, scrypt KDF)`)}\n`);
}

function cmdDecrypt(file: string, args: Args): void {
  if (!args.key) { log(c("red", "\n✗ decrypt needs a passphrase: --key <pass>\n")); exit(1); }
  const enc = read(file);
  let plain: string;
  try {
    plain = decryptEnv(enc, args.key);
  } catch (e) {
    log(c("red", `\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
    exit(1);
    return;
  }
  if (args.out) {
    writeFileSync(resolve(args.out), plain);
    log(brand(`decrypt ${file}`));
    log(`  ${c("green", "✔")} ${c("dim", `wrote ${args.out}`)}\n`);
  } else {
    stdout.write(plain);
  }
}

function cmdMatrix(files: string[]): void {
  const envs = files.map((f) => ({ name: f, map: parseEnv(read(f)).map }));
  const m = envMatrix(envs);
  log(brand(`matrix across ${files.length} environments`));
  const keyW = Math.max(3, ...m.keys.map((k) => k.length));
  const cols = m.envs.map((n) => basename(n).replace(/^\.env\.?/, "") || basename(n));
  const colW = cols.map((n) => Math.max(3, n.length));
  const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));
  log(`  ${pad("KEY", keyW)}  ${cols.map((n, i) => pad(n, colW[i]!)).join("  ")}`);
  log(`  ${"-".repeat(keyW)}  ${colW.map((w) => "-".repeat(w)).join("  ")}`);
  for (const key of m.keys) {
    // Colour the mark, then pad by the *visible* width (1 char) not the ansi length.
    const cells = m.envs.map((n, i) => {
      const has = m.present[key]![n];
      const mark = has ? c("green", "✓") : c("red", "·");
      return mark + " ".repeat(Math.max(0, colW[i]! - 1));
    });
    log(`  ${pad(key, keyW)}  ${cells.join("  ")}`);
  }
  const gaps = m.envs.filter((n) => m.missing[n]!.length > 0);
  log("");
  if (gaps.length === 0) {
    log(`  ${c("green", "✔")} ${c("dim", "every environment declares the same keys")}\n`);
    return;
  }
  for (const n of gaps) {
    log(`  ${c("yellow", "▲")} ${n} ${c("dim", "is missing:")} ${m.missing[n]!.join(", ")}`);
  }
  log("");
  exit(1);
}

function cmdInit(file: string, args: Args): void {
  const text = read(file);
  const example = toExample(text);
  const out = args.out ?? ".env.example";
  if (args.write || args.out) {
    if (existsSync(resolve(out)) && !args.force) {
      log(c("red", `\n✗ ${out} already exists — re-run with --force to overwrite\n`));
      exit(1);
    }
    writeFileSync(resolve(out), example);
    log(brand(`init ${out} from ${file}`));
    log(`  ${c("green", "✔")} ${c("dim", `wrote ${out} (values blanked)`)}\n`);
  } else {
    stdout.write(example.endsWith("\n") ? example : example + "\n");
  }
}

function cmdRedact(file: string, args: Args): void {
  const text = read(file);
  const out = redactEnv(text);
  if (args.out) {
    writeFileSync(resolve(args.out), out);
    log(brand(`redact ${file}`));
    log(`  ${c("green", "✔")} ${c("dim", `wrote ${args.out}`)}\n`);
  } else {
    stdout.write(out.endsWith("\n") ? out : out + "\n");
  }
}

function cmdExport(file: string, args: Args): void {
  const { map } = parseEnv(read(file));
  const out = args.yaml ? toYAML(map) : toJSON(map);
  if (args.out) {
    writeFileSync(resolve(args.out), out);
    log(brand(`export ${file}`));
    log(`  ${c("green", "✔")} ${c("dim", `wrote ${args.out}`)}\n`);
  } else {
    stdout.write(out);
  }
}

function cmdImport(file: string, args: Args): void {
  const text = read(file);
  const ext = extname(file).toLowerCase();
  let map: Record<string, string>;
  try {
    map = ext === ".yaml" || ext === ".yml" ? fromYAML(text) : fromJSON(text);
  } catch (e) {
    log(c("red", `\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
    exit(1);
    return;
  }
  const out = renderEnv(map);
  if (args.out) {
    writeFileSync(resolve(args.out), out);
    log(brand(`import ${file}`));
    log(`  ${c("green", "✔")} ${c("dim", `wrote ${args.out}`)}\n`);
  } else {
    stdout.write(out);
  }
}

function cmdInstallHook(args: Args): void {
  try {
    const { path, replaced } = installHook({ force: args.force });
    log(brand("install-hook"));
    log(`  ${c("green", "✔")} ${c("dim", `${replaced ? "replaced" : "installed"} pre-commit hook → ${path}`)}`);
    log(`  ${c("dim", "It runs `lacspace-dotenv lint --deny-secrets` on staged .env files.")}\n`);
  } catch (e) {
    log(c("red", `\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
    exit(1);
  }
}

function main(): void {
  const [cmd, ...rest] = argv.slice(2);
  const args = parseArgs(rest);

  if (args.version || cmd === "--version" || cmd === "-v") { stdout.write(VERSION + "\n"); return; }
  if (!cmd || args.help || cmd === "--help" || cmd === "-h") { stdout.write(HELP + "\n"); return; }

  switch (cmd) {
    case "lint": cmdLint(args.positional[0] ?? ".env", args); break;
    case "diff": cmdDiff(args.positional[0] ?? ".env", args.positional[1] ?? ".env.example"); break;
    case "sync": cmdSync(args.positional[0] ?? ".env", args.positional[1] ?? ".env.example", args.write); break;
    case "types": cmdTypes(args.positional[0] ?? ".env", args.out, args.name); break;
    case "check": cmdCheck(args.positional[0] ?? ".env.example"); break;
    case "run": cmdRun(args); break;
    case "encrypt": cmdEncrypt(args.positional[0] ?? ".env", args); break;
    case "decrypt": cmdDecrypt(args.positional[0] ?? ".env.enc", args); break;
    case "matrix":
      if (args.positional.length < 2) { log(c("red", "\n✗ matrix needs at least two env files\n")); exit(1); }
      cmdMatrix(args.positional);
      break;
    case "init": cmdInit(args.positional[0] ?? ".env", args); break;
    case "redact": cmdRedact(args.positional[0] ?? ".env", args); break;
    case "export": cmdExport(args.positional[0] ?? ".env", args); break;
    case "import":
      if (!args.positional[0]) { log(c("red", "\n✗ import needs a .json or .yaml file\n")); exit(1); }
      cmdImport(args.positional[0]!, args);
      break;
    case "install-hook": cmdInstallHook(args); break;
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
