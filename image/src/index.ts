/**
 * @lacspace/image
 * Generate images without AI — draw gradients, patterns and placeholders,
 * resize, and export to PNG / JPEG / WebP / SVG with an exact file-size budget.
 *
 * Zero-dependency and isomorphic: native Canvas in the browser (all formats),
 * pure-JS PNG (zlib) and JPEG encoders in Node. Optional `sharp` peer unlocks
 * SVG→raster on the server.
 *
 * ```ts
 * import { gradient, encode, fit, formatBytes } from "@lacspace/image";
 *
 * const bg = gradient(1200, 630, {
 *   angle: 90,
 *   stops: [{ offset: 0, color: "#22d3ee" }, { offset: 1, color: "#6366f1" }],
 * }).pattern("dots", { size: 32 });
 *
 * const png = await encode(bg, { format: "png" });
 * const budgeted = await fit(bg, { format: "jpeg", maxSize: "120kb" });
 * console.log(formatBytes(budgeted.size), "at q", budgeted.quality);
 * ```
 */

export { Surface, gradient, radial, pattern } from "./surface.js";
export { encode } from "./encode.js";
export { fit } from "./fit.js";
export { encodePng, encodePngSync } from "./png.js";
export { encodeJpeg } from "./jpeg.js";
export { rasterizeSvg, type RasterizeSvgOptions } from "./svg.js";
export { parseSize, formatBytes } from "./bytes.js";
export { hasCanvas, canvasSupports } from "./env.js";
export { parseColor, type RGBA } from "./color.js";

export type {
  ImageFormat,
  Color,
  GradientStop,
  LinearGradientOptions,
  RadialGradientOptions,
  PatternKind,
  PatternOptions,
  Fit,
  DrawImageOptions,
  PixelSource,
  EncodeOptions,
  EncodeResult,
  FitOptions,
} from "./types.js";
