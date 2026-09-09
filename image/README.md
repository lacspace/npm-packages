<div align="center">

# @lacspace/image

**Generate images without AI — and hit an exact file-size budget.**

[![npm version](https://img.shields.io/npm/v/@lacspace/image?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/image)
[![install size](https://packagephobia.com/badge?p=@lacspace/image)](https://packagephobia.com/result?p=@lacspace/image)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/image?label=minzip)](https://bundlephobia.com/package/@lacspace/image)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/image)
[![license](https://img.shields.io/npm/l/@lacspace/image?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> Draw gradients, patterns and backgrounds, resize and crop, then export to **PNG · JPEG · WebP · SVG** — at the **dimensions and file size you need** (`"120kb"`, `"1.5mb"`, …). No AI, no cloud, no keys. Deterministic and reproducible.

**Zero-dependency and isomorphic.** In the browser (or a Worker) it uses the native **Canvas** for all formats. In **Node** it ships its own **pure-JS PNG** (via built-in `zlib`) and **baseline JPEG** encoders — nothing to install. An optional `sharp` peer unlocks SVG→raster on the server.

## Install

```bash
npm i @lacspace/image
```

## Draw something and export it

```ts
import { gradient, encode, formatBytes } from "@lacspace/image";

const card = gradient(1200, 630, {
  angle: 60,
  stops: [
    { offset: 0, color: "#0BB9D9" },
    { offset: 0.5, color: "#3B82F6" },
    { offset: 1, color: "#7C3AED" },
  ],
}).pattern("dots", { size: 40, color: "rgba(255,255,255,0.1)" });

const { bytes, size } = await encode(card, { format: "png" });
console.log("wrote", formatBytes(size)); // wrote 86.2 KB
```

## Hit a file-size budget

`fit()` gets you **at or under** a ceiling. Lossy formats binary-search the quality knob; if that isn't enough it downscales. Lossless PNG downscales toward the target.

```ts
import { gradient, fit, formatBytes } from "@lacspace/image";

const img = gradient(1200, 630, { stops: [
  { offset: 0, color: "#ff5f6d" }, { offset: 1, color: "#00c9a7" },
]});

const r = await fit(img, { format: "jpeg", maxSize: "25kb" });
console.log(formatBytes(r.size), "at q", r.quality, `${r.width}×${r.height}`);
// 24.8 KB at q 55 1020×536   (quality + auto-resize to land under 25 KB)
```

> It's a best-effort **ceiling** — the closest fit ≤ your budget within the quality/scale bounds, never padded up to it.

## 🆕 Generators (v1.1.0)

Deterministic, no-AI building blocks — same input, same image:

```ts
import { identicon, mesh, placeholder, encode } from "@lacspace/image";

const avatar = identicon("ada@lacspace.com", { size: 240 });     // symmetric avatar from any string
const bg     = mesh(1200, 630, { seed: "brand" });               // smooth multi-point mesh gradient
const lqip   = placeholder(600, 315, { seed: "hero-1" });        // tasteful seeded gradient placeholder

const png = await encode(avatar, { format: "png" });
```

## The surface API

`Surface` is a plain RGBA pixel buffer with a small, chainable drawing API. Everything is deterministic and identical across Node and the browser.

```ts
import { Surface } from "@lacspace/image";

const s = new Surface(800, 400)
  .fill("#0b1020")
  .radialGradient({ cx: 0.5, cy: 0.3, radius: 0.9, stops: [
    { offset: 0, color: "#1e3a8a" }, { offset: 1, color: "#0b1020" },
  ]})
  .pattern("grid", { size: 32, color: "rgba(255,255,255,0.06)" })
  .rect(40, 40, 200, 80, "rgba(255,255,255,0.9)");

const thumb = s.resize(400, 200);           // bilinear, returns a new Surface
const square = s.crop(0, 0, 400, 400);       // returns a new Surface
```

| Method | What it does |
| --- | --- |
| `.fill(color)` | Solid fill (replaces) |
| `.rect(x, y, w, h, color)` | Blend a rectangle |
| `.linearGradient({ angle, stops })` | Angled gradient |
| `.radialGradient({ cx, cy, radius, stops })` | Radial gradient |
| `.pattern(kind, opts)` | `checker` · `grid` · `dots` · `stripes` · `noise` |
| `.drawImage(src, opts)` | Place another source with `cover`/`contain`/`fill` |
| `.resize(w, h)` · `.crop(x, y, w, h)` | New resampled / cropped surface |
| `.flatten(bg)` | Composite transparency onto a background |

Convenience builders: `gradient(w, h, opts)`, `radial(w, h, opts)`, `pattern(w, h, base, kind, opts)`.

## SVG → raster (pairs with `@lacspace/og`)

Turn any SVG string (for example the zero-dep card from [`@lacspace/og`](https://www.npmjs.com/package/@lacspace/og)) into a raster surface, then export or budget it.

```ts
import { rasterizeSvg, fit } from "@lacspace/image";

const surface = await rasterizeSvg(svgString, { width: 1200, height: 630 });
const og = await fit(surface, { format: "jpeg", maxSize: "200kb" });
```

- **Browser:** uses the native Canvas — zero extra deps.
- **Node:** uses the optional `sharp` peer if installed; otherwise throws a clear message (rich SVG text needs a real renderer). `npm i sharp` to enable it server-side.

## Formats & runtimes

| Format | Browser / Worker | Node |
| --- | --- | --- |
| PNG | ✅ Canvas | ✅ pure-JS (`zlib`) |
| JPEG | ✅ Canvas | ✅ pure-JS baseline |
| WebP | ✅ Canvas | ⛔ needs a Canvas runtime |
| SVG → raster | ✅ Canvas | ✅ with optional `sharp` |

## Size helpers

```ts
import { parseSize, formatBytes } from "@lacspace/image";
parseSize("1.5mb");  // 1572864  (binary units, matches OS/upload limits)
formatBytes(1536);   // "1.5 KB"
```

## API

- `encode(source, { format, quality?, background? })` → `{ bytes, format, width, height, quality?, size }`
- `fit(source, { format, maxSize? | maxBytes?, minQuality?, maxQuality?, allowResize?, minScale?, background? })`
- `encodePng(source, level?)` · `encodePngSync(source)` · `encodeJpeg(source, quality)`
- `rasterizeSvg(svg, { width?, height?, background? })`
- `Surface`, `gradient`, `radial`, `pattern`, `parseColor`, `parseSize`, `formatBytes`, `hasCanvas`, `canvasSupports`

## Contributing 💙

New patterns, generators and encoders are welcome — see [CONTRIBUTING.md](https://github.com/lacspace/npm-packages/blob/main/CONTRIBUTING.md). Open an issue or PR; first-time contributors welcome.

## License

[Lacspace Free Licence v1.0](https://github.com/lacspace/npm-packages/blob/main/LICENSE) — free to use, permissive, Lacspace-branded.

<div align="center"><sub>Part of the <a href="https://developer.lacspace.com/packages">Lacspace</a> ecosystem · zero-dependency · isomorphic · fully typed</sub></div>
