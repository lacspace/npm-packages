/**
 * Apple PWA startup images ("splash screens"). iOS shows these while a
 * home-screen web app boots. Each device/orientation needs its own exact-pixel
 * PNG plus a precisely-targeted `<link rel="apple-touch-startup-image" media=…>`
 * tag — which is exactly the fiddly, easy-to-get-wrong busywork worth automating.
 */
import type { ImageData } from "./png.js";
import { encodePng } from "./png.js";
import { drawIconOnCanvas } from "./compose.js";

/** A target device: CSS-point size + device-pixel-ratio (portrait orientation). */
interface Device {
  /** CSS points (portrait). */
  cssW: number;
  cssH: number;
  ratio: number;
}

/** Current + recent iPhone and iPad devices, portrait CSS-point sizes. */
const DEVICES: Device[] = [
  { cssW: 430, cssH: 932, ratio: 3 }, // 15/14 Pro Max, 15 Plus
  { cssW: 393, cssH: 852, ratio: 3 }, // 15/15 Pro, 14 Pro
  { cssW: 390, cssH: 844, ratio: 3 }, // 14/13/12
  { cssW: 375, cssH: 812, ratio: 3 }, // 13 mini/12 mini/11 Pro/X/XS
  { cssW: 414, cssH: 896, ratio: 3 }, // 11 Pro Max/XS Max
  { cssW: 414, cssH: 896, ratio: 2 }, // 11/XR
  { cssW: 414, cssH: 736, ratio: 3 }, // 8 Plus/7 Plus/6s Plus
  { cssW: 375, cssH: 667, ratio: 2 }, // 8/7/6s/SE2/SE3
  { cssW: 320, cssH: 568, ratio: 2 }, // SE1/5s
  { cssW: 1024, cssH: 1366, ratio: 2 }, // iPad Pro 12.9"
  { cssW: 834, cssH: 1194, ratio: 2 }, // iPad Pro 11"/Air
  { cssW: 834, cssH: 1112, ratio: 2 }, // iPad 10.5"/Air 3
  { cssW: 810, cssH: 1080, ratio: 2 }, // iPad 10.2"
  { cssW: 768, cssH: 1024, ratio: 2 }, // iPad mini/9.7"
];

/** One generated splash image + the media query that targets it. */
export interface SplashEntry {
  filename: string;
  media: string;
  width: number;
  height: number;
}

/**
 * Generate the Apple startup-image set: `icon` centred on a `bg` canvas for
 * every device in both orientations. `scalePct` (default 100) tunes the icon
 * size relative to the sensible default (~30% of the shorter side).
 */
export function generateSplash(
  icon: ImageData,
  bg: string,
  scalePct = 100,
): { files: Record<string, Uint8Array>; entries: SplashEntry[] } {
  const files: Record<string, Uint8Array> = {};
  const entries: SplashEntry[] = [];
  const seen = new Set<string>();

  for (const d of DEVICES) {
    for (const portrait of [true, false]) {
      const cssW = portrait ? d.cssW : d.cssH;
      const cssH = portrait ? d.cssH : d.cssW;
      const pxW = Math.round((portrait ? d.cssW : d.cssH) * d.ratio);
      const pxH = Math.round((portrait ? d.cssH : d.cssW) * d.ratio);
      const filename = `apple-splash-${pxW}-${pxH}.png`;
      if (seen.has(filename)) continue;
      seen.add(filename);

      const iconPx = Math.max(1, Math.round((Math.min(pxW, pxH) * 0.3 * scalePct) / 100));
      files[filename] = encodePng(drawIconOnCanvas(icon, pxW, pxH, iconPx, bg));

      const media =
        `(device-width: ${cssW}px) and (device-height: ${cssH}px) ` +
        `and (-webkit-device-pixel-ratio: ${d.ratio}) ` +
        `and (orientation: ${portrait ? "portrait" : "landscape"})`;
      entries.push({ filename, media, width: pxW, height: pxH });
    }
  }
  return { files, entries };
}
