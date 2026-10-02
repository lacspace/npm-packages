import { BrandTheme, CardSpec, Lang, Localized } from "./types.js";
import { resolveSize } from "./layout.js";

export interface RGBA {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

export interface RectRun {
  x: number;
  y: number;
  w: number;
  h: number;
  color: RGBA;
}

export interface TextRun {
  /** Pango markup (spans with font/size/color), ready for sharp's text input. */
  markup: string;
  x: number;
  y: number;
  width: number;
  align: "left" | "centre";
  /** Raw text (no markup) — for tests/measurement. */
  plain: string;
}

export interface ImageRun {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardPlan {
  width: number;
  height: number;
  background: { color?: RGBA; image?: string; overlay?: RGBA };
  rects: RectRun[];
  texts: TextRun[];
  images: ImageRun[];
  /** The font file to hand Pango for shaping (first of theme.fontFiles). */
  fontFile?: string;
}

const DEVANAGARI = /[ऀ-ॿ]/;

export function parseColor(c: string | undefined): RGBA {
  if (!c) return { r: 255, g: 255, b: 255, alpha: 1 };
  const s = c.trim();
  let m = s.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)$/i);
  if (m) return { r: +m[1]!, g: +m[2]!, b: +m[3]!, alpha: m[4] !== undefined ? +m[4]! : 1 };
  // "name@alpha" or "#hex@alpha"
  let alpha = 1;
  let base = s;
  const at = s.split("@");
  if (at.length === 2) {
    base = at[0]!;
    alpha = Number(at[1]);
  }
  m = base.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1]!;
    if (h.length === 3) h = h.split("").map((x) => x + x).join("");
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), alpha };
  }
  const named: Record<string, [number, number, number]> = {
    white: [255, 255, 255], black: [0, 0, 0], red: [230, 57, 70],
  };
  const n = named[base.toLowerCase()];
  if (n) return { r: n[0], g: n[1], b: n[2], alpha };
  return { r: 255, g: 255, b: 255, alpha };
}

function toHex(c: RGBA): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

function pangoEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function family(theme: BrandTheme, text: string): string {
  return DEVANAGARI.test(text) ? theme.fontFamilyNe ?? theme.fontFamily : theme.fontFamily;
}

function span(theme: BrandTheme, text: string, size: number, color: RGBA, weight = 700, alpha = color.alpha): string {
  const a = alpha < 1 ? ` alpha="${Math.round(alpha * 65535)}"` : "";
  return (
    `<span font_family="${family(theme, text)}" size="${Math.round(size * 1024)}" ` +
    `foreground="${toHex(color)}"${a} weight="${weight >= 700 ? "bold" : "normal"}">${pangoEscape(text)}</span>`
  );
}

function pick(v: Localized | undefined, lang: Lang): string[] {
  if (v === undefined) return [];
  if (typeof v === "string") return v.trim() ? [v] : [];
  if (lang === "en") return v.en ? [v.en] : v.ne ? [v.ne] : [];
  if (lang === "ne") return v.ne ? [v.ne] : v.en ? [v.en] : [];
  return [v.ne, v.en].filter((x) => x && x.trim()) as string[];
}

/**
 * Lay a card out into a flat plan of rects + Pango-markup text runs + images. Pure and
 * deterministic (no native code), so it is fully testable. `renderCard` executes it with
 * sharp, whose Pango/HarfBuzz text path shapes Devanagari correctly (resvg does not).
 */
export function composeCard(spec: CardSpec): CardPlan {
  const { width, height } = resolveSize(spec.size);
  const theme = spec.theme;
  const lang = spec.lang ?? "both";
  const type = spec.type ?? "headline";
  const pad = Math.round(width * 0.075);
  const contentWidth = width - pad * 2;
  const fg = parseColor(theme.fg);
  const accent = parseColor(theme.accent);
  const muted = parseColor(theme.muted ?? "#c3ccd8");

  const rects: RectRun[] = [];
  const texts: TextRun[] = [];
  const images: ImageRun[] = [];
  const background: CardPlan["background"] = spec.image
    ? { image: spec.image, overlay: { r: 0, g: 0, b: 0, alpha: 0.5 } }
    : { color: parseColor(theme.bg) };

  let y = pad;
  if (type === "breaking") {
    const label = (pick(spec.kicker, lang)[0] ?? (lang === "en" ? "BREAKING" : "ताजा खबर")).toUpperCase();
    const bannerH = 96;
    rects.push({ x: 0, y: 0, w: width, h: bannerH, color: accent });
    texts.push({ markup: span(theme, label, 44, fg, 800), x: pad, y: 24, width: contentWidth, align: "left", plain: label });
    y = bannerH + pad;
  } else {
    rects.push({ x: pad, y: pad, w: 84, h: 12, color: accent });
    const kicker = pick(spec.kicker, lang)[0];
    if (kicker) {
      texts.push({ markup: span(theme, kicker.toUpperCase(), 32, accent, 700), x: pad, y: pad + 30, width: contentWidth, align: "left", plain: kicker });
      y = pad + 110;
    } else {
      y = pad + 44;
    }
  }

  if (type === "stat" && spec.stat) {
    const valueSize = Math.round(width * 0.2);
    texts.push({ markup: span(theme, spec.stat.value, valueSize, accent, 800), x: pad, y: Math.round(height * 0.34), width: contentWidth, align: "left", plain: spec.stat.value });
    const labels = pick(spec.stat.label, lang);
    if (labels.length) {
      const markup = labels.map((l) => span(theme, l, 46, fg, 600)).join("\n");
      texts.push({ markup, x: pad, y: Math.round(height * 0.34) + valueSize + 24, width: contentWidth, align: "left", plain: labels.join(" / ") });
    }
  } else {
    const isQuote = type === "quote";
    if (isQuote) {
      texts.push({ markup: span(theme, "“", 150, accent, 800), x: pad, y, width: contentWidth, align: "left", plain: "“" });
      y += 120;
    }
    const headSize = 70;
    const heads = pick(spec.headline, lang);
    const attrs = pick(spec.attribution, lang);
    const lines: string[] = [];
    for (const h of heads) lines.push(span(theme, h, headSize, fg, 800));
    for (const a of attrs) lines.push(span(theme, (isQuote ? "— " : "") + a, 36, muted, 600));
    if (lines.length) {
      // headline lines and attribution are joined with blank lines in one flowed block
      const markup = lines.join("\n\n");
      texts.push({ markup, x: pad, y, width: contentWidth, align: "left", plain: [...heads, ...attrs].join(" ") });
    }
  }

  if (theme.logo) {
    const lw = Math.round(width * 0.13);
    images.push({ src: theme.logo, x: width - pad - lw, y: pad, w: lw, h: lw });
  }
  if (theme.footer) {
    texts.push({ markup: span(theme, theme.footer, 32, muted, 600), x: pad, y: height - pad - 36, width: contentWidth, align: "left", plain: theme.footer });
  }

  return { width, height, background, rects, texts, images, fontFile: theme.fontFiles?.[0] };
}
