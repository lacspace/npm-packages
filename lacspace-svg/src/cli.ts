import { stdout, stderr, argv, exit } from "node:process";
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { basename, join, dirname } from "node:path";
import { optimize } from "./optimize.js";
import type { OptimizeOptions } from "./optimize.js";
import { toJsx } from "./jsx.js";
import { toDataUri } from "./datauri.js";
import { buildSprite } from "./sprite.js";
import type { SpriteInput } from "./sprite.js";
import { info } from "./info.js";

const VERSION = "0.1.0";

const useColor = !process.env.NO_COLOR && stdout.isTTY;
const RAW = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof RAW, s: string): string => (useColor ? `${RAW[k]}${s}${RAW.reset}` : s);
const log = (s = ""): void => void stderr.write(s + "\n");

const COMMANDS = new Set(["optimize", "jsx", "react", "data-uri", "datauri", "sprite", "info"]);

interface Args {
  command: string;
  files: string[];
  out?: string;
  outDir?: string;
  precision?: number;
  removeDimensions: boolean;
  keepIds: boolean;
  keepTitle: boolean;
  pretty: boolean;
  name?: string;
  ts: boolean;
  ref: boolean;
  encoding: "uri" | "base64";
  css: boolean;
  multipass: boolean;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    command: "optimize", files: [], removeDimensions: false, keepIds: false,
    keepTitle: false, pretty: false, ts: false, ref: false, encoding: "uri",
    css: false, multipass: false, json: false, help: false, version: false,
  };
  let first = true;
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (first && COMMANDS.has(arg)) {
      a.command = arg === "react" ? "jsx" : arg === "datauri" ? "data-uri" : arg;
      first = false;
      continue;
    }
    first = false;
    if (arg === "-o" || arg === "--out") a.out = nextVal();
    else if (arg === "--out-dir") a.outDir = nextVal();
    else if (arg === "--precision") a.precision = Number(nextVal());
    else if (arg === "--remove-dimensions") a.removeDimensions = true;
    else if (arg === "--keep-ids") a.keepIds = true;
    else if (arg === "--keep-title") a.keepTitle = true;
    else if (arg === "--pretty") a.pretty = true;
    else if (arg === "--name") a.name = nextVal();
    else if (arg === "--ts" || arg === "--typescript") a.ts = true;
    else if (arg === "--ref") a.ref = true;
    else if (arg === "--encoding") {
      const v = nextVal();
      a.encoding = v === "base64" ? "base64" : "uri";
    } else if (arg === "--base64") a.encoding = "base64";
    else if (arg === "--css") a.css = true;
    else if (arg === "--multipass") a.multipass = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (arg === "-") a.files.push("-");
    else if (!arg.startsWith("-")) a.files.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-svg"))} ${c("dim", "— optimize, convert & bundle SVGs · zero-dependency, offline")}

${c("bold", "Usage")}
  npx lacspace-svg [command] <files...> [options]
  cat icon.svg | npx lacspace-svg optimize

${c("bold", "Commands")}
  optimize   ${c("dim", "(default) minify/clean an SVG, report bytes saved")}
  jsx        ${c("dim", "convert an SVG to a React/JSX component")}
  data-uri   ${c("dim", "emit a data:image/svg+xml URI (URL-encoded or base64)")}
  sprite     ${c("dim", "combine many SVGs into one <symbol> sprite sheet")}
  info       ${c("dim", "print dimensions, element counts & safety warnings")}

${c("bold", "Options")}
  -o, --out <file>        Write output to a file instead of stdout
      --out-dir <dir>     Write one output file per input into <dir>
      --precision <n>     Decimal places for number rounding (default 3)
      --remove-dimensions Drop width/height in favour of viewBox (opt-in)
      --keep-ids          Keep unused id attributes
      --keep-title        Keep <title>/<desc> (default: kept unless this is off)
      --pretty            Pretty-print instead of minifying
      --name <Comp>       (jsx) component name
      --ts                (jsx) emit TypeScript
      --ref               (jsx) forwardRef to the root <svg>
      --encoding <e>      (data-uri) uri | base64 (default uri)
      --css               (data-uri) wrap as background-image:url("…")
      --multipass         Optimize repeatedly until stable
      --json              Machine-readable JSON output
  -h, --help              Show this help
  -v, --version           Print the version

