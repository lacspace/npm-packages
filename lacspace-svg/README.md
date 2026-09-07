# lacspace-svg

**A keyless, zero-dependency SVG toolkit.** Optimize/minify SVGs (an svgo-lite cleaner), convert an SVG to a **React / Vue / Svelte / Solid component**, to a **`data:` URI** for CSS/HTML, and build an **SVG sprite** (symbol sheet) from many files — all with a hand-written, tolerant XML/SVG parser underneath. Fully offline and local: no network, no accounts, no telemetry, **zero runtime dependencies**.

### New in 0.2.0

- **More component targets** — `vue`, `svelte` and `solid` commands plus a `toComponent(svg, { framework })` dispatcher (React `toJsx` unchanged).
- **`currentColor` injection** — `--current-color` (with `--keep-colors`) swaps literal `fill`/`stroke` colours for `currentColor` so icons inherit CSS `color`.
- **More optimizer passes** — drop default-valued presentation attrs, hoist attributes shared by all children onto their group (`--hoist`), and strip Sketch / Adobe-Illustrator editor cruft.
- **viewBox / dimension fixing** — `--fix-dimensions` derives a missing `viewBox` from `width`/`height` (and back), plus a `dimensions()` reader and `dimensions` command.
- **Batch stats** — `optimize *.svg` now prints a per-file **and total** byte-savings summary; `batchOptimize()` exposes the aggregate.

```bash
npx lacspace-svg logo.svg
# <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">…</svg>
#   598 → 287 bytes  -52%
```

## Install

```bash
# one-off, no install
npx lacspace-svg icon.svg

# or globally
npm i -g lacspace-svg

# or as a library
npm i lacspace-svg
```

## Why it exists

