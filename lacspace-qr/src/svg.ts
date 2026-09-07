/**
 * Render a QR code to a crisp, scalable SVG. By default dark modules become a
 * single compact `<path>`; a corner `radius`, a module `shape` (square · dots ·
 * rounded), a distinct finder-eye shape, a linear-gradient foreground and a
 * centred logo/initials embed are all opt-in. The `viewBox` is in module units
 * so it scales without blurring; `size` sets the pixel dimensions. Zero
 * dependencies.
 */
import type { QrCode } from "./matrix.js";
import { parseColor, toCss } from "./color.js";

/** A two-stop linear gradient for the foreground modules. */
export interface Gradient {
  /** Start colour (any value {@link parseColor} accepts). */
  from: string;
  /** End colour. */
  to: string;
  /** Gradient direction in degrees; 0 = left→right, 90 = top→bottom (default 0). */
  angle?: number;
}

/** Module drawing shape. */
export type ModuleShape = "square" | "dots" | "rounded";

/** A centre logo / initials embed. */
export interface LogoOptions {
  /** Raw SVG markup (`<svg…>`), a `data:` URI, or short initials text. */
  src: string;
  /** Logo box as a fraction of the symbol size, clamped to [0.05, 0.35] (default 0.2). */
  size?: number;
  /** Cleared quiet-band padding (in modules) around the logo (default 1). */
  padding?: number;
}

export interface SvgOptions {
  /** Output width/height in pixels (default 512). */
  size?: number;
  /** Quiet-zone margin in modules (default 4). */
  margin?: number;
  /** Foreground (dark module) colour, or a {@link Gradient} (default #000000). */
  fg?: string | Gradient;
  /** Background colour (default #ffffff; use "transparent" for none). */
  bg?: string;
  /** Corner radius per module in [0,0.5] as a fraction of a module (default 0). */
  radius?: number;
  /** Module shape (default "square"; setting it switches to the per-module renderer). */
  shape?: ModuleShape;
  /** Distinct shape for the three finder eyes; defaults to `shape`. */
  eye?: ModuleShape;
  /** Centre logo / initials; only drawn when the symbol's ECC is Q or H. */
  logo?: string | LogoOptions;
  /** Called with a message when a feature is skipped (e.g. a logo on low ECC). */
  onWarn?: (message: string) => void;
}

/** True if module (x,y) falls inside one of the three 7×7 finder patterns. */
export function isFinderModule(qr: QrCode, x: number, y: number): boolean {
  const s = qr.size;
  const inBox = (bx: number, by: number): boolean => x >= bx && x < bx + 7 && y >= by && y < by + 7;
  return inBox(0, 0) || inBox(s - 7, 0) || inBox(0, s - 7);
}

/** The cleared centre band + inner logo box for a QR embed (module coords, no margin). */
export interface LogoClearing {
  /** Whether the logo may be drawn (needs ECC Q or H). */
  allowed: boolean;
  /** Why it was rejected, when `allowed` is false. */
  reason?: string;
  /** The cleared (background-filled) band. */
  clear?: { x: number; y: number; w: number; h: number };
  /** The inner box the artwork is drawn into. */
  inner?: { x: number; y: number; w: number; h: number };
}

/**
 * Compute the cleared centre region for a logo. A logo is only permitted when
 * the symbol's error-correction level is high enough (Q or H) to survive the
 * hole punched in the data; otherwise `allowed` is false with a reason.
 */
