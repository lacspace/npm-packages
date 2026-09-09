/**
 * @lacspace/brand
 * The official Lacspace mark, colours and animations — for everyone to use.
 *
 * Render the self-contained SVG mark and the signature self-crafting animation
 * anywhere (zero-dep, isomorphic), make Lacspace installable as a favicon / PWA
 * icon, and reach the pixel-exact master artwork + Lottie motion bundled under
 * `@lacspace/brand/assets/`.
 *
 * ```ts
 * import { mark, craftMark, installable } from "@lacspace/brand";
 *
 * document.querySelector("#logo").innerHTML = craftMark({ size: 320 });
 * ```
 *
 * This is Lacspace's actual identity. Use it to reference, link to or show
 * integration with Lacspace — but don't alter the mark or imply endorsement.
 * See the LICENSE (Lacspace Brand Usage Licence).
 */

export { mark, iconTile, type MarkOptions, type MarkVariant, type MarkStyle } from "./mark.js";
export {
  craftMark,
  pulseMark,
  floatMark,
  revealMark,
  shimmerMark,
  animatedMark,
  type AnimateOptions,
  type AnimationName,
} from "./animate.js";
export {
  BRAND,
  TAGLINE,
  COLORS,
  HEX,
  MARK_GRADIENT,
  brandCss,
  brandScss,
  type BrandColor,
} from "./colors.js";
export {
  installable,
  faviconSvg,
  faviconDataUri,
  headLinks,
  webManifest,
  FAVICON_SIZES,
  type InstallableOptions,
} from "./favicon.js";
export { ASSETS, assetUrl, assetFile, type AssetKey, type AssetEntry } from "./assets.js";
export { GUIDELINES, DO, DONT, CLEARSPACE, MIN_SIZE, WORDMARK_RULE, type Guideline } from "./guidelines.js";
export { VIEWBOX, MARK_PATH, NODES, EDGES, CENTER } from "./geometry.js";