${c("bold", "Examples")}
  npx lacspace-svg logo.svg -o logo.min.svg
  npx lacspace-svg optimize icons/*.svg --out-dir dist --precision 2
  npx lacspace-svg jsx logo.svg --name Logo --ts --ref
  npx lacspace-svg data-uri icon.svg --css
  npx lacspace-svg sprite icons/*.svg -o sprite.svg
  npx lacspace-svg info logo.svg
  cat logo.svg | npx lacspace-svg optimize
`;

function fail(msg: string, json = false): never {
  if (json) stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

function isGlob(p: string): boolean {
  return p.includes("*");
}

function expandGlob(pattern: string): string[] {
  const dir = dirname(pattern);
  const base = basename(pattern);
  const re = new RegExp("^" + base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((e) => re.test(e)).sort().map((e) => join(dir, e));
}

function resolveInputs(files: string[]): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const useStdin = files.length === 0 || files.includes("-");
  const realFiles = files.filter((f) => f !== "-");

  for (const f of realFiles) {
    const paths = isGlob(f) ? expandGlob(f) : [f];
    if (paths.length === 0) fail(`no files matched: ${f}`);
    for (const p of paths) {
      try {
        if (statSync(p).isDirectory()) continue;
        out.push({ path: p, content: readFileSync(p, "utf8") });
      } catch {
        fail(`cannot read file: ${p}`);
      }
    }
  }
  if (useStdin && realFiles.length === 0) {
    let data = "";
    try {
      data = readFileSync(0, "utf8");
    } catch {
      fail("no input: pass a file, a glob, or pipe an SVG on stdin");
    }
    if (!data.trim()) fail("no input: pass a file, a glob, or pipe an SVG on stdin");
    out.push({ path: "<stdin>", content: data });
  }
  return out;
}

function pascalCase(s: string): string {
  const base = basename(s).replace(/\.svg$/i, "");
  const p = base.replace(/[^A-Za-z0-9]+/g, " ").split(" ").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  return /^[A-Za-z]/.test(p) ? p : "Svg" + p;
}

function writeOut(a: Args, defaultName: string, content: string): void {
  if (a.outDir) {
    mkdirSync(a.outDir, { recursive: true });
    const dest = join(a.outDir, defaultName);
    writeFileSync(dest, content);
    log(`${c("green", "✓")} ${c("bold", dest)} ${c("dim", `(${Buffer.byteLength(content)} bytes)`)}`);
  } else if (a.out) {
    writeFileSync(a.out, content);
    log(`${c("green", "✓")} ${c("bold", a.out)} ${c("dim", `(${Buffer.byteLength(content)} bytes)`)}`);
  } else {
    stdout.write(content + (content.endsWith("\n") ? "" : "\n"));
  }
}

function optimizeOpts(a: Args): OptimizeOptions {
  const o: OptimizeOptions = {
    removeDimensions: a.removeDimensions,
    removeUnusedIds: !a.keepIds,
    removeTitle: !a.keepTitle,
    multipass: a.multipass,
    pretty: a.pretty,
  };
  if (a.precision !== undefined) o.precision = a.precision;
  return o;
}

function cmdOptimize(a: Args, inputs: { path: string; content: string }[]): void {
  const results = inputs.map((f) => ({ path: f.path, res: optimize(f.content, optimizeOpts(a)) }));
  if (a.json && !a.out && !a.outDir) {
    stdout.write(JSON.stringify(
      results.map((r) => ({ file: r.path, before: r.res.before, after: r.res.after, saved: r.res.saved, savedPct: r.res.savedPct, data: r.res.data })),
    ) + "\n");
    return;
  }
  const multi = inputs.length > 1 || a.outDir;
  for (const r of results) {
    if (a.out || a.outDir) {
      const name = r.path === "<stdin>" ? "stdout.svg" : basename(r.path);
      writeOut(a, name, r.res.data);
      log(`  ${c("dim", `${r.res.before} → ${r.res.after} bytes`)}  ${c("green", `-${r.res.savedPct}%`)}`);
    } else {
      if (multi) log(c("dim", `\n/* ${r.path} */`));
      stdout.write(r.res.data + "\n");
      log(`  ${c("dim", `${r.res.before} → ${r.res.after} bytes`)}  ${c("green", `-${r.res.savedPct}%`)}`);
    }
  }
}

function cmdJsx(a: Args, inputs: { path: string; content: string }[]): void {
  for (const f of inputs) {
    const name = a.name ?? (f.path === "<stdin>" ? "SvgComponent" : pascalCase(f.path));
    const opts = { name, typescript: a.ts, ref: a.ref, spreadProps: true };
    let code: string;
    try {
      code = toJsx(f.content, opts);
    } catch (err) {
      fail((err as Error).message, a.json);
    }
    if (a.out || a.outDir) {
      const ext = a.ts ? ".tsx" : ".jsx";
      const fname = (f.path === "<stdin>" ? name : pascalCase(f.path)) + ext;
      writeOut(a, fname, code!);
    } else {
      if (inputs.length > 1) log(c("dim", `\n// ${f.path} → ${name}`));
      stdout.write(code! + (code!.endsWith("\n") ? "" : "\n"));
    }
  }
}

