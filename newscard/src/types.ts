export type CardSizeName = "portrait" | "square" | "og" | "story";
export type CardType = "headline" | "quote" | "stat" | "breaking";
export type Lang = "en" | "ne" | "both";

export interface Size {
  width: number;
  height: number;
}

export const SIZES: Record<CardSizeName, Size> = {
  portrait: { width: 1080, height: 1350 }, // IG portrait 4:5
  square: { width: 1080, height: 1080 }, // 1:1
  og: { width: 1200, height: 630 }, // Open Graph / link preview
  story: { width: 1080, height: 1920 }, // 9:16 story
};

/** A string, or per-language strings. */
export type Localized = string | { en?: string; ne?: string };

export interface BrandTheme {
  /** Background color. */
  bg: string;
  /** Foreground / text color. */
  fg: string;
  /** Accent color (bar, highlights, breaking banner). */
  accent: string;
  /** Muted color for captions/attribution. Default derived from fg. */
  muted?: string;
  /** Font family name used in the SVG (must match an embedded font for shaping). */
  fontFamily: string;
  /** Optional separate family for Devanagari. Defaults to fontFamily. */
  fontFamilyNe?: string;
  /** Font files to embed for correct shaping (Mukta / Noto Sans Devanagari …). */
  fontFiles?: string[];
  /** Logo as a data URI or absolute URL (SVG/PNG), placed in a corner. */
  logo?: string;
  /** Footer line (site name / handle). */
  footer?: string;
}

export interface CardSpec {
  size?: CardSizeName | Size;
  type?: CardType;
  theme: BrandTheme;
  lang?: Lang;
  /** Small eyebrow above the headline (category / "BREAKING"). */
  kicker?: Localized;
  /** Main text — headline, quote body, or breaking line. */
  headline?: Localized;
  /** Quote author / source / photo credit. */
  attribution?: Localized;
  /** For type "stat". */
  stat?: { value: string; label?: Localized };
  /** Optional background image (data URI or URL); darkened for legibility. */
  image?: string;
}

export interface CarouselSpec {
  size?: CardSizeName | Size;
  theme: BrandTheme;
  lang?: Lang;
  slides: Array<Omit<CardSpec, "theme" | "size" | "lang">>;
  /** Show "1/5" page numbers. Default true. */
  pageNumbers?: boolean;
}
