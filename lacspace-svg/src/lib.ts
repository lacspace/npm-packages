/**
 * lacspace-svg — a keyless, zero-dependency SVG toolkit.
 *
 * Optimize/minify SVGs (an svgo-lite cleaner), convert an SVG to a React/JSX
 * component, to a `data:` URI for CSS/HTML, and build an `<svg>` sprite sheet
 * of `<symbol>`s from many files — plus a hand-written, tolerant XML/SVG parser
 * and serializer underneath it all. Fully offline and local: no network, no
 * telemetry, no runtime dependencies.
 *
 * ```ts
 * import { optimize, toJsx, toDataUri, buildSprite, info } from "lacspace-svg";
 *
 * const { data, savedPct } = optimize(svg, { precision: 2 });
 * // data = minified svg; savedPct = e.g. 42.7
 *
 * toJsx(svg, { name: "Logo", typescript: true, ref: true });
 * // "import * as React from 'react'; const Logo = React.forwardRef(…)"
 *
 * toDataUri(svg, { encoding: "uri", css: true }).output;
 * // "background-image: url(\"data:image/svg+xml,%3Csvg …\");"
 *
 * buildSprite([{ id: "home", svg }, { id: "user", svg2 }]).data;
 * // "<svg style='display:none'><symbol id='home' viewBox='…'>…</symbol>…"
 * ```
 */

export {
  parseSvg,
  serialize,
  walk,
  getAttr,
  setAttr,
  removeAttr,
  findRootSvg,
  SvgParseError,
} from "./parse.js";
export type {
  SvgRoot,
  SvgNode,
  SvgElement,
  SvgText,
  SvgComment,
  SvgCData,
  SvgPI,
  SvgDoctype,
  SvgAttr,
  SerializeOptions,
} from "./parse.js";

export {
  optimize,
  collectReferencedIds,
  normalizeColor,
  roundNumber,
  roundNumbersIn,
  stripTrivialTransforms,
} from "./optimize.js";
export type { OptimizeOptions, OptimizeResult } from "./optimize.js";

export { toJsx, jsxAttrName, styleToObject, parseForJsx } from "./jsx.js";
export type { JsxOptions } from "./jsx.js";

export { toDataUri, encodeSvgUri, encodeSvgBase64 } from "./datauri.js";
export type { DataUriOptions, DataUriResult } from "./datauri.js";

export { buildSprite, sanitizeId } from "./sprite.js";
export type { SpriteInput, SpriteOptions, SpriteResult } from "./sprite.js";

export { info } from "./info.js";
export type { SvgInfo, SvgWarning } from "./info.js";
