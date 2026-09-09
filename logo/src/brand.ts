/**
 * Brand-in-a-box: from one brief, a consistent identity — logo variants, a
 * favicon/app-icon set, the colour palette and CSS variables. Everything shares
 * the same seed → the same palette, type and icon across every asset.
 */
import { generateLogo } from "./generate.js";
import type { LogoBrief, LogoResult, Palette, FontPair } from "./types.js";

export interface FaviconSet {
  /** One scalable SVG mark (a filled tile — ideal at any size). */
  svg: string;
  /** The same mark sized for common favicon / app-icon dimensions. */
  sizes: { size: number; svg: string }[];
  /** Ready-to-paste <link> / <meta> tags. */
  links: string;
  /** manifest.webmanifest "icons" entries (for PNGs you rasterize via @lacspace/image). */
  manifestIcons: { src: string; sizes: string; type: string }[];
}

export interface BrandColor {
  role: string;
  hex: string;
}

export interface BrandKit {
  name: string;
  /** Horizontal lockup (icon + wordmark) — the primary logo. */
  primary: LogoResult;
  /** Stacked (icon over wordmark). */
  stacked: LogoResult;
  /** The mark alone (app icon / avatar). */
  mark: LogoResult;
  /** Wordmark only, on transparent. */
  wordmark: LogoResult;
  /** Single-colour version for stamps / watermarks. */
  mono: LogoResult;
  favicon: FaviconSet;
  palette: Palette;
  font: FontPair;
  colors: BrandColor[];
  /** A drop-in CSS custom-property block. */
  css: string;
}

const FAVICON_SIZES = [16, 32, 48, 64, 180, 192, 512];

function resize(svg: string, size: number): string {
  return svg
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`);
}

/** Build a favicon / app-icon set from a brief (a bold, filled mark tile). */
export function generateFavicon(brief: LogoBrief, sizes: number[] = FAVICON_SIZES): FaviconSet {
  const base = generateLogo(brief);
  const mark = generateLogo({
    ...brief,
    seed: base.seed,
    palette: brief.palette ?? base.palette.id,
    engine: base.icon ? "wordmark" : "monogram",
    icon: base.icon,
    shape: brief.shape && brief.shape !== "none" ? brief.shape : "squircle",
    layout: "mark-only",
    background: "gradient",
    size: 512,
  });
  const links =
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n` +
    `<link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png">\n` +
    `<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">`;
  return {
    svg: mark.svg,
    sizes: sizes.map((s) => ({ size: s, svg: resize(mark.svg, s) })),
    links,
    manifestIcons: [192, 512].map((s) => ({ src: `/icon-${s}.png`, sizes: `${s}x${s}`, type: "image/png" })),
  };
}

function cssVars(p: Palette, f: FontPair): string {
  return [
    ":root {",
    `  --brand-bg: ${p.bg};`,
    `  --brand-surface: ${p.surface};`,
    `  --brand-primary: ${p.primary};`,
    `  --brand-accent: ${p.accent};`,
    `  --brand-on: ${p.on};`,
    `  --brand-gradient: linear-gradient(60deg, ${p.from}, ${p.to});`,
    `  --brand-font-display: ${f.stack};`,
    "}",
  ].join("\n");
}

/** From one brief → a full, consistent brand identity. */
export function generateBrandKit(brief: LogoBrief): BrandKit {
  const base = generateLogo({ ...brief, layout: "icon-left" });
  // Lock every downstream choice so all assets match the primary logo.
  const lock: Partial<LogoBrief> = {
    seed: base.seed,
    palette: brief.palette ?? base.palette.id,
    font: brief.font ?? base.font.id,
    engine: base.engine,
    icon: base.icon,
    shape: base.shape,
    keywords: brief.keywords,
    industry: brief.industry,
  };
  const variant = (layout: LogoBrief["layout"], background: LogoBrief["background"] = "surface") =>
    generateLogo({ ...brief, ...lock, layout, background });

  return {
    name: base.name,
    primary: variant("icon-left"),
    stacked: variant("icon-top"),
    mark: variant("mark-only", "gradient"),
    wordmark: variant("wordmark-only", "transparent"),
    mono: generateLogo({ ...brief, ...lock, palette: "slate-mono", layout: "icon-left", background: "transparent" }),
    favicon: generateFavicon({ ...brief, ...lock }),
    palette: base.palette,
    font: base.font,
    colors: [
      { role: "primary", hex: base.palette.primary },
      { role: "accent", hex: base.palette.accent },
      { role: "gradient-from", hex: base.palette.from },
      { role: "gradient-to", hex: base.palette.to },
      { role: "surface", hex: base.palette.surface },
      { role: "on", hex: base.palette.on },
    ],
    css: cssVars(base.palette, base.font),
  };
}
