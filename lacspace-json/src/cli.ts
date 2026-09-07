import { stdout, stderr, argv, exit, stdin } from "node:process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { query } from "./query.js";
import { parseFormat, stringifyFormat, detectFormat, formatFromExt } from "./convert.js";
import type { Format } from "./convert.js";
import { validateSchema } from "./schema.js";
import { diff } from "./diff.js";
import type { DiffEntry } from "./diff.js";
import { merge, parseArrayStrategy } from "./merge.js";
import { formatJson, getPath } from "./format.js";
import { sortKeysDeep, JsonToolError } from "./util.js";
import type { JsonValue } from "./util.js";

const VERSION = "0.1.0";

const useColor = !process.env["NO_COLOR"] && stdout.isTTY !== false;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => (useColor ? `${C[k]}${s}${C.reset}` : s);
const log = (s = ""): void => void stderr.write(s + "\n");
const out = (s: string): void => void stdout.write(s);

const FORMATS = new Set(["json", "yaml", "toml", "csv", "ndjson"]);

interface Args {
  positional: string[];
  from?: Format;
  to?: Format;
  query?: string;
  get?: string;
  schema?: string;
  indent: number;
  sortKeys: boolean;
  min: boolean;
  raw: boolean;
  json: boolean;
  array?: string;
  arrayKey?: string;
  help: boolean;
  version: boolean;
}

function asFormat(v: string, flag: string): Format {
  if (!FORMATS.has(v)) fail(`Unknown format "${v}" for ${flag} (json|yaml|toml|csv|ndjson)`, false);
  return v as Format;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], indent: 2, sortKeys: false, min: false, raw: false,
    json: false, help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--from") a.from = asFormat(nextVal(), "--from");
    else if (arg === "--to") a.to = asFormat(nextVal(), "--to");
    else if (arg === "-q" || arg === "--query") a.query = nextVal();
    else if (arg === "--get") a.get = nextVal();
    else if (arg === "--schema") a.schema = nextVal();
    else if (arg === "--indent") a.indent = Number(nextVal());
    else if (arg === "--sort-keys") a.sortKeys = true;
    else if (arg === "--min" || arg === "--minify") a.min = true;
    else if (arg === "--raw" || arg === "-r") a.raw = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--array") a.array = nextVal();
    else if (arg === "--array-key") a.arrayKey = nextVal();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      list.splice(i + 1, 0, arg.slice(eq + 1));
      list[i] = arg.slice(0, eq);
      i--;
    } else a.positional.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-json"))} ${c("dim", "— the friendly jq: query, convert, validate, diff & merge data")}

${c("bold", "Usage")}
  npx lacspace-json <command> [input] [flags]
  cat data.json | npx lacspace-json <command> [flags]

${c("bold", "Commands")}
  ${c("cyan", "query|get")} <input> -q "<expr>"   Run a jq-style query (default when -q is given)
  ${c("cyan", "convert")}   <input> --to <fmt>     JSON ⇄ YAML ⇄ TOML ⇄ CSV ⇄ NDJSON
  ${c("cyan", "validate")}  <data> --schema <s>    Validate against a JSON Schema (draft-07 subset)
  ${c("cyan", "diff")}      <a> <b>                Structural diff of two documents
  ${c("cyan", "merge")}     <a> <b> [...]          Deep-merge N documents
  ${c("cyan", "format")}    <input>                Pretty-print / minify (default when only input given)

${c("bold", "Flags")}
      --from <fmt>     Input format override (json|yaml|toml|csv|ndjson)
      --to <fmt>       Output format (convert)
  -q, --query <expr>   Query expression (see below)
      --get <path>     Shorthand: extract a single value at a path (.a.b[0])
      --schema <file>  JSON Schema file (validate)
      --indent <n>     Indent width for pretty JSON/YAML (default 2)
      --sort-keys      Sort object keys recursively
      --min            Minify JSON output
  -r, --raw            Print string scalars unquoted (great for shell)
      --json           Force machine-readable JSON output (diff/validate)
      --array <mode>   Merge array strategy: concat | replace | by-key
      --array-key <k>  Key for --array by-key
  -h, --help           Show this help
  -v, --version        Print the version

