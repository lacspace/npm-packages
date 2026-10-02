import { estimateWidth, fitOneLine, parseColor, renderPlan } from "@lacspace/newscard";
import type { BrandTheme, CardPlan, ImageRun, Localized, RGBA, RectRun, RenderOptions, TextRun } from "@lacspace/newscard";

const VERSION = "1.0.0";

export type ThumbSizeName = "youtube" | "og" | "square" | "story";
export const THUMB_SIZES: Record<ThumbSizeName, { width: number; height: number }> = {
  youtube: { width: 1280, height: 720 },
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

export type Urgency = "normal" | "developing" | "breaking";
export type LayoutName = "split" | "fullbleed" | "band" | "badge" | "quote";
export const LAYOUTS: LayoutName[] = ["split", "fullbleed", "band", "badge", "quote"];

export interface ThumbSpec {
  theme: BrandTheme;
  size?: ThumbSizeName | { width: number; height: number };
  /** Headline; keep it short — 3 lines max are drawn, text auto-fits. */
  headline: Localized;
  /** Small category/kicker label. */
  kicker?: Localized;
  /** Photo (licensed; data URI, URL or path). Required for split/fullbleed. */
  image?: string;
  /** Credit line ("Photo: Pexels / Name"). */
  credit?: string;
  urgency?: Urgency;
  /** Category accent colour (hex); defaults to theme.accent. */
  accent?: string;
  lang?: "en" | "ne";
  /** Which layouts to produce (default: all that have what they need). */
  layouts?: LayoutName[];
  /** Big number / stat badge for "badge" layout (e.g. "+12.5%"). */
  stat?: string;
  /** Quote attribution for the "quote" layout. */
  attribution?: Localized;
}

export interface ThumbVariant {
  layout: LayoutName;
  plan: CardPlan;
  /** Headline font size chosen. */
  fontSize: number;
  lines: string[];
  /** Why this variant might win (for the conductor / bandit). */
  rationale: string;
}

const DEV = /[ऀ-ॿ]/;

function pick(v: Localized | undefined, lang: "en" | "ne"): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  return v[lang] ?? v[lang === "en" ? "ne" : "en"] ?? "";
}
function toHex(c: RGBA): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}
function pangoEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function span(theme: BrandTheme, text: string, size: number, color: RGBA, weight: "bold" | "normal" = "bold", alpha = color.alpha): string {
  const fam = DEV.test(text) ? theme.fontFamilyNe ?? theme.fontFamily : theme.fontFamily;
  const a = alpha < 1 ? ` alpha="${Math.round(alpha * 65535)}"` : "";
  return `<span font_family="${fam}" size="${Math.round(size * 1024)}" foreground="${toHex(color)}"${a} weight="${weight}">${pangoEscape(text)}</span>`;
}

/** Greedy word wrap into ≤ maxLines at `size`; returns null if it doesn't fit. */
export function wrapHeadline(text: string, size: number, maxWidth: number, maxLines: number): string[] | null {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (estimateWidth(cand, size) <= maxWidth) cur = cand;
    else {
      if (!cur) return null; // a single word wider than the line
      lines.push(cur);
      cur = w;
      if (lines.length === maxLines) return null;
    }
  }
  if (cur) lines.push(cur);
  return lines.length <= maxLines ? lines : null;
}

/** Largest size (≤ max) at which the headline wraps into ≤ maxLines. Falls back to ellipsis at min. */
export function fitHeadline(text: string, maxWidth: number, maxSize: number, minSize: number, maxLines: number): { size: number; lines: string[] } {
  for (let s = maxSize; s >= minSize; s -= 2) {
    const lines = wrapHeadline(text, s, maxWidth, maxLines);
    if (lines) return { size: s, lines };
  }
  const lines = wrapHeadline(text, minSize, maxWidth, maxLines) ?? [];
  if (lines.length === maxLines || !lines.length) {
    const fitted = fitOneLine(text, minSize, maxWidth * maxLines);
    const w = wrapHeadline(fitted.text, minSize, maxWidth, maxLines) ?? [fitted.text];
    return { size: minSize, lines: w.slice(0, maxLines) };
  }
  return { size: minSize, lines };
}

