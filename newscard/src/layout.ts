import { BrandTheme, CardSpec, Lang, Localized, Size, SIZES } from "./types.js";

export function resolveSize(s: CardSpec["size"]): Size {
  if (!s) return SIZES.portrait;
  return typeof s === "string" ? SIZES[s] : s;
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEVANAGARI = /[ऀ-ॿ]/;
export function hasDevanagari(s: string): boolean {
  return DEVANAGARI.test(s);
}

/** Resolve a Localized value to the strings to render, in order, for a language mode. */
export function pickText(v: Localized | undefined, lang: Lang): string[] {
  if (v === undefined) return [];
  if (typeof v === "string") return [v];
  if (lang === "en") return v.en ? [v.en] : v.ne ? [v.ne] : [];
  if (lang === "ne") return v.ne ? [v.ne] : v.en ? [v.en] : [];
  return [v.ne, v.en].filter(Boolean) as string[]; // both: Nepali first (primary audience)
}

/** Greedy word-wrap to a max character budget; Devanagari wraps on spaces too. */
export function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (!line) line = w;
    else if ((line + " " + w).length <= maxChars) line += " " + w;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function family(theme: BrandTheme, text: string): string {
  return hasDevanagari(text) ? theme.fontFamilyNe ?? theme.fontFamily : theme.fontFamily;
}

interface TextBlockOpts {
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
  weight?: number;
  theme: BrandTheme;
  maxChars: number;
  lineHeight?: number;
  anchor?: "start" | "middle" | "end";
}

/** A wrapped <text> block; returns the svg and the y after the block. */
function textBlock(o: TextBlockOpts): { svg: string; endY: number } {
  const lh = o.lineHeight ?? o.size * 1.22;
  const lines = wrapText(o.text, o.maxChars);
  const tspans = lines
    .map((ln, i) => `<tspan x="${o.x}" dy="${i === 0 ? 0 : lh}">${xml(ln)}</tspan>`)
    .join("");
  const svg =
    `<text x="${o.x}" y="${o.y}" font-family="${xml(family(o.theme, o.text))}" font-size="${o.size}" ` +
    `font-weight="${o.weight ?? 700}" fill="${o.color}" text-anchor="${o.anchor ?? "start"}" ` +
    `xml:space="preserve">${tspans}</text>`;
  return { svg, endY: o.y + (lines.length - 1) * lh };
}

/**
 * Build the SVG string for a card. Pure and deterministic — no native code, so it is
 * fully testable. Render it to PNG/WebP with `renderCard`.
 */
export function buildSvg(spec: CardSpec): string {
  const { width, height } = resolveSize(spec.size);
  const theme = spec.theme;
  const lang = spec.lang ?? "both";
  const type = spec.type ?? "headline";
  const muted = theme.muted ?? "rgba(255,255,255,0.72)";
  const pad = Math.round(width * 0.075);
  const maxChars = Math.max(10, Math.floor((width - pad * 2) / (type === "stat" ? 70 : 42)));

  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);

  // Background: image (darkened) or solid brand color.
  if (spec.image) {
    parts.push(`<image href="${xml(spec.image)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice"/>`);
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="rgba(0,0,0,0.5)"/>`);
  } else {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${theme.bg}"/>`);
  }

  // Breaking banner.
  let cursorY = pad + 70;
  if (type === "breaking") {
    const label = pickText(spec.kicker, lang)[0] ?? (lang === "en" ? "BREAKING" : "ताजा खबर");
    const bannerH = 96;
    parts.push(`<rect x="0" y="0" width="${width}" height="${bannerH}" fill="${theme.accent}"/>`);
    parts.push(
      `<text x="${pad}" y="${Math.round(bannerH * 0.66)}" font-family="${xml(family(theme, label))}" ` +
        `font-size="46" font-weight="800" fill="${theme.fg}" letter-spacing="2">${xml(label.toUpperCase())}</text>`,
    );
    cursorY = bannerH + pad;
  } else {
    // Accent bar + kicker.
    parts.push(`<rect x="${pad}" y="${pad}" width="84" height="12" fill="${theme.accent}"/>`);
    const kicker = pickText(spec.kicker, lang)[0];
    if (kicker) {
      parts.push(
        `<text x="${pad}" y="${pad + 62}" font-family="${xml(family(theme, kicker))}" font-size="34" ` +
          `font-weight="700" fill="${theme.accent}" letter-spacing="3">${xml(kicker.toUpperCase())}</text>`,
      );
      cursorY = pad + 120;
    } else {
      cursorY = pad + 48;
    }
  }

  // Main content.
  if (type === "stat" && spec.stat) {
    const valueSize = Math.round(width * 0.28);
    parts.push(
      `<text x="${pad}" y="${Math.round(height * 0.52)}" font-family="${xml(theme.fontFamily)}" ` +
        `font-size="${valueSize}" font-weight="800" fill="${theme.accent}">${xml(spec.stat.value)}</text>`,
    );
    for (const label of pickText(spec.stat.label, lang)) {
      const b = textBlock({ x: pad, y: Math.round(height * 0.52) + 90, text: label, size: 48, color: theme.fg, theme, maxChars });
      parts.push(b.svg);
    }
  } else {
    const isQuote = type === "quote";
    if (isQuote) {
      parts.push(
        `<text x="${pad}" y="${cursorY + 60}" font-family="${xml(theme.fontFamily)}" font-size="160" ` +
          `font-weight="800" fill="${theme.accent}" opacity="0.5">&#8220;</text>`,
      );
      cursorY += 120;
    }
    const headSize = type === "breaking" ? 76 : 72;
    for (const h of pickText(spec.headline, lang)) {
      const b = textBlock({ x: pad, y: cursorY + headSize, text: h, size: headSize, color: theme.fg, theme, maxChars });
      parts.push(b.svg);
      cursorY = b.endY + headSize * 1.5;
    }
    for (const a of pickText(spec.attribution, lang)) {
      parts.push(
        `<text x="${pad}" y="${cursorY}" font-family="${xml(family(theme, a))}" font-size="36" ` +
          `font-weight="600" fill="${muted}">${xml((isQuote ? "— " : "") + a)}</text>`,
      );
      cursorY += 52;
    }
  }

  // Logo + footer.
  if (theme.logo) {
    const lw = Math.round(width * 0.13);
    parts.push(`<image href="${xml(theme.logo)}" x="${width - pad - lw}" y="${pad}" width="${lw}" height="${lw}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  if (theme.footer) {
    parts.push(
      `<text x="${pad}" y="${height - pad}" font-family="${xml(family(theme, theme.footer))}" font-size="32" ` +
        `font-weight="600" fill="${muted}">${xml(theme.footer)}</text>`,
    );
  }

  parts.push(`</svg>`);
  return parts.join("");
}
