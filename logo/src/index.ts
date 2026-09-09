/**
 * @lacspace/logo
 * Generate real logos and brand marks without AI. Give a name + a few keywords
 * and get on-brand SVG logos — monograms, icon lockups, geometric marks and
 * emblems — chosen deterministically from a curated JSON brain of palettes,
 * fonts, icons and shapes. Seeded, so every logo is reproducible and you can
 * spin endless variations. Export to PNG/JPEG/WebP via `@lacspace/image`.
 *
 * ```ts
 * import { generateLogo, generateLogoSet } from "@lacspace/logo";
 *
 * const { svg } = generateLogo({
 *   name: "Kopi House",
 *   keywords: "coffee, cozy, artisanal, warm",
 * });
 *
 * // 12 reproducible concepts to choose from:
 * const concepts = generateLogoSet({ name: "Orbit Labs", keywords: "ai, network, fast" });
 * ```
 */

export { generateLogo, generateLogoSet, suggest } from "./generate.js";
export { tokenize } from "./brief.js";
export { PALETTES, FONTS, ICONS, MOODS } from "./data.js";
export { initials } from "./text.js";

export type {
  LogoBrief,
  LogoResult,
  Interpreted,
  Palette,
  FontPair,
  IconDef,
  Mood,
  Engine,
  ShapeKind,
  Layout,
  Background,
} from "./types.js";
