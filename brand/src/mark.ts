/**
 * Render the Lacspace mark as a self-contained SVG string — no fonts, no external
 * refs, no JS. Faithful to the master artwork (silhouette + neural network), in
 * every brand colour, at any size. For pixel-exact raster/vector artwork use the
 * bundled files in `@lacspace/brand/assets/`.
 */

import { VIEWBOX, MARK_PATH, NODES, EDGES } from "./geometry.js";
import { HEX, MARK_GRADIENT } from "./colors.js";

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

export type MarkStyle = "filled" | "line" | "glyph";

export interface MarkOptions {
  /** px size (square). Default 256. */
  size?: number;
  /** Colour variant. Default `fullcolor`. */
  variant?: MarkVariant;
  /** `filled` (silhouette + network), `line` (outlined), `glyph` (silhouette only). Default `filled`. */
  style?: MarkStyle;
  /** Show the neural nodes + wires. Default true (ignored for `glyph`). */
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

  const gid = `lac-g-${uid}`;
  const full = variant === "fullcolor";
  const paint = full ? `url(#${gid})` : SOLID[variant];
  // On a dark solid mark the network reads better lightened; on light marks, darkened.
  const isLight = variant === "white";
  const nodeColor = full ? HEX.cyan : isLight ? "#0A101C" : "#FFFFFF";
  const wireColor = full ? "rgba(214,251,255,0.85)" : isLight ? "rgba(10,16,28,0.55)" : "rgba(255,255,255,0.6)";

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${VIEWBOX} ${VIEWBOX}"` +
      (title ? ` role="img" aria-label="${esc(title)}">` : ` aria-hidden="true">`),
  );
  if (title) parts.push(`<title>${esc(title)}</title>`);

  if (full) {
    const stops = MARK_GRADIENT.map((s) => `<stop offset="${s.offset * 100}%" stop-color="${s.color}"/>`).join("");
    parts.push(`<defs><linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%">${stops}</linearGradient></defs>`);
  }

  const rbg = bg(background);
  if (rbg) {
    const r = rounded === true ? VIEWBOX * 0.22 : typeof rounded === "number" ? VIEWBOX * rounded : 0;
    parts.push(`<rect width="${VIEWBOX}" height="${VIEWBOX}" rx="${r}" ry="${r}" fill="${rbg}"/>`);
  }

  if (style === "line") {
    parts.push(`<path d="${MARK_PATH}" fill="none" stroke="${paint}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>`);
  } else {
    parts.push(`<path d="${MARK_PATH}" fill="${paint}"/>`);
  }

  if (network && style !== "glyph") {
    const wires = EDGES.map(([a, b]) => {
      const p = NODES[a]!;
      const q = NODES[b]!;
      return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" stroke="${wireColor}" stroke-width="1.4" stroke-linecap="round"/>`;
    }).join("");
    const dots = NODES.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${nodeColor}"/>`).join("");
    parts.push(`<g>${wires}${dots}</g>`);
  }

  parts.push(`</svg>`);
  return parts.join("");
}

/** A ready favicon/app-icon tile: rounded ink ground + full-colour mark, given a size. */
export function iconTile(size = 512): string {
  return mark({ size, variant: "fullcolor", background: "ink", rounded: true, title: "Lacspace" });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
