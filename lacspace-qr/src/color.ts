/**
 * A tiny colour parser: accepts `#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa` and a
 * handful of common names, returning RGBA bytes. Used by the SVG and PNG
 * renderers. Zero dependencies.
 */

/** An RGBA colour, each channel 0–255. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NAMED: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#008000",
  blue: "#0000ff",
  transparent: "#00000000",
};

/** Parse a colour string into RGBA bytes. Throws on an unrecognised value. */
export function parseColor(input: string): Rgba {
  let s = input.trim().toLowerCase();
  if (NAMED[s]) s = NAMED[s]!;
  if (s[0] !== "#") throw new Error(`Invalid colour: "${input}"`);
  const hex = s.slice(1);
  const expand = (h: string): string => h.split("").map((c) => c + c).join("");
  let full: string;
  if (hex.length === 3) full = expand(hex) + "ff";
  else if (hex.length === 4) full = expand(hex);
  else if (hex.length === 6) full = hex + "ff";
  else if (hex.length === 8) full = hex;
  else throw new Error(`Invalid colour: "${input}"`);
  if (!/^[0-9a-f]{8}$/.test(full)) throw new Error(`Invalid colour: "${input}"`);
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: parseInt(full.slice(6, 8), 16),
  };
}

/** Format an Rgba as a CSS colour (hex, using `#rrggbb` when fully opaque). */
export function toCss(c: Rgba): string {
  const h = (n: number): string => n.toString(16).padStart(2, "0");
  return c.a === 255 ? `#${h(c.r)}${h(c.g)}${h(c.b)}` : `#${h(c.r)}${h(c.g)}${h(c.b)}${h(c.a)}`;
}
