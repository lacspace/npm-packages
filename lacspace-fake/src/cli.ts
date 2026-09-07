import { stdout, stderr, argv, exit, env } from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { RNG } from "./prng.js";
import { isLocale } from "./data.js";
import type { Locale } from "./data.js";
import { GEN_ORDER, callGen } from "./generators.js";
import type { GenContext } from "./generators.js";
import { parseFields, parseJsonSchema, generateRows, generateValues, specFromString } from "./schema.js";
import { formatRows, formatValues, isFormat } from "./format.js";
import type { Format } from "./format.js";

const VERSION = "0.1.0";

const NO_COLOR = Boolean(env["NO_COLOR"]) || !stdout.isTTY;
const RAW = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof RAW, s: string): string => (NO_COLOR ? s : `${RAW[k]}${s}${RAW.reset}`);
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  positional: string[];
  seed?: string;
  locale: Locale;
  count: number;
  format: Format;
  table?: string;
  pretty: boolean;
  out?: string;
  fields?: string;
  schema?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], locale: "en", count: 10, format: "json",
    pretty: false, help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--seed" || arg === "-s") a.seed = nextVal();
    else if (arg === "--locale" || arg === "-l") {
      const l = nextVal();
      if (!isLocale(l)) fail(`Unknown locale "${l}". Use "en" or "ne".`, false);
      a.locale = l;
    } else if (arg === "--count" || arg === "-n") a.count = Math.max(0, Math.floor(Number(nextVal())) || 0);
    else if (arg === "--format" || arg === "-f") {
      const f = nextVal();
      if (!isFormat(f)) fail(`Unknown format "${f}". Use json | ndjson | csv | sql.`, false);
      a.format = f;
    } else if (arg === "--table" || arg === "-t") a.table = nextVal();
    else if (arg === "--pretty") a.pretty = true;
    else if (arg === "--out" || arg === "-o") a.out = nextVal();
    else if (arg === "--fields") a.fields = nextVal();
    else if (arg === "--schema") a.schema = nextVal();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
    else fail(`Unknown flag "${arg}". Run --help for usage.`, false);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-fake"))} ${c("dim", "— keyless, deterministic fake / seed data generator")}

${c("bold", "Usage")}
  npx lacspace-fake --fields "<spec>" [options]     ${c("dim", "# schema rows")}
  npx lacspace-fake --schema <file.json> [options]  ${c("dim", "# JSON schema rows")}
  npx lacspace-fake <generator> [options]           ${c("dim", "# N values of one generator")}
  npx lacspace-fake list                            ${c("dim", "# every generator + a sample")}

${c("bold", "Options")}
  -n, --count <n>      How many rows/values to generate (default 10)
  -f, --format <fmt>   json | ndjson | csv | sql (default json)
  -t, --table <name>   Table name for -f sql (INSERT INTO <name> ...)
      --fields <spec>  Inline schema: "key:gen,key:gen(args),..."
      --schema <file>  JSON schema file (nested objects + arrays supported)
  -s, --seed <str>     Seed for reproducible output (number or any string)
  -l, --locale <loc>   en (default) or ne (Nepal-aware)
      --pretty         Pretty-print JSON
  -o, --out <file>     Write to a file instead of stdout
  -h, --help           Show this help
  -v, --version        Print the version

${c("bold", "Inline field syntax")}
  ${c("dim", 'key:generator            e.g.  name:fullName')}
  ${c("dim", 'key:generator(args)      e.g.  age:int(18..65)  role:oneOf(admin|user)')}
  ${c("dim", 'ranges use ..            lists use |            weighted uses value:weight')}

${c("bold", "Examples")}
  npx lacspace-fake --fields "id:autoincrement,name:fullName,email:email,age:int(18..65)" -n 5
  npx lacspace-fake --fields "id:autoincrement,name:fullName,role:oneOf(admin|user)" -f sql --table users
  npx lacspace-fake --fields "user:fullName,phone:phone" --locale ne -n 3
  npx lacspace-fake --schema users.json -n 50 -f csv -o users.csv
  npx lacspace-fake email -n 5 --seed 42
  npx lacspace-fake list