export function logoClearing(qr: QrCode, logo: LogoOptions): LogoClearing {
  if (qr.ecc !== "H" && qr.ecc !== "Q") {
    return {
      allowed: false,
      reason: `logo needs ECC Q or H for a scannable clearing (symbol is ${qr.ecc}); raise --ecc`,
    };
  }
  const frac = Math.max(0.05, Math.min(0.35, logo.size ?? 0.2));
  const pad = Math.max(0, Math.floor(logo.padding ?? 1));
  const boxMods = Math.max(1, Math.round(qr.size * frac));
  const clearMods = boxMods + pad * 2;
  const start = Math.round((qr.size - clearMods) / 2);
  return {
    allowed: true,
    clear: { x: start, y: start, w: clearMods, h: clearMods },
    inner: { x: start + pad, y: start + pad, w: boxMods, h: boxMods },
  };
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Build the `<defs>` for a foreground gradient, mapping `angle` to a direction vector. */
function gradientDefs(id: string, g: Gradient): string {
  const from = toCss(parseColor(g.from));
  const to = toCss(parseColor(g.to));
  const angle = (((g.angle ?? 0) % 360) + 360) % 360;
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const round = (n: number): string => n.toFixed(4).replace(/\.?0+$/, "");
  const x1 = round(0.5 - dx / 2);
  const y1 = round(0.5 - dy / 2);
  const x2 = round(0.5 + dx / 2);
  const y2 = round(0.5 + dy / 2);
  return (
    `<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/>` +
    `</linearGradient></defs>`
  );
}

/** SVG for one dark module at padded coords, in the requested shape. */
function moduleSvg(px: number, py: number, shape: ModuleShape, radius: number): string {
  if (shape === "dots") {
    return `<circle cx="${px + 0.5}" cy="${py + 0.5}" r="0.5"/>`;
  }
  if (shape === "rounded") {
    const rr = radius > 0 ? radius : 0.35;
    const r = rr.toFixed(4).replace(/\.?0+$/, "");
    return `<rect x="${px}" y="${py}" width="1" height="1" rx="${r}" ry="${r}"/>`;
  }
  return `<rect x="${px}" y="${py}" width="1" height="1"/>`;
}

/** Draw the centred logo artwork (clearing band + art) into the symbol. */
function drawLogo(src: string, clearing: LogoClearing, margin: number, bg: string): string {
  const clear = clearing.clear!;
  const inner = clearing.inner!;
  const cx = clear.x + margin;
  const cy = clear.y + margin;
  const ix = inner.x + margin;
  const iy = inner.y + margin;
  const band = `<rect x="${cx}" y="${cy}" width="${clear.w}" height="${clear.h}" fill="${bg}"/>`;
  const s = src.trim();
  let art: string;
  if (s.startsWith("<")) {
    art = `<svg x="${ix}" y="${iy}" width="${inner.w}" height="${inner.h}" overflow="visible" preserveAspectRatio="xMidYMid meet">${s}</svg>`;
  } else if (/^data:/i.test(s)) {
    art = `<image x="${ix}" y="${iy}" width="${inner.w}" height="${inner.h}" href="${escapeAttr(s)}" preserveAspectRatio="xMidYMid meet"/>`;
  } else {
    const tx = ix + inner.w / 2;
    const ty = iy + inner.h / 2;
    const fs = (inner.h * 0.7).toFixed(4).replace(/\.?0+$/, "");
    art =
      `<text x="${tx}" y="${ty}" font-size="${fs}" font-family="sans-serif" font-weight="700" ` +
      `text-anchor="middle" dominant-baseline="central">${escapeXml(s)}</text>`;
  }
  return band + art;
}

/** Return an SVG document string for the QR code. */
export function renderToSvg(qr: QrCode, opts: SvgOptions = {}): string {
  const size = opts.size ?? 512;
  const margin = opts.margin ?? 4;
  const bgColor = parseColor(opts.bg ?? "#ffffff");
  const radius = Math.max(0, Math.min(0.5, opts.radius ?? 0));
  const dim = qr.size + margin * 2;

  // Foreground: a flat colour or a gradient (which needs a <defs>).
  let defs = "";
  let fg: string;
  if (opts.fg && typeof opts.fg === "object") {
    fg = "url(#lqr-fg)";
    defs = gradientDefs("lqr-fg", opts.fg);
  } else {
    fg = toCss(parseColor((opts.fg as string) ?? "#000000"));
  }

  const bgRect =
    bgColor.a === 0 ? "" : `<rect width="${dim}" height="${dim}" fill="${toCss(bgColor)}"/>`;

  // Optional centre logo, guarded by the symbol's ECC level.
  let clearing: LogoClearing | undefined;
  let logoMarkup = "";
  if (opts.logo) {
    const logo: LogoOptions = typeof opts.logo === "string" ? { src: opts.logo } : opts.logo;
    const c = logoClearing(qr, logo);
    if (!c.allowed) {
      opts.onWarn?.(c.reason!);
    } else {
      clearing = c;
      const clearFill = bgColor.a === 0 ? "#ffffff" : toCss(bgColor);
      logoMarkup = drawLogo(logo.src, c, margin, clearFill);
    }
  }

  const inClear = (x: number, y: number): boolean => {
    if (!clearing) return false;
    const b = clearing.clear!;
    return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
  };

  let body: string;
  const shape = opts.shape;
  const eye = opts.eye;
  if (shape === undefined && eye === undefined) {
    // Legacy path: a compact single <path> (or rounded <rect>s when a radius is set).
    if (radius > 0) {
      const r = radius.toFixed(4).replace(/\.?0+$/, "");
      const rects: string[] = [];
      for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
          if (qr.modules[y]![x] && !inClear(x, y)) {
            rects.push(`<rect x="${x + margin}" y="${y + margin}" width="1" height="1" rx="${r}" ry="${r}"/>`);
          }
        }
      }
      body = `<g fill="${fg}">${rects.join("")}</g>`;
    } else {
      let d = "";
      for (let y = 0; y < qr.size; y++) {
        for (let x = 0; x < qr.size; x++) {
          if (qr.modules[y]![x] && !inClear(x, y)) d += `M${x + margin} ${y + margin}h1v1h-1z`;
        }
      }
      body = `<path fill="${fg}" d="${d}"/>`;
    }
  } else {
    // Per-module renderer with optional distinct finder-eye shape.
    const mainShape: ModuleShape = shape ?? "square";
    const eyeShape: ModuleShape = eye ?? mainShape;
    const parts: string[] = [];
    for (let y = 0; y < qr.size; y++) {
      for (let x = 0; x < qr.size; x++) {
        if (!qr.modules[y]![x] || inClear(x, y)) continue;
        const sh = isFinderModule(qr, x, y) ? eyeShape : mainShape;
        parts.push(moduleSvg(x + margin, y + margin, sh, radius));
      }
    }
    body = `<g fill="${fg}">${parts.join("")}</g>`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${dim} ${dim}" shape-rendering="crispEdges">` +
    defs +
    bgRect +
    body +
    logoMarkup +
    `</svg>`
  );
}
