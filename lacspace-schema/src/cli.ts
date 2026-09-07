import { stdout, stderr, argv, exit } from "node:process";
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import type { JsonValue, JSONSchema } from "./types.js";
import { inferSchema } from "./infer.js";
import type { InferOptions } from "./infer.js";
import { schemaToTs, jsonToTs } from "./schema2ts.js";
import type { TsOptions } from "./schema2ts.js";
import { schemaToExample } from "./example.js";
import { diffSchemas } from "./diff.js";
import { isPlainObject } from "./util.js";

const VERSION = "0.1.0";

const useColor = !process.env.NO_COLOR;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => (useColor ? `${C[k]}${s}${C.reset}` : s);
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  positional: string[];
  name?: string;
  from?: "json" | "schema";
  enumThreshold?: number;
  required?: "detected" | "all" | "none";
  readonly: boolean;
  jsdoc: boolean;
  enum: boolean;
  title?: string;
  indent: number;
  requiredOnly: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], readonly: false, jsdoc: false, enum: false,
    indent: 2, requiredOnly: false, json: false, help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--name") a.name = nextVal();
    else if (arg === "--from") {
      const v = nextVal();
      if (v === "json" || v === "schema") a.from = v;
    } else if (arg === "--enum-threshold") a.enumThreshold = Number(nextVal());
    else if (arg === "--no-required") a.required = "none";
    else if (arg === "--all-required") a.required = "all";
    else if (arg === "--readonly") a.readonly = true;
    else if (arg === "--jsdoc") a.jsdoc = true;
    else if (arg === "--enum") a.enum = true;
    else if (arg === "--title") a.title = nextVal();
    else if (arg === "--indent") a.indent = Math.max(0, Number(nextVal()) || 0);
    else if (arg === "--required-only") a.requiredOnly = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-schema"))} ${c("dim", "— infer JSON Schema, generate TS types & examples")}

${c("bold", "Usage")}
  npx lacspace-schema <command> [input] [options]

${c("bold", "Commands")}
  infer   [file|glob]        Infer a draft-07 JSON Schema from JSON/NDJSON data
  types   [file|glob]        Generate TypeScript types from JSON ${c("dim", "or")} a JSON Schema
  example [schema-file]      Generate an example instance that satisfies a schema
  diff    <before> <after>   Compare two JSON Schemas for breaking changes

${c("bold", "Options")}
  --name <RootName>      Name for the root type / schema title (default Root)
  --from json|schema     Force how 'types' reads its input (default: auto-detect)
  --enum-threshold <n>   Detect enums with <= n distinct values (0 = off, default)
  --no-required          Mark every inferred property optional
  --all-required         Mark every inferred property required
  --readonly             Emit 'readonly' properties (types)
  --jsdoc                Add example values as JSDoc comments (types)
  --enum                 Emit real TS enums for string enums (types)
  --required-only        Example: include only required properties
  --title <str>          Set the schema 'title' (infer)
  --indent <n>           Indent width for JSON/TS output (default 2)
  --json                 Machine-readable JSON (diff)
  -h, --help             Show this help
  -v, --version          Print the version

${c("bold", "Examples")}
  echo '{"id":1,"email":"a@x.com"}' | npx lacspace-schema infer
  npx lacspace-schema infer 'samples/*.json' --enum-threshold 6 --name User
  npx lacspace-schema types user.json --name User --jsdoc
  npx lacspace-schema types user.schema.json --from schema --enum
  npx lacspace-schema example user.schema.json
  npx lacspace-schema diff v1.schema.json v2.schema.json
