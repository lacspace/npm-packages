export type RGB = { r: number; g: number; b: number };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const RGB_RE = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i;

/** Parse `#rgb`, `#rrggbb`, `rgb(r,g,b)` or `rgba(r,g,b,a)`. Returns null otherwise. */
export function parseColor(value: unknown): RGB | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  const h = HEX.exec(s);
  if (h) {
    let hex = h[1]!;
    if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  const m = RGB_RE.exec(s);
  if (m) {
    const r = Number(m[1]);
    const g = Number(m[2]);
    const b = Number(m[3]);
    if (r > 255 || g > 255 || b > 255) return null;
    return { r, g, b };
  }
  return null;
}

export function isColor(value: unknown): value is string {
  return parseColor(value) !== null;
}

/** `#rrggbb` (lower-case) for any parseable colour, else null. VML needs hex. */
export function toHex(value: unknown): string | null {
  const c = parseColor(value);
  if (!c) return null;
  return "#" + [c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, "0")).join("");
}

function channel(n: number): number {
  const s = n / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.x relative luminance. */
export function luminance(c: RGB): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio (1–21) between two colours, or null if either can't be parsed. */
export function contrastRatio(a: unknown, b: unknown): number | null {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return null;
  const l1 = luminance(x);
  const l2 = luminance(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
