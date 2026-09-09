/**
 * Make Lacspace installable — favicon, Apple touch icon, PWA manifest icons and
 * the `<link>` tags to wire them up. The scalable SVG favicon is generated inline
 * (self-contained); the raster sizes are the bundled PNGs in
 * `@lacspace/brand/assets/favicon/` — host them and point these helpers at them.
 */

import { iconTile } from "./mark.js";
import { HEX } from "./colors.js";

export const FAVICON_SIZES = [16, 32, 48, 64, 96, 180, 192, 512] as const;

export interface InstallableOptions {
  /** URL prefix where you host the icon files. Default "/". */
  base?: string;
  /** App name for the manifest. Default "Lacspace". */
  name?: string;
  /** Short name for the manifest. Default = name. */
  shortName?: string;
  /** Theme colour for the browser chrome. Default Ink. */
  themeColor?: string;
  /** Background for the splash. Default Ink. */
  backgroundColor?: string;
}

/** The scalable colour favicon as a self-contained SVG string. */
export function faviconSvg(size = 512): string {
  return iconTile(size);
}

/** The favicon as a `data:` URI, ready for `<link href>` with no hosting. */
export function faviconDataUri(size = 512): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(iconTile(size))}`;
}

/** `<link>` / `<meta>` tags for the document head. */
export function headLinks(opts: InstallableOptions = {}): string {
  const { base = "/", themeColor = HEX.ink } = opts;
  const b = base.endsWith("/") ? base : base + "/";
  return [
    `<link rel="icon" type="image/svg+xml" href="${b}favicon.svg">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="${b}favicon-32.png">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="${b}favicon-16.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${b}apple-touch-icon.png">`,
    `<link rel="mask-icon" href="${b}safari-pinned-tab.svg" color="${themeColor}">`,
    `<link rel="manifest" href="${b}site.webmanifest">`,
    `<meta name="theme-color" content="${themeColor}">`,
  ].join("\n");
}

/** A ready web app manifest object (installable PWA icon). */
export function webManifest(opts: InstallableOptions = {}): Record<string, unknown> {
  const { base = "/", name = "Lacspace", shortName, themeColor = HEX.ink, backgroundColor = HEX.ink } = opts;
  const b = base.endsWith("/") ? base : base + "/";
  return {
    name,
    short_name: shortName ?? name,
    icons: [
      { src: `${b}favicon.svg`, sizes: "any", type: "image/svg+xml" },
      { src: `${b}icon-192.png`, sizes: "192x192", type: "image/png" },
      { src: `${b}icon-512.png`, sizes: "512x512", type: "image/png" },
      { src: `${b}icon-512-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    theme_color: themeColor,
    background_color: backgroundColor,
    display: "standalone",
  };
}

/** Everything you need to install Lacspace, in one call. */
export function installable(opts: InstallableOptions = {}) {
  return {
    svg: faviconSvg(),
    dataUri: faviconDataUri(),
    headLinks: headLinks(opts),
    manifest: webManifest(opts),
    sizes: FAVICON_SIZES,
  };
}
