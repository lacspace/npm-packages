# lacspace-icon

Generate a complete **favicon, PWA and Apple-touch icon set** plus a **web manifest**, an **`.ico`**, an **Open Graph image** and the **HTML snippet** — from one source image.

**No web service. No dependencies.** It ships its own zero-dependency PNG codec (decode + encode via `node:zlib`), an area-average image resizer and a PNG-in-ICO writer, so nothing leaves your machine and there's no native module to compile.

```
npm i -g lacspace-icon      # global CLI
npx lacspace-icon logo.png  # or one-off
```

## Quick start

```bash
lacspace-icon logo.png --out public --name "Lacspace" --short "Lac" --maskable --og
```

Point it at a square-ish PNG and it writes everything you need into `public/`, then prints the `<head>` snippet to paste in.

## What it generates

| File | Size | Purpose |
| --- | --- | --- |
| `favicon-16x16.png` | 16×16 | Classic favicon |
| `favicon-32x32.png` | 32×32 | Retina favicon |
| `favicon-48x48.png` | 48×48 | Windows / high-DPI |
| `favicon.ico` | 16 + 32 + 48 | Multi-size `.ico` (PNG-in-ICO) |
| `apple-touch-icon.png` | 180×180 | iOS home screen (opaque `--bg`) |
| `icon-192.png` | 192×192 | PWA / Android (transparent) |
| `icon-512.png` | 512×512 | PWA splash / install |
| `icon-maskable-512.png` | 512×512 | Maskable, safe-zone padded on `--bg` (with `--maskable`) |
| `og.png` | 1200×630 | Open Graph / Twitter card (with `--og`) |
| `manifest.webmanifest` | — | Web app manifest wired to the icons |

## The `<head>` snippet

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#4d9fff">
```

## CLI

```
lacspace-icon <source.(png|svg)> [options]
```

| Flag | Default | Description |
| --- | --- | --- |
| `--out <dir>` | `./icons` | Output directory |
| `--bg <hex>` | `#0b0b0f` | Background/padding colour for opaque icons (apple-touch, maskable, og) |
| `--name <str>` | `App` | App name for the manifest |
| `--short <str>` | = `--name` | Short name for the manifest |
| `--theme <hex>` | `#4d9fff` | Browser theme colour (`<meta name="theme-color">`) |
| `--maskable` | off | Also emit `icon-maskable-512.png` |
| `--og` | off | Also emit `og.png` (1200×630) |
| `-h`, `--help` | | Show help |
| `-v`, `--version` | | Show version |

### Examples

```bash
# Minimal — favicons, .ico, PWA icons, apple-touch, manifest
lacspace-icon logo.png

# Full set into ./public with a light background
lacspace-icon logo.png --out public --bg "#ffffff" --theme "#111827" --maskable --og

# Name the PWA
lacspace-icon logo.png --name "Lacspace" --short "Lac"

# SVG source (needs an installed browser — see limitations)
lacspace-icon brand.svg --out public
```

## Library

Everything the CLI does is exported.

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generateIcons } from "lacspace-icon";

const { files, snippet, manifest } = generateIcons(readFileSync("logo.png"), {
  name: "My App",
  short: "App",
  bg: "#0b0b0f",
  theme: "#4d9fff",
  maskable: true,
  og: true,
});

mkdirSync("icons", { recursive: true });
for (const [name, bytes] of Object.entries(files)) writeFileSync(`icons/${name}`, bytes);
console.log(snippet);
console.log(manifest.icons);
```

### Low-level API

The building blocks are exported too, so you can run the pipeline yourself:

```ts
import { decodePng, encodePng, resizeRgba, makeIco, buildManifest } from "lacspace-icon";

const img = decodePng(readFileSync("logo.png"));       // → { width, height, rgba }
const small = resizeRgba(img, 32, 32);                  // area-average downscale → Uint8Array
const png32 = encodePng({ width: 32, height: 32, rgba: small });
const ico = makeIco([{ png: png32, size: 32 }]);        // PNG-in-ICO
const manifest = buildManifest({ name: "My App", maskable: true });
```

| Export | Signature |
| --- | --- |
| `decodePng` | `(bytes: Uint8Array) => ImageData` |
| `encodePng` | `(img: ImageData) => Uint8Array` |
| `resizeRgba` | `(img: ImageData, w: number, h: number) => Uint8Array` |
| `makeIco` | `(entries: { png: Uint8Array; size: number }[]) => Uint8Array` |
| `generateIcons` | `(sourcePng: Uint8Array, opts?: IconOptions) => { files, snippet, manifest }` |
| `buildManifest` | `(opts?: IconOptions) => WebManifest` |
| `buildSnippet` | `(opts?: IconOptions) => string` |
| `rasterizeSvg` | `(svg: Uint8Array \| string, size?: number) => Promise<Uint8Array \| null>` |
| `hexToRgba`, `createCanvas`, `compositeOver`, `drawIconOnCanvas` | compositing helpers |
| `crc32`, `isPng` | PNG utilities |

Types: `ImageData`, `IconOptions`, `WebManifest`, `ManifestIcon`, `IcoEntry`, `GenerateResult`.

## How it works

1. **Decode** — a hand-written PNG parser reads the signature + chunks (IHDR, PLTE, tRNS, IDAT, IEND), inflates the IDAT with `node:zlib`, reverses the scanline filters (None/Sub/Up/Average/Paeth) and expands 8-bit colour types 0/2/3/4/6 to straight RGBA.
2. **Resize** — each target size is produced by **area-average (box) sampling** with premultiplied alpha, so downscaled icons stay crisp and transparent edges don't get dark fringes.
3. **Composite** — apple-touch / maskable / OG images fill a canvas with `--bg` and alpha-over the resized icon.
4. **Encode** — RGBA is written back to an 8-bit RGBA PNG (filter 0, `zlib.deflateSync`, correct per-chunk CRC32). The `.ico` embeds the 16/32/48 PNGs directly.

## Limitations (honest)

- **Raster sources should be PNG.** JPEG/WebP are not decoded — convert to PNG first.
- **8-bit PNGs only.** 16-bit and interlaced PNGs are rejected with a clear error (uncommon for logos/icons).
- **SVG and `--emoji` are best-effort and need a browser.** To rasterize an `.svg`, `lacspace-icon` lazily loads `playwright-core` (`npm i playwright-core` + `npx playwright install chromium`). If no browser is available it still writes `manifest.webmanifest` and copies the SVG through as `icon.svg` (scalable), and prints a clear warning that the raster sizes need a PNG source or an installed browser. Emoji input follows the same browser-dependent path.
- **Square in, square out.** Non-square sources are resized to square targets and may distort — feed it a square logo.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