/** SVG gradient tile as a data URI (sharp rasterises it) — used for legibility scrims. */
export function gradientUri(w: number, h: number, from: string, to: string, direction: "down" | "up" | "right" | "left" = "down"): string {
  const [x1, y1, x2, y2] = direction === "down" ? [0, 0, 0, 1] : direction === "up" ? [0, 1, 0, 0] : direction === "right" ? [0, 0, 1, 0] : [1, 0, 0, 0];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${from.split("@")[0]}" stop-opacity="${from.split("@")[1] ?? 1}"/><stop offset="1" stop-color="${to.split("@")[0]}" stop-opacity="${to.split("@")[1] ?? 1}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/></svg>`;
  const b64 = typeof Buffer !== "undefined" ? Buffer.from(svg).toString("base64") : btoa(svg);
  return `data:image/svg+xml;base64,${b64}`;
}

/** Lay out every requested thumbnail variant as a pure CardPlan (render with renderThumb / newscard renderPlan). */
export function composeThumbs(spec: ThumbSpec): ThumbVariant[] {
  const size = typeof spec.size === "string" || !spec.size ? THUMB_SIZES[(spec.size as ThumbSizeName) ?? "youtube"] : spec.size;
  const { width, height } = size;
  const lang = spec.lang ?? (DEV.test(pick(spec.headline, "ne")) && typeof spec.headline !== "string" ? "ne" : DEV.test(typeof spec.headline === "string" ? spec.headline : "") ? "ne" : "en");
  const theme = spec.theme;
  const fg = parseColor(theme.fg), bg = parseColor(theme.bg), accent = parseColor(spec.accent ?? theme.accent), muted = parseColor(theme.muted ?? "#c3ccd8");
  const breaking = spec.urgency === "breaking";
  const pad = Math.round(width * 0.06);
  const headline = pick(spec.headline, lang);
  const kicker = (pick(spec.kicker, lang) || (breaking ? (lang === "ne" ? "ताजा खबर" : "BREAKING") : "")).toUpperCase();
  const want = spec.layouts ?? LAYOUTS.filter((l) => (l === "split" || l === "fullbleed" ? !!spec.image : l === "badge" ? !!spec.stat : l === "quote" ? !!spec.attribution : true));
  const maxHead = Math.round(width * 0.085), minHead = Math.round(width * 0.045);
  const out: ThumbVariant[] = [];

  const kickerRun = (x: number, y: number, w: number, color: RGBA): TextRun[] =>
    kicker ? [{ markup: span(theme, kicker, Math.round(width * 0.026), color), x, y, width: w, align: "left", plain: kicker }] : [];
  const creditRun = (x: number, y: number, w: number): TextRun[] =>
    spec.credit ? [{ markup: span(theme, spec.credit, Math.round(width * 0.016), muted, "normal", 0.9), x, y, width: w, align: "left", plain: spec.credit }] : [];
  const logoRun = (x: number, y: number): ImageRun[] => (theme.logo ? [{ src: theme.logo, x, y, w: Math.round(width * 0.11), h: Math.round(width * 0.11) }] : []);
  const headBlock = (x: number, y: number, w: number, maxLines: number, color: RGBA, sizeMax = maxHead): { texts: TextRun[]; size: number; lines: string[]; h: number } => {
    const { size: fs, lines } = fitHeadline(headline, w, sizeMax, minHead, maxLines);
    const lh = Math.round(fs * 1.18);
    const markup = lines.map((l) => span(theme, l, fs, color)).join("\n");
    return { texts: [{ markup, x, y, width: w, align: "left", plain: lines.join(" ") }], size: fs, lines, h: lh * lines.length };
  };

  for (const layout of want) {
    const rects: RectRun[] = [], texts: TextRun[] = [], images: ImageRun[] = [];
    let background: CardPlan["background"] = { color: bg };
    let hb: ReturnType<typeof headBlock>;
    if (layout === "split" && spec.image) {
      // Text left 55%, photo right 45% (cover, rounded inner edge), accent rule under the kicker.
      const textW = Math.round(width * 0.55) - pad * 2;
      const photoX = Math.round(width * 0.55);
      images.push({ src: spec.image, x: photoX, y: 0, w: width - photoX, h: height, fit: "cover" });
      images.push({ src: gradientUri(Math.round(width * 0.1), height, toHex(bg) + "@1", toHex(bg) + "@0", "right"), x: photoX, y: 0, w: Math.round(width * 0.1), h: height });
      rects.push({ x: pad, y: pad, w: Math.round(width * 0.06), h: Math.round(height * 0.012), color: accent });
      texts.push(...kickerRun(pad, pad + Math.round(height * 0.03), textW, accent));
      hb = headBlock(pad, Math.round(height * 0.22), textW, 4, fg);
      texts.push(...hb.texts);
      texts.push(...creditRun(photoX + Math.round(width * 0.02), height - pad - Math.round(width * 0.02), width - photoX - pad));
      images.push(...logoRun(pad, height - pad - Math.round(width * 0.11)));
      out.push({ layout, plan: { width, height, background, rects, texts, images }, fontSize: hb.size, lines: hb.lines, rationale: "Clear face/subject on the right, headline fully legible on brand colour — safest default for YouTube." });
    } else if (layout === "fullbleed" && spec.image) {
      background = { image: spec.image };
      images.push({ src: gradientUri(width, height, "#000000@0", "#000000@0.85", "down"), x: 0, y: 0, w: width, h: height });
      if (breaking) rects.push({ x: 0, y: 0, w: width, h: Math.round(height * 0.11), color: accent });
      texts.push(...(breaking ? [{ markup: span(theme, kicker, Math.round(width * 0.034), fg), x: pad, y: Math.round(height * 0.028), width: width - pad * 2, align: "left" as const, plain: kicker }] : kickerRun(pad, Math.round(height * 0.5), width - pad * 2, accent)));
      hb = headBlock(pad, Math.round(height * 0.56), width - pad * 2, 3, fg);
      // Pull the block up so the last line sits above the bottom padding.
      const y = Math.min(Math.round(height * 0.56), height - pad - hb.h - (spec.credit ? Math.round(width * 0.03) : 0));
      hb.texts[0]!.y = y;
      texts.push(...hb.texts);
      texts.push(...creditRun(pad, height - pad - Math.round(width * 0.018), width - pad * 2));
      images.push(...logoRun(width - pad - Math.round(width * 0.11), pad));
      out.push({ layout, plan: { width, height, background, rects, texts, images }, fontSize: hb.size, lines: hb.lines, rationale: "Photo-led with a dark scrim — highest emotional pull when the image is strong." });
    } else if (layout === "band") {
      // Brand background, big headline, accent band at the bottom with kicker; optional small photo tile top-right.
      const tileW = spec.image ? Math.round(width * 0.3) : 0;
      if (spec.image) images.push({ src: spec.image, x: width - pad - tileW, y: pad, w: tileW, h: Math.round(tileW * 0.75), fit: "cover", radius: Math.round(width * 0.015) });
      hb = headBlock(pad, pad + (spec.image ? 0 : Math.round(height * 0.04)), width - pad * 2 - (spec.image ? tileW + pad : 0), 4, fg);
      texts.push(...hb.texts);
      const bandH = Math.round(height * 0.16);
      rects.push({ x: 0, y: height - bandH, w: width, h: bandH, color: accent });
      texts.push({ markup: span(theme, kicker || (lang === "ne" ? "समाचार" : "NEWS"), Math.round(width * 0.03), fg), x: pad, y: height - bandH + Math.round(bandH * 0.3), width: width - pad * 2, align: "left", plain: kicker });
      images.push(...logoRun(width - pad - Math.round(width * 0.11), height - bandH + Math.round((bandH - width * 0.11) / 2)));
      texts.push(...creditRun(pad, height - bandH - Math.round(width * 0.03), width - pad * 2));
      out.push({ layout, plan: { width, height, background, rects, texts, images }, fontSize: hb.size, lines: hb.lines, rationale: "Typographic, brand-forward — works without a photo and reads at small sizes." });
    } else if (layout === "badge" && spec.stat) {
      const badgeSize = Math.round(width * 0.17);
      rects.push({ x: pad, y: pad, w: Math.round(width * 0.06), h: Math.round(height * 0.012), color: accent });
      texts.push(...kickerRun(pad, pad + Math.round(height * 0.03), width - pad * 2, accent));
      texts.push({ markup: span(theme, spec.stat, badgeSize, accent), x: pad, y: Math.round(height * 0.2), width: width - pad * 2, align: "left", plain: spec.stat });
      hb = headBlock(pad, Math.round(height * 0.2) + badgeSize + Math.round(height * 0.05), width - pad * 2, 3, fg, Math.round(width * 0.06));
      texts.push(...hb.texts);
      images.push(...logoRun(width - pad - Math.round(width * 0.11), pad));
      out.push({ layout, plan: { width, height, background, rects, texts, images }, fontSize: hb.size, lines: hb.lines, rationale: "Number-first — best for data stories (forex, NEPSE, weather)." });
    } else if (layout === "quote" && spec.attribution) {
      texts.push({ markup: span(theme, "“", Math.round(width * 0.16), accent), x: pad, y: Math.round(height * 0.04), width: width - pad * 2, align: "left", plain: "“" });
      hb = headBlock(pad, Math.round(height * 0.26), width - pad * 2, 3, fg, Math.round(width * 0.065));
      texts.push(...hb.texts);
      const attr = "— " + pick(spec.attribution, lang);
      texts.push({ markup: span(theme, attr, Math.round(width * 0.028), muted, "normal"), x: pad, y: Math.round(height * 0.26) + hb.h + Math.round(height * 0.05), width: width - pad * 2, align: "left", plain: attr });
      if (spec.image) images.push({ src: spec.image, x: width - pad - Math.round(width * 0.2), y: height - pad - Math.round(width * 0.2), w: Math.round(width * 0.2), h: Math.round(width * 0.2), fit: "cover", radius: Math.round(width * 0.1) });
      images.push(...logoRun(pad, height - pad - Math.round(width * 0.11)));
      out.push({ layout, plan: { width, height, background, rects, texts, images }, fontSize: hb.size, lines: hb.lines, rationale: "Quote-led — strong for interviews and statements." });
    }
  }
  return out;
}

/** Render one variant to PNG/WebP via newscard's sharp/Pango renderer. */
export async function renderThumb(v: ThumbVariant, options: RenderOptions = {}): Promise<Uint8Array> {
  return renderPlan(v.plan, options);
}

/** Compose + render every variant. */
export async function thumbnails(spec: ThumbSpec, options: RenderOptions = {}): Promise<Array<ThumbVariant & { image: Uint8Array }>> {
  const vs = composeThumbs(spec);
  const out: Array<ThumbVariant & { image: Uint8Array }> = [];
  for (const v of vs) out.push({ ...v, image: await renderPlan(v.plan, options) });
  return out;
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/thumbgen",
    version: VERSION,
    summary: "YouTube/OG/square/story thumbnail variants from a headline + optional photo: split, fullbleed (scrim), band, number badge and quote layouts; urgency/category accents; headline auto-fit ≤3–4 lines with correct Devanagari shaping; rationale per variant for A/B (feed @lacspace/postbandit).",
    layouts: LAYOUTS,
    sizes: Object.keys(THUMB_SIZES),
    commands: [
      { name: "composeThumbs", input: { type: "object", properties: { theme: { type: "object" }, size: { enum: Object.keys(THUMB_SIZES) }, headline: {}, kicker: {}, image: { type: "string" }, credit: { type: "string" }, urgency: { enum: ["normal", "developing", "breaking"] }, accent: { type: "string" }, lang: { enum: ["en", "ne"] }, layouts: { type: "array" }, stat: { type: "string" }, attribution: {} }, required: ["theme", "headline"] }, output: "ThumbVariant[] { layout, plan, fontSize, lines, rationale }" },
      { name: "thumbnails", input: { type: "object", properties: { spec: { type: "object" }, format: { enum: ["png", "webp"] } }, required: ["spec"] }, output: "(ThumbVariant & { image: bytes })[]" },
    ],
  };
}
