/**
 * The generation pipeline: take one decoded source image and produce the full
 * favicon / PWA / Apple-touch / Open Graph icon set, the .ico, the web manifest
 * and the HTML `<head>` snippet.
 */
import type { ImageData } from "./png.js";
import { decodePng, encodePng, isPng } from "./png.js";
import { decodeJpeg, isJpeg } from "./jpeg.js";
import { resizeRgba } from "./resize.js";
import { makeIco } from "./ico.js";
import { drawIconOnCanvas } from "./compose.js";
import { buildManifest } from "./manifest.js";
import type { IconOptions, WebManifest } from "./manifest.js";
import { pad, roundCorners, circleMask, invert } from "./shape.js";
import { dominantColor } from "./color.js";
import { encodePngIndexed } from "./quantize.js";
import { generateSplash } from "./splash.js";
import type { SplashEntry } from "./splash.js";

/** Per-run statistics reported by {@link generateIcons}. */
export interface GenerateStats {
  /** The auto-detected dominant colour of the source. */
  dominantColor: string;
  /** The resolved manifest `theme_color`. */
  themeColor: string;
  /** The resolved opaque background colour. */
  background: string;
  /** Bytes saved by palette-optimizing the small favicons. */
  bytesSaved: number;
  /** Number of Apple splash images generated. */
  splashCount: number;
}

/** Result of {@link generateIcons}. */
export interface GenerateResult {
  /** Filename → file bytes for every generated asset. */
  files: Record<string, Uint8Array>;
  /** The `<head>` HTML snippet to paste into your page. */
  snippet: string;
  /** The parsed web manifest object (also serialized into `files`). */
  manifest: WebManifest;
  /** Diagnostics about the run (dominant colour, bytes saved, …). */
  stats: GenerateStats;
}

/** Decode a source image (PNG or baseline JPEG) into straight RGBA. */
export function decodeSource(bytes: Uint8Array): ImageData {
  if (isPng(bytes)) return decodePng(bytes);
  if (isJpeg(bytes)) return decodeJpeg(bytes);
  throw new Error("unsupported source: expected a PNG or baseline JPEG image.");
}

function pngOf(icon: ImageData, size: number): Uint8Array {
  return encodePng({ width: size, height: size, rgba: resizeRgba(icon, size, size) });
}

/** Apply the shape/padding controls to the source before it is rasterized. */
function shapeIcon(icon: ImageData, opts: IconOptions): ImageData {
  let base = icon;
  if (opts.padding && opts.padding > 0) base = pad(base, opts.padding);
  if (opts.circle) base = circleMask(base);
  else if (opts.radius && opts.radius > 0) base = roundCorners(base, opts.radius);
  return base;
}

/**
 * Generate the complete icon set from a source PNG or baseline JPEG (bytes).
 * The source should be square-ish; non-square sources are resized to square
 * targets and may distort. Returns the file map, the HTML snippet and manifest.
 */
export function generateIcons(source: Uint8Array, opts: IconOptions = {}): GenerateResult {
  return generateIconsFromImage(decodeSource(source), opts);
}

