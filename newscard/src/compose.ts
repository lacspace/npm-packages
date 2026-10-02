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
  align: "left" | "centre" | "right";
  /** Raw text (no markup) — for tests/measurement. */
  plain: string;
}

export interface ImageRun {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** "inside" (default: letterbox within the box) or "cover" (fill + centre-crop the box). */
  fit?: "inside" | "cover";
  /** Corner radius in px when fit is "cover" (rounded photo tile). */
  radius?: number;
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

/** Rough glyph-advance estimate (px) — Devanagari runs wider than Latin at the same point size. */
export function estimateWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    if (/[ऀ-ॿ]/.test(ch)) w += /[ा-्ँ-ःॢॣ]/.test(ch) ? 0.12 : 0.62; // matras/signs mostly combine
    else if (/[A-Z0-9]/.test(ch)) w += 0.62;
    else if (/[ .,:;'|/-]/.test(ch)) w += 0.3;
    else w += 0.52;
  }
  return w * size;
}

/** Shrink font size (min 60%) so `text` fits `maxWidth` on one line; ellipsise if it still won't. */
export function fitOneLine(text: string, size: number, maxWidth: number): { text: string; size: number } {
  const min = Math.round(size * 0.6);
  let s = size;
  while (s > min && estimateWidth(text, s) > maxWidth) s -= 1;
  if (estimateWidth(text, s) <= maxWidth) return { text, size: s };
  let t = text;
  while (t.length > 1 && estimateWidth(t + "…", s) > maxWidth) t = t.slice(0, -1);
  return { text: t.trimEnd() + "…", size: s };
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

  if (type === "table" && spec.table) {
    // Optional title above the table.
    const heads = pick(spec.headline, lang);
    if (heads.length) {
      const markup = heads.map((h) => span(theme, h, 52, fg, 800)).join("\n");
      texts.push({ markup, x: pad, y, width: contentWidth, align: "left", plain: heads.join(" / ") });
      y += 70 * heads.length + 36;
    }
    const scale = width / 1080;
    const rowH = Math.round(64 * scale);
    const t = spec.table;
    const n = Math.max(1, t.rows[0]?.cells.length ?? t.columns?.length ?? 1);
    const ratios = t.widths && t.widths.length === n ? t.widths : [0.4, ...Array(n - 1).fill(0.6 / Math.max(1, n - 1))].slice(0, n);
    const sum = ratios.reduce((a, b) => a + b, 0);
    const colX: number[] = [];
    const colW: number[] = [];
    let cx = pad;
    for (const r of ratios) {
      const w = Math.round((contentWidth * r) / sum);
      colX.push(cx);
      colW.push(w);
      cx += w;
    }
    const cellText = (text: string, col: number, yy: number, size: number, color: RGBA, weight: number, boxW = colW[col]! - 12) => {
      // One line per cell: shrink the font to fit the column, then ellipsise as a last resort.
      const fitted = fitOneLine(text, size, boxW);
      texts.push({ markup: span(theme, fitted.text, fitted.size, color, weight), x: colX[col]!, y: yy + Math.round((size - fitted.size) / 2), width: Math.max(10, boxW), align: col === 0 ? "left" : "right", plain: fitted.text });
    };
    if (t.columns?.length) {
      t.columns.forEach((c, i) => {
        const label = (pick(c, lang)[0] ?? "").toUpperCase();
        if (label) cellText(label, i, y + 10, 24, muted, 700);
      });
      y += Math.round(rowH * 0.8);
      rects.push({ x: pad, y, w: contentWidth, h: 3, color: { ...accent, alpha: 0.9 } });
      y += 10;
    }
    const up = { r: 34, g: 170, b: 90, alpha: 1 };
    const down = { r: 230, g: 57, b: 70, alpha: 1 };
    t.rows.forEach((row, ri) => {
      if (ri % 2 === 1) rects.push({ x: pad, y, w: contentWidth, h: rowH, color: { ...fg, alpha: 0.06 } });
      let firstX = 0;
      if (row.icon) {
        const ih = Math.round(rowH * 0.7);
        images.push({ src: row.icon, x: colX[0]! + 4, y: y + Math.round((rowH - ih) / 2), w: ih, h: ih });
        firstX = ih + 14;
      }
      row.cells.forEach((cell, ci) => {
        const last = ci === row.cells.length - 1;
        const color = last && row.tone === "up" ? up : last && row.tone === "down" ? down : fg;
        if (ci === 0 && firstX) {
          const fitted = fitOneLine(cell, 34, colW[0]! - firstX - 12);
          texts.push({ markup: span(theme, fitted.text, fitted.size, color, 700), x: colX[0]! + firstX, y: y + 14 + Math.round((34 - fitted.size) / 2), width: Math.max(10, colW[0]! - firstX - 12), align: "left", plain: fitted.text });
        } else {
          cellText(cell, ci, y + 14, 34, color, ci === 0 ? 700 : 600);
        }
      });
      y += rowH;
    });
  } else if (type === "stat" && spec.stat) {
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

  if (spec.chart) {
    const c = spec.chart;
    const cw = Math.round((c.w ?? 0.85) * width);
    const ch = Math.round((c.h ?? 0.18) * height);
    const cxp = c.x !== undefined ? Math.round(c.x * width) : pad;
    const cyp = c.y !== undefined ? Math.round(c.y * height) : Math.min(y + 24, height - pad - ch - 90);
    images.push({ src: c.src, x: cxp, y: cyp, w: cw, h: ch });
  }
  if (theme.logo) {
    const lw = Math.round(width * 0.13);
    images.push({ src: theme.logo, x: width - pad - lw, y: pad, w: lw, h: lw });
  }
  const notes = pick(spec.note, lang);
  if (notes.length) {
    const yy = height - pad - (theme.footer ? 36 + 44 : 36);
    // One line only: bilingual notes that won't fit fall back to the first language, then shrink.
    const joined = notes.join("  ·  ");
    const fitted = fitOneLine(estimateWidth(joined, 26) <= contentWidth ? joined : notes[0]!, 26, contentWidth);
    texts.push({ markup: span(theme, fitted.text, fitted.size, muted, 600), x: pad, y: yy, width: contentWidth, align: "left", plain: fitted.text });
  }
  if (theme.footer) {
    texts.push({ markup: span(theme, theme.footer, 32, muted, 600), x: pad, y: height - pad - 36, width: contentWidth, align: "left", plain: theme.footer });
  }

  return { width, height, background, rects, texts, images, fontFile: theme.fontFiles?.[0] };
}
