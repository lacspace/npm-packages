import { composeCard, CardPlan, RGBA } from "./compose.js";
import { CardSpec, CarouselSpec } from "./types.js";

export interface RenderOptions {
  format?: "png" | "webp";
  /** WebP quality 1–100 (default 90). */
  quality?: number;
}

type SharpModule = typeof import("sharp");

async function loadSharp(): Promise<SharpModule["default"]> {
  const mod: any = await import("sharp").catch(() => {
    throw new Error("newscard: `sharp` is required to render cards — `npm i sharp`");
  });
  return mod.default ?? mod;
}

function bg(c: RGBA): { r: number; g: number; b: number; alpha: number } {
  return { r: c.r, g: c.g, b: c.b, alpha: c.alpha };
}

/** Render a text run via sharp's Pango text path (correct complex-script shaping). */
async function textLayer(
  sharp: SharpModule["default"],
  run: CardPlan["texts"][number],
  fontFile: string | undefined,
): Promise<{ input: Buffer; left: number; top: number }> {
  const opts: any = {
    text: run.markup,
    rgba: true,
    width: run.width,
    align: run.align,
    dpi: 72,
    wrap: "word",
  };
  if (fontFile) opts.fontfile = fontFile;
  const buf = await sharp({ text: opts }).png().toBuffer();
  return { input: buf, left: Math.round(run.x), top: Math.round(run.y) };
}

/** Render a pre-composed plan (lets other packages lay out custom cards and reuse the renderer). */
export async function renderPlan(plan: CardPlan, options: RenderOptions = {}): Promise<Uint8Array> {
  const sharp = await loadSharp();
  const { width, height } = plan;

  // Base canvas: brand color, or a cover-fit background image darkened by an overlay.
  let base: import("sharp").Sharp;
  if (plan.background.image) {
    const imgBuf = await loadImage(plan.background.image);
    base = sharp(imgBuf).resize(width, height, { fit: "cover" });
    if (plan.background.overlay) {
      const ov = await sharp({ create: { width, height, channels: 4, background: bg(plan.background.overlay) } }).png().toBuffer();
      base = sharp(await base.png().toBuffer()).composite([{ input: ov, left: 0, top: 0 }]);
    }
  } else {
    base = sharp({ create: { width, height, channels: 4, background: bg(plan.background.color ?? { r: 0, g: 0, b: 0, alpha: 1 }) } });
  }

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  // Rects (banner, accent bar) as solid tiles.
  for (const r of plan.rects) {
    const tile = await sharp({ create: { width: Math.max(1, Math.round(r.w)), height: Math.max(1, Math.round(r.h)), channels: 4, background: bg(r.color) } }).png().toBuffer();
    composites.push({ input: tile, left: Math.round(r.x), top: Math.round(r.y) });
  }
  // Logos / inline images.
  for (const im of plan.images) {
    try {
      const buf = await loadImage(im.src);
      const w = Math.max(1, Math.round(im.w)), h = Math.max(1, Math.round(im.h));
      let tile = sharp(buf).resize(w, h, { fit: im.fit === "cover" ? "cover" : "inside", position: "attention" });
      if (im.fit === "cover" && im.radius) {
        const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${im.radius}" ry="${im.radius}"/></svg>`);
        tile = sharp(await tile.png().toBuffer()).composite([{ input: mask, blend: "dest-in" }]);
      }
      composites.push({ input: await tile.png().toBuffer(), left: Math.round(im.x), top: Math.round(im.y) });
    } catch {
      /* skip a missing logo rather than fail the card */
    }
  }
  // Text runs (Pango — correct Devanagari shaping). Skip any empty run.
  for (const t of plan.texts) {
    if (!t.plain.trim()) continue;
    composites.push(await textLayer(sharp, t, plan.fontFile));
  }

  const out = sharp(await base.png().toBuffer()).composite(composites);
  if (options.format === "webp") return new Uint8Array(await out.webp({ quality: options.quality ?? 90 }).toBuffer());
  return new Uint8Array(await out.png().toBuffer());
}

async function loadImage(src: string): Promise<Buffer> {
  if (src.startsWith("data:")) {
    const b64 = src.slice(src.indexOf(",") + 1);
    return Buffer.from(b64, "base64");
  }
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    return Buffer.from(await res.arrayBuffer());
  }
  const { readFile } = await import("node:fs/promises");
  return readFile(src);
}

/** Render a card spec to PNG (default) or WebP bytes. Uses sharp (Pango/HarfBuzz text). */
export async function renderCard(spec: CardSpec, options: RenderOptions = {}): Promise<Uint8Array> {
  return renderPlan(composeCard(spec), options);
}

/** Render every slide of a carousel, with optional "n/total" page numbers. */
export async function renderCarousel(carousel: CarouselSpec, options: RenderOptions = {}): Promise<Uint8Array[]> {
  const total = carousel.slides.length;
  const out: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const slide = carousel.slides[i]!;
    let theme = carousel.theme;
    if (carousel.pageNumbers !== false) {
      const base = carousel.theme.footer ? `${carousel.theme.footer}   ` : "";
      theme = { ...carousel.theme, footer: `${base}${i + 1}/${total}` };
    }
    out.push(await renderCard({ ...slide, size: carousel.size, theme, lang: carousel.lang }, options));
  }
  return out;
}
