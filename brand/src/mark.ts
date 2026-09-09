/**
 * Render the Lacspace mark as a self-contained SVG string — no fonts, no external
 * refs, no JS. The full-colour mark is the real, pixel-exact artwork (the detailed
 * neural head from the master logo); the single-colour variants are the head-
 * profile silhouette, which is the correct mono treatment. For raster/Lottie use
 * the bundled files in `@lacspace/brand/assets/`.
 */

import { VIEWBOX, MARK_PATH, NODES, EDGES } from "./geometry.js";
import { HEX, MARK_GRADIENT } from "./colors.js";
import { ARTWORK_INNER } from "./artwork.js";

export type MarkVariant =
  | "fullcolor"
  | "white"
  | "black"
  | "ink"
  | "violet"
  | "orange"
  | "blue"
  | "cyan"
  | "mono";

export type MarkStyle = "filled" | "line" | "glyph" | "network";

export interface MarkOptions {
  /** px size (square). Default 256. */
  size?: number;
  /** Colour variant. Default `fullcolor` (the real detailed artwork). */
  variant?: MarkVariant;
  /** `filled` (real artwork / solid silhouette), `line`, `glyph`, or `network` (wireframe). Default `filled`. */
  style?: MarkStyle;
  /** Show the neural nodes + wires (only for the geometric styles). */
  network?: boolean;
  /** Background: `transparent` (default), `ink`, `off-white`, or any CSS colour. */
  background?: "transparent" | "ink" | "off-white" | (string & {});
  /** Round the background into an app-icon tile (0–1 of size, or true for 22%). */
  rounded?: boolean | number;
  /** Accessible label. Default "Lacspace". Pass "" to mark decorative. */
  title?: string;
  /** Disambiguate gradient ids when embedding several marks inline. */
  uid?: string;
}

const SOLID: Record<Exclude<MarkVariant, "fullcolor">, string> = {
  white: "#FFFFFF",
  black: "#000000",
  ink: HEX.ink,
  violet: HEX.violet,
  orange: HEX.orange,
  blue: HEX.blue,
  cyan: HEX.cyan,
  mono: "#64748B",
};

function bg(background: MarkOptions["background"]): string | null {
  if (!background || background === "transparent") return null;
  if (background === "ink") return HEX.ink;
  if (background === "off-white") return HEX.offWhite;
  return background;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function frame(size: number, title: string, inner: string): string {
  const label = title ? ` role="img" aria-label="${esc(title)}"` : ` aria-hidden="true"`;
  const t = title ? `<title>${esc(title)}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}"${label}>${t}${inner}</svg>`;
}

function ground(background: MarkOptions["background"], rounded: MarkOptions["rounded"]): string {
  const c = bg(background);
  if (!c) return "";
  const r = rounded === true ? VIEWBOX * 0.22 : typeof rounded === "number" ? VIEWBOX * rounded : 0;
  return `<rect width="${VIEWBOX}" height="${VIEWBOX}" rx="${r}" ry="${r}" fill="${c}"/>`;
}

/** Render the mark → a complete `<svg>` string. Pure and deterministic. */
export function mark(opts: MarkOptions = {}): string {
  const {
    size = 256,
    variant = "fullcolor",
    style = "filled",
    network = true,
    background = "transparent",
    rounded = false,
    title = "Lacspace",
    uid = variant,
  } = opts;

  // The real, professional artwork — full-colour, filled (the default logo).
  if (variant === "fullcolor" && style === "filled") {
    return frame(size, title, ground(background, rounded) + ARTWORK_INNER);
  }

  // Geometric renderings (mono variants, or the wireframe styles).
  const gid = `lac-g-${uid}`;
  const full = variant === "fullcolor";
  const paint = full ? `url(#${gid})` : SOLID[variant];
  const isLight = variant === "white";
  const nodeColor = full ? HEX.cyan : isLight ? "#0A101C" : "#FFFFFF";
  const wireColor = full ? "rgba(214,251,255,0.85)" : isLight ? "rgba(10,16,28,0.55)" : "rgba(255,255,255,0.6)";

  const parts: string[] = [];
  if (full) {
    const stops = MARK_GRADIENT.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join("");
    parts.push(`<defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient></defs>`);
  }
  parts.push(ground(background, rounded));

  if (style === "line") {
    parts.push(`<path d="${MARK_PATH}" fill="none" stroke="${paint}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="${MARK_PATH}" fill="${paint}"/>`);
  }

  const showNet = style === "network" || (network && style === "line");
  if (showNet) {
    const wires = EDGES.map(([a, b]) => {
      const p = NODES[a]!;
      const q = NODES[b]!;
      return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${wireColor}" stroke-width="1.4" stroke-linecap="round"/>`;
    }).join("");
    const dots = NODES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${nodeColor}"/>`).join("");
    parts.push(`<g>${wires}${dots}</g>`);
  }

  return frame(size, title, parts.join(""));
}

/** A ready favicon/app-icon tile: rounded ink ground + the real full-colour mark. */
export function iconTile(size = 512): string {
  return mark({ size, variant: "fullcolor", background: "ink", rounded: true, title: "Lacspace" });
}
