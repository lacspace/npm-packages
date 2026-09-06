/**
 * lacspace-icon — generate a complete favicon, PWA and Apple-touch icon set
 * plus a web manifest, an .ico, an Open Graph image and the HTML snippet, from
 * one source image. No web service, no dependencies.
 *
 * ```ts
 * import { readFileSync, writeFileSync } from "node:fs";
 * import { generateIcons } from "lacspace-icon";
 *
 * const { files, snippet, manifest } = generateIcons(readFileSync("logo.png"), {
 *   name: "My App", short: "App", bg: "#0b0b0f", theme: "#4d9fff",
 *   maskable: true, og: true,
 * });
 * for (const [name, bytes] of Object.entries(files)) writeFileSync(`icons/${name}`, bytes);
 * console.log(snippet);
 * ```
 *
 * Under the hood it ships its own zero-dependency PNG codec (decode/encode via
 * `node:zlib`), an area-average resizer, and a PNG-in-ICO writer — so it needs
 * no native modules and no cloud service. Rasterizing an SVG/emoji source to
 * PNG is best-effort and needs an installed browser (`playwright-core`).
 */
export { decodePng, encodePng, crc32, isPng, type ImageData } from "./png.js";
export { decodeJpeg, isJpeg } from "./jpeg.js";
export { resizeRgba } from "./resize.js";
export { makeIco, type IcoEntry } from "./ico.js";
export { hexToRgba, createCanvas, compositeOver, drawIconOnCanvas } from "./compose.js";
export { dominantColor, rgbToHex } from "./color.js";
export { pad, roundCorners, circleMask, invert } from "./shape.js";
export { quantizeColors, encodePngIndexed } from "./quantize.js";
export { generateSplash, type SplashEntry } from "./splash.js";
export {
  check,
  checkDir,
  checkUrl,
  type CheckReport,
  type CheckItem,
} from "./check.js";
export {
  buildManifest,
  type IconOptions,
  type WebManifest,
  type ManifestIcon,
  type ManifestShortcut,
} from "./manifest.js";
export {
  generateIcons,
  generateIconsFromImage,
  decodeSource,
  buildSnippet,
  rasterizeSvg,
  type GenerateResult,
  type GenerateStats,
  type SnippetExtras,
} from "./generate.js";
