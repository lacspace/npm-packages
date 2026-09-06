# lacspace-icon

Generate a complete **favicon, PWA and Apple-touch icon set** plus a **web manifest**, an **`.ico`**, an **Open Graph image**, **Apple splash screens** and the **HTML snippet** — from one **PNG or baseline JPEG**.

**No web service. No dependencies.** It ships its own zero-dependency **PNG codec** and **baseline JPEG decoder** (Huffman + IDCT + YCbCr, all hand-written), an area-average image resizer, an indexed-PNG palette optimizer and a PNG-in-ICO writer — so nothing leaves your machine and there's no native module to compile.

```
npm i -g lacspace-icon      # global CLI
npx lacspace-icon logo.png  # or one-off
```

## Quick start

```bash
lacspace-icon logo.png --out public --name "Lacspace" --short "Lac" --maskable --og
```

Point it at a square-ish PNG or JPEG and it writes everything you need into `public/`, then prints the `<head>` snippet to paste in. If you don't pass `--theme`, it picks a `theme_color` straight from your logo's **dominant colour**.

## What it generates

| File | Size | Purpose |
| --- | --- | --- |
| `favicon-16x16.png` | 16×16 | Classic favicon (palette-optimized) |
| `favicon-32x32.png` | 32×32 | Retina favicon (palette-optimized) |
| `favicon-48x48.png` | 48×48 | Windows / high-DPI |
| `favicon.ico` | 16 + 32 + 48 | Multi-size `.ico` (PNG-in-ICO) |
| `apple-touch-icon.png` | 180×180 | iOS home screen (opaque `--bg`) |
| `icon-192.png` | 192×192 | PWA / Android (transparent) |
| `icon-512.png` | 512×512 | PWA splash / install |
| `icon-maskable-512.png` | 512×512 | Maskable, safe-zone padded on `--bg` (`--maskable`) |
| `og.png` | 1200×630 | Open Graph / Twitter card (`--og`) |
| `favicon-dark-16/32.png` | 16/32 | Dark-mode favicon variant (`--dark` / `--auto-dark`) |
| `apple-splash-*.png` | per-device | iOS PWA startup images, both orientations (`--splash`) |
| `manifest.webmanifest` | — | Web app manifest wired to the icons |

## CLI

```
lacspace-icon <source.(png|jpg|svg)> [options]
lacspace-icon check <dir-or-url> [--json]
```

### Shape & sizing

| Flag | Description |
| --- | --- |
| `--padding <pct>` | Transparent margin around the icon, % per side (e.g. `12`) |
| `--radius <pct>` | Rounded corners, % of the shorter side (`0`..`50`), anti-aliased |
| `--circle` | Mask the icon to a circle |
| `--scale <pct>` | Icon size on opaque backgrounds (apple/maskable/og/splash); `100` = default |
| `--bg <hex>` | Background/padding colour for opaque icons (default `#0b0b0f`) |

### Manifest

| Flag | Default | Description |
| --- | --- | --- |
| `--name <str>` | `App` | App name |
| `--short <str>` | = `--name` | Short name |
| `--theme <hex>` | *dominant colour* | Theme colour (`<meta name="theme-color">`) |
| `--display <str>` | `standalone` | `standalone` \| `fullscreen` \| `minimal-ui` \| `browser` |
| `--orientation <str>` | — | `portrait` \| `landscape` \| `any` … |
| `--scope <url>` | — | Manifest `scope` |
| `--start-url <url>` | — | Manifest `start_url` |
| `--id <str>` | — | Manifest `id` |
| `--categories <list>` | — | Comma-separated categories |
| `--shortcut "Name\|/url"` | — | Home-screen shortcut (repeatable) |

### Extra outputs

| Flag | Description |
| --- | --- |
| `--maskable` | Also emit `icon-maskable-512.png` |
| `--og` | Also emit `og.png` (1200×630) + `og:image` tags |
| `--splash` | Also emit the Apple PWA startup-image (splash) set + `<link>`s |
| `--dark <src>` | Emit a dark favicon variant from this source (png/jpg) |
| `--auto-dark` | Emit a dark favicon variant by inverting the source |
| `--no-optimize` | Don't palette-optimize small favicons (keep truecolor PNG) |

### Examples

```bash
# Minimal — favicons, .ico, PWA icons, apple-touch, manifest
lacspace-icon logo.png

# JPEG source, full PWA package with splash screens and an OG card
lacspace-icon photo.jpg --name "Lacspace" --og --splash

# Rounded, padded, maskable app icon
lacspace-icon logo.png --radius 22 --padding 10 --maskable

# Circular icon with an auto dark-mode variant
lacspace-icon logo.png --circle --theme "#4d9fff" --auto-dark

# Rich manifest with shortcuts
lacspace-icon logo.png --start-url "/?src=pwa" --shortcut "New|/new" --shortcut "Docs|/docs"

# Audit an existing setup (folder or live URL)
lacspace-icon check ./public
lacspace-icon check https://example.com --json
```

`check` reports which recommended files and `<head>` tags are missing and prints a 0–100 completeness score (exit code `1` if anything required is missing — handy in CI).