function cmdDataUri(a: Args, inputs: { path: string; content: string }[]): void {
  for (const f of inputs) {
    const res = toDataUri(f.content, { encoding: a.encoding, css: a.css });
    if (a.json && !a.out && !a.outDir) {
      stdout.write(JSON.stringify({ file: f.path, encoding: res.encoding, bytes: res.bytes, uri: res.uri, output: res.output }) + "\n");
      continue;
    }
    if (a.out || a.outDir) {
      const name = (f.path === "<stdin>" ? "svg" : basename(f.path).replace(/\.svg$/i, "")) + (a.css ? ".css" : ".txt");
      writeOut(a, name, res.output);
    } else {
      if (inputs.length > 1) log(c("dim", `\n/* ${f.path} */`));
      stdout.write(res.output + "\n");
    }
  }
}

function cmdSprite(a: Args, inputs: { path: string; content: string }[]): void {
  const spriteInputs: SpriteInput[] = inputs.map((f) => ({
    id: f.path === "<stdin>" ? "icon" : basename(f.path),
    svg: f.content,
  }));
  const res = buildSprite(spriteInputs, { pretty: a.pretty });
  if (a.json && !a.out) {
    stdout.write(JSON.stringify({ symbols: res.symbols, data: res.data }) + "\n");
    return;
  }
  writeOut(a, "sprite.svg", res.data);
  if (!a.out && !a.outDir) log("");
  log(c("bold", `  ${res.symbols.length} symbol${res.symbols.length === 1 ? "" : "s"}`));
  for (const s of res.symbols) log(`    ${c("cyan", "#" + s.id)}  ${c("dim", s.viewBox ?? "(no viewBox)")}`);
  log(`\n${c("bold", "  Usage")}`);
  for (const line of res.usage.split("\n")) log(`    ${c("dim", line)}`);
  log("");
}

function cmdInfo(a: Args, inputs: { path: string; content: string }[]): void {
  for (const f of inputs) {
    const i = info(f.content);
    if (a.json) {
      stdout.write(JSON.stringify({ file: f.path, ...i }) + "\n");
      continue;
    }
    log(`\n${c("bold", c("magenta", "◆ lacspace-svg info"))}  ${c("dim", f.path)}`);
    log(`  ${c("cyan", "size")}      ${i.bytes} bytes`);
    log(`  ${c("cyan", "width")}     ${i.width ?? c("dim", "—")}`);
    log(`  ${c("cyan", "height")}    ${i.height ?? c("dim", "—")}`);
    log(`  ${c("cyan", "viewBox")}   ${i.viewBox ?? c("dim", "—")}`);
    log(`  ${c("cyan", "elements")}  ${i.elementCount} total, ${i.idCount} with ids`);
    const top = Object.entries(i.elements).sort((x, y) => y[1] - x[1]);
    for (const [name, n] of top) log(`    ${c("dim", name.padEnd(16))} ${n}`);
    if (i.warnings.length) {
      log(`  ${c("yellow", `⚠ ${i.warnings.length} warning${i.warnings.length === 1 ? "" : "s"}`)}`);
      for (const w of i.warnings) log(`    ${c("yellow", w.kind)} ${c("dim", "· " + w.detail)}`);
    } else {
      log(`  ${c("green", "✓ no script/handler warnings")}`);
    }
    log("");
  }
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help) { stdout.write(HELP + "\n"); return; }

  const inputs = resolveInputs(args.files);
  if (inputs.length === 0) { stdout.write(HELP + "\n"); return; }

  switch (args.command) {
    case "jsx": return cmdJsx(args, inputs);
    case "data-uri": return cmdDataUri(args, inputs);
    case "sprite": return cmdSprite(args, inputs);
    case "info": return cmdInfo(args, inputs);
    default: return cmdOptimize(args, inputs);
  }
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