`;

function fail(msg: string): never {
  log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

// --- input reading ----------------------------------------------------------

function expandGlob(pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  const parts = pattern.split("/");
  const absolute = parts[0] === "";
  const startIdx = absolute ? 1 : 0;
  const results: string[] = [];
  const walk = (base: string, idx: number): void => {
    if (idx >= parts.length) return;
    const seg = parts[idx]!;
    const last = idx === parts.length - 1;
    if (seg === "**") {
      walk(base, idx + 1); // match zero directories
      let entries: string[] = [];
      try { entries = readdirSync(base); } catch { return; }
      for (const e of entries) {
        const full = join(base, e);
        try { if (statSync(full).isDirectory()) walk(full, idx); } catch { /* skip */ }
      }
      return;
    }
    const re = new RegExp("^" + seg.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    let entries: string[] = [];
    try { entries = readdirSync(base); } catch { return; }
    for (const e of entries) {
      if (!re.test(e)) continue;
      const full = join(base, e);
      if (last) {
        try { if (statSync(full).isFile()) results.push(full); } catch { /* skip */ }
      } else {
        try { if (statSync(full).isDirectory()) walk(full, idx + 1); } catch { /* skip */ }
      }
    }
  };
  walk(absolute ? "/" : ".", startIdx);
  return results.sort();
}

function readStdin(): string {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function readInputs(pattern: string | undefined): string {
  if (!pattern) {
    const data = readStdin();
    if (!data.trim()) fail("no input — pass a file/glob or pipe JSON on stdin");
    return data;
  }
  const files = expandGlob(pattern);
  const real = files.filter((f) => existsSync(f) && statSync(f).isFile());
  if (real.length === 0) fail(`no files matched: ${pattern}`);
  return real.map((f) => readFileSync(f, "utf8")).join("\n");
}

/** Parse a blob of JSON / NDJSON / concatenated docs into top-level samples. */
function parseSamples(text: string): JsonValue[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  // Try a single JSON document first.
  try {
    const v = JSON.parse(trimmed) as JsonValue;
    return Array.isArray(v) ? v : [v];
  } catch { /* fall through to NDJSON */ }
  // NDJSON: one JSON value per non-empty line.
  const out: JsonValue[] = [];
  for (const line of trimmed.split("\n")) {
    const l = line.trim();
    if (!l) continue;
    try {
      out.push(JSON.parse(l) as JsonValue);
    } catch (err) {
      fail(`invalid JSON line: ${(err as Error).message}`);
    }
  }
  if (out.length === 0) fail("could not parse input as JSON or NDJSON");
  return out;
}

function parseSchema(text: string): JSONSchema {
  let v: unknown;
  try {
    v = JSON.parse(text.trim());
  } catch (err) {
    fail(`invalid JSON Schema: ${(err as Error).message}`);
  }
  if (!isPlainObject(v)) fail("a JSON Schema must be a JSON object");
  return v as JSONSchema;
}

const SCHEMA_KEYWORDS = new Set([
  "$schema", "$ref", "$id", "$defs", "definitions", "type", "properties",
  "items", "required", "enum", "const", "anyOf", "oneOf", "allOf", "format",
  "additionalProperties", "title", "description", "minimum", "maximum",
  "minItems", "maxItems", "minLength", "maxLength", "pattern", "examples", "default",
]);

const SCHEMA_TYPE_NAMES = new Set(["string", "number", "integer", "boolean", "object", "array", "null"]);

/** Heuristic: does this parsed JSON look like a JSON Schema (vs plain data)? */
function looksLikeSchema(v: JsonValue): boolean {
  if (!isPlainObject(v)) return false;
  if ("$schema" in v || "$ref" in v || "$defs" in v || "definitions" in v) return true;
  const t = (v as JSONSchema).type;
  const hasSchemaType =
    (typeof t === "string" && SCHEMA_TYPE_NAMES.has(t)) ||
    (Array.isArray(t) && t.every((x) => typeof x === "string" && SCHEMA_TYPE_NAMES.has(x)));
  if (hasSchemaType && (("properties" in v) || ("items" in v) || Object.keys(v).every((k) => SCHEMA_KEYWORDS.has(k)))) {
    return true;
  }
  return false;
}

// --- commands ---------------------------------------------------------------

function jsonPrint(value: unknown, indent: number): void {
  stdout.write(JSON.stringify(value, null, indent) + "\n");
}

function cmdInfer(a: Args): void {
  const samples = parseSamples(readInputs(a.positional[1]));
  const opts: InferOptions = {
    enumThreshold: a.enumThreshold ?? 0,
    collectExamples: a.jsdoc,
  };
  if (a.required) opts.required = a.required;
  if (a.title || a.name) opts.title = a.title ?? a.name;
  const schema = inferSchema(samples, opts);
  jsonPrint(schema, a.indent);
}

function tsOptions(a: Args): TsOptions {
  const opts: TsOptions = {
    readonly: a.readonly, jsdoc: a.jsdoc, enum: a.enum, indent: a.indent,
  };
  if (a.name) opts.name = a.name;
  return opts;
}

function cmdTypes(a: Args): void {
  const text = readInputs(a.positional[1]);
  let mode = a.from;
  let parsed: JsonValue[];
  if (mode === "schema") {
    const schema = parseSchema(text);
    stdout.write(schemaToTs(schema, tsOptions(a)));
    return;
  }
  parsed = parseSamples(text);
  if (!mode && parsed.length === 1 && looksLikeSchema(parsed[0]!)) mode = "schema";
  if (mode === "schema") {
    stdout.write(schemaToTs(parsed[0] as JSONSchema, tsOptions(a)));
    return;
  }
  const opts = tsOptions(a) as TsOptions & Pick<InferOptions, "enumThreshold" | "required">;
  opts.enumThreshold = a.enumThreshold ?? 0;
  if (a.required) opts.required = a.required;
  stdout.write(jsonToTs(parsed, opts));
}

function cmdExample(a: Args): void {
  const schema = parseSchema(readInputs(a.positional[1]));
  const ex = schemaToExample(schema, { includeOptional: !a.requiredOnly });
  jsonPrint(ex, a.indent);
}

function cmdDiff(a: Args): void {
  const [, beforeArg, afterArg] = a.positional;
  if (!beforeArg || !afterArg) fail("diff needs two schema files: diff <before> <after>");
  const before = parseSchema(readInputs(beforeArg));
  const after = parseSchema(readInputs(afterArg));
  const result = diffSchemas(before, after);
  if (a.json) {
    jsonPrint(result, a.indent);
    return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-schema diff"))} ${c("dim", `${basename(beforeArg)} → ${basename(afterArg)}`)}\n`);
  if (result.changes.length === 0) {
    log(`  ${c("green", "✓ no changes")}\n`);
  } else {
    for (const ch of result.changes) {
      const mark = ch.breaking ? c("red", "✗ BREAKING") : c("yellow", "• change");
      log(`  ${mark} ${c("cyan", ch.path)} ${c("dim", `[${ch.kind}]`)} ${ch.detail}`);
    }
    const nBreak = result.changes.filter((x) => x.breaking).length;
    log("");
    log(`  ${result.breaking ? c("red", `${nBreak} breaking`) : c("green", "0 breaking")} ${c("dim", `of ${result.changes.length} change(s)`)}\n`);
  }
  if (result.breaking) exit(2);
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  const command = args.positional[0];
  if (args.help || !command) { stdout.write(HELP + "\n"); return; }

  switch (command) {
    case "infer": return cmdInfer(args);
    case "types": return cmdTypes(args);
    case "example": return cmdExample(args);
    case "diff": return cmdDiff(args);
    default:
      fail(`unknown command: ${command} (try infer | types | example | diff)`);
  }
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
