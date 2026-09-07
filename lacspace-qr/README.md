# lacspace-qr

**Generate scannable QR codes to the terminal, an SVG, or a PNG — from a QR encoder written entirely from scratch.** No API keys, no network, no telemetry, and **zero runtime dependencies**. The Reed–Solomon error correction, matrix placement, data masking, SVG writer and PNG encoder are all hand-written; the PNG side only uses the built-in `node:zlib`.

```bash
npx lacspace-qr "https://lacspace.com"
#   renders a scannable QR right in your terminal
#   https://lacspace.com  ·  v2 · ecc M · mask 2 · 25×25
```

### New in 0.2.0

- **Styled SVG modules** — `--shape square|dots|rounded` plus a distinct finder-eye shape via `--eye`.
- **Centre logo / initials** — `--logo <text|file|data-uri>`, drawn in a cleared quiet band (guarded: needs `--ecc Q|H`).
- **Gradient foreground** — `--gradient from,to[,angle]` emits a real SVG `<linearGradient>` two-tone fill.
- **Full-block ANSI render** — `renderToAnsi` / `-f ansi` for a one-module-per-cell terminal QR.
- **Calendar payload** — `calendarPayload` / the `calendar` preset build an iCalendar `VEVENT`.
- **`batch` subcommand** — `lacspace-qr batch list.csv --out dir/` (the pure `planBatch` maps rows → `{name,payload}`).

## Why it exists

Most QR libraries pull in a tree of dependencies or phone home to an image API. `lacspace-qr` does neither: it's a single, auditable, offline tool. It implements the ISO/IEC 18004 encoding pipeline properly — mode selection, character-count headers, Reed–Solomon ECC over GF(256), block interleaving, all seven function patterns, and penalty-scored mask selection — so the codes it emits are genuinely spec-correct and scan on real phones.

## Install

```bash
# one-off, no install
npx lacspace-qr "https://lacspace.com"

# or globally
npm i -g lacspace-qr

# or as a library
npm i lacspace-qr
```

## CLI

```
lacspace-qr "<text or url>" [options]
lacspace-qr <preset> [preset args] [options]
lacspace-qr batch list.csv --out out/ -f svg
```

### Presets

| Preset | Example |
| --- | --- |
| `url` | `lacspace-qr url lacspace.com` (adds `https://`) |
| `text` | `lacspace-qr text "hello world"` |
| `wifi` | `lacspace-qr wifi --ssid Home --password s3cret [--security WPA\|WEP\|nopass] [--hidden]` |
| `vcard` | `lacspace-qr vcard --name "Ada" --org Lacspace --tel +977… --email a@b.com` |
| `email` | `lacspace-qr email --email a@b.com --subject Hi --body "…"` |
| `tel` | `lacspace-qr tel --tel +9779800000000` |
| `sms` | `lacspace-qr sms --tel +15551234 --message "hi"` |
| `geo` | `lacspace-qr geo 27.7172 85.3240` |
| `calendar` | `lacspace-qr calendar --vtitle "Launch" --start 2026-10-01T09:00Z [--end --location --body]` |

A bare `lacspace-qr "<string>"` just encodes the string (text or URL).

### Examples

