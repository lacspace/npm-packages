/**
 * The generation pipeline: take one decoded source image and produce the full
 * favicon / PWA / Apple-touch / Open Graph icon set, the .ico, the web manifest
 * and the HTML `<head>` snippet.
 */
import type { ImageData } from "./png.js";
import { decodePng, encodePng } from "./png.js";
import { resizeRgba } from "./resize.js";
import { makeIco } from "./ico.js";
import { drawIconOnCanvas } from "./compose.js";
import { buildManifest } from "./manifest.js";
import type { IconOptions, WebManifest } from "./manifest.js";

/** Result of {@link generateIcons}. */
export interface GenerateResult {
  /** Filename → file bytes for every generated asset. */
  files: Record<string, Uint8Array>;
  /** The `<head>` HTML snippet to paste into your page. */
  snippet: string;
  /** The parsed web manifest object (also serialized into `files`). */
  manifest: WebManifest;
}

function pngOf(icon: ImageData, size: number): Uint8Array {
  return encodePng({ width: size, height: size, rgba: resizeRgba(icon, size, size) });
}

/**
 * Generate the complete icon set from a source PNG (bytes). The source should
 * be square-ish; non-square sources are resized to square targets and may
 * distort. Returns the file map, the HTML snippet and the manifest object.
 */
export function generateIcons(sourcePng: Uint8Array, opts: IconOptions = {}): GenerateResult {
  const icon = decodePng(sourcePng);
  return generateIconsFromImage(icon, opts);
}

/** Same as {@link generateIcons} but takes an already-decoded image. */
export function generateIconsFromImage(icon: ImageData, opts: IconOptions = {}): GenerateResult {
  const bg = opts.bg ?? "#0b0b0f";
  const files: Record<string, Uint8Array> = {};

  // Favicons (transparent) + .ico.
  const fav16 = pngOf(icon, 16);
  const fav32 = pngOf(icon, 32);
  const fav48 = pngOf(icon, 48);
  files["favicon-16x16.png"] = fav16;
  files["favicon-32x32.png"] = fav32;
  files["favicon-48x48.png"] = fav48;
  files["favicon.ico"] = makeIco([
    { png: fav16, size: 16 },
    { png: fav32, size: 32 },
    { png: fav48, size: 48 },
  ]);

  // Apple-touch (opaque bg, icon fills the tile).
  files["apple-touch-icon.png"] = encodePng(drawIconOnCanvas(icon, 180, 180, 180, bg));

  // PWA icons (transparent "any").
  files["icon-192.png"] = pngOf(icon, 192);
  files["icon-512.png"] = pngOf(icon, 512);

  // Maskable icon: safe-zone padded (icon at ~80% on the bg).
  if (opts.maskable) {
    files["icon-maskable-512.png"] = encodePng(drawIconOnCanvas(icon, 512, 512, Math.round(512 * 0.8), bg));
  }

  // Open Graph image: icon centred on the bg.
  if (opts.og) {
    files["og.png"] = encodePng(drawIconOnCanvas(icon, 1200, 630, 420, bg));
  }

  const manifest = buildManifest(opts);
  files["manifest.webmanifest"] = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n");

  return { files, snippet: buildSnippet(opts), manifest };
}

/** Build the `<head>` HTML snippet for the generated set. */
export function buildSnippet(opts: IconOptions = {}): string {
  const theme = opts.theme ?? "#4d9fff";
  const lines = [
    `<link rel="icon" href="/favicon.ico" sizes="any">`,
    `<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">`,
    `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">`,
    `<link rel="manifest" href="/manifest.webmanifest">`,
    `<meta name="theme-color" content="${theme}">`,
  ];
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
