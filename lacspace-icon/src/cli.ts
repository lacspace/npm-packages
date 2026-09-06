/**
 * lacspace-icon CLI — turn one source image into a full favicon / PWA / Apple-
 * touch / Open Graph icon set, a web manifest, an .ico and the HTML snippet.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { isPng } from "./png.js";
import { isJpeg } from "./jpeg.js";
import { generateIcons, generateIconsFromImage, decodeSource, rasterizeSvg, buildSnippet } from "./generate.js";
import type { GenerateResult } from "./generate.js";
import { buildManifest } from "./manifest.js";
import type { IconOptions, ManifestShortcut } from "./manifest.js";
import { check } from "./check.js";
import type { CheckReport } from "./check.js";

const VERSION = "0.2.0";

const HELP = `lacspace-icon — favicon / PWA / OG icon-set generator (zero dependencies)

USAGE
  lacspace-icon <source.(png|jpg|svg)> [options]
  lacspace-icon check <dir-or-url> [--json]

INPUT
  Accepts PNG and baseline (sequential) JPEG sources directly. SVG needs an
  installed browser (playwright-core). Progressive JPEGs are not supported —
  re-export as baseline.

SHAPE & SIZING
  --padding <pct>   Transparent margin around the icon, % per side (e.g. 12)
  --radius <pct>    Rounded corners, % of the shorter side (0..50)
  --circle          Mask the icon to a circle
  --scale <pct>     Icon size on opaque bg (apple/maskable/og/splash), 100 = default
  --bg <hex>        Background/padding colour for opaque icons (default: #0b0b0f)

MANIFEST
  --name <str>          App name (default: "App")
  --short <str>         Short name (default: --name)
  --theme <hex>         Theme colour (default: the image's dominant colour)
  --display <str>       standalone | fullscreen | minimal-ui | browser
  --orientation <str>   portrait | landscape | any | …
  --scope <url>         Manifest scope
  --start-url <url>     Manifest start_url
  --id <str>            Manifest id
  --categories <list>   Comma-separated categories
  --shortcut "Name|/url"  Home-screen shortcut (repeatable)

EXTRA OUTPUTS
  --maskable        Also emit icon-maskable-512.png (safe-zone padded)
  --og              Also emit og.png (1200x630) + og:image tags
  --splash          Also emit the Apple PWA startup-image (splash) set + links
  --dark <src>      Emit a dark favicon variant from this source (png/jpg)
  --auto-dark       Emit a dark favicon variant by inverting the source
  --no-optimize     Don't palette-optimize small favicons (keep truecolor PNG)

MISC
  --out <dir>       Output directory (default: ./icons)
  --json            (check only) print the audit as JSON
  -h, --help        Show this help
  -v, --version     Show version

EXAMPLES
  lacspace-icon logo.png
  lacspace-icon photo.jpg --name "Lacspace" --og --splash
  lacspace-icon logo.png --radius 22 --padding 10 --maskable
  lacspace-icon logo.png --circle --theme "#4d9fff" --auto-dark
  lacspace-icon logo.png --shortcut "New|/new" --shortcut "Docs|/docs"
  lacspace-icon check ./icons
  lacspace-icon check https://example.com --json
`;

interface Parsed {
  subcommand?: "check";
  source?: string;
  out: string;
  opts: IconOptions;
  darkPath?: string;
  json: boolean;
  help: boolean;
  version: boolean;
}

function num(v: string | undefined, flag: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${flag} expects a number (got "${v}")`);
  return n;
}

function parseArgs(argv: string[]): Parsed {
  const p: Parsed = { out: "./icons", opts: {}, json: false, help: false, version: false };
  const shortcuts: ManifestShortcut[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "-h": case "--help": p.help = true; break;
      case "-v": case "--version": p.version = true; break;
      case "check": if (!p.subcommand && !p.source) p.subcommand = "check"; break;
      case "--out": case "-o": p.out = argv[++i] ?? p.out; break;
      case "--json": p.json = true; break;
      case "--bg": p.opts.bg = argv[++i]; break;
      case "--name": p.opts.name = argv[++i]; break;
      case "--short": p.opts.short = argv[++i]; break;
      case "--theme": p.opts.theme = argv[++i]; break;
      case "--maskable": p.opts.maskable = true; break;
      case "--og": p.opts.og = true; break;
      case "--padding": p.opts.padding = num(argv[++i], "--padding"); break;
      case "--radius": p.opts.radius = num(argv[++i], "--radius"); break;
      case "--circle": p.opts.circle = true; break;
      case "--scale": p.opts.scale = num(argv[++i], "--scale"); break;
      case "--splash": p.opts.splash = true; break;
      case "--dark": p.darkPath = argv[++i]; break;
      case "--auto-dark": p.opts.autoDark = true; break;
      case "--no-optimize": p.opts.optimize = false; break;
      case "--display": p.opts.display = argv[++i]; break;
      case "--orientation": p.opts.orientation = argv[++i]; break;
      case "--scope": p.opts.scope = argv[++i]; break;
      case "--start-url": p.opts.startUrl = argv[++i]; break;
      case "--id": p.opts.id = argv[++i]; break;
      case "--categories": p.opts.categories = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean); break;
      case "--shortcut": {
        const raw = argv[++i] ?? "";
        const [name, url] = raw.split("|");
        if (!name || !url) throw new Error(`--shortcut expects "Name|/url" (got "${raw}")`);
        shortcuts.push({ name: name.trim(), url: url.trim() });
        break;
      }
      default:
        if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
        if (!p.source) p.source = a;
        break;
    }
  }
  if (shortcuts.length) p.opts.shortcuts = shortcuts;
  return p;
}

function fail(msg: string): never {
  process.stderr.write(`lacspace-icon: ${msg}\n`);
  process.exit(1);
}

function printCheck(report: CheckReport, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }
  process.stdout.write(`\nAudit of ${report.target} (${report.kind}) — score ${report.score}/100\n\n`);
  for (const item of report.items) {
    const mark = item.ok ? "✓" : item.required ? "✗" : "○";
    process.stdout.write(`  ${mark} ${item.label}${item.detail ? `  (${item.detail})` : ""}\n`);
  }
  if (report.missing.length) {
    process.stdout.write(`\nMissing (recommended): ${report.missing.join(", ")}\n`);
  } else {
    process.stdout.write(`\nAll recommended files/tags are present.\n`);
  }
}

async function main(): Promise<void> {
  let parsed: Parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail((e as Error).message);
  }

  if (parsed.version) { process.stdout.write(VERSION + "\n"); return; }

  // `check` subcommand.
  if (parsed.subcommand === "check") {
    if (!parsed.source) fail("check needs a directory or URL: lacspace-icon check <dir-or-url>");
    let report: CheckReport;
    try {
      report = await check(parsed.source);
    } catch (e) {
      fail(`audit failed: ${(e as Error).message}`);
    }
    printCheck(report, parsed.json);
    if (report.score < 100) process.exitCode = 1;
    return;
  }

  if (parsed.help || !parsed.source) {
    process.stdout.write(HELP);
    if (!parsed.source && !parsed.help) process.exit(1);
    return;
  }

  const sourcePath = resolve(parsed.source);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(sourcePath));
  } catch {
    fail(`could not read source file: ${parsed.source}`);
  }

  // Load a dark source if requested.
  if (parsed.darkPath) {
    try {
      parsed.opts.dark = new Uint8Array(readFileSync(resolve(parsed.darkPath)));
    } catch {
      fail(`could not read --dark source file: ${parsed.darkPath}`);
    }
  }

  const outDir = resolve(parsed.out);
  mkdirSync(outDir, { recursive: true });

  const ext = extname(sourcePath).toLowerCase();
  const looksSvg = ext === ".svg" || (!isPng(bytes) && !isJpeg(bytes) && /<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 512))));

  if (looksSvg) {
    process.stdout.write("Source looks like an SVG — trying to rasterize with a browser...\n");
    const png = await rasterizeSvg(bytes, 1024);
    if (png) {
      writeResult(outDir, generateIcons(png, parsed.opts));
    } else {
      // Fallback: copy the SVG through + manifest + snippet, warn honestly.
      writeFileSync(resolve(outDir, "icon.svg"), bytes);
      const manifest = buildManifest(parsed.opts);
      writeFileSync(resolve(outDir, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
      const snippet = buildSnippet(parsed.opts);
      process.stderr.write(
        "\nWARNING: no browser available (playwright-core not installed), so raster\n" +
        "sizes (PNG/ICO/apple-touch/OG) could NOT be generated. Wrote icon.svg\n" +
        "(scalable) + manifest.webmanifest only. Install a browser\n" +
        "(`npm i playwright-core` + `npx playwright install chromium`) or pass a PNG/JPEG\n" +
        "source to get the full set.\n\n",
      );
      process.stdout.write(`Output: ${outDir}\n  - icon.svg\n  - manifest.webmanifest\n\n`);
      process.stdout.write("Paste this into your <head> (add your own <link rel=\"icon\" href=\"/icon.svg\">):\n\n" + snippet + "\n");
      return;
    }
  } else if (isPng(bytes) || isJpeg(bytes)) {
    let result: GenerateResult;
    try {
      result = generateIconsFromImage(decodeSource(bytes), parsed.opts);
    } catch (e) {
      fail(`could not decode source: ${(e as Error).message}`);
    }
    writeResult(outDir, result);
  } else {
    fail("unsupported source: expected a .png, .jpg (baseline) or .svg file.");
  }
}

function writeResult(outDir: string, result: GenerateResult): void {
  const names = Object.keys(result.files);
  for (const name of names) writeFileSync(resolve(outDir, name), result.files[name]!);
  process.stdout.write(`\nGenerated ${names.length} files in ${outDir}:\n`);
  for (const name of names) process.stdout.write(`  - ${name}\n`);
  const s = result.stats;
  process.stdout.write(`\nDominant colour: ${s.dominantColor}  |  theme_color: ${s.themeColor}\n`);
  if (s.bytesSaved > 0) process.stdout.write(`Palette optimization saved ${s.bytesSaved} bytes on the small favicons.\n`);
  if (s.splashCount > 0) process.stdout.write(`Generated ${s.splashCount} Apple splash images.\n`);
  process.stdout.write("\nPaste this into your <head>:\n\n" + result.snippet + "\n");
}

main().catch((e) => fail((e as Error).message));
