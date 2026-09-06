/**
 * Build a W3C web app manifest (manifest.webmanifest) for the generated icon
 * set.
 */

/** Options that shape the manifest and the generated icons. */
export interface IconOptions {
  /** Full application name. Default "App". */
  name?: string;
  /** Short name for the home-screen label. Default = `name`. */
  short?: string;
  /** Background / padding colour for opaque icons (apple-touch, maskable, og). Default "#0b0b0f". */
  bg?: string;
  /** Browser theme colour. Default "#4d9fff". */
  theme?: string;
  /** Also emit a maskable 512 icon (safe-zone padded on `bg`). */
  maskable?: boolean;
  /** Also emit a 1200×630 Open Graph image. */
  og?: boolean;
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

  return {
    name,
    short_name: short,
    icons,
    theme_color: theme,
    background_color: bg,
    display: "standalone",
  };
}