```bash
# Terminal (default) — scans straight off the screen
npx lacspace-qr "https://lacspace.com"

# WiFi join code
npx lacspace-qr wifi --ssid Home --password s3cret
#   WIFI:T:WPA;S:Home;P:s3cret;;

# Branded SVG
npx lacspace-qr "https://x.com" -f svg -o qr.svg --fg "#4d9fff" --radius 0.4

# Styled: dot modules with rounded finder eyes
npx lacspace-qr "https://x.com" -f svg -o qr.svg --shape dots --eye rounded

# Two-tone gradient foreground
npx lacspace-qr "https://x.com" -f svg -o qr.svg --gradient "#4d9fff,#a855f7,45"

# Centre logo / initials (needs high ECC to stay scannable)
npx lacspace-qr "https://lacspace.com" -f svg -o qr.svg --ecc H --logo LS
npx lacspace-qr "https://lacspace.com" -f svg -o qr.svg --ecc H --logo ./brand.svg

# Full-block terminal render
npx lacspace-qr "https://lacspace.com" -f ansi   # or: --ansi

# Calendar event (VEVENT)
npx lacspace-qr calendar --vtitle "Launch" --start 2026-10-01T09:00Z -f svg -o event.svg

# vCard as a PNG (hand-written encoder → real 8-bit RGBA PNG)
npx lacspace-qr vcard --name "Ada Lovelace" --tel +9779800000000 -f png -o ada.png

# Location
npx lacspace-qr geo 27.7172 85.3240 -f svg -o place.svg

# High error correction + a forced version
npx lacspace-qr "MISSION CRITICAL" --ecc H --qr-version 5

# Batch: one file per CSV row, named by the id column
npx lacspace-qr batch urls.csv --out out/ -f png --scale 8
```

`urls.csv` can be `id,url` (or any `id` + `data`/`text`/`url`/`content` headers); a single-column CSV or a `.txt` list numbers rows automatically.

### Flags

| Flag | Description |
| --- | --- |
| `-f, --format <term\|ansi\|svg\|png>` | Output format (default `term`) |
| `--ansi` | Full-block terminal render (alias for `-f ansi`) |
| `-o, --out <file>` | Write to a file instead of stdout (required for PNG) |
| `batch <list.csv\|.txt>` | Subcommand: generate one file per row (`--out`/`--out-dir` sets the dir) |
| `--batch <list.csv\|.txt>` | Same, as a flag |
| `--out-dir <dir>` | Output directory for batch (default `out`) |
| `--ecc <L\|M\|Q\|H>` | Error-correction level (default `M`) |
| `--qr-version <1-40>` | Force the QR **symbol** version |
| `--min-version <1-40>` | Minimum symbol version |
| `--mask <0-7>` | Force a data mask (default: lowest penalty) |
| `--mode <numeric\|alphanumeric\|byte>` | Force the encoding mode |
| `--size <px>` | SVG pixel size (default `512`) |
| `--scale <px>` | PNG pixels per module (default `10`) |
| `--margin, --quiet <n>` | Quiet-zone modules (term `2`, svg/png `4`) |
| `--fg <colour>` | Dark-module colour (svg/png, default `#000000`) |
| `--bg <colour>` | Background colour (svg/png; `transparent` supported) |
| `--radius <0-0.5>` | Rounded modules (svg) |
| `--shape <square\|dots\|rounded>` | Module shape (svg) |
| `--eye <square\|dots\|rounded>` | Distinct finder-eye shape (svg) |
| `--gradient <from,to[,angle]>` | Two-tone linear-gradient foreground (svg) |
| `--logo <text\|file\|data-uri>` | Centre logo/initials (svg; needs `--ecc Q\|H`) |
| `--logo-size <0.05-0.35>` | Logo box as a fraction of the symbol (svg) |
| `--invert` | Swap dark/light (terminal/ansi, for light backgrounds) |
| `--json` | Print metadata as JSON |
| `-h, --help` | Show help |
| `-v, --version` | Print the tool version |

> **Flag note:** `-v` / `--version` prints the *tool* version, while `--qr-version` sets the QR *symbol* version (1–40). They are deliberately different flags to avoid the classic clash.

Invalid input (a payload too large for the chosen version, an unknown ECC level, a bad mask) prints a clear error to **stderr** and exits non-zero, so it behaves in scripts and CI.

## Library API

```ts
import { makeQr, renderToSvg, renderToTerminal, renderToPng, wifiPayload } from "lacspace-qr";

const qr = makeQr("https://lacspace.com", { ecc: "H" });
console.log(renderToTerminal(qr));
const svg = renderToSvg(qr, {
  size: 512,
  shape: "dots",
  eye: "rounded",
  fg: { from: "#4d9fff", to: "#a855f7", angle: 45 }, // gradient foreground
  logo: "LS",                                        // centre initials (needs ecc Q|H)
});
const png = renderToPng(qr, { scale: 10 }); // Uint8Array of PNG bytes

const wifi = makeQr(wifiPayload({ ssid: "Lacspace", password: "s3cret" }));
```

