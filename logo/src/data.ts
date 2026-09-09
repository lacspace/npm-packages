/** Typed views over the JSON "brain". These are bundled into the build. */
import palettesJson from "./data/palettes.json";
import fontsJson from "./data/fonts.json";
import iconsJson from "./data/icons.json";
import moodsJson from "./data/moods.json";
import keywordsJson from "./data/keywords.json";
import type { FontPair, IconDef, Mood, Palette } from "./types.js";

export const PALETTES = palettesJson as Palette[];
export const FONTS = fontsJson as FontPair[];
export const ICONS = iconsJson as IconDef[];
export const MOODS = moodsJson as Mood[];
export const KEYWORDS = keywordsJson as {
  colorWords: Record<string, string>;
  vibeWords: Record<string, string>;
};

export const paletteById = (id: string): Palette | undefined => PALETTES.find((p) => p.id === id);
export const fontById = (id: string): FontPair | undefined => FONTS.find((f) => f.id === id);
export const iconByKey = (key: string): IconDef | undefined => ICONS.find((i) => i.key === key);
export const moodById = (id: string): Mood | undefined => MOODS.find((m) => m.id === id);
