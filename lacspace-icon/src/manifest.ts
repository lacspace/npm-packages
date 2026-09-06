/**
 * Build a W3C web app manifest (manifest.webmanifest) for the generated icon
 * set.
 */
import type { ImageData } from "./png.js";

/** A home-screen shortcut for the manifest. */
export interface ManifestShortcut {
  name: string;
  url: string;
  short_name?: string;
  description?: string;
}

/** Options that shape the manifest and the generated icons. */
export interface IconOptions {
  /** Full application name. Default "App". */
  name?: string;
  /** Short name for the home-screen label. Default = `name`. */
  short?: string;
  /** Background / padding colour for opaque icons (apple-touch, maskable, og, splash). Default "#0b0b0f". */
  bg?: string;
  /** Browser theme colour. Default: the image's dominant colour, else "#4d9fff". */
  theme?: string;
  /** Also emit a maskable 512 icon (safe-zone padded on `bg`). */
  maskable?: boolean;
  /** Also emit a 1200×630 Open Graph image. */
  og?: boolean;

  // ---- v0.2.0: shape & sizing (applied to the source before generating) ----
  /** Transparent margin around the icon, as a % of each side (e.g. 10). */
  padding?: number;
  /** Rounded-corner radius as a % of the shorter side (0..50). */
  radius?: number;
  /** Mask the icon to a centred circle. */
  circle?: boolean;
  /** How large the icon sits on opaque backgrounds, as a % of the default (100 = default). */
  scale?: number;

  // ---- v0.2.0: extra outputs ----
  /** Also emit the Apple PWA startup-image (splash) set + media links. */
  splash?: boolean;
  /** Dark-variant source image; if omitted with `autoDark`, the light source is inverted. */
  dark?: ImageData | Uint8Array;
  /** Auto-generate a dark favicon variant by inverting the source. */
  autoDark?: boolean;
  /** Palette-optimize small favicons (indexed PNG). Default true. */
  optimize?: boolean;

  // ---- v0.2.0: richer manifest ----
  /** Manifest `display`. Default "standalone". */
  display?: string;
  /** Manifest `orientation` (e.g. "portrait", "landscape", "any"). */
  orientation?: string;
  /** Manifest `scope`. */
  scope?: string;
  /** Manifest `start_url`. */
  startUrl?: string;
  /** Manifest `id`. */
  id?: string;
  /** Manifest `categories`. */
  categories?: string[];
  /** Manifest `shortcuts`. */
  shortcuts?: ManifestShortcut[];
}

/** One icon entry in the manifest. */
export interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** Shape of the generated web manifest. */
export interface WebManifest {
  name: string;
  short_name: string;
  icons: ManifestIcon[];
  theme_color: string;
  background_color: string;
  display: string;
  orientation?: string;
  scope?: string;
  start_url?: string;
  id?: string;
  categories?: string[];
  shortcuts?: ManifestShortcut[];
}

/** Build the web manifest object from the resolved options. */
export function buildManifest(opts: IconOptions = {}): WebManifest {
  const name = opts.name ?? "App";
  const short = opts.short ?? name;
  const theme = opts.theme ?? "#4d9fff";
  const bg = opts.bg ?? "#0b0b0f";

  const icons: ManifestIcon[] = [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  ];
  if (opts.maskable) {
    icons.push({ src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" });
  }

  const manifest: WebManifest = {
    name,
    short_name: short,
    icons,
    theme_color: theme,
    background_color: bg,
    display: opts.display ?? "standalone",
  };
  if (opts.orientation) manifest.orientation = opts.orientation;
  if (opts.scope) manifest.scope = opts.scope;
  if (opts.startUrl) manifest.start_url = opts.startUrl;
  if (opts.id) manifest.id = opts.id;
  if (opts.categories && opts.categories.length) manifest.categories = opts.categories;
  if (opts.shortcuts && opts.shortcuts.length) {
    manifest.shortcuts = opts.shortcuts.map((s) => ({
      name: s.name,
      ...(s.short_name ? { short_name: s.short_name } : {}),
      url: s.url,
      ...(s.description ? { description: s.description } : {}),
    }));
  }
  return manifest;
}