${c("dim", "Free · keyless · zero-dependency · runs fully offline · no telemetry")}
`;

function fail(msg: string, isJsonUnused: boolean): never {
  log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function runList(a: Args): void {
  const seed = a.seed ?? "sample";
  const lines: string[] = [];
  lines.push(`\n${c("bold", c("magenta", "◆ lacspace-fake generators"))} ${c("dim", `· locale ${a.locale}`)}`);
  for (const name of GEN_ORDER) {
    const rng = new RNG(`${seed}:${name}`);
    const ctx: GenContext = { rng, locale: a.locale, index: 0, row: {} };
    let sample: unknown;
    try {
      sample = callGen(name, ctx, sampleArgs(name));
    } catch {
      sample = "(needs args)";
    }
    lines.push(`  ${c("cyan", name.padEnd(16))} ${c("dim", String(sample))}`);
  }
  lines.push(`\n${c("dim", `${GEN_ORDER.length} generators · use as key:${c("dim", "generator")} in --fields, or directly: lacspace-fake <generator>`)}\n`);
  // Data (the list) goes to stdout; it is the requested output.
  stdout.write(lines.join("\n") + "\n");
}

/** Reasonable demo args so args-required generators show a real sample in `list`. */
function sampleArgs(name: string): (string | number)[] {
  switch (name) {
    case "int": return [1, 100];
    case "float": return [0, 1, 2];
    case "oneOf": return ["red", "green", "blue"];
    case "weighted": return ["admin:1", "user:5"];
    case "between": return ["2020-01-01", "2024-12-31"];
    default: return [];
  }
}

function output(text: string, a: Args): void {
  if (a.out) {
    writeFileSync(a.out, text.endsWith("\n") ? text : text + "\n");
    log(`${c("green", "✓")} wrote ${c("bold", a.out)} ${c("dim", `(${a.format})`)}`);
  } else {
    stdout.write(text + "\n");
  }
}

function main(): void {
  const a = parseArgs(argv.slice(2));
  if (a.version) { stdout.write(VERSION + "\n"); return; }

  const cmd = a.positional[0];

  if (a.help || (a.positional.length === 0 && !a.fields && !a.schema)) {
    stdout.write(HELP + "\n");
    return;
  }

  if (cmd === "list") { runList(a); return; }

  // --- JSON schema file ---------------------------------------------------
  if (a.schema) {
    let raw: string;
    try {
      raw = a.schema === "-" ? readStdin() : readFileSync(a.schema, "utf8");
    } catch (err) {
      fail(`Could not read schema file "${a.schema}": ${(err as Error).message}`, false);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw!);
    } catch (err) {
      fail(`Schema file is not valid JSON: ${(err as Error).message}`, false);
    }
    let text: string;
    try {
      const fields = parseJsonSchema(parsed);
      const rows = generateRows(fields, { count: a.count, seed: a.seed, locale: a.locale });
      text = formatRows(rows, { format: a.format, pretty: a.pretty, table: a.table });
    } catch (err) {
      fail((err as Error).message, false);
    }
    output(text!, a);
    return;
  }

  // --- inline --fields ----------------------------------------------------
  if (a.fields) {
    let text: string;
    try {
      const fields = parseFields(a.fields);
      const rows = generateRows(fields, { count: a.count, seed: a.seed, locale: a.locale });
      text = formatRows(rows, { format: a.format, pretty: a.pretty, table: a.table });
    } catch (err) {
      fail((err as Error).message, false);
    }
    output(text!, a);
    return;
  }

  // --- single generator ---------------------------------------------------
  const specStr = cmd!;
  const column = /^([A-Za-z_][A-Za-z0-9_]*)/.exec(specStr)?.[1] ?? "value";
  let text: string;
  try {
    // validate eagerly for a clean error
    specFromString(specStr);
    const values = generateValues(specStr, { count: a.count, seed: a.seed, locale: a.locale });
    text = formatValues(values, column, { format: a.format, pretty: a.pretty, table: a.table });
  } catch (err) {
    fail((err as Error).message, false);
  }
  output(text!, a);
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