## The `<head>` snippet

```html
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#4d9fff">
<!-- with --auto-dark: -->
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-dark-32x32.png" media="(prefers-color-scheme: dark)">
<!-- with --splash: one per device/orientation -->
<link rel="apple-touch-startup-image" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)" href="/apple-splash-1290-2796.png">
```

## Library

Everything the CLI does is exported.

```ts
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { generateIcons } from "lacspace-icon";

const { files, snippet, manifest, stats } = generateIcons(readFileSync("logo.png"), {
  name: "My App", short: "App",
  theme: "#4d9fff",        // omit to auto-pick the dominant colour
  maskable: true, og: true, splash: true, autoDark: true,
  radius: 20, padding: 8, scale: 100,
  shortcuts: [{ name: "New", url: "/new" }],
});

mkdirSync("icons", { recursive: true });
for (const [name, bytes] of Object.entries(files)) writeFileSync(`icons/${name}`, bytes);
console.log(snippet);
console.log(stats.dominantColor, "· bytes saved:", stats.bytesSaved);
```

`generateIcons` also accepts a **baseline JPEG** buffer directly (it auto-detects PNG vs JPEG).

### Selected exports

| Export | Signature |
| --- | --- |
| `generateIcons` | `(source: Uint8Array, opts?: IconOptions) => GenerateResult` |
| `generateIconsFromImage` | `(icon: ImageData, opts?: IconOptions) => GenerateResult` |
| `decodeSource` | `(bytes: Uint8Array) => ImageData` (PNG or baseline JPEG) |
| `decodePng` / `encodePng` | `(bytes) => ImageData` / `(img) => Uint8Array` |
| `decodeJpeg` / `isJpeg` | baseline JPEG → `ImageData` / sniff SOI |
| `resizeRgba` | `(img, w, h) => Uint8Array` (area-average) |
| `makeIco` | `(entries: IcoEntry[]) => Uint8Array` |
| `dominantColor` | `(img: ImageData \| Uint8Array) => string` (`#rrggbb`) |
| `pad` / `roundCorners` / `circleMask` / `invert` | shape helpers `(img, …) => ImageData` |
| `quantizeColors` / `encodePngIndexed` | palette reduce / indexed-PNG encode |
| `generateSplash` | `(icon, bg, scale?) => { files, entries }` |
| `check` / `checkDir` / `checkUrl` | audit a folder or URL → `CheckReport` |
| `buildManifest` / `buildSnippet` | manifest object / `<head>` string |
| `rasterizeSvg` | `(svg, size?) => Promise<Uint8Array \| null>` (needs a browser) |
| `hexToRgba`, `createCanvas`, `compositeOver`, `drawIconOnCanvas`, `crc32`, `isPng` | utilities |

Types: `ImageData`, `IconOptions`, `WebManifest`, `ManifestIcon`, `ManifestShortcut`, `IcoEntry`, `GenerateResult`, `GenerateStats`, `SnippetExtras`, `SplashEntry`, `CheckReport`, `CheckItem`.

## How it works

1. **Decode** — a hand-written **PNG parser** (8-bit colour types 0/2/3/4/6) or a hand-written **baseline JPEG decoder** (marker parsing → canonical Huffman → dequant → separable inverse DCT → chroma upsample → YCbCr/greyscale → RGBA).
2. **Shape** — optional transparent padding, anti-aliased rounded corners or a circular mask are applied to the source.
3. **Resize** — each target size is produced by **area-average (box) sampling** with premultiplied alpha, so downscaled icons stay crisp and transparent edges don't get dark fringes.
4. **Theme** — the source's **dominant colour** is extracted (saturation-weighted) to seed `theme_color` and the OG background unless you pass `--theme` / `--bg`.
5. **Composite** — apple-touch / maskable / OG / splash images fill a canvas with the background colour and alpha-over the resized icon at `--scale`.
6. **Encode** — big sizes are truecolor PNGs; small favicons are also encoded as **indexed (palette) PNGs** and the smaller of the two is kept (reported as bytes saved). The `.ico` embeds the 16/32/48 PNGs directly.

## Limitations (honest)

- **JPEG must be baseline (sequential DCT), 8-bit.** **Progressive** JPEGs, 12-bit and arithmetic-coded JPEGs, and **CMYK/YCCK** (4-component) JPEGs are rejected with a clear error — re-export as a baseline RGB/greyscale JPEG or a PNG. JPEG is lossy, so a JPEG source can't be pixel-perfect; prefer PNG for line-art logos.
- **8-bit PNGs only.** 16-bit and interlaced PNGs are rejected with a clear error (uncommon for logos/icons).
- **WebP/AVIF are not decoded** — convert to PNG or JPEG first.
- **SVG is best-effort and needs a browser.** To rasterize an `.svg`, `lacspace-icon` lazily loads `playwright-core` (`npm i playwright-core` + `npx playwright install chromium`). If no browser is available it still writes `manifest.webmanifest` and copies the SVG through as `icon.svg` (scalable), with a clear warning.
- **Square in, square out.** Non-square sources are resized to square targets and may distort — feed it a square logo (or use `--padding`).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
