export interface Palette {
  id: string;
  name: string;
  mood: string[];
  bg: string;
  surface: string;
  primary: string;
  accent: string;
  on: string;
  from: string;
  to: string;
}

export interface FontPair {
  id: string;
  display: string;
  body: string;
  weight: number;
  mood: string[];
  stack: string;
}

export interface IconDef {
  key: string;
  keywords: string[];
  svg: string;
}

export interface Mood {
  id: string;
  name: string;
  keywords: string[];
  paletteMood: string[];
  fontMood: string[];
  shapes: ShapeKind[];
  layouts: Layout[];
  engines: Engine[];
}

export type Engine = "monogram" | "wordmark" | "abstract" | "emblem" | "lettermark";
export type ShapeKind =
  | "circle"
  | "rounded"
  | "squircle"
  | "hexagon"
  | "shield"
  | "seal"
  | "diamond"
  | "blob"
  | "none";
export type Layout = "icon-left" | "icon-top" | "stacked" | "wordmark-only" | "emblem" | "mark-only";

export type Background = "solid" | "transparent" | "gradient" | "surface";

export interface LogoBrief {
  /** Brand / company name (required). */
  name: string;
  /** Keywords describing the brand — array or comma/space string. */
  keywords?: string | string[];
  /** A free-text description (≥ a sentence). Keywords are extracted from it. */
  brief?: string;
  /** Force an industry/mood id (e.g. "food", "finance"). */
  industry?: string;
  /** Force a style/mood preset id. */
  style?: string;
  /** Force a palette id. */
  palette?: string;
  /** Force a font pairing id. */
  font?: string;
  /** Force an icon key. */
  icon?: string;
  /** Force an enclosure shape. */
  shape?: ShapeKind;
  /** Force a layout. */
  layout?: Layout;
  /** Force a generation engine. */
  engine?: Engine;
  /** Seed for deterministic variation (number or string). */
  seed?: number | string;
  /** Output canvas size in px (square). Default 480. */
  size?: number;
  /** Background treatment. Default "transparent". */
  background?: Background;
}

export interface Interpreted {
  keywords: string[];
  mood: string;
  iconKey?: string;
  paletteId: string;
  fontId: string;
  notes: string[];
}

export interface LogoResult {
  svg: string;
  width: number;
  height: number;
  engine: Engine;
  palette: Palette;
  font: FontPair;
  icon?: string;
  shape: ShapeKind;
  layout: Layout;
  mood: string;
  name: string;
  seed: number;
  interpreted: Interpreted;
}
