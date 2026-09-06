/**
 * High-quality RGBA resizing. Downscaling uses area-average (box) sampling —
 * every destination pixel is the alpha-weighted, premultiplied average of the
 * source pixels it covers, which avoids the aliasing you get from nearest /
 * naive sampling. Because it works on fractional coverage it also handles
 * upscaling gracefully (equivalent to bilinear for integer-aligned scales).
 */
import type { ImageData } from "./png.js";

/**
 * Resize `img` to `dw` × `dh` and return a new straight-RGBA buffer.
 * Alpha is premultiplied during accumulation so transparent edges do not bleed
 * dark fringes into the result.
 */
export function resizeRgba(img: ImageData, dw: number, dh: number): Uint8Array {
  const { width: sw, height: sh, rgba: src } = img;
  if (dw <= 0 || dh <= 0) throw new Error("resizeRgba: target dimensions must be positive.");
  const out = new Uint8Array(dw * dh * 4);
  if (dw === sw && dh === sh) {
    out.set(src);
    return out;
  }

  const scaleX = sw / dw;
  const scaleY = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const fy0 = dy * scaleY;
    const fy1 = (dy + 1) * scaleY;
    const sy0 = Math.floor(fy0);
    const sy1 = Math.min(sh, Math.ceil(fy1));
    for (let dx = 0; dx < dw; dx++) {
      const fx0 = dx * scaleX;
      const fx1 = (dx + 1) * scaleX;
      const sx0 = Math.floor(fx0);
      const sx1 = Math.min(sw, Math.ceil(fx1));

      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      let wsum = 0;

      for (let sy = sy0; sy < sy1; sy++) {
        // Vertical coverage of this source row by the destination pixel.
        const wy = Math.min(fy1, sy + 1) - Math.max(fy0, sy);
        if (wy <= 0) continue;
        for (let sx = sx0; sx < sx1; sx++) {
          const wx = Math.min(fx1, sx + 1) - Math.max(fx0, sx);
          if (wx <= 0) continue;
          const w = wx * wy;
          const p = (sy * sw + sx) * 4;
          const a = src[p + 3]!;
          const af = a / 255;
          sr += src[p]! * af * w;
          sg += src[p + 1]! * af * w;
          sb += src[p + 2]! * af * w;
          sa += a * w;
          wsum += w;
        }
      }

      const dp = (dy * dw + dx) * 4;
      if (wsum <= 0) {
        out[dp] = 0; out[dp + 1] = 0; out[dp + 2] = 0; out[dp + 3] = 0;
        continue;
      }
      const outA = sa / wsum;
      if (outA <= 0) {
        out[dp] = 0; out[dp + 1] = 0; out[dp + 2] = 0; out[dp + 3] = 0;
      } else {
        // Un-premultiply.
        const inv = 255 / outA;
        out[dp] = clamp8((sr / wsum) * inv);
        out[dp + 1] = clamp8((sg / wsum) * inv);
        out[dp + 2] = clamp8((sb / wsum) * inv);
        out[dp + 3] = clamp8(outA);
      }
    }
  }
  return out;
}

function clamp8(v: number): number {
  const r = Math.round(v);
  return r < 0 ? 0 : r > 255 ? 255 : r;
}