/** Same as {@link generateIcons} but takes an already-decoded image. */
export function generateIconsFromImage(icon: ImageData, opts: IconOptions = {}): GenerateResult {
  const dominant = dominantColor(icon);
  const bg = opts.bg ?? "#0b0b0f";
  const ogBg = opts.bg ?? dominant;
  const theme = opts.theme ?? dominant;
  const scale = opts.scale ?? 100;
  const optimize = opts.optimize !== false;

  const base = shapeIcon(icon, opts);
  const files: Record<string, Uint8Array> = {};
  let bytesSaved = 0;

  // A small favicon PNG, palette-optimized when that is smaller.
  const smallFav = (img: ImageData, size: number): Uint8Array => {
    const resized: ImageData = { width: size, height: size, rgba: resizeRgba(img, size, size) };
    const truecolor = encodePng(resized);
    if (optimize) {
      const indexed = encodePngIndexed(resized);
      if (indexed.length < truecolor.length) {
        bytesSaved += truecolor.length - indexed.length;
        return indexed;
      }
    }
    return truecolor;
  };

  // Favicons (transparent) + .ico.
  const fav16 = smallFav(base, 16);
  const fav32 = smallFav(base, 32);
  const fav48 = smallFav(base, 48);
  files["favicon-16x16.png"] = fav16;
  files["favicon-32x32.png"] = fav32;
  files["favicon-48x48.png"] = fav48;
  files["favicon.ico"] = makeIco([
    { png: fav16, size: 16 },
    { png: fav32, size: 32 },
    { png: fav48, size: 48 },
  ]);

  // Apple-touch (opaque bg, icon fills the tile — scaled by `scale`).
  const appleIcon = Math.max(1, Math.min(180, Math.round((180 * scale) / 100)));
  files["apple-touch-icon.png"] = encodePng(drawIconOnCanvas(base, 180, 180, appleIcon, bg));

  // PWA icons (transparent "any") — full quality, not palette-reduced.
  files["icon-192.png"] = pngOf(base, 192);
  files["icon-512.png"] = pngOf(base, 512);

  // Maskable icon: safe-zone padded (icon at ~80% * scale on the bg).
  if (opts.maskable) {
    const maskableIcon = Math.max(1, Math.round((512 * 0.8 * scale) / 100));
    files["icon-maskable-512.png"] = encodePng(drawIconOnCanvas(base, 512, 512, maskableIcon, bg));
  }

  // Open Graph image: icon centred on the (dominant-colour) bg.
  if (opts.og) {
    const ogIcon = Math.max(1, Math.round((420 * scale) / 100));
    files["og.png"] = encodePng(drawIconOnCanvas(base, 1200, 630, ogIcon, ogBg));
  }

  // Dark variant favicons.
  let hasDark = false;
  if (opts.dark || opts.autoDark) {
    const darkSource = opts.dark
      ? shapeIcon(opts.dark instanceof Uint8Array ? decodeSource(opts.dark) : opts.dark, opts)
      : invert(base);
    files["favicon-dark-16x16.png"] = smallFav(darkSource, 16);
    files["favicon-dark-32x32.png"] = smallFav(darkSource, 32);
    hasDark = true;
  }

  // Apple splash screens.
  let splashEntries: SplashEntry[] = [];
  if (opts.splash) {
    const s = generateSplash(base, bg, scale);
    Object.assign(files, s.files);
    splashEntries = s.entries;
  }

  const manifest = buildManifest({ ...opts, theme, bg });
  files["manifest.webmanifest"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");

  const snippet = buildSnippet(opts, { theme, dark: hasDark, splash: splashEntries, og: !!opts.og });
  const stats: GenerateStats = {
    dominantColor: dominant,
    themeColor: theme,
    background: bg,
    bytesSaved,
    splashCount: splashEntries.length,
  };
  return { files, snippet, manifest, stats };
}

/** Extra tags the snippet can include beyond the always-present set. */
export interface SnippetExtras {
  theme?: string;
  dark?: boolean;
  splash?: SplashEntry[];
  og?: boolean;
}

/** Build the `<head>` HTML snippet for the generated set. */
export function buildSnippet(opts: IconOptions = {}, extras: SnippetExtras = {}): string {
  const theme = extras.theme ?? opts.theme ?? "#4d9fff";
  const lines = [
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
    `<meta name="theme-color" content="${theme}">`,
  ];
  if (extras.dark) {
    lines.push(
      `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-dark-16x16.png" media="(prefers-color-scheme: dark)">`,
      `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-dark-32x32.png" media="(prefers-color-scheme: dark)">`,
    );
  }
  if (extras.og) {
    lines.push(
      `<meta property="og:image" content="/og.png">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
    );
  }
  if (extras.splash && extras.splash.length) {
    for (const s of extras.splash) {
      lines.push(`<link rel="apple-touch-startup-image" media="${s.media}" href="/${s.filename}">`);
    }
  }
  return lines.join("\n");
}

/**
 * Best-effort SVG rasterizer. Lazily imports `playwright-core` (an optional
 * peer, like the lacspace-scraper browser engine) to render the SVG to a large
 * PNG. Returns `null` if no browser is available — the caller should then fall
 * back to copying the SVG through and emitting the manifest + snippet only.
 */
export async function rasterizeSvg(svg: Uint8Array | string, size = 1024): Promise<Uint8Array | null> {
  const svgText = typeof svg === "string" ? svg : new TextDecoder().decode(svg);
  let pw: typeof import("playwright-core");
  try {
    pw = await import("playwright-core");
  } catch {
    return null;
  }
  let browser: import("playwright-core").Browser | undefined;
  try {
    browser = await pw.chromium.launch();
  } catch {
    return null;
  }
  try {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const dataUri = "data:image/svg+xml;base64," + Buffer.from(svgText, "utf8").toString("base64");
    const html = `<!doctype html><html><head><style>*{margin:0;padding:0}html,body{width:${size}px;height:${size}px}img{width:${size}px;height:${size}px;display:block}</style></head><body><img src="${dataUri}"></body></html>`;
    await page.setContent(html, { waitUntil: "networkidle" });
    const buf = await page.screenshot({ type: "png", omitBackground: true });
    return new Uint8Array(buf);
  } catch {
    return null;
  } finally {
    await browser.close();
  }
}
