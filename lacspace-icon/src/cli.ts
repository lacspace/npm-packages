/**
 * lacspace-icon CLI — turn one source image into a full favicon / PWA / Apple-
 * touch / Open Graph icon set, a web manifest, an .ico and the HTML snippet.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, extname } from "node:path";
import { isPng } from "./png.js";
import { generateIcons, rasterizeSvg, buildSnippet } from "./generate.js";
import { buildManifest } from "./manifest.js";
import type { IconOptions } from "./manifest.js";

const VERSION = "0.1.0";

const HELP = `lacspace-icon — favicon / PWA / OG icon-set generator (zero dependencies)

USAGE
  lacspace-icon <source.(png|svg)> [options]

OPTIONS
  --out <dir>       Output directory (default: ./icons)
  --bg <hex>        Background/padding colour for opaque icons (default: #0b0b0f)
  --name <str>      App name for the manifest (default: "App")
  --short <str>     Short name for the manifest (default: --name)
  --theme <hex>     Browser theme colour (default: #4d9fff)
  --maskable        Also emit icon-maskable-512.png (safe-zone padded)
  --og              Also emit og.png (1200x630 Open Graph image)
  -h, --help        Show this help
  -v, --version     Show version

EXAMPLES
  lacspace-icon logo.png
  lacspace-icon logo.png --out public --name "Lacspace" --short "Lac" --maskable --og
  lacspace-icon logo.png --bg "#ffffff" --theme "#111827"
  lacspace-icon brand.svg --out public          # needs an installed browser

Generates: favicon-16x16.png, favicon-32x32.png, favicon-48x48.png, favicon.ico,
apple-touch-icon.png, icon-192.png, icon-512.png, manifest.webmanifest
(+ icon-maskable-512.png with --maskable, + og.png with --og), and prints the
<head> snippet to paste into your HTML.
`;

interface Parsed {
  source?: string;
  out: string;
  opts: IconOptions;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Parsed {
  const p: Parsed = { out: "./icons", opts: {}, help: false, version: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    switch (a) {
      case "-h": case "--help": p.help = true; break;
      case "-v": case "--version": p.version = true; break;
      case "--out": case "-o": p.out = argv[++i] ?? p.out; break;
      case "--bg": p.opts.bg = argv[++i]; break;
      case "--name": p.opts.name = argv[++i]; break;
      case "--short": p.opts.short = argv[++i]; break;
      case "--theme": p.opts.theme = argv[++i]; break;
      case "--maskable": p.opts.maskable = true; break;
      case "--og": p.opts.og = true; break;
      default:
        if (a.startsWith("-")) throw new Error(`Unknown option: ${a}`);
        if (!p.source) p.source = a;
        break;
    }
  }
  return p;
}

function fail(msg: string): never {
  process.stderr.write(`lacspace-icon: ${msg}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let parsed: Parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    fail((e as Error).message);
  }

  if (parsed.version) { process.stdout.write(VERSION + "\n"); return; }
  if (parsed.help || !parsed.source) { process.stdout.write(HELP); if (!parsed.source && !parsed.help) process.exit(1); return; }

  const sourcePath = resolve(parsed.source);
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(readFileSync(sourcePath));
  } catch {
    fail(`could not read source file: ${parsed.source}`);
  }

  const outDir = resolve(parsed.out);
  mkdirSync(outDir, { recursive: true });

  const ext = extname(sourcePath).toLowerCase();
  const looksSvg = ext === ".svg" || (!isPng(bytes) && /<svg[\s>]/i.test(new TextDecoder().decode(bytes.subarray(0, 512))));

  if (looksSvg) {
    process.stdout.write("Source looks like an SVG — trying to rasterize with a browser...\n");
    const png = await rasterizeSvg(bytes, 1024);
    if (png) {
      writeAll(outDir, generateFiles(png, parsed.opts), parsed.opts);
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
        "(`npm i playwright-core` + `npx playwright install chromium`) or pass a PNG\n" +
        "source to get the full set.\n\n",
      );
      process.stdout.write(`Output: ${outDir}\n  - icon.svg\n  - manifest.webmanifest\n\n`);
      process.stdout.write("Paste this into your <head> (add your own <link rel=\"icon\" href=\"/icon.svg\">):\n\n" + snippet + "\n");
      return;
    }
  } else if (isPng(bytes)) {
    let files: Record<string, Uint8Array>;
    try {
      files = generateFiles(bytes, parsed.opts);
    } catch (e) {
      fail(`could not decode PNG: ${(e as Error).message}`);
    }
    writeAll(outDir, files, parsed.opts);
  } else {
    fail("unsupported source: expected a .png or .svg file (JPEG/WebP are not supported — convert to PNG first).");
  }
}

function generateFiles(png: Uint8Array, opts: IconOptions): Record<string, Uint8Array> {
  return generateIcons(png, opts).files;
}

function writeAll(outDir: string, files: Record<string, Uint8Array>, opts: IconOptions): void {
  const names = Object.keys(files);
  for (const name of names) {
    writeFileSync(resolve(outDir, name), files[name]!);
  }
  process.stdout.write(`\nGenerated ${names.length} files in ${outDir}:\n`);
  for (const name of names) process.stdout.write(`  - ${name}\n`);
  process.stdout.write("\nPaste this into your <head>:\n\n" + buildSnippet(opts) + "\n");
}

main().catch((e) => fail((e as Error).message));
