/**
 * Render a QR code to a crisp, scalable SVG. Dark modules become a single
 * `<path>` (compact) or individual rounded `<rect>`s when a corner radius is
 * requested. The `viewBox` is in module units so it scales without blurring;
 * `size` sets the pixel dimensions. Zero dependencies.
 */
import type { QrCode } from "./matrix.js";
import { parseColor, toCss } from "./color.js";

export interface SvgOptions {
  /** Output width/height in pixels (default 512). */
  size?: number;
  /** Quiet-zone margin in modules (default 4). */
  margin?: number;
  /** Foreground (dark module) colour (default #000000). */
  fg?: string;
  /** Background colour (default #ffffff; use "transparent" for none). */
  bg?: string;
  /** Corner radius per module in [0,0.5] as a fraction of a module (default 0). */
  radius?: number;
}

/** Return an SVG document string for the QR code. */
export function renderToSvg(qr: QrCode, opts: SvgOptions = {}): string {
  const size = opts.size ?? 512;
  const margin = opts.margin ?? 4;
  const fg = toCss(parseColor(opts.fg ?? "#000000"));
  const bgColor = parseColor(opts.bg ?? "#ffffff");
  const radius = Math.max(0, Math.min(0.5, opts.radius ?? 0));
  const dim = qr.size + margin * 2;

  const bgRect =
    bgColor.a === 0
      ? ""
      : `<rect width="${dim}" height="${dim}" fill="${toCss(bgColor)}"/>`;

  let body: string;
  if (radius > 0) {
    const r = radius.toFixed(4).replace(/\.?0+$/, "");
    const rects: string[] = [];
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.modules[y]![x]) {
          rects.push(`<rect x="${x + margin}" y="${y + margin}" width="1" height="1" rx="${r}" ry="${r}"/>`);
        }
      }
    }
    body = `<g fill="${fg}">${rects.join("")}</g>`;
  } else {
    // One path: a "M x y h1 v1 h-1 z" square per dark module.
    let d = "";
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (qr.modules[y]![x]) d += `M${x + margin} ${y + margin}h1v1h-1z`;
      }
    }
    body = `<path fill="${fg}" d="${d}"/>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    bgRect +
    body +
    `</svg>`
  );
}
