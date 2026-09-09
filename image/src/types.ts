/**
 * Shared types for @lacspace/image.
 */

/** A raster format this library can produce. `svg` passes through untouched. */
export type ImageFormat = "png" | "jpeg" | "webp";

/** A CSS-ish colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`, or `transparent`. */
export type Color = string;

/** One stop in a gradient. `offset` is 0..1; `color` any supported Color. */
export interface GradientStop {
  offset: number;
  color: Color;
}

export interface LinearGradientOptions {
  /** Angle in degrees, clockwise from the positive x-axis (0 = left→right, 90 = top→bottom). */
  angle?: number;
  stops: GradientStop[];
}

export interface RadialGradientOptions {
  /** Centre x in 0..1 of the surface width (default 0.5). */
  cx?: number;
  /** Centre y in 0..1 of the surface height (default 0.5). */
  cy?: number;
  /** Radius in 0..1 of the larger surface dimension (default 0.75). */
  radius?: number;
  stops: GradientStop[];
}

export type PatternKind = "checker" | "grid" | "dots" | "stripes" | "noise";

export interface PatternOptions {
  /** Cell/line size in px (default 24). */
  size?: number;
  /** Foreground colour (default #ffffff22 over the current surface). */
  color?: Color;
  /** For `stripes`: angle 0 (vertical) | 90 (horizontal) | 45 (diagonal). Default 45. */
  angle?: 0 | 45 | 90;
  /** For `noise`: 0..1 strength (default 0.06). */
  strength?: number;
  /** Deterministic seed for `noise` (default 1). */
  seed?: number;
}

export type Fit = "cover" | "contain" | "fill" | "stretch";

export interface DrawImageOptions {
  x?: number;
  y?: number;
  /** Target width; defaults to source width (or fills the box when x/y/w/h given). */
  width?: number;
  height?: number;
  /** How to place a source into the target box when both are sized. Default "cover". */
  fit?: Fit;
  /** Resampling quality when scaling (default "bilinear"). */
  resample?: "nearest" | "bilinear";
}

/** Anything we can read pixels from. */
export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, row-major, 4 bytes per pixel. */
  data: Uint8ClampedArray;
}

export interface EncodeOptions {
  format: ImageFormat;
  /** 1..100 for lossy formats (jpeg/webp). Ignored for png. Default 82. */
  quality?: number;
  /** Background painted under transparent pixels when flattening to jpeg. Default #ffffff. */
  background?: Color;
}

export interface EncodeResult {
  bytes: Uint8Array;
  format: ImageFormat;
  width: number;
  height: number;
  /** Effective quality used (lossy formats). */
  quality?: number;
  /** Byte length — same as bytes.length, provided for convenience. */
  size: number;
}

export interface FitOptions {
  format: ImageFormat;
  /** Target ceiling. Accepts a number of bytes or a string like "200kb" / "1.5mb". */
  maxBytes?: number;
  maxSize?: string | number;
  /** Lowest acceptable quality before we start downscaling (default 30). */
  minQuality?: number;
  /** Highest quality to try first (default 92). */
  maxQuality?: number;
  /** Allow shrinking dimensions if quality alone can't hit the budget (default true). */
  allowResize?: boolean;
  /** Smallest scale factor when resizing (default 0.35). */
  minScale?: number;
  background?: Color;
}