| Export | Signature | Purpose |
| --- | --- | --- |
| `makeQr` | `(text, opts?) => QrCode` | Encode text into a full QR matrix (auto version/mode/mask) |
| `encodeText` | `(text, opts?) => EncodedData` | Just the interleaved codeword stream + chosen version/mode |
| `renderToTerminal` | `(qr, opts?) => string` | Unicode half-block rendering |
| `renderToAnsi` | `(qr, opts?) => string` | Full-block terminal render (2 chars/module) |
| `renderToSvg` | `(qr, opts?) => string` | Crisp SVG document (shape / eye / gradient / logo) |
| `renderToPng` | `(qr, opts?) => Uint8Array` | Hand-written 8-bit RGBA PNG |
| `renderToImage` | `(qr, opts?) => ImageData` | Raw RGBA raster |
| `isFinderModule` | `(qr, x, y) => boolean` | Is a module inside a finder pattern (eye styling) |
| `logoClearing` | `(qr, logo) => LogoClearing` | Pure centre-clearing geometry + ECC guard |
| `wifiPayload` / `vcardPayload` / `emailPayload` / `telPayload` / `smsPayload` / `geoPayload` / `urlPayload` / `calendarPayload` | payload builders | Correctly-formatted payload strings |
| `gfMul` / `gfPow` / `rsComputeDivisor` / `rsComputeRemainder` | GF(256) + Reed–Solomon | The low-level ECC math |
| `parseBatch` / `planBatch` | `(contents, "csv"\|"txt") => BatchRow[] / BatchPlan[]` | Parse a batch list (`planBatch` → `{name,payload}`) |
| `numDataCodewords` / `dataCapacityBits` / `alignmentPatternPositions` | capacity helpers | Version/ECC geometry |

Types: `QrCode`, `QrOptions`, `EccLevel` (`"L"\|"M"\|"Q"\|"H"`), `QrMode`, `EncodedData`, `WifiPayload`, `VcardPayload`, `CalendarPayload`, `SvgOptions`, `Gradient`, `ModuleShape`, `LogoOptions`, `LogoClearing`, `PngOptions`, `TerminalOptions`, `AnsiOptions`, `BatchRow`, `BatchPlan`, `Rgba`.

## Correctness

The encoder is validated against independent published reference vectors: the *"HELLO WORLD"* version 1-Q data **and** error-correction codewords match the ISO/IEC 18004 worked example exactly, and the Reed–Solomon generator polynomials match the standard degree-7/10/13 generators. The test suite also checks GF(256) arithmetic against a reference multiply, finder/timing/alignment placement, format- and version-information BCH round-trips, mask-penalty scoring, and a locked module-matrix fingerprint.

## Limitations

- **Single-mode encoding.** Each payload is encoded in one auto-selected mode (numeric, alphanumeric, or UTF-8 byte). This is spec-valid and compact for typical inputs; it does not compute the theoretically optimal *mixed*-mode segmentation.
- **No Kanji mode** and **no ECI**. Non-ASCII text is UTF-8 byte-encoded (which the vast majority of scanners read correctly), rather than using Shift-JIS Kanji mode.
- **Structured-append** (splitting one message across multiple symbols) is not implemented. Logo, eye styling, gradients and module shapes are supported in the SVG renderer (`--shape`/`--eye`/`--gradient`/`--logo`), but not in the PNG rasteriser.
- **Barcodes:** only QR is implemented. Code-128 was intentionally left out for now rather than adding scope — it can be added later, still zero-dependency.
- PNG is written as an 8-bit RGBA (colour type 6) image; it is not size-optimised (no palette/indexed output).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
