/**
 * The Lacspace palette — the single source of truth, mirrored from the brand kit
 * (`palette/colors.json`). Exported as tokens plus ready-to-paste CSS/SCSS and the
 * gradient the mark is built from.
 */

export interface BrandColor {
  /** kebab token, e.g. `lacspace-orange` */
  token: string;
  name: string;
  role: string;
  hex: string;
  rgb: string;
}

export const BRAND = "Lacspace";
export const TAGLINE = "THINK · INNOVATE · EXECUTE";

export const COLORS: readonly BrandColor[] = [
  { token: "lacspace-orange", name: "Lacspace Orange", role: "primary", hex: "#F97316", rgb: "rgb(249,115,22)" },
  { token: "lacspace-violet", name: "Lacspace Violet", role: "accent", hex: "#7C3AED", rgb: "rgb(124,58,237)" },
  { token: "lacspace-blue", name: "Lacspace Blue", role: "dark-accent", hex: "#3B82F6", rgb: "rgb(59,130,246)" },
  { token: "lacspace-cyan", name: "Lacspace Cyan", role: "mark", hex: "#0BB9D9", rgb: "rgb(11,185,217)" },
  { token: "ink", name: "Ink", role: "surface-dark", hex: "#0A101C", rgb: "rgb(10,16,28)" },
  { token: "off-white", name: "Off-White", role: "surface-light", hex: "#FAFAFA", rgb: "rgb(250,250,250)" },
];

/** Quick lookups. */
export const HEX = {
  orange: "#F97316",
  violet: "#7C3AED",
  blue: "#3B82F6",
  cyan: "#0BB9D9",
  ink: "#0A101C",
  offWhite: "#FAFAFA",
} as const;

/** The three-stop gradient the mark is rendered with: cyan → blue → violet. */
export const MARK_GRADIENT: readonly { offset: number; color: string }[] = [
  { offset: 0, color: HEX.cyan },
  { offset: 0.5, color: HEX.blue },
  { offset: 1, color: HEX.violet },
];

/** `:root { --brand-… }` custom properties for the whole palette. */
export function brandCss(prefix = "brand"): string {
  const vars = COLORS.map((c) => `  --${prefix}-${c.token}: ${c.hex};`).join("\n");
  return `:root {\n${vars}\n  --${prefix}-gradient: linear-gradient(135deg, ${HEX.cyan}, ${HEX.blue}, ${HEX.violet});\n}`;
}

/** SCSS `$brand-…` variables. */
export function brandScss(): string {
  return COLORS.map((c) => `$${c.token}: ${c.hex};`).join("\n");
}
