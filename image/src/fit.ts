/**
 * fit() — encode an image to land at or under a file-size budget.
 *
 * Lossy formats (jpeg/webp): binary-search the quality knob for the highest
 * quality that fits; if even the floor is too big, progressively downscale.
 * Lossless png: quality can't move bytes, so we downscale toward the budget.
 *
 * It is a best-effort ceiling: the result is the closest fit ≤ budget we can
 * reach within the quality/scale bounds (never padded up to the budget).
 */

import { encode } from "./encode.js";
import { parseSize } from "./bytes.js";
import { Surface } from "./surface.js";
import type { EncodeResult, FitOptions, PixelSource } from "./types.js";

function toSurface(src: PixelSource): Surface {
  return src instanceof Surface ? src : Surface.from(src);
}

export async function fit(source: PixelSource, opts: FitOptions): Promise<EncodeResult> {
  const maxBytes = opts.maxBytes ?? (opts.maxSize != null ? parseSize(opts.maxSize) : undefined);
  if (!maxBytes || maxBytes <= 0) throw new Error("fit() needs a positive `maxBytes` or `maxSize`.");

  const { format } = opts;
  const minQuality = opts.minQuality ?? 30;
  const maxQuality = opts.maxQuality ?? 92;
  const allowResize = opts.allowResize ?? true;
  const minScale = opts.minScale ?? 0.35;
  const background = opts.background;
  const base = toSurface(source);

  // --- Lossless PNG: combine downscale + colour quantization (posterize) ---
  if (format === "png") {
    let best = await encode(base, { format, background });
    if (best.size <= maxBytes) return best;
    if (!allowResize) return best;
    const scales = [1, 0.85, 0.7, 0.55, minScale];
    const bitsSteps = [8, 6, 5, 4, 3, 2]; // 8 = no quantization
    for (const scale of scales) {
      const w = Math.max(1, Math.round(base.width * scale));
      const h = Math.max(1, Math.round(base.height * scale));
      const scaled = scale === 1 ? base : base.resize(w, h);
      for (const bits of bitsSteps) {
        const surf = bits >= 8 ? scaled : scaled.posterize(bits);
        const r = await encode(surf, { format, background });
        if (r.size < best.size) best = r;
        if (r.size <= maxBytes) return r;
      }
    }
    return best; // smallest we could produce (budget genuinely unreachable losslessly)
  }

  // --- Lossy jpeg/webp: quality search, then downscale if needed ---
  const qualitySearch = async (surface: Surface): Promise<EncodeResult | null> => {
    let lo = minQuality;
    let hi = maxQuality;
    let best: EncodeResult | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = await encode(surface, { format, quality: mid, background });
      if (r.size <= maxBytes) {
        best = r;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best;
  };

  const atFull = await qualitySearch(base);
  if (atFull) return atFull;

  if (allowResize) {
    for (let scale = 0.85; scale >= minScale; scale -= 0.12) {
      const w = Math.max(1, Math.round(base.width * scale));
      const h = Math.max(1, Math.round(base.height * scale));
      const found = await qualitySearch(base.resize(w, h));
      if (found) return found;
    }
    // Last resort: smallest scale at the lowest quality.
    const w = Math.max(1, Math.round(base.width * minScale));
    const h = Math.max(1, Math.round(base.height * minScale));
    return encode(base.resize(w, h), { format, quality: minQuality, background });
  }

  // No resizing allowed and nothing fit — return the smallest (floor quality).
  return encode(base, { format, quality: minQuality, background });
}
