import { buildSvg, resolveSize } from "./layout.js";
import { CardSpec, CarouselSpec } from "./types.js";

export interface RenderOptions {
  format?: "png" | "webp";
  /** WebP quality 1–100 (default 90). Requires `sharp` for webp. */
  quality?: number;
}

async function svgToPng(svg: string, fontFiles: string[], defaultFamily: string): Promise<Uint8Array> {
  const mod: any = await import("@resvg/resvg-js").catch(() => {
    throw new Error("newscard: @resvg/resvg-js is required to render PNGs — `npm i @resvg/resvg-js`");
  });
  const Resvg = mod.Resvg;
  const resvg = new Resvg(svg, {
    font: {
      fontFiles,
      loadSystemFonts: fontFiles.length === 0,
      defaultFontFamily: defaultFamily,
    },
  });
  return resvg.render().asPng();
}

async function pngToWebp(png: Uint8Array, quality: number): Promise<Uint8Array> {
  const mod = "sharp"; // non-literal so TS doesn't resolve the optional dep at build time
  const sharp: any = await import(mod).catch(() => {
    throw new Error("newscard: webp output needs `sharp` installed, or request format 'png'");
  });
  return new Uint8Array(await sharp.default(png).webp({ quality }).toBuffer());
}

/** Render a card spec to PNG (default) or WebP bytes. Node (needs @resvg/resvg-js). */
export async function renderCard(spec: CardSpec, options: RenderOptions = {}): Promise<Uint8Array> {
  const svg = buildSvg(spec);
  const png = await svgToPng(svg, spec.theme.fontFiles ?? [], spec.theme.fontFamily);
  if (options.format === "webp") return pngToWebp(png, options.quality ?? 90);
  return png;
}

/** Render every slide of a carousel to image bytes, with optional "n/total" pages. */
export async function renderCarousel(carousel: CarouselSpec, options: RenderOptions = {}): Promise<Uint8Array[]> {
  const total = carousel.slides.length;
  const out: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const slide = carousel.slides[i]!;
    const spec: CardSpec = {
      ...slide,
      size: carousel.size,
      theme: carousel.theme,
      lang: carousel.lang,
    };
    // Page number via a footer suffix when enabled.
    if (carousel.pageNumbers !== false) {
      const base = carousel.theme.footer ? `${carousel.theme.footer}   ` : "";
      spec.theme = { ...carousel.theme, footer: `${base}${i + 1}/${total}` };
    }
    out.push(await renderCard(spec, options));
  }
  return out;
}

export { resolveSize };