${c("bold", "Query language")} ${c("dim", "(hand-written, no eval)")}
  ${c("dim", "paths")}   .users[0].name   .items[].price   .a[\"b c\"]
  ${c("dim", "pipe")}    .users[] | select(.age > 21) | .name
  ${c("dim", "funcs")}   keys values length type has(k) map(.x) unique reverse
  ${c("dim", "        ")} sort_by(.x) group_by(.x) first last min max sum avg add flatten

${c("bold", "Examples")}
  echo '{"a":{"b":[1,2,3]}}' | npx lacspace-json --get .a.b[1]
  npx lacspace-json query data.json -q ".users[] | select(.active) | .email" -r
  npx lacspace-json convert config.toml --to yaml
  cat data.csv | npx lacspace-json convert --from csv --to json
  npx lacspace-json validate user.json --schema user.schema.json
  npx lacspace-json diff old.json new.json
  npx lacspace-json merge base.json override.json --array by-key --array-key id
`;

function fail(msg: string, json: boolean, extra: Record<string, unknown> = {}): never {
  if (json) out(JSON.stringify({ ok: false, error: msg, ...extra }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

function isStdinPiped(): boolean {
  try { return !stdin.isTTY; } catch { return false; }
}

function readStdin(): string {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function expandGlob(pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  const dir = dirname(pattern);
  const base = basename(pattern);
  const re = new RegExp("^" + base.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  try {
    return readdirSync(dir).filter((f) => re.test(f)).map((f) => join(dir, f)).sort();
  } catch { return [pattern]; }
}

interface Loaded { value: JsonValue; format: Format; source: string; }

function loadInput(source: string | undefined, from: Format | undefined): Loaded {
  let text: string;
  let src = source ?? "-";
  let fmt: Format | undefined = from;
  if (source && source !== "-") {
    try {
      const st = statSync(source);
      if (!st.isFile()) throw new JsonToolError(`Not a file: ${source}`);
    } catch {
      fail(`Cannot read "${source}"`, false);
    }
    text = readFileSync(source, "utf8");
    if (!fmt) fmt = formatFromExt(source);
  } else {
    if (!isStdinPiped()) fail("No input given. Pass a file or pipe data via stdin.", false);
    text = readStdin();
    src = "<stdin>";
  }
  if (!fmt) fmt = detectFormat(text);
  let value: JsonValue;
  try { value = parseFormat(text, fmt); }
  catch (err) { fail(err instanceof Error ? err.message : String(err), false); }
  return { value: value!, format: fmt, source: src };
}

function printValue(value: JsonValue, a: Args): void {
  if (a.raw && (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null)) {
    out(String(value ?? "") + "\n");
    return;
  }
  if (a.raw && Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null)) {
    out(value.map((v) => (v === null ? "null" : String(v))).join("\n") + "\n");
    return;
  }
  out(formatJson(value, { indent: a.indent, sortKeys: a.sortKeys, minify: a.min }) + (a.min ? "\n" : "\n"));
}

// --- commands --------------------------------------------------------------

function cmdQuery(a: Args): void {
  const loaded = loadInput(a.positional[1], a.from);
  if (a.get) { printValue((getPath(loaded.value, a.get) ?? null) as JsonValue, a); return; }
  const expr = a.query;
  if (!expr) fail('query needs an expression: -q "<expr>" (or use --get <path>)', a.json);
  let result: JsonValue;
  try { result = query(loaded.value, expr!) as JsonValue; }
  catch (err) { fail(err instanceof Error ? err.message : String(err), a.json); }
  printValue(result!, a);
}

function cmdConvert(a: Args): void {
  const loaded = loadInput(a.positional[1], a.from);
  const to = a.to ?? "json";
  let value: JsonValue = loaded.value;
  if (a.query) { try { value = query(value, a.query) as JsonValue; } catch (err) { fail(err instanceof Error ? err.message : String(err), a.json); } }
  if (a.sortKeys) value = sortKeysDeep(value) as JsonValue;
  let text: string;
  try { text = stringifyFormat(value, to, { indent: a.indent, minify: a.min }); }
  catch (err) { fail(err instanceof Error ? err.message : String(err), a.json); }
  out(text!);
}

function cmdValidate(a: Args): void {
  if (!a.schema) fail("validate needs --schema <file>", a.json);
  const loaded = loadInput(a.positional[1], a.from);
  let schema: JsonValue;
  try {
    const schemaText = readFileSync(a.schema!, "utf8");
    schema = parseFormat(schemaText, formatFromExt(a.schema!) ?? "json");
  } catch (err) { fail(`Cannot read schema: ${(err as Error).message}`, a.json); }
  const result = validateSchema(loaded.value, schema!);
  if (a.json) { out(JSON.stringify(result) + "\n"); if (!result.valid) exit(1); return; }
  if (result.valid) {
    log(`\n${c("green", "✓ valid")} ${c("dim", `· ${loaded.source} matches the schema`)}\n`);
  } else {
    log(`\n${c("red", `✗ invalid`)} ${c("dim", `· ${result.errors.length} error${result.errors.length === 1 ? "" : "s"}`)}`);
    for (const e of result.errors) log(`  ${c("yellow", e.path)}  ${c("dim", e.message)}`);
    log("");
    exit(1);
  }
}

function cmdDiff(a: Args): void {
  const files = a.positional.slice(1);
  if (files.length < 2) fail("diff needs two inputs: diff <a> <b>", a.json);
  const aDoc = loadInput(files[0], a.from);
  const bDoc = loadInput(files[1], a.from);
  const entries = diff(aDoc.value, bDoc.value);
  if (a.json) { out(JSON.stringify({ ok: true, changes: entries.length, diff: entries }) + "\n"); if (entries.length) exit(1); return; }
  if (entries.length === 0) { log(`\n${c("green", "✓ no differences")}\n`); return; }
  log(`\n${c("bold", c("magenta", "◆ lacspace-json diff"))} ${c("dim", `· ${entries.length} change${entries.length === 1 ? "" : "s"}`)}\n`);
  for (const e of entries) printDiff(e);
  log("");
  exit(1);
}

function printDiff(e: DiffEntry): void {
  const short = (v: unknown): string => { const s = JSON.stringify(v); return s && s.length > 60 ? s.slice(0, 57) + "…" : s ?? "undefined"; };
  if (e.kind === "added") log(`  ${c("green", "+")} ${c("cyan", e.path)}  ${c("dim", short(e.after))}`);
  else if (e.kind === "removed") log(`  ${c("red", "-")} ${c("cyan", e.path)}  ${c("dim", short(e.before))}`);
  else log(`  ${c("yellow", "~")} ${c("cyan", e.path)}  ${c("dim", short(e.before))} ${c("dim", "→")} ${c("dim", short(e.after))}`);
}

function cmdMerge(a: Args): void {
  const files = a.positional.slice(1);
  if (files.length < 1) fail("merge needs at least one input", a.json);
  const expanded: string[] = [];
  for (const f of files) expanded.push(...expandGlob(f));
  const values = expanded.map((f) => loadInput(f, a.from).value);
  const strat = parseArrayStrategy(a.array, a.arrayKey);
  const result = merge(values, { array: strat });
  const to = a.to ?? "json";
  let text: string;
  try { text = stringifyFormat(a.sortKeys ? (sortKeysDeep(result) as JsonValue) : result, to, { indent: a.indent, minify: a.min }); }
  catch (err) { fail(err instanceof Error ? err.message : String(err), a.json); }
  out(text!);
}

function cmdFormat(a: Args): void {
  const loaded = loadInput(a.positional[1], a.from);
  if (a.get) { printValue((getPath(loaded.value, a.get) ?? null) as JsonValue, a); return; }
  let value: JsonValue = loaded.value;
  if (a.query) { try { value = query(value, a.query) as JsonValue; } catch (err) { fail(err instanceof Error ? err.message : String(err), a.json); } }
  if (a.to && a.to !== "json") { out(stringifyFormat(a.sortKeys ? (sortKeysDeep(value) as JsonValue) : value, a.to, { indent: a.indent, minify: a.min })); return; }
  printValue(value, a);
}

// --- dispatch --------------------------------------------------------------

const COMMANDS = new Set(["query", "get", "convert", "validate", "diff", "merge", "format"]);

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { out(VERSION + "\n"); return; }
  if (args.help) { out(HELP + "\n"); return; }

  let cmd = args.positional[0];
  if (!cmd || !COMMANDS.has(cmd)) {
    // No explicit command. Infer: -q/--get → query, --to → convert, --schema → validate, else format.
    if (args.positional.length === 0 && !isStdinPiped() && !args.query && !args.get) { out(HELP + "\n"); return; }
    if (args.schema) { args.positional.unshift("validate"); cmd = "validate"; }
    else if (args.query || args.get) { args.positional.unshift("query"); cmd = "query"; }
    else if (args.to) { args.positional.unshift("convert"); cmd = "convert"; }
    else { args.positional.unshift("format"); cmd = "format"; }
  }

  switch (cmd) {
    case "query":
    case "get": cmdQuery(args); return;
    case "convert": cmdConvert(args); return;
    case "validate": cmdValidate(args); return;
    case "diff": cmdDiff(args); return;
    case "merge": cmdMerge(args); return;
    case "format": cmdFormat(args); return;
  }
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