Most SVG tooling is either a huge dependency tree, a paid web service that uploads your art, or both. `lacspace-svg` is a single small package that runs entirely on your machine. It complements [`lacspace-icon`](https://developer.lacspace.com/tools/icon) and slots into any build script or CI job.

## CLI

```
lacspace-svg [command] <files...> [options]
cat icon.svg | lacspace-svg optimize
```

### Commands

| Command | Purpose |
| --- | --- |
| `optimize` *(default)* | Minify/clean an SVG (or a batch) and report bytes saved |
| `jsx` (alias `react`) | Convert an SVG to a React/JSX component |
| `vue` | Convert an SVG to a Vue 3 single-file component |
| `svelte` | Convert an SVG to a Svelte component |
| `solid` | Convert an SVG to a Solid component |
| `component` | Convert an SVG with `--framework react\|vue\|svelte\|solid` |
| `data-uri` | Emit a `data:image/svg+xml` URI (URL-encoded or base64) |
| `sprite` | Combine many SVGs into one `<symbol>` sprite sheet |
| `info` | Print dimensions, element counts and safety warnings |
| `dimensions` | Print `width` / `height` / `viewBox` of the root `<svg>` |

### Options

| Flag | Description |
| --- | --- |
| `-o, --out <file>` | Write output to a file instead of stdout |
| `--out-dir <dir>` | Write one output file per input into `<dir>` |
| `--precision <n>` | Decimal places for number rounding (default `3`) |
| `--remove-dimensions` | Drop `width`/`height` in favour of `viewBox` (opt-in) |
| `--fix-dimensions` | Derive a missing `viewBox` from `width`/`height` (and vice-versa) |
| `--current-color` | Replace literal `fill`/`stroke` colours with `currentColor` |
| `--keep-colors <l>` | Comma list of colours to keep literal (with `--current-color`) |
| `--hoist` | Hoist an attribute shared by all children onto their group |
| `--keep-default-attrs` | Keep presentation attrs set to their default value |
| `--keep-ids` | Keep unused `id` attributes |
| `--keep-title` | Keep `<title>`/`<desc>` (accessibility text) |
| `--pretty` | Pretty-print instead of minifying |
| `--name <Comp>` | *(component)* component name |
| `--framework <f>` | *(component)* `react` \| `vue` \| `svelte` \| `solid` |
| `--ts` | *(component)* emit TypeScript |
| `--ref` | *(jsx)* `forwardRef` to the root `<svg>` |
| `--encoding <e>` | *(data-uri)* `uri` (default) or `base64` |
| `--css` | *(data-uri)* wrap as `background-image:url("…")` |
| `--multipass` | Optimize repeatedly until the output stabilizes |
| `--json` | Machine-readable JSON output |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

Inputs can be a file, a `*.svg` glob, or **stdin** (pipe an SVG in). Data goes to stdout; logs and errors go to stderr; an unreadable file or empty match **exits non-zero** so it works in CI.

## Examples

```bash
# Minify a logo and write it out (reports the byte savings)
lacspace-svg logo.svg -o logo.min.svg

# Optimize a whole folder into dist/, rounding to 2 decimals
lacspace-svg optimize "icons/*.svg" --out-dir dist --precision 2

# Turn an SVG into a typed, ref-forwarding React component
lacspace-svg jsx logo.svg --name Logo --ts --ref

# …or a Vue 3 SFC, a Svelte component, or a typed Solid component
lacspace-svg vue logo.svg --name Logo --ts
lacspace-svg svelte logo.svg --name Logo
lacspace-svg component logo.svg --framework solid --ts

# Make icons inherit the surrounding CSS color (keep the brand white literal)
lacspace-svg optimize "icons/*.svg" --current-color --keep-colors "#fff" --out-dir dist

# Optimize a folder and print per-file + total savings
lacspace-svg optimize "icons/*.svg" --precision 2
#   … 2 files  1204 → 812 bytes  -32.6% (392 bytes saved)
```
```jsx
import * as React from "react";

const Logo = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(function Logo(props, ref) {
  return (
    <svg viewBox="0 0 24 24" ref={ref} {...props}>
      <path d="M0.111 0.222L3.333 4.444" fill="#f00" />
    </svg>
  );
});
export default Logo;
```

```bash
# Inline an SVG in CSS as a URL-encoded data URI (smaller than base64)
lacspace-svg data-uri icon.svg --css
# background-image: url("data:image/svg+xml,%3Csvg …%3E");

# Build a sprite sheet from many icons and print the usage snippet
lacspace-svg sprite "icons/*.svg" -o sprite.svg
# <svg style="display:none"><symbol id="home" viewBox="0 0 24 24">…</symbol>…</svg>
#   Usage:  <svg><use href="#home"></use></svg>

# Inspect a file (dimensions, element counts, script/handler warnings)
lacspace-svg info suspicious.svg
```

## What the optimizer does

Every default-on transform is **lossless to rendering** for real-world SVG:

- strip comments, the XML declaration, DOCTYPE, `<?xml-stylesheet?>`, `<metadata>` and editor cruft (`sodipodi:*` / `inkscape:*` / `sketch:*` / Adobe-Illustrator attributes + their `xmlns` declarations);
- remove empty attributes, empty containers (`<g>`, `<defs>`, …), presentation attributes set to their SVG default (`fill-opacity="1"`, `stroke-linejoin="miter"`, …) and `id`s that nothing references (ids used by `url(#id)` / `href` / `xlink:href` are kept);
- collapse whitespace, round numbers in coords/paths/transforms to `--precision` decimals, drop trivial no-op transforms (`translate(0)`, `scale(1)`, identity matrices);
- normalize colours (`#ffffff` → `#fff`, `rgb(255,0,0)` → `#f00`) and add a `viewBox` derived from `width`/`height` when missing;
- report before/after byte size and the percent saved (per file **and** a batch total).

**Opt-in** transforms (can change output, so off by default): `--current-color` (colours → `currentColor`), `--hoist` (move an attribute shared by every child onto their group), `--fix-dimensions` (also derive `width`/`height` from the `viewBox`), `--remove-dimensions` (drop `width`/`height`), and removing `<title>`/`<desc>` (kept unless you *don't* pass `--keep-title` — the CLI removes them by default for the smallest output; the library keeps them unless `removeTitle: true`).

## Library API

```ts
import {
  optimize, batchOptimize, toJsx, toComponent, toVue, toSvelte, toSolid,
  currentColorize, dimensions, fixDimensions, toDataUri, buildSprite, info,
  parseSvg, serialize,
} from "lacspace-svg";
```

| Export | Signature |
| --- | --- |
| `optimize` | `(svg: string, opts?: OptimizeOptions) => OptimizeResult` |
| `batchOptimize` | `(inputs: {path,content}[], opts?: OptimizeOptions) => BatchResult` (per-file + totals) |
| `toJsx` | `(svg: string, opts?: JsxOptions) => string` — React (unchanged) |
| `toComponent` | `(svg: string, opts?: ComponentOptions) => string` — dispatch by `framework` |
| `toVue` / `toSvelte` / `toSolid` | `(svg: string, opts?: ComponentOptions) => string` |
| `currentColorize` | `(svg: string, opts?: CurrentColorOptions) => { data, replaced }` |
| `dimensions` | `(svg: string) => { width?, height?, viewBox?, viewBoxValues? }` |
| `fixDimensions` | `(svg: string, opts?: FixDimensionsOptions) => FixDimensionsResult` |
| `toDataUri` | `(svg: string, opts?: DataUriOptions) => DataUriResult` |
| `buildSprite` | `(inputs: SpriteInput[], opts?: SpriteOptions) => SpriteResult` |
| `info` | `(svg: string) => SvgInfo` |
| `parseSvg` | `(svg: string) => SvgRoot` — tolerant XML/SVG parser |
| `serialize` | `(node, opts?: SerializeOptions) => string` |
| `getAttr` / `setAttr` / `removeAttr` / `walk` | tree helpers |
| `normalizeColor` / `roundNumber` / `stripTrivialTransforms` | pure transform helpers |
| `encodeSvgUri` / `encodeSvgBase64` | data-URI encoders |
| `jsxAttrName` / `styleToObject` | JSX helpers |
| `sanitizeId` | filename → safe SVG id |

```ts
const { data, savedPct } = optimize(svg, { precision: 2, currentColor: true });
const { total } = batchOptimize([{ path: "a.svg", content: a }, { path: "b.svg", content: b }]);
const react = toJsx(svg, { name: "Logo", typescript: true, ref: true });
const vue = toComponent(svg, { framework: "vue", name: "Logo", typescript: true });
const { data: recolored } = currentColorize(svg, { keep: ["#fff"] });
const { viewBox } = fixDimensions(svg); // derive a missing viewBox from width/height
const sprite = buildSprite([{ id: "home", svg: homeSvg }]);
const stats = info(svg); // stats.warnings flags <script>, on* handlers, external hrefs
```

Everything is fully typed and ships as **dual ESM + CJS** with `.d.ts`.

## Safety

`lacspace-svg` never executes anything it reads. `info` **flags** `<script>` elements, inline `on*` event handlers, `<foreignObject>` and external `href`s so you can review them — it does not run or auto-strip them. When building data-URIs it correctly escapes `#`, `<`, `>`, quotes and `%`.

## Limitations (honest)

- **No path-data geometry.** The optimizer normalizes whitespace and numeric precision inside `d`, but it never merges, re-encodes, or does arithmetic on path commands — that is error-prone and out of scope. For that last few percent, run the output through a geometry-aware pass.
- **Not a validating XML processor.** The parser is tolerant by design: it accepts the SVG editors emit and round-trips it, but won't reject every malformed document.
- **Entities are preserved verbatim**, not resolved.
- Colour normalization covers hex and `rgb()`; it does not convert named colours or `hsl()`.
- Default-value dropping is deliberately conservative to stay lossless under CSS inheritance.

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE).
